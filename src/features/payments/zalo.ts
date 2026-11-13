// Tin nhắn chữ để copy dán Zalo cho thầu phụ / nhà cung cấp (thay cho xuất ảnh, 13/11/2026).
// Chỉ ghép chữ từ số đã tính ở lib/calc — không cộng trừ tiền ở đây.
import { formatDate, formatMoney } from '@/lib/format';

const money = (n: number) => `${formatMoney(n)} đ`;
const line = (label: string, value: string | null | undefined) => (value ? `${label}: ${value}` : null);
const join = (rows: (string | null | undefined | false)[]) => rows.filter(Boolean).join('\n');

export type ZaloPayment = { date: string; amount: number; note?: string | null };

/** Công nợ 1 hợp đồng thầu phụ: giá trị, các lần đã trả, còn phải trả */
export function subcontractZaloText(x: {
  subcontractor: string; project: string; description?: string | null; date?: string | null;
  total: number; paid: number; debt: number; payments: readonly ZaloPayment[];
}): string {
  return join([
    `CÔNG NỢ THẦU PHỤ — ${x.subcontractor}`,
    line('Công trình', x.project),
    line('Nội dung', x.description),
    line('Ngày HĐ', x.date ? formatDate(x.date) : null),
    `Giá trị HĐ: ${money(x.total)}`,
    `Đã trả: ${money(x.paid)}${x.payments.length ? ` (${x.payments.length} lần)` : ''}`,
    ...x.payments.map((p) => ` • ${formatDate(p.date)}: ${formatMoney(p.amount)}${p.note ? ` — ${p.note}` : ''}`),
    x.debt > 0 ? `CÒN PHẢI TRẢ: ${money(x.debt)}` : x.debt < 0 ? `TRẢ DƯ: ${money(-x.debt)}` : 'ĐÃ TRẢ ĐỦ',
  ]);
}

/** Một phiếu chi (tạm ứng / thanh toán đợt thầu phụ, trả nợ NCC) */
export function paymentZaloText(x: { kind: string; date: string; party: string; partyLabel: string; project: string; note?: string | null; amount: number }): string {
  return join([
    `PHIẾU CHI ${formatDate(x.date)} — ${x.kind}`,
    `${x.partyLabel}: ${x.party}`,
    line('Công trình', x.project),
    line('Nội dung', x.note),
    `Số tiền: ${money(x.amount)}`,
  ]);
}

/** Đối chiếu công nợ nhà cung cấp: tổng mua nợ, đã trả, còn nợ + hóa đơn còn nợ */
export function supplierZaloText(x: {
  supplier: string; today: string; creditInvoices: number; paid: number; debt: number;
  open: readonly { date: string | null; project: string; description?: string | null; remaining: number }[];
}): string {
  const shown = x.open.slice(0, 30);
  return join([
    `ĐỐI CHIẾU CÔNG NỢ — ${x.supplier} (đến ${formatDate(x.today)})`,
    `Tổng mua nợ: ${money(x.creditInvoices)}`,
    `Đã trả: ${money(x.paid)}`,
    x.debt > 0 ? `CÒN NỢ: ${money(x.debt)}` : 'ĐÃ TRẢ HẾT',
    shown.length ? `Hóa đơn còn nợ (${x.open.length}):` : null,
    ...shown.map((i) => ` • ${i.date ? formatDate(i.date) : '—'} · ${i.project}${i.description ? ` · ${i.description}` : ''}: còn ${formatMoney(i.remaining)}`),
    x.open.length > shown.length ? ` … và ${x.open.length - shown.length} hóa đơn khác` : null,
  ]);
}
