// TN02 — tên file / tên sheet Excel: khử ký tự lạ, cắt độ dài, khử trùng.

const pad = (n: number) => String(n).padStart(2, '0');

/** `DuLieu_YYYY-MM-DD_HHmm.xlsx` theo giờ máy */
export function exportFileName(now: Date = new Date(), prefix = 'DuLieu'): string {
  return `${prefix}_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;
}

/**
 * Tên sheet hợp lệ: bỏ phần trong ngoặc ("CT Cô Sáu (42 CVT, TB)" → "CT Cô Sáu"), bỏ ký tự Excel cấm ([]:*?/\ và nháy đơn),
 * cắt 28 ký tự, trùng thì thêm " (2)", " (3)"…  `used` được cập nhật.
 */
export function sheetName(raw: string, used: Set<string>): string {
  let base = raw.replace(/\([^)]*\)/g, ' ').replace(/[[\]:*?/\\']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!base) base = 'Sheet';
  base = base.slice(0, 28).trim();
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - ` (${i})`.length).trim()} (${i})`;
  used.add(name.toLowerCase());
  return name;
}

/** Ngày YYYY-MM-DD → dd/mm/yyyy (giữ như app cũ, tránh lệch múi giờ) */
export function vnDate(v: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
