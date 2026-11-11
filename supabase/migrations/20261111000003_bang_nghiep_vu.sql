-- GĐ2 — Bảng nghiệp vụ (KẾ HOẠCH mục 4, 4C, 4F, 4G, 4J, 4K, 4L) + bảng Tiến Độ cho GĐ12
-- Quy ước:
--   • Mọi bảng: id, company_id, created_at, updated_at, deleted_at (xóa mềm), created_by (= Người TH).
--   • Tiền: bigint (đồng, số nguyên). Khối lượng / số công: numeric.
--   • RLS: đọc theo has_permission(module,'view'); thêm = 'add'; sửa = 'full' hoặc ('add' + dòng của mình / quyền edit_others);
--     xóa hẳn = 'full' + purge_trash + dòng đã ở thùng rác. Bảng có công trình còn lọc theo phạm vi công trình của tài khoản.

-- ============ Hàm quyền bổ sung ============
create or replace function public.has_any_permission(modules text[], level text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select bool_or(public.has_permission(m, has_any_permission.level)) from unnest(modules) as m
  ), false)
$$;

-- Tài khoản thấy mọi công trình (Admin hoặc project_scope = 'all')
create or replace function public.sees_all_projects() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select r.is_admin or p.project_scope = 'all'
    from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and not p.is_locked and p.deleted_at is null
  ), false)
$$;

-- Các công trình được giao (khi project_scope = 'assigned')
create or replace function public.my_project_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select pp.project_id from public.profile_projects pp
  join public.profiles p on p.id = pp.profile_id
  where p.id = auth.uid() and not p.is_locked and p.deleted_at is null
$$;

-- Được sửa dòng này không: Toàn quyền, hoặc Nhập + (dòng của mình hoặc có quyền sửa dòng người khác)
create or replace function public.can_edit_row(modules text[], row_created_by uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_any_permission(modules, 'full')
      or (public.has_any_permission(modules, 'add')
          and (row_created_by = auth.uid() or public.has_special('edit_others')))
$$;

-- Tự ghi Người TH + thời điểm. Người dùng thường không giả được created_by / company_id.
-- Service role (script chuyển dữ liệu) được giữ nguyên thời điểm cũ.
create or replace function public.stamp_row() returns trigger
language plpgsql as $$
begin
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

-- ============ Danh Bạ ============
-- Khách hàng (chủ đầu tư)
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  name        text not null,          -- Tên gọi (A Huynh, Cô Sáu…)
  full_name   text,                   -- Họ tên đầy đủ
  address     text,
  email       text,
  tax_code    text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id) default auth.uid()
);
create unique index customers_name_uq on public.customers (company_id, lower(name)) where deleted_at is null;

-- Nhân viên
create table public.employees (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  full_name   text not null,
  title       text,                   -- Chức danh
  profile_id  uuid references public.profiles(id) on delete set null,  -- tài khoản app (nếu có)
  started_on  date,                   -- Ngày vào làm
  note        text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id) default auth.uid()
);

-- Công nhân
create table public.workers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  name        text not null,          -- Tên gọi trong sổ chấm công (HIỀN, LONG…)
  role        text check (role in ('C','T','P')),  -- Chính / Thợ / Phụ
  full_name   text,                   -- Họ tên theo CCCD
  note        text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id) default auth.uid()
);
create unique index workers_name_uq on public.workers (company_id, lower(name)) where deleted_at is null;

-- Thầu phụ
create table public.subcontractors (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default public.current_company_id() references public.companies(id),
  name           text not null,
  field          text,                -- Lĩnh vực
  contact_person text,                -- Người liên hệ
  note           text,
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  created_by     uuid references auth.users(id) default auth.uid()
);
create unique index subcontractors_name_uq on public.subcontractors (company_id, lower(name)) where deleted_at is null;

