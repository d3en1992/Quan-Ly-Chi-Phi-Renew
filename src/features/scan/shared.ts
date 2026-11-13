// Dùng chung cho các màn kết quả của nút AI (tiền ứng, thu tiền, vật tư) — hàm thuần, có test.
import type { MaterialItem, PayMethod } from '@shared/scan';

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

/** Số lượng gọn: 8 → "8", 2.5 → "2,5" */
const qty = (n: number) => (n ? String(Math.round(n * 1000) / 1000).replace('.', ',') : '');

/**
 * Danh sách vật tư → chữ để dán Zalo gửi nhà cung cấp:
 *   VẬT TƯ ĐIỆN — CT A Huynh
 *   1. Dây điện 1.5 màu xanh: 1 cuộn
 *   …
 *   Giao: qua chùa
 */
export function materialsText(items: readonly MaterialItem[], opts: { title?: string; project?: string; delivery?: string } = {}): string {
  const head = [opts.title?.trim().toUpperCase(), opts.project?.trim()].filter(Boolean).join(' — ');
  const lines = items.filter((x) => x.name.trim()).map((x, i) => {
    const q = [qty(x.quantity), x.unit.trim()].filter(Boolean).join(' ');
    return `${i + 1}. ${x.name.trim()}${q ? `: ${q}` : ''}${x.note.trim() ? ` (${x.note.trim()})` : ''}`;
  });
  // "Giao qua chùa" giữ nguyên; "qua chùa" → "Giao: qua chùa"
  const delivery = opts.delivery?.trim() ?? '';
  const giao = !delivery ? '' : /^giao/i.test(delivery) ? delivery : `Giao: ${delivery}`;
  return [head, ...lines, giao].filter(Boolean).join('\n');
}

/** Danh sách vật tư → bảng TSV (dán vào Excel / Google Sheets): STT, Tên vật tư, Số lượng, ĐVT, Ghi chú */
export function materialsTsv(items: readonly MaterialItem[]): string {
  return ['STT\tTên vật tư\tSố lượng\tĐVT\tGhi chú',
    ...items.filter((x) => x.name.trim()).map((x, i) => [i + 1, x.name.trim(), qty(x.quantity), x.unit.trim(), x.note.trim()].join('\t'))].join('\n');
}
