-- GĐ1 — Công ty, vai trò, quyền, tài khoản (KẾ HOẠCH mục 4C)
-- Mức quyền: none (Ẩn) < view (Xem) < add (Nhập: thêm + sửa dòng của mình) < full (Toàn quyền)

-- ============ Hàm dùng chung ============
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ============ Công ty ============
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- Tên đầy đủ
  short_name  text,                          -- Tên ngắn trên menu
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),  -- dùng làm đuôi email ẩn
  logo_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

-- ============ Danh sách mục (module) để phân quyền ============
create table public.app_modules (
  key         text primary key,
  label       text not null,     -- tên hiện trong bảng quyền
  sort_order  int  not null
);

-- ============ Vai trò ============
create table public.roles (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id),
  name                  text not null,
  description           text,
  is_admin              boolean not null default false,  -- Admin luôn toàn quyền, không sửa được
  sort_order            int not null default 100,
  -- Quyền đặc biệt
  see_contact_ids       boolean not null default false,  -- Xem SĐT, số CCCD
  edit_others           boolean not null default false,  -- Sửa / xóa dòng người khác nhập
  purge_trash           boolean not null default false,  -- Xóa vĩnh viễn trong Thùng rác
  default_project_scope text not null default 'all' check (default_project_scope in ('all','assigned')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  created_by            uuid references auth.users(id),
  unique (company_id, name)
);
create trigger roles_updated_at before update on public.roles
  for each row execute function public.set_updated_at();

create table public.role_permissions (
  role_id     uuid not null references public.roles(id) on delete cascade,
  module      text not null references public.app_modules(key),
  level       text not null default 'none' check (level in ('none','view','add','full')),
  company_id  uuid not null references public.companies(id),
  updated_at  timestamptz not null default now(),
  primary key (role_id, module)
);
create trigger role_permissions_updated_at before update on public.role_permissions
  for each row execute function public.set_updated_at();

-- ============ Tài khoản ============
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  company_id            uuid not null references public.companies(id),
  username              text not null check (username ~ '^[a-z0-9._-]{2,32}$'),
  display_name          text not null,      -- = Người TH khi nhập liệu
  role_id               uuid not null references public.roles(id),
  must_change_password  boolean not null default true,
  project_scope         text not null default 'all' check (project_scope in ('all','assigned')),
  is_locked             boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  created_by            uuid references auth.users(id),
  unique (company_id, username)
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Phạm vi công trình (khi project_scope = 'assigned').
-- Khóa ngoại tới projects được thêm ở GĐ2 khi có bảng projects.
create table public.profile_projects (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid not null,
  company_id  uuid not null references public.companies(id),
  created_at  timestamptz not null default now(),
  primary key (profile_id, project_id)
);

-- ============ Hàm quyền (dùng trong RLS) ============
create or replace function public.level_rank(lvl text) returns int
language sql immutable as $$
  select case lvl when 'none' then 0 when 'view' then 1 when 'add' then 2 when 'full' then 3 else -1 end
$$;

-- Công ty của người đang đăng nhập (null nếu chưa đăng nhập / bị khóa)
create or replace function public.current_company_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.company_id from public.profiles p
  where p.id = auth.uid() and not p.is_locked and p.deleted_at is null
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select r.is_admin from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and not p.is_locked and p.deleted_at is null
  ), false)
$$;

-- has_permission('expenses','add') = người đang đăng nhập có mức >= 'add' ở mục expenses không
create or replace function public.has_permission(module text, level text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select r.is_admin or public.level_rank(coalesce(rp.level, 'none')) >= public.level_rank(has_permission.level)
    from public.profiles p
    join public.roles r on r.id = p.role_id and r.deleted_at is null
    left join public.role_permissions rp on rp.role_id = r.id and rp.module = has_permission.module
    where p.id = auth.uid() and not p.is_locked and p.deleted_at is null
  ), false)
$$;

-- Quyền đặc biệt: 'see_contact_ids' | 'edit_others' | 'purge_trash'
create or replace function public.has_special(flag text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select r.is_admin or case flag
      when 'see_contact_ids' then r.see_contact_ids
      when 'edit_others' then r.edit_others
      when 'purge_trash' then r.purge_trash
      else false end
    from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and not p.is_locked and p.deleted_at is null
  ), false)
$$;

-- Thông tin quyền của người đang đăng nhập, app gọi 1 lần sau khi đăng nhập
create or replace function public.get_my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'must_change_password', p.must_change_password, 'project_scope', p.project_scope,
      'company_id', p.company_id),
    'company', jsonb_build_object('id', c.id, 'name', c.name, 'short_name', c.short_name, 'slug', c.slug),
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

-- Sau khi người dùng tự đổi mật khẩu lần đầu
create or replace function public.complete_password_change() returns void
language sql volatile security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = auth.uid()
$$;