-- Nhà cung cấp (tách khỏi danh mục vì có địa chỉ, SĐT cửa hàng, công tắc Mua nợ — mục 4F)
create table public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default public.current_company_id() references public.companies(id),
  name           text not null,
  address        text,
  phone          text,                -- SĐT cửa hàng in trên hóa đơn
  buys_on_credit boolean not null default false,  -- Mua nợ: hóa đơn mới tự bỏ tích Đã TT
  note           text,
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  created_by     uuid references auth.users(id) default auth.uid()
);
create unique index suppliers_name_uq on public.suppliers (company_id, lower(name)) where deleted_at is null;

-- Thông tin cá nhân nhạy cảm (SĐT, CCCD, tài khoản nhận lương) của khách hàng / công nhân / nhân viên / thầu phụ.
-- Để bảng riêng vì RLS chỉ chặn được theo DÒNG: bảng này chỉ đọc được khi có quyền "Xem SĐT, số CCCD".
-- Người không có quyền dùng hàm list_contact_private_masked() để lấy bản đã che (079188•••123).
create table public.contact_private (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null default public.current_company_id() references public.companies(id),
  customer_id       uuid unique references public.customers(id) on delete cascade,
  worker_id         uuid unique references public.workers(id) on delete cascade,
  employee_id       uuid unique references public.employees(id) on delete cascade,
  subcontractor_id  uuid unique references public.subcontractors(id) on delete cascade,
  phone             text,
  id_number         text,             -- Số CCCD (chỉ lưu chữ, không lưu ảnh)
  id_issued_on      date,
  id_issued_place   text,
  date_of_birth     date,
  gender            text,
  hometown          text,             -- Quê quán
  permanent_address text,             -- Nơi thường trú
  bank_account      text,             -- Tài khoản nhận lương
  bank_name         text,
  bank_holder       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  created_by        uuid references auth.users(id) default auth.uid(),
  check (num_nonnulls(customer_id, worker_id, employee_id, subcontractor_id) = 1)
);

-- ============ Danh mục ngắn ============
create table public.catalog_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  kind        text not null check (kind in ('expense_type','person','equipment_name','unit')),
              -- Loại chi phí / Người mua / Tên thiết bị / Đơn vị tính
  name        text not null,
  archived    boolean not null default false,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id) default auth.uid()
);
create unique index catalog_items_name_uq on public.catalog_items (company_id, kind, lower(name)) where deleted_at is null;

-- ============ Công trình ============
create table public.projects (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null default public.current_company_id() references public.companies(id),
  name                   text not null,
  kind                   text check (kind in ('new_build','renovation','small_repair')),  -- CT / SC / SN-Khác
  status                 text not null default 'active' check (status in ('planning','active','completed','closed')),
  is_company_overhead    boolean not null default false,   -- dòng đặc biệt CÔNG TY (chi phí chung)
  customer_id            uuid references public.customers(id),
  owner_name             text,                             -- tên chủ đầu tư ghi tay (khi chưa gắn khách hàng)
  address                text,                             -- địa chỉ công trình
  scope_note             text,                             -- hạng mục (phần trong ngoặc của tên)
  cost_weight_k          numeric(8,3) check (cost_weight_k >= 0),  -- hệ số k; null = mặc định 1; 0 = không gánh CP chung
  floor_areas            jsonb not null default '[]'::jsonb,       -- khối lượng sàn [{ten,dvt,kl,heSo,tinh}]
  start_date             date,
  start_date_user_edited boolean not null default false,
  end_date               date,
  completed_date         date,
  closed_date            date,
  created_year           int,                              -- thay cat_ct_years (mục 4K)
  aliases                text[] not null default '{}',     -- tên cũ đã chuẩn hóa (không dấu, chữ thường)
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  created_by             uuid references auth.users(id) default auth.uid(),
  check (is_company_overhead or kind is not null)
);
create unique index projects_name_uq on public.projects (company_id, lower(name)) where deleted_at is null;
create unique index projects_overhead_uq on public.projects (company_id) where is_company_overhead and deleted_at is null;
create index projects_customer_idx on public.projects (customer_id);

alter table public.profile_projects
  add constraint profile_projects_project_fk foreign key (project_id) references public.projects(id) on delete cascade;

