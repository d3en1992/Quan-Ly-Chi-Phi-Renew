// Dùng chung cho các màn kết quả của nút AI (tiền ứng, thu tiền, hợp đồng) — hàm thuần, có test.
import type { PayMethod } from '@shared/scan';
import type { FpTable } from './duplicates';

/** Ô AI không chắc / chưa điền được → tô vàng */
export const UNSURE = '!border-warn !bg-warn-soft';

export const METHOD_OPTS: { value: Exclude<PayMethod, ''>; label: string }[] = [
  { value: 'transfer', label: 'Chuyển khoản' }, { value: 'cash', label: 'Tiền mặt' },
];

/** Phiếu chi không có cột hình thức → ghi vào đầu nội dung: "CK · Ứng tiền điện nước" */
export function methodNote(method: PayMethod, note: string): string {
  const tag = method === 'transfer' ? 'CK' : method === 'cash' ? 'Tiền mặt' : '';
  const n = note.trim();
  if (!tag || new RegExp(`^${tag}\\b`, 'i').test(n)) return n;
  return n ? `${tag} · ${n}` : tag;
}

/** Gọi sau khi lưu phiếu: nhớ vân tay ảnh / tệp vừa gửi để lần sau báo trùng */
export type Remember = (table: FpTable, id: string) => void;
