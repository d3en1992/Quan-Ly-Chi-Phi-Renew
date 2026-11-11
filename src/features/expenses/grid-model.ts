// Mô hình dữ liệu của LƯỚI NHẬP NHANH (hàm thuần, có test): dòng, ô, ghi giá trị vào ô, kiểm tra dòng, đổi ra TSV.
// Hành vi chép từ hoadon.quick-entry.js + hoadon.sheet-grid.js (_setCellValue, _canonicalizeAcValue, validateQuickEntryCategories).
import { parseMoneyDigits, parsePastedMoney } from '@/lib/calc';
import type { ExpenseInput } from './schema';
import { findByName, isoToVn, parseDateInput, parsePaidCell } from './logic';

export const COLS = ['date', 'type', 'project', 'amount', 'description', 'buyer', 'supplier', 'paid'] as const;
export type Col = (typeof COLS)[number];
export const COL_LABEL: Record<Col, string> = {
  date: 'Ngày', type: 'Loại Chi Phí *', project: 'Công Trình *', amount: 'Số Tiền (đ)', description: 'Nội Dung / Ghi Chú',
  buyer: 'Người Mua', supplier: 'Nhà Cung Cấp', paid: 'Đã TT',
};

export type GridRow = {
  key: number;
  date: string; type: string; project: string;
  /** chỉ chữ số */
  amount: string;
  description: string; buyer: string; supplier: string;
  paid: boolean;
  /** Loại + Công trình tự chép từ dòng trên khi Enter ở dòng cuối; người dùng chưa đụng vào dòng này */
  auto: boolean;
};

type Named = { id: string; name: string };
export type GridLists = {
  projectOptions: readonly Named[];
  types: readonly Named[];
  buyers: readonly Named[];
  suppliers: readonly (Named & { buys_on_credit: boolean })[];
};

let nextKey = 1;
export function blankRow(from?: Partial<GridRow>): GridRow {
  return { key: nextKey++, date: '', type: '', project: '', amount: '', description: '', buyer: '', supplier: '', paid: true, auto: false, ...from };
}
export const blankRows = (n: number): GridRow[] => Array.from({ length: n }, () => blankRow());

/** Dòng mới thêm ở cuối: tự chép Loại + Công trình của dòng trên (như `addRow` app cũ) */
export function nextRowAfter(last: GridRow | undefined): GridRow {
  if (!last || (!last.type && !last.project)) return blankRow();
  return blankRow({ type: last.type, project: last.project, auto: true });
}

const sourceOf = (col: Col, lists: GridLists): readonly Named[] | null =>
  col === 'type' ? lists.types : col === 'project' ? lists.projectOptions : col === 'buyer' ? lists.buyers : col === 'supplier' ? lists.suppliers : null;

/** Giá trị đang gõ dở (chưa chốt): ô tiền chỉ giữ chữ số */
export function typeCell(row: GridRow, col: Col, raw: string): GridRow {
  if (col === 'paid') return row;
  return { ...row, [col]: col === 'amount' ? raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '') : raw, auto: false };
}

/**
 * CHỐT giá trị một ô (rời ô, chọn gợi ý, dán, Ctrl+D): sửa về đúng tên trong danh mục, ngày về dd/mm/yyyy,
 * tiền về số nguyên. Đổi nhà cung cấp → ô Đã TT theo công tắc Mua nợ của NCC mới (người nhập vẫn tích lại được).
 */
export function commitCell(row: GridRow, col: Col, raw: string, lists: GridLists, year: number): GridRow {
  const text = String(raw ?? '').replace(/[\r\n]+/g, ' ');
  const next: GridRow = { ...row };
  if (col === 'paid') {
    const p = parsePaidCell(text);
    if (p !== null) next.paid = p;
  } else if (col === 'date') {
    const iso = parseDateInput(text, year);
    next.date = iso ? isoToVn(iso) : text.trim();
  } else if (col === 'amount') {
    const n = parsePastedMoney(text);
    next.amount = n > 0 ? String(n) : '';
  } else if (col === 'description') {
    next.description = text.trim();
  } else {
    const src = sourceOf(col, lists)!;
    next[col] = findByName(text, src)?.name ?? text.trim();
    if (col === 'supplier') {
      const before = findByName(row.supplier, lists.suppliers);
      const after = findByName(next.supplier, lists.suppliers);
      if (before?.id !== after?.id) next.paid = !after?.buys_on_credit;
    }
  }
  const changed = COLS.some((c) => next[c] !== row[c]);
  return changed ? { ...next, auto: false } : row;
}

