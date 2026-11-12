-- GĐ9: Chụp đa năng + Xuất dữ liệu (TN02)
-- 1) Kho ảnh hóa đơn `receipts` (Supabase Storage, riêng tư): đường dẫn `<company_id>/<năm>/<uuid>.jpg`.
--    Chỉ người cùng công ty đọc được; thêm ảnh cần quyền Nhập ở Nhập Chi Phí. Ảnh CCCD KHÔNG bao giờ lên đây.
-- 2) audit_log: nhật ký thao tác nhạy cảm (xuất SĐT / CCCD / số tài khoản). Chỉ Admin đọc, không ai sửa / xóa qua API.
-- 3) export_contact_private(): đọc đủ SĐT / CCCD / STK để xuất file — không có quyền "Xem SĐT, số CCCD" thì báo lỗi 42501
--    (API trả 403), có quyền thì ghi 1 dòng audit_log.

-- ============ 1) Kho ảnh hóa đơn ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts'
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and (select public.has_any_permission('{expenses,expense_stats,projects,payables,cost_allocation,profit,dashboard}'::text[], 'view')));

create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts'
              and (storage.foldername(name))[1] = (select public.current_company_id())::text
              and (select public.has_permission('expenses', 'add')));

-- Xóa ảnh: chỉ khi lưu hóa đơn hỏng giữa chừng (người vừa tải lên tự gỡ)
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts'
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and owner_id = (select auth.uid())::text);

-- ============ 2) Nhật ký ============
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.current_company_id() references public.companies(id),
  user_id     uuid references auth.users(id) default auth.uid(),
  action      text not null,          -- 'export_private' …
  row_count   int not null default 0,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_company_created on public.audit_log (company_id, created_at desc);
alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log for select to authenticated
  using (company_id = (select public.current_company_id()) and (select public.is_admin()));
-- Không có chính sách insert / update / delete: chỉ hàm security definer bên dưới được ghi.

-- ============ 3) Xuất dữ liệu cá nhân ============
create or replace function public.export_contact_private(note jsonb default '{}'::jsonb)
returns table (customer_id uuid, worker_id uuid, employee_id uuid, subcontractor_id uuid,
               phone text, id_number text, id_issued_on date, id_issued_place text, date_of_birth date, gender text,
               hometown text, permanent_address text, bank_account text, bank_name text, bank_holder text)
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if not public.has_permission('contacts', 'view') or not public.has_special('see_contact_ids') then
    raise exception 'Không có quyền xuất SĐT / CCCD / số tài khoản' using errcode = '42501';
  end if;
  select count(*) into n from public.contact_private c
   where c.company_id = public.current_company_id() and c.deleted_at is null;
  insert into public.audit_log (company_id, user_id, action, row_count, detail)
  values (public.current_company_id(), auth.uid(), 'export_private', n, coalesce(note, '{}'::jsonb));
  return query
    select c.customer_id, c.worker_id, c.employee_id, c.subcontractor_id, c.phone, c.id_number, c.id_issued_on,
           c.id_issued_place, c.date_of_birth, c.gender, c.hometown, c.permanent_address, c.bank_account, c.bank_name, c.bank_holder
    from public.contact_private c
    where c.company_id = public.current_company_id() and c.deleted_at is null;
end $$;

grant execute on function public.export_contact_private(jsonb) to authenticated;
revoke execute on function public.export_contact_private(jsonb) from anon, public;
