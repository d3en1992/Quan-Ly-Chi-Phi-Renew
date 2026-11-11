// Quy tắc đặt tên / nhận loại công trình — chép từ app cũ (projects.ui.js: ctDetectLoai, _ctSuggestName, _ctNormalizeNamePrefix).
// Hàm thuần, có test. KHÔNG có công thức tiền ở đây.

/** Độ dài tối đa tên công trình (như CT_NAME_MAX app cũ) */
export const NAME_MAX = 45;

export type KindCode = 'CT' | 'SC' | 'SN' | 'Khác';
export type ProjectKind = 'new_build' | 'renovation' | 'small_repair';

// Tiền tố phải đứng riêng: "CTY ABC", "Scan…" KHÔNG tính là CT / SC (chữ cái liền sau mã thì bỏ qua)
const KIND_RE = /^\s*\[?\s*(CT|SC|SN)\s*\]?(?![a-zà-ỹ])/i;

/** "SN Cô Sáu (Ốp gạch)" → 'SN'; "Nhà anh Tài" → 'Khác' */
export function detectKindCode(name: string | null | undefined): KindCode {
  const m = String(name ?? '').match(KIND_RE);
  return m ? (m[1]!.toUpperCase() as KindCode) : 'Khác';
}

/** CT → xây mới, SC → sửa chữa, SN / Khác → sửa nhỏ / khác */
export function kindFromCode(code: KindCode): ProjectKind {
  return code === 'CT' ? 'new_build' : code === 'SC' ? 'renovation' : 'small_repair';
}

/** "[SN] Cô Sáu" → "SN Cô Sáu" (app xếp loại theo chữ đầu tên, để "[" ở đầu thì xếp sai) */
export function normalizeNamePrefix(name: string): string {
  return String(name ?? '').trim().replace(/^\[\s*(CT|SC|SN)\s*\]\s*/i, (_, code: string) => code.toUpperCase() + ' ');
}

/** Bỏ mã loại ở đầu tên (để so 2 tên mà không tính phần mã) */
export function stripKindPrefix(name: string): string {
  return String(name ?? '').trim().replace(KIND_RE, '').replace(/^[\s\-–:.]+/, '').trim();
}

/**
 * Gợi ý tên: "<Loại> <Tên khách> (<Hạng mục>)", dài quá NAME_MAX thì cắt phần hạng mục nhưng giữ dấu đóng ngoặc.
 * `currentName` rỗng → mặc định loại CT; tên đang gõ không có mã → không gắn mã.
 * Chưa chọn khách → chưa gợi ý (trả '').
 */
export function suggestProjectName(currentName: string, customerName: string | null | undefined, scope: string): string {
  const cur = (currentName ?? '').trim();
  const code = cur ? detectKindCode(cur) : 'CT';
  if (!customerName) return '';
  const head = (code !== 'Khác' ? code + ' ' : '') + customerName;
  const hm = (scope ?? '').trim();
  if (!hm) return head.slice(0, NAME_MAX).trim();
  let name = `${head} (${hm})`;
  if (name.length > NAME_MAX) {
    const room = NAME_MAX - head.length - 3; // 3 = " (" + ")"
    name = room > 0 ? `${head} (${hm.slice(0, room).trim()})` : head.slice(0, NAME_MAX).trim();
  }
  return name;
}

/** Hạng mục của công trình cũ chưa lưu riêng → lấy phần trong ngoặc cuối tên */
export function scopeFromName(name: string): string {
  const m = String(name ?? '').match(/\(([^()]*)\)\s*$/);
  return m ? m[1]!.trim() : '';
}

/** Chuẩn hóa tên để so khớp / lưu bí danh: bỏ dấu, chữ thường, gọn khoảng trắng */
export function normalizeName(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Hệ số k: số ≥ 0 hợp lệ, sai → 1 (như `_ctReadK`). Chấp nhận dấu phẩy "1,5". */
export function readK(raw: string): number {
  const n = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

export type FloorArea = { ten: string; dvt: string; kl: number | null; heSo?: number; tinh?: boolean };

export function totalFloorArea(rows: readonly FloorArea[]): number {
  return rows.reduce((s, r) => s + (r.kl && r.tinh !== false ? r.kl * (r.heSo ?? 1) : 0), 0);
}
