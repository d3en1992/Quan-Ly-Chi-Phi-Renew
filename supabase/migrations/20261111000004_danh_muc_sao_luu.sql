-- GĐ4 — Sao lưu / khôi phục toàn bộ dữ liệu nghiệp vụ của công ty + logo công ty trong get_my_access.
-- • backups: bản sao lưu lưu trong kho (cột data chỉ đọc qua get_backup_data(), Admin).
-- • create_backup / export_company_snapshot / get_backup_data / restore_backup: chỉ Admin (create_backup còn cho service_role chạy mỗi đêm).
-- • Không đụng tài khoản, vai trò, quyền (giống admin_wipe_business_data).

-- stamp_row: khi đang khôi phục (cờ app.restoring) thì giữ nguyên created_by / created_at / updated_at trong bản sao lưu
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
  end if;
  return new;
end $$;

create table public.backups (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  kind        text not null default 'manual' check (kind in ('manual', 'nightly', 'before_restore')),
  note        text,
  size_bytes  bigint not null default 0,
  counts      jsonb not null default '{}'::jsonb,   -- số dòng từng bảng
  data        jsonb not null,                       -- toàn bộ dữ liệu (chỉ Admin lấy được qua get_backup_data)
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) default auth.uid()
);
create index backups_company_idx on public.backups (company_id, created_at desc);
alter table public.backups enable row level security;
create policy backups_select on public.backups for select to authenticated
  using (company_id = (select public.current_company_id()) and (select public.has_permission('catalog', 'view')));
create policy backups_delete on public.backups for delete to authenticated
  using (company_id = (select public.current_company_id()) and (select public.is_admin()));
-- Không cho đọc cột data trực tiếp (nặng, và chứa mọi dữ liệu): chỉ các cột mô tả
revoke all on public.backups from authenticated, anon;
grant select (id, company_id, kind, note, size_bytes, counts, created_at, created_by) on public.backups to authenticated;
grant delete on public.backups to authenticated;

-- Thứ tự bảng: bảng cha trước, bảng con sau (khôi phục chèn theo thứ tự này, xóa theo thứ tự ngược = admin_wipe_business_data)
create or replace function public._backup_tables() returns text[]
language sql immutable as $$
  select array[
    'customers', 'employees', 'workers', 'subcontractors', 'suppliers', 'catalog_items', 'contact_private', 'projects',
    'profile_projects', 'expenses', 'expense_lines', 'timesheet_weeks', 'timesheet_lines', 'wage_advances', 'main_contracts',
    'subcontracts', 'settlements', 'receipts', 'payable_closures', 'payments', 'payment_allocations', 'equipment',
    'cost_allocations', 'schedule_templates', 'schedule_phases', 'schedule_tasks', 'schedule_notes'
  ]
$$;

