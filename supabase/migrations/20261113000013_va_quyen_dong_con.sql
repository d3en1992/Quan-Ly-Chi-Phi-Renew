-- Vá quyền sau review 13/11/2026.
-- 1) Thêm DÒNG CON (dòng vật tư, dòng chấm công, dòng chia tiền NCC): trước chỉ kiểm "thấy được phiếu cha",
--    nên người có quyền Nhập (chỉ sửa phiếu của mình) gọi thẳng API vẫn chèn được dòng vào phiếu của người khác.
--    Nay phải SỬA ĐƯỢC phiếu cha (can_edit_row: Toàn quyền, hoặc Nhập + phiếu của mình / có quyền "sửa của người khác").
--    Hàm security definer (replace_payment_allocations) không bị ảnh hưởng — nó tự kiểm quyền.
-- 2) Người CHƯA ĐĂNG NHẬP (anon) không cần gọi hàm nội bộ nào → thu hồi EXECUTE (các hàm vốn đã tự kiểm auth.uid(),
--    đây chỉ là bớt bề mặt thừa). authenticated / service_role vẫn giữ quyền đã cấp ở migration 000011.

drop policy if exists expense_lines_insert on public.expense_lines;
create policy expense_lines_insert on public.expense_lines for insert to authenticated
  with check (
    company_id = (select public.current_company_id())
    and (select public.has_any_permission('{expenses}'::text[], 'add'))
    and exists (select 1 from public.expenses x
                where x.id = expense_id and public.can_edit_row('{expenses}'::text[], x.created_by))
  );

drop policy if exists timesheet_lines_insert on public.timesheet_lines;
create policy timesheet_lines_insert on public.timesheet_lines for insert to authenticated
  with check (
    company_id = (select public.current_company_id())
    and (select public.has_any_permission('{timesheets}'::text[], 'add'))
    and exists (select 1 from public.timesheet_weeks x
                where x.id = week_id and public.can_edit_row('{timesheets}'::text[], x.created_by))
  );

drop policy if exists payment_allocations_insert on public.payment_allocations;
create policy payment_allocations_insert on public.payment_allocations for insert to authenticated
  with check (
    company_id = (select public.current_company_id())
    and (select public.has_any_permission('{payments}'::text[], 'add'))
    and exists (select 1 from public.payments x
                where x.id = payment_id and public.can_edit_row('{payments}'::text[], x.created_by))
  );

-- Thu hồi EXECUTE của anon trên mọi hàm trong schema public (kể cả cấp qua PUBLIC)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from anon, public', r.fn);
  end loop;
end $$;
