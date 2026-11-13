// Quy tắc của màn Nhập Chi Phí — hàm thuần, có test. Chép hành vi app cũ:
// hoadon.sheet-grid.js (_normVi, _filterItems, dán vùng), hoadon.quick-entry.js (_invDupKey, _findExactDupInvoices,
// so gần giống ≥ 70%, invHistorySuggest), tienich.js (_strSimilarity), core.storage.js (buildNDFromItems).
// KHÔNG có công thức tiền ở đây (thành tiền / tổng nằm ở src/lib/calc/expense.ts).

/** Bỏ dấu + chữ thường: "Vật Tư Điện" → "vat tu dien" (gõ không dấu cũng tìm ra) */
export function normVi(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

export type Suggestion = { id: string; name: string };

/** Thứ tự gợi ý: (1) khớp NGUYÊN tên → (2) BẮT ĐẦU bằng chữ gõ → (3) CHỨA chữ gõ. Tối đa `limit` dòng. */
export function filterSuggestions<T extends { name: string }>(query: string, items: readonly T[], limit = 25): T[] {
  const q = normVi(query);
  if (!q) return items.slice(0, limit);
  const exact: T[] = [], starts: T[] = [], contains: T[] = [];
  for (const item of items) {
    const n = normVi(item.name);
    if (n === q) exact.push(item);
    else if (n.startsWith(q)) starts.push(item);
    else if (n.includes(q)) contains.push(item);
  }
  return [...exact, ...starts, ...contains].slice(0, limit);
}

/** Tìm mục có tên trùng (không phân biệt dấu, hoa thường) */
export function findByName<T extends { name: string }>(value: string, items: readonly T[]): T | undefined {
  const q = normVi(value);
  return q ? items.find((i) => normVi(i.name) === q) : undefined;
}

/** Chuỗi copy từ Excel (TSV) → ma trận ô. Bỏ các dòng trống ở cuối. */
export function parseTsv(text: string): string[][] {
  const lines = String(text ?? '').split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  return lines.map((l) => l.split('\t'));
}

/** Vùng chọn lớn hơn vùng copy thì lặp lại cho đầy (như Excel) */
export function tileMatrix(matrix: string[][], rows: number, cols: number): string[][] {
  const mr = matrix.length, mc = matrix[0]?.length ?? 0;
  if (!mr || !mc || (rows <= mr && cols <= mc)) return matrix;
  const R = Math.max(rows, mr), C = Math.max(cols, mc);
  return Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => matrix[r % mr]![c % mc] ?? ''));
}

const pad = (n: number) => String(n).padStart(2, '0');
const validDate = (y: number, m: number, d: number) => {
  const x = new Date(Date.UTC(y, m - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
};

/**
 * Ngày gõ tay / dán từ Excel → 'YYYY-MM-DD'. Nhận "1/11", "01/11/2026", "1-11-26", "2026-11-01", "0111".
 * Thiếu năm thì lấy `defaultYear`. Sai → null.
 */
export function parseDateInput(raw: string, defaultYear: number): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]; return validDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null; }
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/);
  if (!m) { const c = s.match(/^(\d{2})(\d{2})(\d{4})?$/); if (c) m = [s, c[1]!, c[2]!, c[3]!] as unknown as RegExpMatchArray; }
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]);
  let y = m[3] ? Number(m[3]) : defaultYear;
  if (m[3] && m[3].length === 2) y += 2000;
  return validDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

/** 'YYYY-MM-DD' → "dd/mm/yyyy" */
export function isoToVn(iso: string | null | undefined): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Ô Đã TT khi dán: "x", "có", "1", "đã tt", "true"… → true; "n", "0", "nợ", "chưa"… → false; trống / lạ → null (giữ nguyên) */
export function parsePaidCell(raw: string): boolean | null {
  const v = normVi(raw);
  if (!v) return null;
  if (['x', 'y', 'yes', 'co', '1', 'true', 'da tt', 'da tra', 'da thanh toan', 'tt', '✓', 'v'].includes(v)) return true;
  if (['n', 'no', 'khong', '0', 'false', 'no ncc', 'mua no', 'chua', 'chua tt', 'chua tra'].includes(v) || v === 'no') return false;
  return null;
}

/** Độ giống nhau của 2 chuỗi (hệ số Dice trên cặp ký tự), 0 → 1 — `_strSimilarity` app cũ */
export function strSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) { const bg = s.slice(i, i + 2); m.set(bg, (m.get(bg) ?? 0) + 1); }
    return m;
  };
  const am = bigrams(a), bm = bigrams(b);
  let inter = 0;
  am.forEach((cnt, bg) => { const o = bm.get(bg); if (o) inter += Math.min(cnt, o); });
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