-- ============ Hóa đơn chi phí ============
create table public.expenses (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null default public.current_company_id() references public.companies(id),
  project_id         uuid not null references public.projects(id),
  date               date not null,
  expense_type_id    uuid not null references public.catalog_items(id),  -- Loại chi phí
  supplier_id        uuid references public.suppliers(id),
  buyer_id           uuid references public.catalog_items(id),           -- Người mua (danh mục person)
  paid_at_purchase   boolean not null default true,                      -- Đã TT (mục 4F)
  description        text not null default '',
  amount             bigint not null,                                    -- Thành tiền
  invoice_no         text,
  source             text not null default 'quick' check (source in ('quick','detail','scan','import')),
  receipt_image_path text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  created_by         uuid references auth.users(id) default auth.uid()
);
create index expenses_project_date_idx on public.expenses (project_id, date);
create index expenses_company_date_idx on public.expenses (company_id, date);
create index expenses_supplier_idx on public.expenses (supplier_id, date);
create index expenses_type_idx on public.expenses (expense_type_id);

create table public.expense_lines (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  position    int not null default 0,
  name        text not null default '',
  unit        text,                       -- ĐVT
  quantity    numeric(14,3) not null default 0,
  unit_price  bigint not null default 0,
  discount    text,                       -- chiết khấu ghi tay (app cũ: ck)
  amount      bigint not null default 0,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id) default auth.uid()
);
create index expense_lines_expense_idx on public.expense_lines (expense_id, position);

-- ============ Chấm công ============
create table public.timesheet_weeks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  project_id  uuid not null references public.projects(id),
  week_start  date not null check (extract(dow from week_start) = 0),  -- Chủ nhật đầu tuần
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id) default auth.uid()
);
-- Mỗi công trình mỗi tuần 1 dòng (không tính dòng đã xóa)
create unique index timesheet_weeks_uq on public.timesheet_weeks (company_id, project_id, week_start) where deleted_at is null;
create index timesheet_weeks_start_idx on public.timesheet_weeks (company_id, week_start);

create table public.timesheet_lines (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null default public.current_company_id() references public.companies(id),
  week_id          uuid not null references public.timesheet_weeks(id) on delete cascade,
  worker_id        uuid not null references public.workers(id),
  position         int not null default 0,
  role             text check (role in ('C','T','P')),     -- C/T/P tại thời điểm chấm
  day_units        numeric(4,2)[] not null default '{0,0,0,0,0,0,0}'
                   check (array_length(day_units, 1) = 7), -- CN..T7
  daily_wage       bigint not null default 0,              -- Lương/ngày
  allowance        bigint not null default 0,              -- Phụ cấp
  retail_purchase  bigint not null default 0,              -- HĐ mua lẻ
  debt_deduction   bigint not null default 0,              -- Trừ nợ (app cũ: tru)
  legacy_loan      bigint not null default 0,              -- Ứng ghi thẳng trong tuần đời cũ (loanAmount)
  note             text,                                   -- Nội dung
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  created_by       uuid references auth.users(id) default auth.uid()
);
create index timesheet_lines_week_idx on public.timesheet_lines (week_id, position);
create index timesheet_lines_worker_idx on public.timesheet_lines (worker_id);
create unique index timesheet_lines_uq on public.timesheet_lines (week_id, worker_id) where deleted_at is null;

-- Tạm ứng lương (ứng / trả của công nhân — mục 4L)
create table public.wage_advances (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null default public.current_company_id() references public.companies(id),
  worker_id         uuid not null references public.workers(id),
  project_id        uuid references public.projects(id),
  date              date not null,
  direction         text not null check (direction in ('advance','repay')),  -- ứng (+) / trả (−)
  amount            bigint not null check (amount >= 0),
  counts_in_net_pay boolean not null default false,  -- tính vào Thực lãnh của tuần chứa ngày này
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  created_by        uuid references auth.users(id) default auth.uid()
);
create index wage_advances_worker_idx on public.wage_advances (worker_id, date);
create index wage_advances_date_idx on public.wage_advances (company_id, date);