-- Ai cũng tự đổi được tên hiển thị của mình
create or replace function public.update_my_display_name(new_name text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if coalesce(trim(new_name), '') = '' then raise exception 'Tên hiển thị không được trống'; end if;
  update public.profiles set display_name = upper(trim(new_name)) where id = auth.uid();
end $$;

-- Danh sách tài khoản cho tab Tài Khoản & Quyền (kèm lần đăng nhập gần nhất)
create or replace function public.admin_list_accounts()
returns table (
  id uuid, username text, display_name text, role_id uuid, role_name text,
  project_scope text, must_change_password boolean, is_locked boolean,
  last_sign_in_at timestamptz, created_at timestamptz, project_ids uuid[]
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('accounts', 'view') then
    raise exception 'Không có quyền xem tài khoản' using errcode = '42501';
  end if;
  return query
    select p.id, p.username, p.display_name, p.role_id, r.name, p.project_scope,
           p.must_change_password, p.is_locked, u.last_sign_in_at, p.created_at,
           coalesce(array(select pp.project_id from public.profile_projects pp where pp.profile_id = p.id), '{}')
    from public.profiles p
    join public.roles r on r.id = p.role_id
    join auth.users u on u.id = p.id
    where p.company_id = public.current_company_id() and p.deleted_at is null
    order by r.sort_order, p.created_at;
end $$;

-- ============ Chặn thao tác nguy hiểm ============
-- Không ai sửa / xóa vai trò Admin, không cho quyền của Admin
create or replace function public.guard_roles() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.is_admin then raise exception 'Không xóa được vai trò Admin'; end if;
    if exists (select 1 from public.profiles where role_id = old.id and deleted_at is null) then
      raise exception 'Vai trò đang có người dùng, không xóa được';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.is_admin and (not new.is_admin or new.deleted_at is not null) then
    raise exception 'Không sửa được vai trò Admin';
  end if;
  if tg_op = 'INSERT' and new.is_admin and auth.uid() is not null then
    raise exception 'Không tạo thêm vai trò Admin được';
  end if;
  if tg_op = 'UPDATE' and not old.is_admin and new.is_admin then
    raise exception 'Không biến vai trò thường thành Admin được';
  end if;
  return new;
end $$;
create trigger roles_guard before insert or update or delete on public.roles
  for each row execute function public.guard_roles();

create or replace function public.guard_role_permissions() returns trigger
language plpgsql as $$
declare rid uuid := coalesce(new.role_id, old.role_id);
begin
  if auth.uid() is not null and exists (select 1 from public.roles where id = rid and is_admin) then
    raise exception 'Admin luôn toàn quyền, không sửa được';
  end if;
  return coalesce(new, old);
end $$;
create trigger role_permissions_guard before insert or update or delete on public.role_permissions
  for each row execute function public.guard_role_permissions();

-- Admin không tự khóa / tự hạ quyền mình; không ai đổi username, công ty qua đường thường
create or replace function public.guard_profiles() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;  -- service role (hàm admin-users) được phép
  if new.id = auth.uid() and (new.role_id <> old.role_id or new.is_locked or new.deleted_at is not null) then
    raise exception 'Không tự khóa hoặc tự đổi vai trò của mình được';
  end if;
  if new.username <> old.username or new.company_id <> old.company_id then
    raise exception 'Không đổi được tên đăng nhập / công ty';
  end if;
  if new.is_locked <> old.is_locked then
    raise exception 'Khóa / mở khóa phải qua chức năng Khóa tài khoản';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profiles();

-- ============ RLS ============
alter table public.companies        enable row level security;
alter table public.app_modules      enable row level security;
alter table public.roles            enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles         enable row level security;
alter table public.profile_projects enable row level security;

create policy companies_select on public.companies for select to authenticated
  using (id = public.current_company_id());
create policy companies_update on public.companies for update to authenticated
  using (id = public.current_company_id() and public.is_admin())
  with check (id = public.current_company_id());

create policy app_modules_select on public.app_modules for select to authenticated using (true);

create policy roles_select on public.roles for select to authenticated
  using (company_id = public.current_company_id());
create policy roles_insert on public.roles for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_permission('accounts','full'));
create policy roles_update on public.roles for update to authenticated
  using (company_id = public.current_company_id() and public.has_permission('accounts','full'))
  with check (company_id = public.current_company_id());
create policy roles_delete on public.roles for delete to authenticated
  using (company_id = public.current_company_id() and public.has_permission('accounts','full'));

create policy role_permissions_select on public.role_permissions for select to authenticated
  using (company_id = public.current_company_id());
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (company_id = public.current_company_id() and public.has_permission('accounts','full'))
  with check (company_id = public.current_company_id() and public.has_permission('accounts','full'));

-- Tài khoản: tự xem dòng mình; người có quyền Tài khoản xem cả công ty; chỉ Toàn quyền mới sửa.
-- Tạo / xóa tài khoản chỉ qua Edge Function admin-users (service role).
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or (company_id = public.current_company_id() and public.has_permission('accounts','view')));
create policy profiles_update on public.profiles for update to authenticated
  using (company_id = public.current_company_id() and public.has_permission('accounts','full'))
  with check (company_id = public.current_company_id());

create policy profile_projects_select on public.profile_projects for select to authenticated
  using (profile_id = auth.uid() or (company_id = public.current_company_id() and public.has_permission('accounts','view')));
create policy profile_projects_write on public.profile_projects for all to authenticated
  using (company_id = public.current_company_id() and public.has_permission('accounts','full'))
  with check (company_id = public.current_company_id() and public.has_permission('accounts','full'));

-- Hàm quyền cho phép gọi từ app
grant execute on function public.has_permission(text, text) to authenticated;
grant execute on function public.has_special(text) to authenticated;
grant execute on function public.get_my_access() to authenticated;
grant execute on function public.complete_password_change() to authenticated;
grant execute on function public.update_my_display_name(text) to authenticated;
grant execute on function public.admin_list_accounts() to authenticated;
revoke execute on function public.get_my_access() from anon;
revoke execute on function public.admin_list_accounts() from anon;
