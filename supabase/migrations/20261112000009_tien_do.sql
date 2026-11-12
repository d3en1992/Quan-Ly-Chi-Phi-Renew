-- GĐ12: Tiến Độ Thi Công — Phần 1 (lõi)
-- 1) schedule_plans: mỗi công trình 1 kế hoạch (ngày khởi công, hạn bàn giao, lịch nghỉ, ngày nghỉ lễ, mẫu đã áp).
-- 2) schedule_tasks thêm: loại (việc / mốc ◆), trạng thái (chưa làm / đang làm / tạm dừng / xong), vướng mắc.
--    schedule_notes thêm: % lúc ghi (nhật ký cập nhật %).
-- 3) create_schedule: lập kế hoạch từ mẫu trong 1 giao dịch (kế hoạch + giai đoạn + việc).
-- 4) Thùng rác: khôi phục / xóa vĩnh viễn kế hoạch, giai đoạn, việc (kéo theo dòng con bị xóa cùng lúc).
-- Trạng thái "Chậm / Trễ n ngày" là TÍNH RA (src/features/schedule/logic.ts), không lưu.

-- ============ 1) Kế hoạch ============
create table public.schedule_plans (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  project_id  uuid not null references public.projects(id) on delete cascade,
  start_date  date not null,                            -- ngày khởi công
  deadline    date,                                     -- hạn bàn giao (tùy chọn)
  rest_days   text not null default 'sun' check (rest_days in ('sun','sat_sun','none')),  -- Nghỉ CN / Nghỉ T7 & CN / Làm cả tuần
  holidays    date[] not null default '{}',             -- ngày nghỉ lễ / nghỉ riêng
  template_key text,                                    -- mẫu đã áp (để biết, không dùng tính toán)
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users(id),
  created_by  uuid references auth.users(id) default auth.uid()
);
create unique index schedule_plans_project_uq on public.schedule_plans (project_id) where deleted_at is null;

alter table public.schedule_plans enable row level security;
create trigger schedule_plans_stamp before insert or update on public.schedule_plans for each row execute function public.stamp_row();
create policy schedule_plans_select on public.schedule_plans for select to authenticated using (
  company_id = (select public.current_company_id()) and (select public.has_any_permission('{schedule,projects}'::text[], 'view'))
  and ((select public.sees_all_projects()) or project_id in (select public.my_project_ids())));
create policy schedule_plans_insert on public.schedule_plans for insert to authenticated with check (
  company_id = (select public.current_company_id()) and (select public.has_any_permission('{schedule}'::text[], 'add'))
  and ((select public.sees_all_projects()) or project_id in (select public.my_project_ids())));
create policy schedule_plans_update on public.schedule_plans for update to authenticated using (
  company_id = (select public.current_company_id()) and public.can_edit_row('{schedule}'::text[], created_by)
  and ((select public.sees_all_projects()) or project_id in (select public.my_project_ids())))
  with check (company_id = (select public.current_company_id()));
create policy schedule_plans_delete on public.schedule_plans for delete to authenticated using (
  company_id = (select public.current_company_id()) and deleted_at is not null
  and (select public.has_any_permission('{schedule}'::text[], 'full')) and (select public.has_special('purge_trash'))
  and ((select public.sees_all_projects()) or project_id in (select public.my_project_ids())));

-- Sao lưu / khôi phục: thêm schedule_plans (sau projects, trước giai đoạn)
create or replace function public._backup_tables() returns text[]
language sql immutable as $$
  select array[
    'customers', 'employees', 'workers', 'subcontractors', 'suppliers', 'catalog_items', 'contact_private', 'projects',
    'profile_projects', 'expenses', 'expense_lines', 'timesheet_weeks', 'timesheet_lines', 'wage_advances', 'main_contracts',
    'subcontracts', 'settlements', 'receipts', 'payable_closures', 'payments', 'payment_allocations', 'equipment',
    'cost_allocations', 'schedule_templates', 'schedule_plans', 'schedule_phases', 'schedule_tasks', 'schedule_notes'
  ]
$$;
revoke execute on function public._backup_tables() from public, anon, authenticated;

-- ============ 2) Cột mới của việc / nhật ký ============
alter table public.schedule_tasks
  add column kind    text not null default 'task' check (kind in ('task','milestone')),
  add column status  text not null default 'todo' check (status in ('todo','doing','paused','done')),
  add column blocker text;   -- vướng mắc / lý do chậm
