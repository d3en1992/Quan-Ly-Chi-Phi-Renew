-- GĐ8: Theo Dõi TB + Thùng Rác
-- 1) deleted_by: ai đã xóa (cột "Người xóa" ở Thùng Rác) — stamp_row tự ghi khi deleted_at chuyển từ trống sang có.
-- 2) save_equipment / transfer_equipment / edit_equipment: thêm, luân chuyển, sửa thiết bị theo đúng quy tắc gộp dòng của app cũ
--    (cùng Nơi + Tên + Tình trạng + Thông tin máy → cộng số lượng vào 1 dòng).
-- 3) trash_restore / trash_purge: khôi phục (kèm dòng con bị xóa cùng lúc) và xóa vĩnh viễn (quyền purge_trash).

-- ============ 1) Người xóa ============
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join pg_trigger g on g.tgrelid = ('public.' || quote_ident(c.table_name))::regclass and g.tgname = c.table_name || '_stamp'
    where c.table_schema = 'public' and c.column_name = 'deleted_at'
  loop
    execute format('alter table public.%I add column if not exists deleted_by uuid references auth.users(id)', t);
  end loop;
end $$;

create or replace function public.stamp_row() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.created_at := now();
      new.updated_at := now();
    end if;
  else
    if auth.uid() is not null then
      new.created_by := old.created_by;
      new.company_id := old.company_id;
      new.created_at := old.created_at;
      new.updated_at := now();
    elsif new.updated_at is not distinct from old.updated_at then
      new.updated_at := now();
    end if;
    -- Người xóa: ghi lúc đưa vào Thùng rác, gỡ lúc khôi phục
    if new.deleted_at is null then
      new.deleted_by := null;
    elsif old.deleted_at is null and auth.uid() is not null then
      new.deleted_by := auth.uid();
    end if;
  end if;
  return new;
end $$;

-- ============ 2) Thiết bị ============
create or replace function public._equipment_note_key(n text) returns text
language sql immutable set search_path = '' as $$
  select lower(btrim(regexp_replace(coalesce(n, ''), '\s+', ' ', 'g')))
$$;

