-- Cấp quyền bảng cho API như Supabase chạy trên máy.
-- Project Supabase tạo mới (từ 2026) KHÔNG tự cấp quyền bảng trong schema public cho anon / authenticated / service_role,
-- nên bản online báo "permission denied". Quyền đọc / ghi thật vẫn do RLS quyết định (mọi bảng đều bật RLS).
-- Trên máy các quyền này đã có sẵn → chạy lại không đổi gì.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Giữ đúng hạn chế của bảng sao lưu (migration …000004): không đọc cột data trực tiếp
revoke all on public.backups from authenticated, anon;
grant select (id, company_id, kind, note, size_bytes, counts, created_at, created_by) on public.backups to authenticated;
grant delete on public.backups to authenticated;
