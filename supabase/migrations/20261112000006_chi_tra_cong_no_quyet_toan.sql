-- GĐ7: Chi Trả TP/NCC, Công Nợ Phải Trả, Doanh Thu, Quyết Toán
-- 1) replace_payment_allocations: ghi lại cách chia tiền trả NCC (mục 4J). CÔNG THỨC chia nằm ở app
--    (src/lib/calc/payables.ts → reallocateSupplierPayments); hàm này chỉ kiểm tra rồi thay các dòng chia trong 1 giao dịch.
--    payment_allocations là dữ liệu SUY RA từ phiếu chi + hóa đơn nên được xóa hẳn rồi ghi lại (không qua Thùng rác).
-- 2) close_payable / undo_payable_closure: tất toán một cặp thầu phụ × công trình (tạo phiếu chi phần còn lại như app cũ) và hoàn tác.
-- 3) save_settlement / delete_settlement: lưu quyết toán + đồng bộ phiếu thu tự động "tiền còn lại" + đóng công trình khi Chốt.

create or replace function public.replace_payment_allocations(p_payment_ids uuid[], p_allocs jsonb)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  co  uuid := public.current_company_id();
  n   int;
begin
  if co is null or not public.has_any_permission('{payments,payables,expenses}'::text[], 'add') then
    raise exception 'Bạn không có quyền ghi phiếu chi / hóa đơn' using errcode = '42501';
  end if;
  if p_payment_ids is null or cardinality(p_payment_ids) = 0 then return 0; end if;
  if p_allocs is null or jsonb_typeof(p_allocs) <> 'array' then
    raise exception 'Dữ liệu chia tiền không hợp lệ' using errcode = '22023';
  end if;

  -- Mọi phiếu phải là phiếu Trả nợ NCC của công ty
  if exists (
    select 1 from unnest(p_payment_ids) as x(id)
    left join public.payments p on p.id = x.id and p.company_id = co and p.kind = 'supplier_payment'
    where p.id is null
  ) then
    raise exception 'Có phiếu chi không hợp lệ' using errcode = '22023';
  end if;

  -- Mỗi dòng chia: thuộc một phiếu trong danh sách; hóa đơn (nếu có) cùng NCC, cùng công trình, cùng công ty
  if exists (
    select 1
    from jsonb_to_recordset(p_allocs) as a(payment_id uuid, expense_id uuid, project_id uuid, amount bigint)
    left join public.payments p on p.id = a.payment_id
    left join public.expenses e on e.id = a.expense_id
    left join public.projects j on j.id = a.project_id and j.company_id = co
    where a.payment_id is null or not (a.payment_id = any (p_payment_ids)) or a.amount is null or j.id is null
       or (a.expense_id is not null and (e.id is null or e.company_id <> co
           or e.supplier_id is distinct from p.supplier_id or e.project_id <> a.project_id))
  ) then
    raise exception 'Dòng chia tiền không khớp phiếu chi / hóa đơn' using errcode = '22023';
  end if;

  -- Không chia quá số tiền của phiếu
  if exists (
    select 1
    from (select a.payment_id, sum(a.amount) as s
          from jsonb_to_recordset(p_allocs) as a(payment_id uuid, amount bigint) group by a.payment_id) t
    join public.payments p on p.id = t.payment_id
    where p.amount >= 0 and t.s > p.amount
  ) then
    raise exception 'Chia quá số tiền của phiếu chi' using errcode = '22023';
  end if;

  delete from public.payment_allocations where payment_id = any (p_payment_ids);
  insert into public.payment_allocations (company_id, payment_id, expense_id, project_id, amount, created_by)
  select co, a.payment_id, a.expense_id, a.project_id, a.amount, auth.uid()
  from jsonb_to_recordset(p_allocs) as a(payment_id uuid, expense_id uuid, project_id uuid, amount bigint)
  where a.amount <> 0;
  get diagnostics n = row_count;
  return n;
end $$;