create or replace function public._snapshot_company(p_company uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t text;
  rows jsonb;
  res jsonb := '{}'::jsonb;
begin
  foreach t in array public._backup_tables() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where company_id = $1', t) into rows using p_company;
    res := res || jsonb_build_object(t, rows);
  end loop;
  return jsonb_build_object(
    'app', 'qlcp', 'version', 1, 'taken_at', now(), 'company_id', p_company,
    'company', (select to_jsonb(c) from public.companies c where c.id = p_company),
    'tables', res);
end $$;

create or replace function public._snapshot_counts(snap jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(key, jsonb_array_length(value)), '{}'::jsonb) from jsonb_each(snap -> 'tables')
$$;

-- Lưu 1 bản sao lưu trong kho. Admin gọi từ app; service_role (script mỗi đêm) truyền p_company.
create or replace function public.create_backup(p_kind text default 'manual', p_note text default null, p_company uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  co uuid;
  snap jsonb;
  new_id uuid;
begin
  if auth.role() = 'service_role' then
    co := p_company;
  elsif public.is_admin() then
    co := public.current_company_id();
  else
    raise exception 'Chỉ Admin được sao lưu' using errcode = '42501';
  end if;
  if co is null then raise exception 'Thiếu công ty cần sao lưu'; end if;
  if p_kind not in ('manual', 'nightly', 'before_restore') then raise exception 'Loại sao lưu không hợp lệ'; end if;
  snap := public._snapshot_company(co);
  insert into public.backups (company_id, kind, note, size_bytes, counts, data, created_by)
  values (co, p_kind, p_note, length(snap::text), public._snapshot_counts(snap), snap, auth.uid())
  returning id into new_id;
  -- giữ 30 bản mới nhất của mỗi loại
  delete from public.backups b
  where b.company_id = co and b.kind = p_kind
    and b.id not in (select id from public.backups where company_id = co and kind = p_kind order by created_at desc limit 30);
  return new_id;
end $$;

-- Lấy toàn bộ dữ liệu để người dùng tải file JSON (không lưu trong kho)
create or replace function public.export_company_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Chỉ Admin được tải bản sao lưu' using errcode = '42501'; end if;
  return public._snapshot_company(public.current_company_id());
end $$;

create or replace function public.get_backup_data(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d jsonb;
begin
  if not public.is_admin() then raise exception 'Chỉ Admin được tải bản sao lưu' using errcode = '42501'; end if;
  select b.data into d from public.backups b where b.id = p_id and b.company_id = public.current_company_id();
  if d is null then raise exception 'Không thấy bản sao lưu'; end if;
  return d;
end $$;

-- Khôi phục: tự lưu 1 bản "trước khi khôi phục", xóa dữ liệu nghiệp vụ hiện tại, nạp lại từ bản sao lưu — trong MỘT giao dịch
-- (lỗi giữa chừng thì tự quay về như cũ, không mất gì). Không đụng tài khoản / vai trò / quyền.
create or replace function public.restore_backup(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  co uuid := public.current_company_id();
  t text;
  rows jsonb;
  n int;
  report jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then raise exception 'Chỉ Admin được khôi phục' using errcode = '42501'; end if;
  if p_data is null or p_data ->> 'app' <> 'qlcp' or (p_data ->> 'version')::int <> 1 or jsonb_typeof(p_data -> 'tables') <> 'object' then
    raise exception 'File không phải bản sao lưu của app này';
  end if;
  if (p_data ->> 'company_id')::uuid is distinct from co then
    raise exception 'Bản sao lưu thuộc công ty khác';
  end if;
  perform public.create_backup('before_restore', 'Tự lưu trước khi khôi phục');
  perform set_config('app.restoring', '1', true);
  perform public.admin_wipe_business_data(co);
  foreach t in array public._backup_tables() loop
    rows := coalesce(p_data -> 'tables' -> t, '[]'::jsonb);
    if t = 'profile_projects' then
      -- chỉ giao lại công trình cho tài khoản còn tồn tại
      execute 'insert into public.profile_projects select r.* from jsonb_populate_recordset(null::public.profile_projects, $1) r where r.profile_id in (select id from public.profiles)' using rows;
    elsif t = 'employees' then
      execute 'insert into public.employees select r.* from jsonb_populate_recordset(null::public.employees, $1) r' using rows;
      update public.employees set profile_id = null where company_id = co and profile_id is not null and profile_id not in (select id from public.profiles);
    else
      execute format('insert into public.%I select r.* from jsonb_populate_recordset(null::public.%I, $1) r', t, t) using rows;
    end if;
    get diagnostics n = row_count;
    report := report || jsonb_build_object(t, n);
  end loop;
  perform set_config('app.restoring', '0', true);
  return report;
end $$;

revoke execute on function public._snapshot_company(uuid), public._snapshot_counts(jsonb), public._backup_tables() from public, anon, authenticated;
revoke execute on function public.create_backup(text, text, uuid), public.export_company_snapshot(), public.get_backup_data(uuid), public.restore_backup(jsonb) from public, anon;
grant execute on function public.create_backup(text, text, uuid), public.export_company_snapshot(), public.get_backup_data(uuid), public.restore_backup(jsonb) to authenticated, service_role;

-- get_my_access: thêm logo_url của công ty
create or replace function public.get_my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'must_change_password', p.must_change_password, 'project_scope', p.project_scope,
      'company_id', p.company_id),
    'company', jsonb_build_object('id', c.id, 'name', c.name, 'short_name', c.short_name, 'slug', c.slug, 'logo_url', c.logo_url),
    'role', jsonb_build_object('id', r.id, 'name', r.name, 'is_admin', r.is_admin),
    'special', jsonb_build_object(
      'see_contact_ids', r.is_admin or r.see_contact_ids,
      'edit_others', r.is_admin or r.edit_others,
      'purge_trash', r.is_admin or r.purge_trash),
    'permissions', coalesce((
      select jsonb_object_agg(m.key, case when r.is_admin then 'full' else coalesce(rp.level, 'none') end)
      from public.app_modules m
      left join public.role_permissions rp on rp.role_id = r.id and rp.module = m.key
    ), '{}'::jsonb),
    'project_ids', coalesce((
      select jsonb_agg(pp.project_id) from public.profile_projects pp where pp.profile_id = p.id
    ), '[]'::jsonb)
  )
  from public.profiles p
  join public.roles r on r.id = p.role_id
  join public.companies c on c.id = p.company_id
  where p.id = auth.uid() and not p.is_locked and p.deleted_at is null
$$;
