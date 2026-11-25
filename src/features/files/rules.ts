// Quy tắc tệp PDF / Excel / Word (anh chốt 25/11/2026):
//  · trên 15 MB: không nhận · từ 3 MB trở xuống: lưu nguyên bản
//  · 3–15 MB: PDF nén, bản nén ≤ 3 MB mới lưu; không thì KHÔNG lưu tệp và báo (AI vẫn đọc được). Excel, Word không nén → trên 3 MB không lưu.
export const MB = 1024 * 1024;
export const MAX_STORE_BYTES = 3 * MB;
export const MAX_FILE_BYTES = 15 * MB;

export const sizeText = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export type Storable = { blob: Blob | null; note: string };

/** Bản để LƯU KHO của một tệp (blob = null: không lưu được, lý do ở note) */
export async function prepareStorable(file: Blob, isPdf: boolean, compress: (f: Blob, target: number) => Promise<Blob | null>): Promise<Storable> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`Tệp nặng ${sizeText(file.size)} — app chỉ nhận tới 15 MB.`);
  if (file.size <= MAX_STORE_BYTES) return { blob: file, note: '' };
  if (!isPdf) return { blob: null, note: `Tệp nặng ${sizeText(file.size)} (trên 3 MB) nên không lưu kèm được.` };
  const small = await compress(file, MAX_STORE_BYTES).catch(() => null);
  if (!small) return { blob: null, note: `PDF nặng ${sizeText(file.size)} và không nén được (khóa mật khẩu, có chữ ký số, hoặc không có ảnh để nén) nên không lưu kèm được.` };
  if (small.size > MAX_STORE_BYTES) return { blob: null, note: `PDF nặng ${sizeText(file.size)}, nén xong còn ${sizeText(small.size)} (trên 3 MB) nên không lưu kèm được.` };
  return { blob: small, note: `Đã nén để lưu: ${sizeText(file.size)} → ${sizeText(small.size)}.` };
}

/** Gọi bộ nén thật (nạp pdf-lib khi cần) */
export const storablePdf = (file: Blob) => prepareStorable(file, true, async (f, t) => (await import('./pdf-compress')).compressPdf(f, t));
export const storableOther = (file: Blob) => prepareStorable(file, false, async () => null);