-- ============ Hợp đồng, thu tiền, quyết toán ============
-- HĐ chính: mỗi công trình 1 hợp đồng
create table public.main_contracts (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null default public.current_company_id() references public.companies(id),
  project_id       uuid not null references public.projects(id),
  date             date,
  value            bigint not null default 0,   -- giá trị HĐ (giaTri)
  extra_value      bigint not null default 0,   -- giá trị phụ (giaTriphu)
  legacy_variation bigint not null default 0,   -- phát sinh đời cũ (phatSinh)
  quantity         numeric(14,3),               -- SL × đơn giá khi không có hạng mục
  unit_price       bigint,
  items            jsonb not null default '[]'::jsonb,  -- hạng mục [{name,donVi,sl,donGia}]
  customer_name    text,                        -- tên chủ đầu tư ghi trên HĐ
  description      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  created_by       uuid references auth.users(id) default auth.uid()
);
create unique index main_contracts_project_uq on public.main_contracts (project_id) where deleted_at is null;

-- HĐ thầu phụ
create table public.subcontracts (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null default public.current_company_id() references public.companies(id),
  project_id       uuid not null references public.projects(id),
  subcontractor_id uuid not null references public.subcontractors(id),
  date             date,
  value            bigint not null default 0,
  legacy_variation bigint not null default 0,   -- phát sinh đời cũ (phatSinh)
  quantity         numeric(14,3),
  unit_price       bigint,
  items            jsonb not null default '[]'::jsonb,
  description      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  created_by       uuid references auth.users(id) default auth.uid()
);
create index subcontracts_project_idx on public.subcontracts (project_id, date);
create index subcontracts_sub_idx on public.subcontracts (subcontractor_id);

-- Quyết toán
create table public.settlements (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  project_id  uuid not null references public.projects(id),
  date        date not null,
  kind        text not null check (kind in ('increase','decrease','replace')),  -- tăng / giảm / thay thế HĐ
  amount      bigint not null check (amount >= 0),   -- số tiền người dùng nhập (luôn dương)
  is_final    boolean not null default false,        -- Chốt (quyết toán cuối, đóng công trình)
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id) default auth.uid()
);
create index settlements_project_idx on public.settlements (project_id, date);

-- Thu tiền
create table public.receipts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null default public.current_company_id() references public.companies(id),
  project_id    uuid not null references public.projects(id),
  date          date not null,
  amount        bigint not null,
  kind          text not null default 'other' check (kind in ('advance','stage','settlement','other')),
                -- Tạm ứng / Giai đoạn / Quyết toán / Khác
  is_auto       boolean not null default false,   -- phiếu tự sinh khi Chốt quyết toán (không sửa / xóa tay)
  settlement_id uuid references public.settlements(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references auth.users(id) default auth.uid()
);
create index receipts_project_idx on public.receipts (project_id, date);
create index receipts_date_idx on public.receipts (company_id, date);

-- ============ Chi trả TP / NCC, công nợ phải trả ============
-- Tất toán: ai tất toán, khi nào (để hoàn tác được)
create table public.payable_closures (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null default public.current_company_id() references public.companies(id),
  party_kind       text not null check (party_kind in ('subcontractor','supplier')),
  subcontractor_id uuid references public.subcontractors(id),
  supplier_id      uuid references public.suppliers(id),
  project_id       uuid references public.projects(id),
  closed_on        date not null,
  amount           bigint not null default 0,    -- số tiền của phiếu chi tất toán
  closed_by_name   text,                         -- Người TH chọn lúc tất toán
  note             text,
  undone_at        timestamptz,                  -- đã hoàn tác
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  created_by       uuid references auth.users(id) default auth.uid(),
  check ((party_kind = 'subcontractor' and subcontractor_id is not null and supplier_id is null)
      or (party_kind = 'supplier' and supplier_id is not null and subcontractor_id is null))
);