/** Một hóa đơn (sắp lưu hoặc đã lưu) để so trùng */
export type DupCandidate = {
  id?: string | null;
  date: string | null;
  projectId: string | null;
  typeId: string | null;
  buyerId: string | null;
  supplierId: string | null;
  amount: number;
  description: string;
  lines?: { name: string; unit: string | null; quantity: number; unitPrice: number; discount: string | null }[];
};

const nk = (v: string | null | undefined) => normVi(v);

/** "Chữ ký" hóa đơn: ngày | công trình | loại | người mua | NCC | số tiền | nội dung | các dòng vật tư (`_invDupKey`) */
export function dupKey(r: DupCandidate): string {
  const lines = (r.lines ?? []).map((l) => [nk(l.name), nk(l.unit), Number(l.quantity) || 0, Number(l.unitPrice) || 0, nk(l.discount)].join('~')).join(';');
  return [r.date ?? '', r.projectId ?? '', r.typeId ?? '', r.buyerId ?? '', r.supplierId ?? '', Math.round(r.amount) || 0, nk(r.description), lines].join('|');
}

export type DupHit = { incoming: DupCandidate; existing: DupCandidate; similarity: number; exact: boolean; inForm: boolean };

/**
 * Cảnh báo trùng trước khi lưu (như app cũ, gộp 2 bước vào 1 danh sách):
 *  1. Trùng 100% mọi trường với hóa đơn đã lưu, hoặc 2 dòng giống hệt nhau ngay trong lần lưu.
 *  2. Gần giống: cùng ngày + công trình + số tiền, nội dung giống ≥ 70% (hoặc cùng trống) — chỉ xét hóa đơn MỚI.
 * `saved` = hóa đơn nhập tay còn sống (không gồm dòng tự sinh từ chấm công). Bỏ qua chính hóa đơn đang sửa (cùng id).
 */
