-- GĐ99 — Sổ chấm công theo ý anh Tình (12/11/2026):
-- 1) Ô ngày công gõ được số lẻ, không giới hạn trên (1,3 · 0,75 · 2). Cột cũ numeric(4,2) chỉ tới 99,99 → nới thành
--    numeric(8,2) (vẫn 2 số lẻ, khớp app làm tròn 2 số lẻ). Dữ liệu cũ giữ nguyên giá trị.
-- 2) Bỏ cột "Trừ nợ" khỏi sổ chấm công: trả nợ ứng lương ghi ở tab Tạm ứng lương như app cũ.
--    save_timesheet_week KHÔNG còn đồng bộ / xóa dòng "Trả" (wage_advances có source_week_id) và KHÔNG đụng
--    timesheet_lines.debt_deduction (tru đời cũ) — lưu lại tuần cũ giữ nguyên các khoản đó.
--    Xóa cả tuần (delete_timesheet_week) vẫn xóa mềm dòng "Trả" gắn với tuần như trước (khôi phục được ở Thùng rác).

alter table public.timesheet_lines
  alter column day_units type numeric(8,2)[] using day_units::numeric(8,2)[];

-- p_lines: [{worker_id, role, day_units[7], daily_wage, allowance, retail_purchase, note}] (trường debt_deduction nếu có bị bỏ qua)
create or replace function public.save_timesheet_week(p_project_id uuid, p_week_start date, p_lines jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  w_id      uuid;
  w_owner   uuid;
  l         jsonb;
  pos       int := 0;
  wk        uuid;
  keep      uuid[] := '{}';
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
    if exists (select 1 from jsonb_array_elements_text(l->'day_units') x where coalesce(x::numeric, 0) < 0) then
      raise exception 'Ngày công không được âm' using errcode = '22023';
    end if;
    keep := keep || wk;

    insert into public.timesheet_lines
      (week_id, worker_id, position, role, day_units, daily_wage, allowance, retail_purchase, note, debt_deduction)
    values
      (w_id, wk, pos, nullif(l->>'role', ''),
       array(select round(coalesce(x::numeric, 0), 2) from jsonb_array_elements_text(l->'day_units') x)::numeric(8,2)[],
       coalesce((l->>'daily_wage')::bigint, 0), coalesce((l->>'allowance')::bigint, 0),
       coalesce((l->>'retail_purchase')::bigint, 0), nullif(l->>'note', ''), 0)
    on conflict (week_id, worker_id) where deleted_at is null do update set
      position = excluded.position, role = excluded.role, day_units = excluded.day_units,
      daily_wage = excluded.daily_wage, allowance = excluded.allowance, retail_purchase = excluded.retail_purchase,
      note = excluded.note;
    -- debt_deduction (tru đời cũ), legacy_loan và dòng "Trả" của tuần: giữ nguyên, không có ô sửa trong sổ
    pos := pos + 1;
  end loop;

  -- Công nhân bị bỏ khỏi bảng: xóa mềm dòng chấm công (dòng "Trả" của họ vẫn giữ trong sổ Tạm ứng lương)
  update public.timesheet_lines set deleted_at = now_ts
   where week_id = w_id and deleted_at is null and not (worker_id = any(keep));

  return w_id;
end $$;

grant execute on function public.save_timesheet_week(uuid, date, jsonb) to authenticated;
revoke execute on function public.save_timesheet_week(uuid, date, jsonb) from anon, public;
