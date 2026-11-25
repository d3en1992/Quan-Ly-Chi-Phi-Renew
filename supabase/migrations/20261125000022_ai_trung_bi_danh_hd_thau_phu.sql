-- GĐ99 (25/11/2026) — Trợ lý AI đợt 2:
-- 1) subcontracts.attachment_paths: ảnh / PDF / Excel hợp đồng thầu phụ (kho documents).
-- 2) image_fingerprints: dấu vân tay ảnh / tệp đã nhập qua AI → cảnh báo gửi trùng ảnh (chỉ cảnh báo, không chặn).
-- 3) worker_aliases: tên cai hay ghi trên phiếu chấm công → công nhân ("SƠN HEO" → SƠN MT). Anh sửa tên ở màn kiểm tra thì app tự nhớ.

alter table public.subcontracts add column if not exists attachment_paths text[] default '{}';

drop policy if exists documents_insert on storage.objects;
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
              and (storage.foldername(name))[1] = (select public.current_company_id())::text
              and (select public.has_any_permission('{payments,revenue,payables}'::text[], 'add')));

drop policy if exists documents_select on storage.objects;
create policy documents_select on storage.objects for select to authenticated
  using (bucket_id = 'documents'
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and (owner_id = (select auth.uid())::text
              or exists (select 1 from public.payments x where objects.name = any (x.attachment_paths))
              or exists (select 1 from public.receipts x where objects.name = any (x.attachment_paths))
              or exists (select 1 from public.main_contracts x where objects.name = any (x.attachment_paths))
              or exists (select 1 from public.subcontracts x where objects.name = any (x.attachment_paths))));

drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents'
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and owner_id = (select auth.uid())::text
         and not exists (select 1 from public.payments x where objects.name = any (x.attachment_paths))
         and not exists (select 1 from public.receipts x where objects.name = any (x.attachment_paths))
         and not exists (select 1 from public.main_contracts x where objects.name = any (x.attachment_paths))
         and not exists (select 1 from public.subcontracts x where objects.name = any (x.attachment_paths)));

-- ============ Vân tay ảnh / tệp ============
create table public.image_fingerprints (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null default public.current_company_id() references public.companies(id),
  sha          text not null,           -- SHA-256: điểm ảnh (ảnh) hoặc nội dung tệp (PDF, Excel)
  dhash        text,                    -- 1024 bit (256 chữ hex): ảnh gần giống (chụp lại, Zalo nén); tệp thì trống
  target_table text not null check (target_table in ('expenses', 'timesheet_weeks', 'payments', 'receipts', 'main_contracts', 'subcontracts')),
  target_id    uuid not null,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) default auth.uid()
);
create index image_fingerprints_company on public.image_fingerprints (company_id, created_at desc);
alter table public.image_fingerprints enable row level security;
-- Vân tay không chứa nội dung; chi tiết phiếu trùng đọc riêng theo quyền của bảng đó
create policy image_fingerprints_select on public.image_fingerprints for select to authenticated
  using (company_id = (select public.current_company_id())
         and (select public.has_any_permission('{expenses,timesheets,payments,revenue,payables}'::text[], 'add')));
create policy image_fingerprints_insert on public.image_fingerprints for insert to authenticated
  with check (company_id = (select public.current_company_id()) and created_by = (select auth.uid())
              and (select public.has_any_permission('{expenses,timesheets,payments,revenue,payables}'::text[], 'add')));
grant select, insert on public.image_fingerprints to authenticated;
grant all on public.image_fingerprints to service_role;

-- ============ Tên gọi trên phiếu chấm công ============
create table public.worker_aliases (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies(id),
  alias      text not null,             -- tên đã bỏ dấu, chữ thường: "son heo"
  worker_id  uuid not null references public.workers(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  unique (company_id, alias)
);
alter table public.worker_aliases enable row level security;
create policy worker_aliases_select on public.worker_aliases for select to authenticated
  using (company_id = (select public.current_company_id()) and (select public.has_any_permission('{timesheets,contacts}'::text[], 'view')));
create policy worker_aliases_insert on public.worker_aliases for insert to authenticated
  with check (company_id = (select public.current_company_id()) and (select public.has_permission('timesheets', 'add'))
              and exists (select 1 from public.workers w where w.id = worker_id));
create policy worker_aliases_update on public.worker_aliases for update to authenticated
  using (company_id = (select public.current_company_id()) and (select public.has_permission('timesheets', 'add')))
  with check (company_id = (select public.current_company_id()) and exists (select 1 from public.workers w where w.id = worker_id));
grant select, insert, update on public.worker_aliases to authenticated;
grant all on public.worker_aliases to service_role;

-- Anh cho sẵn 25/11/2026: Sơn Heo = SƠN MT, Sơn Cốc = Sơn cai (danh mục ghi SƠN)
insert into public.worker_aliases (company_id, alias, worker_id, created_by)
select w.company_id, a.alias, w.id, null
from public.workers w join (values ('son heo', 'SƠN MT'), ('son coc', 'SƠN')) as a(alias, name) on w.name = a.name
where w.deleted_at is null
on conflict do nothing;