export function findDuplicates(incoming: readonly DupCandidate[], saved: readonly DupCandidate[]): DupHit[] {
  const byKey = new Map<string, DupCandidate[]>();
  const byLoose = new Map<string, DupCandidate[]>();
  const loose = (r: DupCandidate) => `${r.date ?? ''}|${r.projectId ?? ''}|${Math.round(r.amount) || 0}`;
  for (const s of saved) {
    const k = dupKey(s); (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(s);
    const l = loose(s); (byLoose.get(l) ?? byLoose.set(l, []).get(l)!).push(s);
  }
  const out: DupHit[] = [];
  const inForm = new Map<string, DupCandidate>();
  for (const rec of incoming) {
    const k = dupKey(rec);
    const exact = (byKey.get(k) ?? []).find((s) => !rec.id || s.id !== rec.id);
    if (exact) out.push({ incoming: rec, existing: exact, similarity: 1, exact: true, inForm: false });
    else if (inForm.has(k)) out.push({ incoming: rec, existing: inForm.get(k)!, similarity: 1, exact: true, inForm: true });
    else if (!rec.id) {
      const nd = rec.description.toLowerCase().trim();
      for (const s of byLoose.get(loose(rec)) ?? []) {
        const other = s.description.toLowerCase().trim();
        const sim = strSimilarity(nd, other);
        if (sim >= 0.7 || (nd === '' && other === '')) { out.push({ incoming: rec, existing: s, similarity: nd === '' && other === '' ? 1 : sim, exact: sim >= 0.99, inForm: false }); break; }
      }
    }
    inForm.set(k, rec);
  }
  return out;
}

/**
 * Gợi ý từ LỊCH SỬ đã nhập (`invHistorySuggest`): gộp trùng không phân biệt hoa thường, xếp theo số lần dùng nhiều nhất
 * rồi ngày gần nhất; giữ cách viết của lần nhập gần nhất; bỏ chuỗi dài hơn 120 ký tự.
 */
export function historySuggest(entries: readonly { text: string | null | undefined; date: string | null | undefined }[]): string[] {
  const map = new Map<string, { name: string; n: number; last: string }>();
  for (const e of entries) {
    const name = String(e.text ?? '').trim().replace(/\s+/g, ' ');
    if (!name || name.length > 120) continue;
    const k = name.toLowerCase();
    const d = e.date ?? '';
    const cur = map.get(k);
    if (!cur) { map.set(k, { name, n: 1, last: d }); continue; }
    cur.n++;
    if (d > cur.last) { cur.last = d; cur.name = name; }
  }
  return [...map.values()].sort((a, b) => b.n - a.n || (b.last > a.last ? 1 : b.last < a.last ? -1 : 0)).map((e) => e.name);
}

/** Nội dung tự ghép từ tên các dòng vật tư, bỏ tên trùng (`buildNDFromItems`) */
export function buildDescription(names: readonly (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const t = String(raw ?? '').trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out.join(', ');
}

// ── Khu vực (quận / huyện) để nhắc "khác khu vực" khi cửa hàng và công trình ở 2 nơi khác nhau ──
const DISTRICTS = [
  'cu chi', 'hoc mon', 'binh chanh', 'nha be', 'can gio', 'thu duc', 'go vap', 'binh thanh', 'tan binh', 'tan phu', 'phu nhuan', 'binh tan',
  'di an', 'thuan an', 'thu dau mot', 'ben cat', 'tan uyen', 'bien hoa', 'long thanh', 'nhon trach', 'trang bom', 'duc hoa', 'ben luc', 'can giuoc', 'trang bang',
];
const ABBREVIATIONS: Record<string, string> = { gv: 'go vap', tp: 'tan phu', tb: 'tan binh', pn: 'phu nhuan', btan: 'binh tan', bthanh: 'binh thanh', td: 'thu duc', hm: 'hoc mon', cc: 'cu chi', bc: 'binh chanh' };

/**
 * Đoán quận / huyện từ địa chỉ ghi tay: "128 Tỉnh lộ 8, Củ Chi" → 'cu chi'; "213 Quang Trung, GV" → 'go vap';
 * "…, Q.12" → 'quan 12'. Không đoán được → null (khi đó KHÔNG gắn nhãn khác khu vực).
 */
export function districtOf(address: string | null | undefined): string | null {
  const n = normVi(address);
  if (!n) return null;
  let best: { pos: number; name: string } | null = null;
  for (const d of DISTRICTS) { const pos = n.lastIndexOf(d); if (pos >= 0 && (!best || pos > best.pos)) best = { pos, name: d }; }
  const q = [...n.matchAll(/(?:^|[\s,.(])(?:quan|q)\.?\s*(\d{1,2})(?!\d)/g)].pop();
  if (q && (!best || (q.index ?? 0) > best.pos)) best = { pos: q.index ?? 0, name: `quan ${Number(q[1])}` };
  if (best) return best.name;
  // Viết tắt chỉ nhận khi đứng riêng sau dấu phẩy cuối: "(PTH, TP)" → Tân Phú
  const last = n.replace(/[()]/g, '').split(',').pop()!.trim().replace(/\.$/, '');
  return ABBREVIATIONS[last] ?? null;
}

/** true khi đoán được CẢ HAI khu vực và chúng khác nhau */
export function isDifferentArea(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = districtOf(a), db = districtOf(b);
  return !!da && !!db && da !== db;
}

/**
 * Ô Người mua → dữ liệu lưu. Không bao giờ là lỗi (Người mua không bắt buộc):
 * khớp mục danh mục thật → buyerId; tên khác (công nhân, tài khoản, tên mới) → buyerName (lúc lưu tự thêm vào danh mục);
 * trống → cả hai trống (lúc lưu = chủ tài khoản).
 */
export function buyerOf(text: string, buyers: readonly { id: string; name: string }[]): { buyerId: string | null; buyerName?: string } {
  const t = text.trim();
  if (!t) return { buyerId: null };
  const hit = findByName(t, buyers);
  if (hit && /^[0-9a-f-]{36}$/i.test(hit.id)) return { buyerId: hit.id };
  return { buyerId: null, buyerName: hit?.name ?? t };
}

/** Gợi ý Người mua = danh mục Người mua + tên công nhân / tài khoản chưa có (id giả 'ten:…', lúc lưu mới thêm vào danh mục) */
export function mergeBuyerNames(catalog: readonly { id: string; name: string }[], names: readonly string[]): { id: string; name: string }[] {
  const have = new Set(catalog.map((c) => normVi(c.name)));
  const extra: { id: string; name: string }[] = [];
  for (const raw of names) {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase(); // cùng cách chuẩn hóa tên Người mua của danh mục
    const k = normVi(name);
    if (!name || have.has(k)) continue;
    have.add(k);
    extra.push({ id: 'ten:' + name, name });
  }
  return [...catalog, ...extra].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/**
 * Ô lọc gõ-tìm (FilterCombo): trống = tất cả; gõ đúng một tên trong danh sách = lọc đúng tên đó;
 * gõ dở = lọc theo "có chứa" (không dấu, không phân biệt hoa thường).
 */
export function matchFilterText(sel: string, value: string, names: readonly string[]): boolean {
  const q = normVi(sel);
  if (!q) return true;
  const v = normVi(value);
  return names.some((n) => normVi(n) === q) ? v === q : v.includes(q);
}