-- Tất toán một cặp thầu phụ × công trình. p_amount = số còn phải trả (app tính bằng công thức công nợ);
-- > 0 thì tạo 1 phiếu chi "Thanh toán đợt" đúng số đó (gắn closure_id để hoàn tác), ≤ 0 thì chỉ đóng sổ.
create or replace function public.close_payable(
  p_subcontractor_id uuid, p_project_id uuid, p_date date, p_amount bigint, p_by text, p_note text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  c_id uuid;
begin
  if p_date is null then raise exception 'Chọn ngày tất toán' using errcode = '22023'; end if;
  if exists (select 1 from public.payable_closures
             where subcontractor_id = p_subcontractor_id and project_id = p_project_id and deleted_at is null and undone_at is null) then
    raise exception 'Cặp thầu phụ × công trình này đã tất toán rồi' using errcode = '23505';
  end if;
  insert into public.payable_closures (party_kind, subcontractor_id, project_id, closed_on, amount, closed_by_name, note)
  values ('subcontractor', p_subcontractor_id, p_project_id, p_date, greatest(coalesce(p_amount, 0), 0), nullif(btrim(coalesce(p_by, '')), ''), nullif(btrim(coalesce(p_note, '')), ''))
  returning id into c_id;
  if coalesce(p_amount, 0) > 0 then
    insert into public.payments (kind, date, amount, subcontractor_id, project_id, closure_id, note)
    values ('progress', p_date, p_amount, p_subcontractor_id, p_project_id, c_id,
            'Tất toán công nợ' || coalesce(' (' || nullif(btrim(coalesce(p_by, '')), '') || ')', ''));
  end if;
  return c_id;
end $$;

-- Hoàn tác một lần tất toán: phiếu chi tự sinh vào Thùng rác, công nợ quay lại như trước.
create or replace function public.undo_payable_closure(p_closure_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  now_ts timestamptz := now();
begin
  update public.payments set deleted_at = now_ts where closure_id = p_closure_id and deleted_at is null;
  if exists (select 1 from public.payments where closure_id = p_closure_id and deleted_at is null) then
    raise exception 'Không hoàn tác được: phiếu chi tất toán do người khác ghi' using errcode = '42501';
  end if;
  update public.payable_closures set undone_at = now_ts, deleted_at = now_ts where id = p_closure_id and deleted_at is null;
  if not found then
    raise exception 'Không hoàn tác được: lần tất toán không còn hoặc bạn không có quyền' using errcode = '42501';
  end if;
end $$;

-- Lưu quyết toán. p_receipt_mode: 'keep' = không đụng phiếu thu tự động; 'remove' = gỡ; 'set' = tạo / cập nhật đúng p_receipt_amount
-- (app tính "còn phải thu toàn vòng đời sau quyết toán" bằng remainingAfterSettlement; ≤ 0 thì gỡ phiếu).
create or replace function public.save_settlement(
  p_id uuid, p_project_id uuid, p_date date, p_kind text, p_amount bigint, p_note text, p_is_final boolean,
  p_receipt_mode text, p_receipt_amount bigint
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  s_id   uuid := p_id;
  r_id   uuid;
  now_ts timestamptz := now();
begin
  if p_date is null then raise exception 'Chọn ngày quyết toán' using errcode = '22023'; end if;
  if p_receipt_mode not in ('keep', 'remove', 'set') then raise exception 'Tham số phiếu thu không hợp lệ' using errcode = '22023'; end if;

  if s_id is null then
    insert into public.settlements (project_id, date, kind, amount, note, is_final)
    values (p_project_id, p_date, p_kind, p_amount, nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_is_final, false))
    returning id into s_id;
  else
    update public.settlements
       set project_id = p_project_id, date = p_date, kind = p_kind, amount = p_amount,
           note = nullif(btrim(coalesce(p_note, '')), ''), is_final = coalesce(p_is_final, false)
     where id = s_id and deleted_at is null;
    if not found then
      raise exception 'Không sửa được quyết toán này (đã xóa, hoặc do người khác nhập)' using errcode = '42501';
    end if;
  end if;

  if p_receipt_mode <> 'keep' then
    select id into r_id from public.receipts where settlement_id = s_id and is_auto and deleted_at is null limit 1;
    if p_receipt_mode = 'remove' or coalesce(p_receipt_amount, 0) <= 0 then
      if r_id is not null then update public.receipts set deleted_at = now_ts where id = r_id; end if;
    elsif r_id is not null then
      update public.receipts set project_id = p_project_id, date = p_date, amount = p_receipt_amount where id = r_id;
    else
      insert into public.receipts (project_id, date, amount, kind, is_auto, settlement_id, note)
      values (p_project_id, p_date, p_receipt_amount, 'settlement', true, s_id, 'Thu tiền còn lại sau quyết toán (tự động)');
    end if;
  end if;

  -- Chốt quyết toán cuối → công trình sang "Đã quyết toán" (cần quyền sửa công trình; không có quyền thì bỏ qua)
  if coalesce(p_is_final, false) then
    update public.projects set status = 'closed', closed_date = p_date where id = p_project_id and status <> 'closed';
  end if;
  return s_id;
end $$;

-- Xóa mềm quyết toán + phiếu thu tự động đi kèm
create or replace function public.delete_settlement(p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  now_ts timestamptz := now();
begin
  update public.settlements set deleted_at = now_ts where id = p_id and deleted_at is null;
  if not found then
    raise exception 'Không xóa được quyết toán này (đã xóa, hoặc do người khác nhập)' using errcode = '42501';
  end if;
  update public.receipts set deleted_at = now_ts where settlement_id = p_id and is_auto and deleted_at is null;
end $$;

revoke all on function public.replace_payment_allocations(uuid[], jsonb) from public, anon;
revoke all on function public.close_payable(uuid, uuid, date, bigint, text, text) from public, anon;
revoke all on function public.undo_payable_closure(uuid) from public, anon;
revoke all on function public.save_settlement(uuid, uuid, date, text, bigint, text, boolean, text, bigint) from public, anon;
revoke all on function public.delete_settlement(uuid) from public, anon;
grant execute on function public.replace_payment_allocations(uuid[], jsonb) to authenticated;
grant execute on function public.close_payable(uuid, uuid, date, bigint, text, text) to authenticated;
grant execute on function public.undo_payable_closure(uuid) to authenticated;
grant execute on function public.save_settlement(uuid, uuid, date, text, bigint, text, boolean, text, bigint) to authenticated;
grant execute on function public.delete_settlement(uuid) to authenticated;