-- Cộng p_qty vào dòng trùng (Nơi + Tên + Tình trạng + Thông tin máy) hoặc tạo dòng mới. Trả về id dòng nhận.
create or replace function public._equipment_put(
  p_name_id uuid, p_location text, p_project_id uuid, p_qty numeric, p_condition text, p_date date, p_note text, p_skip uuid default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  t_id uuid;
  n text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
begin
  select id into t_id from public.equipment
  where deleted_at is null and name_id = p_name_id and location = p_location and project_id is not distinct from p_project_id
    and condition = p_condition and public._equipment_note_key(note) = public._equipment_note_key(n)
    and (p_skip is null or id <> p_skip)
  order by created_at limit 1;
  if t_id is not null then
    update public.equipment set quantity = quantity + p_qty, date = coalesce(p_date, date) where id = t_id;
    if not found then raise exception 'Không cộng được vào dòng thiết bị đã có (dòng do người khác nhập)' using errcode = '42501'; end if;
    return t_id;
  end if;
  insert into public.equipment (name_id, location, project_id, quantity, condition, date, note)
  values (p_name_id, p_location, p_project_id, p_qty, p_condition, p_date, n) returning id into t_id;
  return t_id;
end $$;

-- Thêm nhiều thiết bị vào 1 nơi. p_rows: [{ name_id, quantity, condition, note }]
create or replace function public.save_equipment(p_location text, p_project_id uuid, p_date date, p_rows jsonb)
returns int
language plpgsql security invoker set search_path = '' as $$
declare
  r record;
  n int := 0;
begin
  if p_location not in ('project', 'warehouse', 'scaffold') or (p_location = 'project') <> (p_project_id is not null) then
    raise exception 'Chọn công trình hoặc kho' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Không có dữ liệu để lưu' using errcode = '22023'; end if;
  for r in select * from jsonb_to_recordset(p_rows) as x(name_id uuid, quantity numeric, condition text, note text) loop
    if r.name_id is null or coalesce(r.quantity, 0) <= 0 then raise exception 'Thiếu tên thiết bị hoặc số lượng' using errcode = '22023'; end if;
    perform public._equipment_put(r.name_id, p_location, p_project_id, r.quantity, coalesce(r.condition, 'working'), coalesce(p_date, current_date), r.note);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Luân chuyển p_qty của 1 dòng sang nơi khác. Phần còn lại giữ ở nơi cũ; chuyển hết thì dòng cũ vào Thùng rác.
create or replace function public.transfer_equipment(
  p_id uuid, p_location text, p_project_id uuid, p_qty numeric, p_condition text, p_date date, p_note text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  s public.equipment%rowtype;
  t_id uuid;
begin
  select * into s from public.equipment where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy thiết bị (có thể đã bị xóa)' using errcode = 'P0002'; end if;
  if p_location not in ('project', 'warehouse', 'scaffold') or (p_location = 'project') <> (p_project_id is not null) then
    raise exception 'Chọn nơi chuyển đến' using errcode = '22023';
  end if;
  if coalesce(p_qty, 0) <= 0 or p_qty > s.quantity then raise exception 'Số lượng chuyển phải từ 1 đến %', s.quantity using errcode = '22023'; end if;
  if p_location = s.location and p_project_id is not distinct from s.project_id
     and coalesce(p_condition, s.condition) = s.condition and public._equipment_note_key(p_note) = public._equipment_note_key(s.note) then
    raise exception 'Nơi chuyển đến trùng nơi đang đứng' using errcode = '22023';
  end if;
  if p_qty = s.quantity then
    update public.equipment set deleted_at = now() where id = p_id;
  else
    update public.equipment set quantity = quantity - p_qty where id = p_id;
  end if;
  if not found then raise exception 'Bạn không có quyền sửa dòng thiết bị này' using errcode = '42501'; end if;
  t_id := public._equipment_put(s.name_id, p_location, p_project_id, p_qty, coalesce(p_condition, s.condition), coalesce(p_date, current_date), p_note, p_id);
  return t_id;
end $$;

-- Sửa số lượng / tình trạng / thông tin máy. Đổi tình trạng / thông tin máy mà cùng nơi đã có dòng trùng → gộp.
create or replace function public.edit_equipment(p_id uuid, p_quantity numeric, p_condition text, p_note text)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  s public.equipment%rowtype;
  twin uuid;
  n text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
begin
  select * into s from public.equipment where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy thiết bị (có thể đã bị xóa)' using errcode = 'P0002'; end if;
  if coalesce(p_quantity, 0) <= 0 then raise exception 'Số lượng phải lớn hơn 0 — muốn bỏ thiết bị thì dùng nút xóa' using errcode = '22023'; end if;
  if p_condition not in ('working', 'needs_maintenance', 'needs_repair') then raise exception 'Tình trạng không hợp lệ' using errcode = '22023'; end if;
  select id into twin from public.equipment
  where deleted_at is null and id <> p_id and name_id = s.name_id and location = s.location and project_id is not distinct from s.project_id
    and condition = p_condition and public._equipment_note_key(note) = public._equipment_note_key(n)
  order by created_at limit 1;
  if twin is not null then
    update public.equipment set quantity = quantity + p_quantity where id = twin;
    if not found then raise exception 'Không gộp được vào dòng trùng (dòng do người khác nhập)' using errcode = '42501'; end if;
    update public.equipment set deleted_at = now() where id = p_id;
    if not found then raise exception 'Bạn không có quyền sửa dòng thiết bị này' using errcode = '42501'; end if;
    return twin;
  end if;
  update public.equipment set quantity = p_quantity, condition = p_condition, note = n where id = p_id;
  if not found then raise exception 'Bạn không có quyền sửa dòng thiết bị này' using errcode = '42501'; end if;
  return p_id;
end $$;

-- ============ 3) Thùng rác ============
-- Bảng được phép khôi phục / xóa hẳn từ Thùng rác, kèm các mục có quyền sửa (giống _apply_rls ở migration 000003).
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
    else null end
$$;

-- Khôi phục 1 bản ghi (chạy bằng quyền người gọi → RLS quyết định có được sửa dòng đó không).
-- Dòng con bị xóa CÙNG LÚC với bản ghi (cùng deleted_at) được khôi phục theo.
create or replace function public.trash_restore(p_table text, p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  ts timestamptz;
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
    if not found then raise exception 'Bạn không có quyền khôi phục bản ghi này (dòng do người khác nhập)' using errcode = '42501'; end if;
    if p_table = 'timesheet_weeks' then
      update public.timesheet_lines set deleted_at = null where week_id = p_id and deleted_at = ts;
      update public.wage_advances set deleted_at = null where source_week_id = p_id and deleted_at = ts;
    elsif p_table = 'settlements' then
      update public.receipts set deleted_at = null where settlement_id = p_id and is_auto and deleted_at = ts;
    elsif p_table = 'payable_closures' then
      update public.payments set deleted_at = null where closure_id = p_id and deleted_at = ts;
    end if;
  exception when unique_violation then
    raise exception 'Không khôi phục được: đã có bản ghi khác đang dùng thay cho bản này (cùng công trình / cùng tuần / cùng tên). Xóa hoặc sửa bản đang dùng trước.' using errcode = '23505';
  end;
end $$;

-- Xóa vĩnh viễn 1 bản ghi đang ở Thùng rác. Cần: quyền đặc biệt purge_trash + Toàn quyền ở mục của bảng + thấy công trình của dòng.
create or replace function public.trash_purge(p_table text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  co   uuid := public.current_company_id();
  mods text[] := public._trash_edit_mods(p_table);
  has_project boolean;
  ok   boolean;
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
    end if;
    execute format('delete from public.%I where id = $1', p_table) using p_id;
  exception when foreign_key_violation then
    raise exception 'Còn dữ liệu khác đang dùng bản ghi này nên chưa xóa vĩnh viễn được' using errcode = '23503';
  end;
end $$;

revoke all on function public._equipment_put(uuid, text, uuid, numeric, text, date, text, uuid) from public, anon;
revoke all on function public.save_equipment(text, uuid, date, jsonb) from public, anon;
revoke all on function public.transfer_equipment(uuid, text, uuid, numeric, text, date, text) from public, anon;
revoke all on function public.edit_equipment(uuid, numeric, text, text) from public, anon;
revoke all on function public.trash_restore(text, uuid) from public, anon;
revoke all on function public.trash_purge(text, uuid) from public, anon;
grant execute on function public._equipment_put(uuid, text, uuid, numeric, text, date, text, uuid) to authenticated;
grant execute on function public.save_equipment(text, uuid, date, jsonb) to authenticated;
grant execute on function public.transfer_equipment(uuid, text, uuid, numeric, text, date, text) to authenticated;
grant execute on function public.edit_equipment(uuid, numeric, text, text) to authenticated;
grant execute on function public.trash_restore(text, uuid) to authenticated;
grant execute on function public.trash_purge(text, uuid) to authenticated;
