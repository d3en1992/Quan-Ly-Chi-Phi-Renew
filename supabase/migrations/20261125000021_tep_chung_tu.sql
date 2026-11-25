-- GĐ99: Lưu ẢNH / TỆP kèm phiếu chi, phiếu thu, hợp đồng chính và ẢNH CCCD (anh chốt 25/11/2026 — trước đây ảnh CCCD không lưu).
-- 1) Cột danh sách đường dẫn tệp (một phiếu có thể nhiều tệp; CCCD có 2 mặt). Cho phép null để khôi phục được bản sao lưu cũ.
-- 2) Kho `documents` (phiếu chi, phiếu thu, hợp đồng; ảnh / PDF / Excel) và kho `id-cards` (ảnh CCCD, riêng).
--    Đọc tệp = đọc được chính phiếu đang gắn tệp đó (RLS của bảng: quyền mục + phạm vi công trình) → Kế toán không mở được ảnh phiếu thu.
--    Ảnh CCCD: thêm điều kiện quyền đặc biệt "Xem SĐT, số CCCD".
--    Xóa tệp: người tải lên tự gỡ, và chỉ khi không còn phiếu nào gắn tệp đó.

alter table public.payments        add column if not exists attachment_paths text[] default '{}';
alter table public.receipts        add column if not exists attachment_paths text[] default '{}';
alter table public.main_contracts  add column if not exists attachment_paths text[] default '{}';
alter table public.contact_private add column if not exists id_image_paths   text[] default '{}';
comment on column public.contact_private.id_image_paths is 'Ảnh CCCD / giấy tờ (kho id-cards) — chỉ người có quyền xem SĐT, số CCCD';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('id-cards', 'id-cards', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ============ documents ============
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
              and (storage.foldername(name))[1] = (select public.current_company_id())::text
              and (select public.has_any_permission('{payments,revenue}'::text[], 'add')));

create policy documents_select on storage.objects for select to authenticated
  using (bucket_id = 'documents'
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and (owner_id = (select auth.uid())::text
              or exists (select 1 from public.payments x where objects.name = any (x.attachment_paths))
              or exists (select 1 from public.receipts x where objects.name = any (x.attachment_paths))
              or exists (select 1 from public.main_contracts x where objects.name = any (x.attachment_paths))));

create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents'
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and owner_id = (select auth.uid())::text
         and not exists (select 1 from public.payments x where objects.name = any (x.attachment_paths))
         and not exists (select 1 from public.receipts x where objects.name = any (x.attachment_paths))
         and not exists (select 1 from public.main_contracts x where objects.name = any (x.attachment_paths)));

-- ============ id-cards ============
create policy id_cards_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'id-cards'
              and (storage.foldername(name))[1] = (select public.current_company_id())::text
              and (select public.has_permission('contacts', 'add'))
              and (select public.has_special('see_contact_ids')));

create policy id_cards_select on storage.objects for select to authenticated
  using (bucket_id = 'id-cards'
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and (select public.has_permission('contacts', 'view'))
         and (select public.has_special('see_contact_ids'))
         and (owner_id = (select auth.uid())::text
              or exists (select 1 from public.contact_private x where objects.name = any (x.id_image_paths))));

create policy id_cards_delete on storage.objects for delete to authenticated
  using (bucket_id = 'id-cards'
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and owner_id = (select auth.uid())::text
         and not exists (select 1 from public.contact_private x where objects.name = any (x.id_image_paths)));
