-- GĐ6: Chấm Công + Tạm ứng lương
-- 1) Cột "Trừ nợ" của sổ chấm công tự thành dòng "Trả" trong sổ Tạm ứng lương:
--    wage_advances.source_week_id = tuần chấm công sinh ra dòng trả đó (mỗi tuần × công nhân tối đa 1 dòng).
--    Dòng trả này có counts_in_net_pay = true (trừ vào Thực lãnh tuần đó, như tick "tính vào Thực Lãnh" của app cũ),
--    ngày = thứ Bảy của tuần (ngày trả lương).
-- 2) Lưu / xóa một tuần trong MỘT giao dịch (hàm save_timesheet_week / delete_timesheet_week), chạy bằng quyền
--    của người gọi (security invoker) nên RLS vẫn kiểm tra từng dòng.

alter table public.wage_advances
  add column source_week_id uuid references public.timesheet_weeks(id) on delete set null;

create unique index wage_advances_source_uq on public.wage_advances (source_week_id, worker_id)
  where deleted_at is null and source_week_id is not null;

-- Lưu một tuần chấm công của một công trình.
-- p_lines: [{worker_id, role, day_units[7], daily_wage, allowance, retail_purchase, note, debt_deduction}]
-- Trả về id tuần. Dòng của công nhân bị bỏ khỏi bảng → xóa mềm (kèm dòng "Trả" do tuần sinh ra).
create or replace function public.save_timesheet_week(p_project_id uuid, p_week_start date, p_lines jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  w_id      uuid;
  w_owner   uuid;
  l         jsonb;
  pos       int := 0;
  wk        uuid;
  ded       bigint;
  keep      uuid[] := '{}';
  sat       date := p_week_start + 6;
  now_ts    timestamptz := now();
begin
  if extract(dow from p_week_start) <> 0 then
    raise exception 'Ngày đầu tuần phải là Chủ nhật' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Chưa có công nhân nào trong tuần' using errcode = '22023';
  end if;

  select id, created_by into w_id, w_owner from public.timesheet_weeks
   where project_id = p_project_id and week_start = p_week_start and deleted_at is null
   for update;

  if w_id is null then
    insert into public.timesheet_weeks (project_id, week_start) values (p_project_id, p_week_start)
    returning id into w_id;
  else
    if not public.can_edit_row('{timesheets}', w_owner) then
      raise exception 'Tuần này do người khác nhập — cần quyền "Sửa / xóa dòng người khác nhập"' using errcode = '42501';
    end if;
    update public.timesheet_weeks set updated_at = now_ts where id = w_id;
  end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    wk := (l->>'worker_id')::uuid;
    if wk is null then
      raise exception 'Dòng chấm công thiếu công nhân' using errcode = '22023';
    end if;
    if wk = any(keep) then
      raise exception 'Một công nhân bị nhập 2 dòng trong cùng tuần' using errcode = '23505';
    end if;
    keep := keep || wk;
    ded := greatest(coalesce((l->>'debt_deduction')::bigint, 0), 0);

    insert into public.timesheet_lines
      (week_id, worker_id, position, role, day_units, daily_wage, allowance, retail_purchase, note, debt_deduction)
    values
      (w_id, wk, pos, nullif(l->>'role', ''),
       array(select coalesce(x::numeric, 0) from jsonb_array_elements_text(l->'day_units') x)::numeric(4,2)[],
       coalesce((l->>'daily_wage')::bigint, 0), coalesce((l->>'allowance')::bigint, 0),
       coalesce((l->>'retail_purchase')::bigint, 0), nullif(l->>'note', ''), 0)
    on conflict (week_id, worker_id) where deleted_at is null do update set
      position = excluded.position, role = excluded.role, day_units = excluded.day_units,
      daily_wage = excluded.daily_wage, allowance = excluded.allowance, retail_purchase = excluded.retail_purchase,
      note = excluded.note,
      -- "Trừ nợ" đời cũ (tru) chuyển hẳn sang sổ Tạm ứng lương (dòng Trả bên dưới) → không đếm 2 lần
      debt_deduction = 0;
    -- legacy_loan (ứng ghi thẳng trong tuần đời cũ) giữ nguyên, không có ô sửa

    -- Đồng bộ dòng "Trả" của tuần này cho công nhân này
    if ded > 0 then
      update public.wage_advances
         set amount = ded, date = sat, project_id = p_project_id, direction = 'repay', counts_in_net_pay = true
       where source_week_id = w_id and worker_id = wk and deleted_at is null;
      if not found then
        insert into public.wage_advances (worker_id, project_id, date, direction, amount, counts_in_net_pay, note, source_week_id)
        values (wk, p_project_id, sat, 'repay', ded, true,
                'Trừ nợ trong sổ chấm công tuần ' || to_char(p_week_start, 'DD/MM') || '–' || to_char(sat, 'DD/MM/YYYY'), w_id);
      end if;
    else
      update public.wage_advances set deleted_at = now_ts
       where source_week_id = w_id and worker_id = wk and deleted_at is null;
    end if;
    pos := pos + 1;
  end loop;

  -- Công nhân bị bỏ khỏi bảng
  update public.timesheet_lines set deleted_at = now_ts
   where week_id = w_id and deleted_at is null and not (worker_id = any(keep));
  update public.wage_advances set deleted_at = now_ts
   where source_week_id = w_id and deleted_at is null and not (worker_id = any(keep));

  return w_id;
end $$;

-- Xóa mềm một tuần (vào Thùng rác) cùng các dòng và dòng "Trả" do tuần sinh ra
create or replace function public.delete_timesheet_week(p_week_id uuid)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  w_owner uuid;
  now_ts  timestamptz := now();
begin
  select created_by into w_owner from public.timesheet_weeks where id = p_week_id and deleted_at is null;
  if not found then
    raise exception 'Không tìm thấy tuần (có thể đã bị xóa)' using errcode = 'P0002';
  end if;
  if not public.can_edit_row('{timesheets}', w_owner) then
    raise exception 'Tuần này do người khác nhập — cần quyền "Sửa / xóa dòng người khác nhập"' using errcode = '42501';
  end if;
  update public.timesheet_lines set deleted_at = now_ts where week_id = p_week_id and deleted_at is null;
  update public.wage_advances  set deleted_at = now_ts where source_week_id = p_week_id and deleted_at is null;
  update public.timesheet_weeks set deleted_at = now_ts where id = p_week_id;
end $$;

grant execute on function public.save_timesheet_week(uuid, date, jsonb) to authenticated;
grant execute on function public.delete_timesheet_week(uuid) to authenticated;
revoke execute on function public.save_timesheet_week(uuid, date, jsonb) from anon, public;
revoke execute on function public.delete_timesheet_week(uuid) from anon, public;
