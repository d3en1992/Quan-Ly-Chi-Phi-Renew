-- Thầu phụ cũng làm công nhân (13/11/2026): thầu phụ lâu lâu ít việc thì qua làm công nhân vài ngày
-- → Danh Bạ có 2 hồ sơ (thầu phụ + công nhân) cho cùng một người. Nối hai hồ sơ:
--   subcontractors.worker_id = công nhân tương ứng (mỗi công nhân nối với tối đa 1 thầu phụ).
-- Thông tin cá nhân (họ tên, SĐT, CCCD, ngày sinh, quê quán, tài khoản) lưu MỘT chỗ ở hồ sơ thầu phụ;
-- hồ sơ công nhân đã nối thì hiện theo thầu phụ. Chấm công / chi trả / công nợ giữ nguyên (2 vai trò, tiền tính riêng).
alter table public.subcontractors add column if not exists worker_id uuid references public.workers(id) on delete set null;
create unique index if not exists subcontractors_worker_uq on public.subcontractors(worker_id)
  where worker_id is not null and deleted_at is null;
comment on column public.subcontractors.worker_id is 'Thầu phụ này cũng làm công nhân (tên trong sổ chấm công). Thông tin cá nhân lưu ở hồ sơ thầu phụ.';