-- Phiếu chi TP / NCC (app cũ: tiền ứng thầu phụ / nhà cung cấp)
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null default public.current_company_id() references public.companies(id),
  kind             text not null check (kind in ('advance','progress','supplier_payment')),
                   -- Tạm ứng TP / Thanh toán đợt TP / Trả nợ NCC
  date             date not null,
  amount           bigint not null,
  subcontractor_id uuid references public.subcontractors(id),
  subcontract_id   uuid references public.subcontracts(id) on delete set null,
  supplier_id      uuid references public.suppliers(id),
  project_id       uuid references public.projects(id),  -- null được với Trả nợ NCC theo cục
  allocation_mode  text not null default 'fifo' check (allocation_mode in ('fifo','project','manual')),
                   -- Trả nợ NCC: chia cũ nhất trước / chỉ trong công trình project_id / tích tay từng hóa đơn (mục 4J)
  closure_id       uuid references public.payable_closures(id) on delete set null,  -- phiếu sinh từ Tất toán
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  created_by       uuid references auth.users(id) default auth.uid(),
  check ((kind = 'supplier_payment' and supplier_id is not null and subcontractor_id is null and subcontract_id is null)
      or (kind in ('advance','progress') and subcontractor_id is not null and supplier_id is null and project_id is not null)),
  check (allocation_mode <> 'project' or project_id is not null)
);
create index payments_project_idx on public.payments (project_id, date);
create index payments_supplier_idx on public.payments (supplier_id, date);
create index payments_sub_idx on public.payments (subcontractor_id, date);
create index payments_date_idx on public.payments (company_id, date);

-- Phiếu chi NCC ↔ hóa đơn: số tiền đã chia (mục 4J).
-- expense_id null = phần tiền của phiếu gắn công trình nhưng không còn hóa đơn mua nợ nào để chia
-- (dữ liệu cũ trả dư) — vẫn tính là "đã trả" của công trình project_id để lãi / lỗ khớp app cũ.
create table public.payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  payment_id  uuid not null references public.payments(id) on delete cascade,
  expense_id  uuid references public.expenses(id) on delete cascade,
  project_id  uuid not null references public.projects(id),
  amount      bigint not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id) default auth.uid()
);
create index payment_allocations_payment_idx on public.payment_allocations (payment_id);
create index payment_allocations_expense_idx on public.payment_allocations (expense_id);
create index payment_allocations_project_idx on public.payment_allocations (project_id);

-- ============ Thiết bị ============
create table public.equipment (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  name_id     uuid not null references public.catalog_items(id),   -- Tên thiết bị (danh mục equipment_name)
  location    text not null check (location in ('project','warehouse','scaffold')),
              -- Tại công trình / Kho thiết bị công ty / Kho vật tư giàn giáo
  project_id  uuid references public.projects(id),
  quantity    numeric(12,2) not null default 1,
  condition   text not null default 'working' check (condition in ('working','needs_maintenance','needs_repair')),
              -- Đang hoạt động / Cần bảo trì / Cần sửa chữa
  date        date,
  note        text,   -- Thông tin máy
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id) default auth.uid(),
  check ((location = 'project') = (project_id is not null))
);
create index equipment_project_idx on public.equipment (project_id);
create index equipment_name_idx on public.equipment (name_id);

-- ============ Tỉ trọng & định mức (giữ jsonb như app cũ) ============
create table public.cost_allocations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  kind        text not null check (kind in ('project','benchmark','config')),
              -- phân bổ theo công trình / định mức / cấu hình rổ
  project_id  uuid references public.projects(id),
  name        text,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id) default auth.uid(),
  check ((kind = 'project') = (project_id is not null))
);
create unique index cost_allocations_project_uq on public.cost_allocations (project_id) where kind = 'project' and deleted_at is null;
create unique index cost_allocations_config_uq on public.cost_allocations (company_id) where kind = 'config' and deleted_at is null;

-- ============ Tiến Độ (GĐ12) ============
-- Mẫu giai đoạn / lịch nghỉ
create table public.schedule_templates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  kind        text not null default 'phases' check (kind in ('phases','calendar')),  -- mẫu giai đoạn / lịch nghỉ
  name        text not null,
  project_kind text check (project_kind in ('new_build','renovation','small_repair')),
  is_default  boolean not null default false,
  data        jsonb not null default '[]'::jsonb,   -- phases: [{name, days, tasks:[…]}]; calendar: {weekdays_off, holidays}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id) default auth.uid()
);

