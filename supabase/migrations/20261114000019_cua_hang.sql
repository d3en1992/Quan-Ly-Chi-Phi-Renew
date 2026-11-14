-- GĐ99: Danh Bạ › CỬA HÀNG — điểm bán vật tư (nhất là ở công trình xa) để anh em tra địa chỉ, xem ảnh mặt tiền, đi mua đồ / lấy phiếu công nợ.
-- Trợ lý AI (nút "Lưu thông tin") đọc ảnh bảng hiệu → tên, địa chỉ, SĐT, mặt hàng; người dùng kiểm tra rồi mới lưu.
-- 1) Bảng shops: quyền theo mục Danh Bạ (contacts) như các nhóm danh bạ khác; có thể nối 1 nhà cung cấp (theo dõi công nợ bên NCC).
-- 2) Kho ảnh `shop-photos` (riêng tư): `<company_id>/<uuid>.jpg`. Xem Danh Bạ thì xem được ảnh; Nhập ở Danh Bạ thì tải lên được.
-- 3) Thùng rác khôi phục được cửa hàng; Realtime báo máy khác.

create table public.shops (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null default public.current_company_id() references public.companies(id),
  name         text not null,
  address      text,
  area         text,                -- khu vực: phường / quận / tỉnh (vd "Tân Phú, TP.HCM", "Biên Hòa, Đồng Nai") — để tìm theo vùng
  phone        text,
  details      text,                -- mặt hàng / ghi chú, mỗi dòng 1 gạch đầu dòng
  photo_path   text,                -- ảnh mặt tiền trong kho shop-photos
  supplier_id  uuid references public.suppliers(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  created_by   uuid references auth.users(id) default auth.uid()
);
comment on table public.shops is 'Danh Bạ › Cửa hàng: điểm bán vật tư, ảnh mặt tiền, mặt hàng (Trợ lý AI đọc bảng hiệu)';
create index shops_company on public.shops (company_id) where deleted_at is null;
create index shops_supplier on public.shops (supplier_id) where supplier_id is not null;

-- RLS theo mẫu _apply_rls (migration 000003): đọc = Xem Danh Bạ; thêm = Nhập; sửa = dòng của mình hoặc Toàn quyền / sửa dòng người khác
alter table public.shops enable row level security;
create trigger shops_stamp before insert or update on public.shops for each row execute function public.stamp_row();
create policy shops_select on public.shops for select to authenticated using (
  company_id = (select public.current_company_id()) and (select public.has_any_permission('{contacts}'::text[], 'view')));
create policy shops_insert on public.shops for insert to authenticated with check (
  company_id = (select public.current_company_id()) and (select public.has_any_permission('{contacts}'::text[], 'add')));
create policy shops_update on public.shops for update to authenticated using (
  company_id = (select public.current_company_id()) and public.can_edit_row('{contacts}'::text[], created_by))
  with check (company_id = (select public.current_company_id()));
create policy shops_delete on public.shops for delete to authenticated using (
  company_id = (select public.current_company_id()) and deleted_at is not null
  and (select public.has_any_permission('{contacts}'::text[], 'full')) and (select public.has_special('purge_trash')));

-- Thùng rác: thêm shops vào danh sách bảng khôi phục / xóa hẳn được (giữ nguyên các bảng cũ)
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
    when 'shops' then '{contacts}'
    else null end
$$;

alter publication supabase_realtime add table public.shops;

-- ============ Kho ảnh mặt tiền cửa hàng ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-photos', 'shop-photos', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy shop_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'shop-photos'
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and (select public.has_permission('contacts', 'view')));

create policy shop_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-photos'
              and (storage.foldername(name))[1] = (select public.current_company_id())::text
              and (select public.has_permission('contacts', 'add')));

-- Xóa ảnh: người vừa tải lên tự gỡ (lưu hỏng giữa chừng / đổi ảnh khác)
create policy shop_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shop-photos'
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and owner_id = (select auth.uid())::text);