alter table public.schedule_notes
  add column progress_pct numeric(5,2) check (progress_pct between 0 and 100);

-- ============ 3) Lập kế hoạch từ mẫu ============
-- p_plan: {start_date, deadline, rest_days, holidays[], template_key}
-- p_phases: [{id, name, position, tasks:[{name, kind, start_date, end_date, position}]}]
-- Chạy bằng quyền người gọi (RLS kiểm tra quyền Tiến độ ≥ Nhập + phạm vi công trình).
create or replace function public.create_schedule(p_project uuid, p_plan jsonb, p_phases jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  plan_id uuid;
  ph jsonb;
  tk jsonb;
begin
  if exists (select 1 from public.schedule_plans where project_id = p_project and deleted_at is null) then
    raise exception 'Công trình này đã có kế hoạch tiến độ' using errcode = '23505';
  end if;
  insert into public.schedule_plans (project_id, start_date, deadline, rest_days, holidays, template_key)
  values (p_project, (p_plan->>'start_date')::date, nullif(p_plan->>'deadline', '')::date, coalesce(p_plan->>'rest_days', 'sun'),
          coalesce((select array_agg(x::date) from jsonb_array_elements_text(coalesce(p_plan->'holidays', '[]'::jsonb)) x), '{}'),
          p_plan->>'template_key')
  returning id into plan_id;
  for ph in select * from jsonb_array_elements(coalesce(p_phases, '[]'::jsonb)) loop
    insert into public.schedule_phases (id, project_id, name, position)
    values ((ph->>'id')::uuid, p_project, ph->>'name', coalesce((ph->>'position')::int, 0));
    for tk in select * from jsonb_array_elements(coalesce(ph->'tasks', '[]'::jsonb)) loop
      insert into public.schedule_tasks (project_id, phase_id, name, kind, position, start_date, end_date)
      values (p_project, (ph->>'id')::uuid, tk->>'name', coalesce(tk->>'kind', 'task'), coalesce((tk->>'position')::int, 0),
              nullif(tk->>'start_date', '')::date, nullif(tk->>'end_date', '')::date);
    end loop;
  end loop;
  return plan_id;
end $$;
revoke all on function public.create_schedule(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_schedule(uuid, jsonb, jsonb) to authenticated;

-- ============ 4) Thùng rác ============
create or replace function public._trash_edit_mods(p_table text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_table
    when 'expenses' then '{expenses}'::text[]
    when 'timesheet_weeks' then '{timesheets}'
    when 'wage_advances' then '{timesheets}'
    when 'payments' then '{payments}'
    when 'receipts' then '{revenue,settlements}'
    when 'main_contracts' then '{revenue}'
    when 'subcontracts' then '{payables}'
    when 'settlements' then '{settlements}'
    when 'payable_closures' then '{payables}'
    when 'equipment' then '{equipment}'
    when 'cost_allocations' then '{cost_allocation}'
    when 'projects' then '{projects}'
    when 'customers' then '{contacts}'
    when 'employees' then '{contacts}'
    when 'workers' then '{contacts,timesheets}'
    when 'subcontractors' then '{contacts,catalog}'
    when 'suppliers' then '{contacts,catalog,expenses}'
    when 'catalog_items' then '{catalog}'
    when 'schedule_plans' then '{schedule}'
    when 'schedule_phases' then '{schedule}'
    when 'schedule_tasks' then '{schedule}'
    else null end
$$;

create or replace function public.trash_restore(p_table text, p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  ts timestamptz;
  n  int;
  pid uuid;
begin
  if public._trash_edit_mods(p_table) is null then raise exception 'Loại dữ liệu không hỗ trợ khôi phục' using errcode = '22023'; end if;
  execute format('select deleted_at from public.%I where id = $1 and deleted_at is not null', p_table) into ts using p_id;
  if ts is null then raise exception 'Không tìm thấy bản ghi trong Thùng rác (có thể đã được khôi phục)' using errcode = 'P0002'; end if;
  begin
    if p_table = 'payable_closures' then
      update public.payable_closures set deleted_at = null, undone_at = null where id = p_id;
    else
      execute format('update public.%I set deleted_at = null where id = $1', p_table) using p_id;
    end if;
    get diagnostics n = row_count;   -- (FOUND không đổi sau EXECUTE nên phải đếm dòng)
    if n = 0 then raise exception 'Bạn không có quyền khôi phục bản ghi này (dòng do người khác nhập)' using errcode = '42501'; end if;
    if p_table = 'timesheet_weeks' then
      update public.timesheet_lines set deleted_at = null where week_id = p_id and deleted_at = ts;
      update public.wage_advances set deleted_at = null where source_week_id = p_id and deleted_at = ts;
    elsif p_table = 'settlements' then
      update public.receipts set deleted_at = null where settlement_id = p_id and is_auto and deleted_at = ts;
    elsif p_table = 'payable_closures' then
      update public.payments set deleted_at = null where closure_id = p_id and deleted_at = ts;
    elsif p_table = 'schedule_plans' then
      select project_id into pid from public.schedule_plans where id = p_id;
      update public.schedule_phases set deleted_at = null where project_id = pid and deleted_at = ts;
      update public.schedule_tasks set deleted_at = null where project_id = pid and deleted_at = ts;
    elsif p_table = 'schedule_phases' then
      update public.schedule_tasks set deleted_at = null where phase_id = p_id and deleted_at = ts;
    end if;
  exception when unique_violation then
    raise exception 'Không khôi phục được: đã có bản ghi khác đang dùng thay cho bản này (cùng công trình / cùng tuần / cùng tên). Xóa hoặc sửa bản đang dùng trước.' using errcode = '23505';
  end;
end $$;

create or replace function public.trash_purge(p_table text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  co   uuid := public.current_company_id();
  mods text[] := public._trash_edit_mods(p_table);
  has_project boolean;
  ok   boolean;
  ts   timestamptz;
  pid  uuid;
begin
  if mods is null then raise exception 'Loại dữ liệu không hỗ trợ xóa vĩnh viễn' using errcode = '22023'; end if;
  if co is null or not public.has_special('purge_trash') or not public.has_any_permission(mods, 'full') then
    raise exception 'Bạn không có quyền xóa vĩnh viễn' using errcode = '42501';
  end if;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = 'project_id') into has_project;
  if has_project then
    execute format('select exists (select 1 from public.%I where id = $1 and company_id = $2 and deleted_at is not null
                    and (project_id is null or public.sees_all_projects() or project_id in (select public.my_project_ids())))', p_table)
      into ok using p_id, co;
  else
    execute format('select exists (select 1 from public.%I where id = $1 and company_id = $2 and deleted_at is not null)', p_table) into ok using p_id, co;
  end if;
  if not ok then raise exception 'Không tìm thấy bản ghi trong Thùng rác' using errcode = 'P0002'; end if;
  begin
    if p_table = 'expenses' then
      delete from public.payment_allocations where expense_id = p_id;
      delete from public.expense_lines where expense_id = p_id;
    elsif p_table = 'timesheet_weeks' then
      delete from public.wage_advances where source_week_id = p_id and deleted_at is not null;
      delete from public.timesheet_lines where week_id = p_id;
    elsif p_table = 'payments' then
      delete from public.payment_allocations where payment_id = p_id;
    elsif p_table = 'settlements' then
      delete from public.receipts where settlement_id = p_id and is_auto and deleted_at is not null;
    elsif p_table = 'payable_closures' then
      delete from public.payments where closure_id = p_id and deleted_at is not null;
    elsif p_table = 'schedule_plans' then
      -- giai đoạn + việc bị xóa cùng lúc với kế hoạch (việc / ghi chú đi theo nhờ on delete cascade)
      select deleted_at, project_id into ts, pid from public.schedule_plans where id = p_id;
      delete from public.schedule_tasks where project_id = pid and deleted_at = ts;
      delete from public.schedule_phases where project_id = pid and deleted_at = ts;
    end if;
    execute format('delete from public.%I where id = $1', p_table) using p_id;
  exception when foreign_key_violation then
    raise exception 'Còn dữ liệu khác đang dùng bản ghi này nên chưa xóa vĩnh viễn được' using errcode = '23503';
  end;
end $$;

revoke all on function public.trash_restore(text, uuid) from public, anon;
revoke all on function public.trash_purge(text, uuid) from public, anon;
grant execute on function public.trash_restore(text, uuid) to authenticated;
grant execute on function public.trash_purge(text, uuid) to authenticated;