-- Giai đoạn của công trình (dùng chung với giai đoạn của Tỉ Trọng qua cost_phase_key)
create table public.schedule_phases (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default public.current_company_id() references public.companies(id),
  project_id     uuid not null references public.projects(id),
  name           text not null,
  position       int not null default 0,
  start_date     date,
  end_date       date,
  cost_phase_key text,   -- id giai đoạn trong cost_allocations.data.giaiDoan
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  created_by     uuid references auth.users(id) default auth.uid()
);
create index schedule_phases_project_idx on public.schedule_phases (project_id, position);

-- Việc
create table public.schedule_tasks (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null default public.current_company_id() references public.companies(id),
  project_id    uuid not null references public.projects(id),
  phase_id      uuid references public.schedule_phases(id) on delete cascade,
  name          text not null,
  position      int not null default 0,
  start_date    date,
  end_date      date,
  progress_pct  numeric(5,2) not null default 0 check (progress_pct between 0 and 100),
  assignee      text,                               -- người phụ trách (ghi tay)
  assignee_id   uuid references public.profiles(id) on delete set null,
  depends_on    uuid[] not null default '{}',       -- các việc phải xong trước
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references auth.users(id) default auth.uid()
);
create index schedule_tasks_project_idx on public.schedule_tasks (project_id, position);
create index schedule_tasks_phase_idx on public.schedule_tasks (phase_id);

-- Nhật ký / ghi chú hiện trường
create table public.schedule_notes (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null default public.current_company_id() references public.companies(id),
  project_id   uuid not null references public.projects(id),
  task_id      uuid references public.schedule_tasks(id) on delete cascade,
  date         date not null default current_date,
  content      text not null default '',
  image_paths  text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  created_by   uuid references auth.users(id) default auth.uid()
);
create index schedule_notes_project_idx on public.schedule_notes (project_id, date);

-- ============ RLS + trigger cho mọi bảng trên ============
-- read_mods null = mọi tài khoản của công ty đọc được (dữ liệu tra cứu: danh mục, NCC, thầu phụ).
create or replace function public._apply_rls(
  tbl text, read_mods text[], insert_mods text[], edit_mods text[], scope text default null
) returns void language plpgsql as $f$
declare
  co text := 'company_id = (select public.current_company_id())';
  rd text := case when read_mods is null then 'true'
                  else format('(select public.has_any_permission(%L::text[], ''view''))', read_mods) end;
  sc text := coalesce(' and (' || scope || ')', '');
begin
  execute format('alter table public.%I enable row level security', tbl);
  execute format('create trigger %I before insert or update on public.%I for each row execute function public.stamp_row()',
                 tbl || '_stamp', tbl);
  execute format('create policy %I on public.%I for select to authenticated using (%s and %s%s)',
                 tbl || '_select', tbl, co, rd, sc);
  execute format('create policy %I on public.%I for insert to authenticated with check (%s and (select public.has_any_permission(%L::text[], ''add''))%s)',
                 tbl || '_insert', tbl, co, insert_mods, sc);
  execute format('create policy %I on public.%I for update to authenticated using (%s and public.can_edit_row(%L::text[], created_by)%s) with check (%s)',
                 tbl || '_update', tbl, co, edit_mods, sc, co);
  execute format('create policy %I on public.%I for delete to authenticated using (%s and deleted_at is not null and (select public.has_any_permission(%L::text[], ''full'')) and (select public.has_special(''purge_trash''))%s)',
                 tbl || '_delete', tbl, co, edit_mods, sc);
end $f$;

