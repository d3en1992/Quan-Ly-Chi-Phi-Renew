-- GĐ99: Lưu ảnh PHIẾU CHẤM CÔNG (Trợ lý AI đọc ảnh phiếu) kèm tuần chấm công để xem lại, đối chiếu.
-- 1) timesheet_weeks.sheet_image_path: đường dẫn ảnh trong kho `receipts` (`<company_id>/<năm>/<uuid>.jpg`, cùng kho với ảnh hóa đơn).
-- 2) Kho `receipts`: người có quyền Nhập ở Chấm Công cũng tải ảnh lên được; người Xem được Chấm Công cũng đọc được ảnh.
--    (Trước: chỉ quyền Nhập Chi Phí mới tải lên.) Xóa ảnh giữ nguyên: chỉ người vừa tải lên tự gỡ.

alter table public.timesheet_weeks add column if not exists sheet_image_path text;
comment on column public.timesheet_weeks.sheet_image_path is 'Ảnh phiếu chấm công (kho receipts) — do Trợ lý AI lưu kèm, có thể trống';

drop policy if exists receipts_select on storage.objects;
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts'
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and (select public.has_any_permission('{expenses,expense_stats,projects,payables,cost_allocation,profit,dashboard,timesheets}'::text[], 'view')));

drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts'
              and (storage.foldername(name))[1] = (select public.current_company_id())::text
              and (select public.has_any_permission('{expenses,timesheets}'::text[], 'add')));