export function clearCell(row: GridRow, col: Col, lists: GridLists): GridRow {
  if (col === 'paid') return row;
  return commitCell({ ...row, auto: false }, col, '', lists, 2000);
}

/** Giá trị ô khi copy ra ngoài (tiền = số trơn, Đã TT = "x" / "") */
export function cellText(row: GridRow, col: Col): string {
  return col === 'paid' ? (row.paid ? 'x' : '') : row[col];
}

/** Dòng chưa nhập gì (hoặc chỉ có Loại + Công trình tự chép) → bỏ qua khi lưu, không tính vào tổng */
export function isBlank(row: GridRow): boolean {
  if (row.amount || row.description.trim() || row.buyer.trim() || row.supplier.trim()) return false;
  if (row.auto) return true;
  return !row.type.trim() && !row.project.trim() && !row.date.trim();
}

/** Ngày của từng dòng: ô trống thì lấy ngày của dòng gần nhất phía trên, dòng đầu lấy hôm nay. null = gõ sai. */
export function effectiveDates(rows: readonly GridRow[], todayIso: string): (string | null)[] {
  const year = Number(todayIso.slice(0, 4));
  let cur = todayIso;
  return rows.map((r) => {
    if (!r.date.trim()) return cur;
    const iso = parseDateInput(r.date, year);
    if (iso) cur = iso;
    return iso;
  });
}

export type RowCheck = { state: 'blank' } | { state: 'valid'; input: ExpenseInput } | { state: 'invalid'; bad: Col[] };

/** Kiểm tra một dòng: đủ Loại + Công trình (đúng danh mục) + Số tiền > 0; Người mua / NCC nếu có phải đúng danh mục */
export function checkRow(row: GridRow, date: string | null, lists: GridLists): RowCheck {
  if (isBlank(row)) return { state: 'blank' };
  const bad: Col[] = [];
  const type = findByName(row.type, lists.types);
  const project = findByName(row.project, lists.projectOptions);
  const buyer = row.buyer.trim() ? findByName(row.buyer, lists.buyers) : null;
  const supplier = row.supplier.trim() ? findByName(row.supplier, lists.suppliers) : null;
  const amount = parseMoneyDigits(row.amount);
  if (!date) bad.push('date');
  if (!type) bad.push('type');
  if (!project) bad.push('project');
  if (amount <= 0) bad.push('amount');
  if (buyer === undefined) bad.push('buyer');
  if (supplier === undefined) bad.push('supplier');
  if (bad.length || !type || !project || !date) return { state: 'invalid', bad };
  return {
    state: 'valid',
    input: {
      date, projectId: project.id, typeId: type.id, supplierId: supplier?.id ?? null, buyerId: buyer?.id ?? null,
      paid: row.paid, description: row.description.trim(), amount, invoiceNo: null, source: 'quick',
    },
  };
}

/** Ô gõ sai ngay lúc này (tô đỏ dù chưa bấm Lưu): có chữ nhưng không khớp danh mục / không phải ngày */
export function isCellWrong(row: GridRow, col: Col, lists: GridLists, year: number): boolean {
  if (col === 'paid' || col === 'amount' || col === 'description') return false;
  const v = row[col].trim();
  if (!v) return false;
  if (col === 'date') return !parseDateInput(v, year);
  return !findByName(v, sourceOf(col, lists)!);
}

export function toTsv(rows: readonly GridRow[], r1: number, c1: number, r2: number, c2: number): string {
  const out: string[] = [];
  for (let r = r1; r <= Math.min(r2, rows.length - 1); r++) {
    const cells: string[] = [];
    for (let c = c1; c <= Math.min(c2, COLS.length - 1); c++) cells.push(cellText(rows[r]!, COLS[c]!));
    out.push(cells.join('\t'));
  }
  return out.join('\r\n');
}

/** Dán ma trận vào lưới từ ô (r0, c0); thiếu dòng thì thêm. Trả về lưới mới. */
export function pasteMatrix(rows: readonly GridRow[], matrix: string[][], r0: number, c0: number, lists: GridLists, year: number): GridRow[] {
  const out = [...rows];
  while (out.length < r0 + matrix.length) out.push(blankRow());
  matrix.forEach((line, i) => {
    let row = out[r0 + i]!;
    line.forEach((raw, j) => {
      const col = COLS[c0 + j];
      if (col) row = commitCell({ ...row, auto: false }, col, raw, lists, year);
    });
    out[r0 + i] = row;
  });
  return out;
}
