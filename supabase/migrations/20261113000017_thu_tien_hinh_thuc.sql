-- Thu tiền: ghi khách trả bằng chuyển khoản hay tiền mặt (13/11/2026 — nút AI ghi phiếu thu bằng giọng nói / ảnh chuyển khoản).
-- null = chưa ghi (phiếu cũ). Không ảnh hưởng công thức tiền.
alter table public.receipts add column if not exists method text check (method in ('transfer', 'cash'));
comment on column public.receipts.method is 'Hình thức thu: transfer = chuyển khoản, cash = tiền mặt, null = chưa ghi';
