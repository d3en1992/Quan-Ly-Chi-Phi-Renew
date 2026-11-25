// Trợ lý AI — CẢNH BÁO TRÙNG (chỉ cảnh báo, lưu hay không do người dùng). Hàm thuần, có test.
//  1. Trùng số liệu: so phiếu AI vừa đọc với dữ liệu đã lưu (kể cả nhập tay) theo số tiền, ngày, công trình, đối tác, nội dung; giống ≥ 90% → báo.
//  2. Trùng ảnh: so vân tay ảnh (fingerprint.ts).
import { strSimilarity } from '@/features/expenses/logic';

export type DupRecord = {
  id?: string | null; date: string | null; projectId: string | null;
  /** Nhà cung cấp / thầu phụ; không có thì null (bỏ qua khi so) */
  partyId?: string | null; amount: number; text: string;
};
export type DupResult<T extends DupRecord = DupRecord> = { record: T; similarity: number };

export const DUP_THRESHOLD = 0.9;
const W = { amount: 40, date: 20, project: 15, party: 15, text: 5 };

/** Độ giống 0 → 1. Số tiền lệch quá 0,5% hoặc ngày lệch quá 3 ngày → 0. Ô nào một bên để trống thì không tính vào điểm. */
export function recordSimilarity(a: DupRecord, b: DupRecord): number {
  if (!(a.amount > 0) || !(b.amount > 0)) return 0;
  const gap = Math.abs(a.amount - b.amount) / Math.max(a.amount, b.amount);
  if (gap > 0.005 || !a.date || !b.date) return 0;
  const days = Math.abs(Math.round((Date.parse(a.date) - Date.parse(b.date)) / 86_400_000));
  if (days > 3) return 0;
  let got = W.amount * (gap === 0 ? 1 : 0.9) + W.date * (days === 0 ? 1 : days === 1 ? 0.7 : 0.4);
  let max = W.amount + W.date;
  if (a.projectId && b.projectId) { max += W.project; if (a.projectId === b.projectId) got += W.project; }
  if (a.partyId && b.partyId) { max += W.party; if (a.partyId === b.partyId) got += W.party; }
  const ta = a.text.trim().toLowerCase(), tb = b.text.trim().toLowerCase();
  if (ta && tb) { max += W.text; got += W.text * strSimilarity(ta, tb); }
  return got / max;
}

/** Các phiếu đã lưu giống phiếu này ≥ 90%, giống nhất trước (tối đa 3) */
export function likelyDuplicates<T extends DupRecord>(incoming: DupRecord, saved: readonly T[]): DupResult<T>[] {
  return saved
    .filter((s) => !incoming.id || s.id !== incoming.id)
    .map((record) => ({ record, similarity: recordSimilarity(incoming, record) }))
    .filter((x) => x.similarity >= DUP_THRESHOLD)
    .sort((x, y) => y.similarity - x.similarity)
    .slice(0, 3);
}

// ───────── Vân tay ảnh ─────────
export type Fingerprint = { sha: string; dhash: string | null };
export type FpTable = 'expenses' | 'timesheet_weeks' | 'payments' | 'receipts' | 'main_contracts' | 'subcontracts';
export type StoredFingerprint = { sha: string; dhash: string | null; target_table: FpTable; target_id: string };

/** Lưới 32 × 32 dấu: 1 khi ô bên phải sáng hơn ô này quá 6 bậc (vùng phẳng = 0 nên ảnh nén lại không làm đổi dấu) */
export const HASH_SIDE = 32;
export function dhashOf(gray: readonly number[]): string {
  let hex = '', nibble = 0, n = 0;
  for (let y = 0; y < HASH_SIDE; y++) {
    for (let x = 0; x < HASH_SIDE; x++) {
      const i = y * (HASH_SIDE + 1) + x;
      nibble = (nibble << 1) | (gray[i + 1]! - gray[i]! > 6 ? 1 : 0);
      if (++n % 4 === 0) { hex += nibble.toString(16); nibble = 0; }
    }
  }
  return hex;
}

const BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
const ones = (h: string) => [...h].reduce((s, c) => s + BITS[parseInt(c, 16)]!, 0);
/** Tỉ lệ dấu khác nhau so với số dấu có trong 2 ảnh, 0 (y hệt) → 1. Ảnh gần như trống (ít dấu) không so được → 1 */
export function dhashDistance(a: string, b: string): number {
  if (a.length !== b.length) return 1;
  const base = Math.max(ones(a), ones(b));
  if (base < 40) return 1;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += BITS[parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)]!;
  return d / base;
}

export type ImageHit = StoredFingerprint & { exact: boolean };
/**
 * Ảnh / tệp đã từng nhập. Ảnh chuyển khoản cùng ngân hàng trông gần y nhau (chỉ khác vài con số) nên phiếu chi / phiếu thu
 * chỉ báo khi đúng y ảnh đó; hóa đơn, phiếu chấm công, hợp đồng báo cả khi gần giống (Zalo nén lại, máy khác).
 */
export function matchFingerprint(fp: Fingerprint, stored: readonly StoredFingerprint[]): ImageHit[] {
  const out: ImageHit[] = [];
  for (const s of stored) {
    const exact = s.sha === fp.sha;
    const near = !exact && s.target_table !== 'payments' && s.target_table !== 'receipts' && !!fp.dhash && !!s.dhash && dhashDistance(fp.dhash, s.dhash) <= 0.06;
    if ((exact || near) && !out.some((o) => o.target_id === s.target_id)) out.push({ ...s, exact });
  }
  return out.sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, 3);
}