do $$
declare
  by_project   text := '(select public.sees_all_projects()) or project_id in (select public.my_project_ids())';
  by_project_n text := 'project_id is null or (select public.sees_all_projects()) or project_id in (select public.my_project_ids())';
  cost_readers text[] := '{expenses,expense_stats,projects,payables,cost_allocation,profit,dashboard}';
  rev_readers  text[] := '{revenue,settlements,profit,dashboard}';
  pay_readers  text[] := '{payments,payables,projects,cost_allocation,profit,dashboard}';
begin
  -- Danh bạ, danh mục
  perform public._apply_rls('customers', '{contacts}', '{contacts,projects}', '{contacts}');
  perform public._apply_rls('employees', '{contacts}', '{contacts}', '{contacts}');
  perform public._apply_rls('workers', '{timesheets,contacts,projects,expense_stats}', '{contacts,timesheets}', '{contacts,timesheets}');
  perform public._apply_rls('subcontractors', null, '{contacts,catalog,payments,payables}', '{contacts,catalog}');
  perform public._apply_rls('suppliers', null, '{contacts,catalog,expenses}', '{contacts,catalog,expenses}');
  perform public._apply_rls('catalog_items', null, '{catalog,expenses,equipment}', '{catalog}');
  perform public._apply_rls('contact_private', '{contacts}', '{contacts}', '{contacts}',
                            '(select public.has_special(''see_contact_ids''))');
  -- Công trình
  perform public._apply_rls('projects', '{projects}', '{projects}', '{projects}',
                            '(select public.sees_all_projects()) or id in (select public.my_project_ids())');
  -- Chi phí
  perform public._apply_rls('expenses', cost_readers, '{expenses}', '{expenses}', by_project);
  perform public._apply_rls('expense_lines', cost_readers, '{expenses}', '{expenses}',
                            'exists (select 1 from public.expenses x where x.id = expense_id)');
  -- Chấm công
  perform public._apply_rls('timesheet_weeks', '{timesheets,expense_stats,projects,cost_allocation,profit,dashboard}',
                            '{timesheets}', '{timesheets}', by_project);
  perform public._apply_rls('timesheet_lines', '{timesheets,expense_stats,projects,cost_allocation,profit,dashboard}',
                            '{timesheets}', '{timesheets}',
                            'exists (select 1 from public.timesheet_weeks x where x.id = week_id)');
  perform public._apply_rls('wage_advances', '{timesheets}', '{timesheets}', '{timesheets}', by_project_n);
  -- Doanh thu, quyết toán: Kế toán / Chỉ xem KHÔNG đọc được
  perform public._apply_rls('main_contracts', rev_readers, '{revenue}', '{revenue}', by_project);
  perform public._apply_rls('receipts', rev_readers, '{revenue,settlements}', '{revenue,settlements}', by_project);
  perform public._apply_rls('settlements', rev_readers, '{settlements}', '{settlements}', by_project);
  -- Chi trả, công nợ
  perform public._apply_rls('subcontracts', pay_readers, '{payables}', '{payables}', by_project);
  perform public._apply_rls('payable_closures', '{payables,payments}', '{payables}', '{payables}', by_project_n);
  perform public._apply_rls('payments', pay_readers, '{payments}', '{payments}', by_project_n);
  perform public._apply_rls('payment_allocations', pay_readers, '{payments}', '{payments}',
                            'exists (select 1 from public.payments x where x.id = payment_id)');
  -- Thiết bị, tỉ trọng
  perform public._apply_rls('equipment', '{equipment}', '{equipment}', '{equipment}', by_project_n);
  perform public._apply_rls('cost_allocations', '{cost_allocation}', '{cost_allocation}', '{cost_allocation}', by_project_n);
  -- Tiến độ
  perform public._apply_rls('schedule_templates', '{schedule,catalog}', '{schedule,catalog}', '{schedule,catalog}');
  perform public._apply_rls('schedule_phases', '{schedule,projects}', '{schedule}', '{schedule}', by_project);
  perform public._apply_rls('schedule_tasks', '{schedule,projects}', '{schedule}', '{schedule}', by_project);
  perform public._apply_rls('schedule_notes', '{schedule,projects}', '{schedule}', '{schedule}', by_project);
end $$;

drop function public._apply_rls(text, text[], text[], text[], text);

-- Khách hàng: người không có quyền Danh bạ vẫn thấy khách của công trình mình xem được (để hiện tên chủ đầu tư)
drop policy customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated
  using (company_id = (select public.current_company_id())
     and ((select public.has_permission('contacts', 'view'))
          or exists (select 1 from public.projects p where p.customer_id = customers.id)));

-- ============ SĐT / CCCD đã che cho người không có quyền "Xem SĐT, số CCCD" ============
create or replace function public.mask_middle(v text, head int, tail int) returns text
language sql immutable as $$
  select case
    when v is null or v = '' then v
    when length(v) <= head + tail then repeat('•', length(v))
    else left(v, head) || '•••' || right(v, tail)
  end
$$;

create or replace function public.list_contact_private_masked()
returns table (customer_id uuid, worker_id uuid, employee_id uuid, subcontractor_id uuid,
               phone text, id_number text, has_bank_account boolean)
language plpgsql stable security definer set search_path = '' as $$
declare can_see boolean := public.has_special('see_contact_ids');
begin
  if not public.has_permission('contacts', 'view') then
    raise exception 'Không có quyền xem Danh bạ' using errcode = '42501';
  end if;
  return query
    select c.customer_id, c.worker_id, c.employee_id, c.subcontractor_id,
           case when can_see then c.phone else public.mask_middle(c.phone, 4, 3) end,
           case when can_see then c.id_number else public.mask_middle(c.id_number, 6, 3) end,
           coalesce(c.bank_account, '') <> ''
    from public.contact_private c
    where c.company_id = public.current_company_id() and c.deleted_at is null;
end $$;

grant execute on function public.has_any_permission(text[], text) to authenticated;
grant execute on function public.sees_all_projects() to authenticated;
grant execute on function public.my_project_ids() to authenticated;
grant execute on function public.can_edit_row(text[], uuid) to authenticated;
grant execute on function public.list_contact_private_masked() to authenticated;
revoke execute on function public.list_contact_private_masked() from anon;
revoke execute on function public.my_project_ids() from anon;

-- ============ Xóa sạch dữ liệu nghiệp vụ của 1 công ty (script chuyển dữ liệu gọi trước khi đổ lại) ============
-- Chỉ service role gọi được. KHÔNG đụng tài khoản, vai trò, quyền.
create or replace function public.admin_wipe_business_data(target_company uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.schedule_notes      where company_id = target_company;
  delete from public.schedule_tasks      where company_id = target_company;
  delete from public.schedule_phases     where company_id = target_company;
  delete from public.schedule_templates  where company_id = target_company;
  delete from public.cost_allocations    where company_id = target_company;
  delete from public.equipment           where company_id = target_company;
  delete from public.payment_allocations where company_id = target_company;
  delete from public.payments            where company_id = target_company;
  delete from public.payable_closures    where company_id = target_company;
  delete from public.receipts            where company_id = target_company;
  delete from public.settlements         where company_id = target_company;
  delete from public.subcontracts        where company_id = target_company;
  delete from public.main_contracts      where company_id = target_company;
  delete from public.wage_advances       where company_id = target_company;
  delete from public.timesheet_lines     where company_id = target_company;
  delete from public.timesheet_weeks     where company_id = target_company;
  delete from public.expense_lines       where company_id = target_company;
  delete from public.expenses            where company_id = target_company;
  delete from public.profile_projects    where company_id = target_company;
  delete from public.projects            where company_id = target_company;
  delete from public.contact_private     where company_id = target_company;
  delete from public.catalog_items       where company_id = target_company;
  delete from public.suppliers           where company_id = target_company;
  delete from public.subcontractors      where company_id = target_company;
  delete from public.workers             where company_id = target_company;
  delete from public.employees           where company_id = target_company;
  delete from public.customers           where company_id = target_company;
end $$;
revoke execute on function public.admin_wipe_business_data(uuid) from public, anon, authenticated;
grant execute on function public.admin_wipe_business_data(uuid) to service_role;
