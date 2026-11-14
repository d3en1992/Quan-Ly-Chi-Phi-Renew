// LƯỚI Ô KIỂU GOOGLE SHEET dùng chung (Nhập nhanh, dòng vật tư Hóa đơn chi tiết, …). Bảng tự vẽ ô của mình; hook này lo:
// chọn ô / vùng (bấm, kéo chuột, Shift + mũi tên), Enter xuống · Tab sang phải · mũi tên, Ctrl+C / Ctrl+V vùng (dán thẳng từ Excel,
// Google Sheet, Zalo), Delete xóa vùng, Ctrl+D chép ô trên, kéo ô vuông góc dưới để điền xuống, Ctrl+Z hoàn tác, Ctrl+S lưu,
// và Ô GỢI Ý (dropdown) của từng cột: gõ lọc danh sách, ↑↓ chọn, Enter / Tab điền, Esc đóng, "+ Thêm mới".
// Ô nhập trong bảng phải có data-r / data-c (số dòng / số cột của lưới) để hook tìm và đưa con trỏ tới.
import {
  useEffect, useLayoutEffect, useRef, useState,
  type ClipboardEvent, type Dispatch, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject, type SetStateAction,
} from 'react';
import { filterSuggestions, findByName } from '@/features/expenses/logic';
import { rectOf, SuggestPanel, type AnchorRect, type SuggestItem } from './combo';

export type SheetSel = { ar: number; ac: number; fr: number; fc: number };
export type SheetRange = { r1: number; r2: number; c1: number; c2: number };

/** Chữ dán từ Excel / Google Sheet → ma trận ô (bỏ dòng trống cuối) */
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
export const rangeOf = (s: SheetSel): SheetRange => ({ r1: Math.min(s.ar, s.fr), r2: Math.max(s.ar, s.fr), c1: Math.min(s.ac, s.fc), c2: Math.max(s.ac, s.fc) });

// ── Làm sạch số gõ / dán vào ô (dùng chung các bảng) ──
/** Số lượng gõ / dán: giữ chữ số và dấu chấm phẩy ("1.250,5" → "1250,5" khi có cả 2 dấu) */
export function cleanQuantity(raw: string): string {
  let t = raw.replace(/[^\d.,]/g, '');
  if (t.includes('.') && t.includes(',')) t = t.replace(/\./g, '');
  return t;
}
/** Đơn giá gõ / dán: "1.250.000 đ" → 1250000 (chỉ lấy chữ số) */
export const cleanMoney = (raw: string): number => Math.round(Number(raw.replace(/\D/g, '')) || 0);

/** Bộ nhớ tạm khi trình duyệt không cho đọc clipboard (nút Copy / Dán) */
let memoryClip = '';
export const sheetClip = { get: () => memoryClip, set: (t: string) => { memoryClip = t; } };

/** Khai báo ô gợi ý của 1 cột */
export type SheetSuggestCol = {
  items: readonly SuggestItem[];
  /** Tiêu đề nhỏ trên danh sách, vd "Công trình" */
  label: string;
  limit?: number;
  /** Gõ tự do (Tên vật tư, ĐVT, Nội dung): chưa gõ thì không hiện, gõ đúng y 1 mục thì ẩn */
  free?: boolean;
  /** Vừa vào ô là hiện danh sách (chưa tô sáng sẵn) */
  openOnFocus?: boolean;
  /** Cho "+ Thêm mới …" khi tên chưa có: trả tên đã tạo (null = hủy) */
  create?: (text: string) => Promise<string | null>;
};
type SuggestState = { r: number; c: number; anchor: AnchorRect; active: number };

export type SheetOptions<T> = {
  rows: T[];
  setRows: Dispatch<SetStateAction<T[]>>;
  colCount: number;
  tableRef: RefObject<HTMLElement | null>;
  /** Chữ của ô khi copy ra ngoài */
  cellText: (row: T, c: number) => string;
  /** Dán ma trận từ ô (r0, c0); thiếu dòng thì tự thêm. Trả lưới mới. */
  paste: (rows: T[], matrix: string[][], r0: number, c0: number) => T[];
  /** Xóa trắng 1 ô */
  clear: (row: T, c: number) => T;
  /** Dòng mới thêm ở cuối khi Enter / Tab ở dòng cuối */
  newRow: (rows: T[]) => T;
  /** Ctrl+D: chép ô trên (mặc định = dán chữ của ô trên) */
  copyDown?: (row: T, above: T, c: number) => T;
  onSave?: () => void;
  /** Cột nào có ô gợi ý (null = không) */
  suggest?: (c: number) => SheetSuggestCol | null;
  /** Chọn 1 mục gợi ý (hoặc vừa "+ Thêm mới") → ghi vào ô; bên gọi tự điền thêm ô khác nếu cần */
  onPick?: (r: number, c: number, name: string) => void;
};

export function useSheetGrid<T>(o: SheetOptions<T>) {
  const [sel, setSel] = useState<SheetSel>({ ar: 0, ac: 0, fr: 0, fc: 0 });
  const [fillTo, setFillTo] = useState<number | null>(null);
  const [sg, setSg] = useState<SuggestState | null>(null);
  const [, setTick] = useState(0);
  const optsRef = useRef(o);
  optsRef.current = o;
  const rowsRef = useRef(o.rows);
  rowsRef.current = o.rows;
  const selRef = useRef(sel);
  selRef.current = sel;
  const fillRef = useRef<number | null>(null);
  fillRef.current = fillTo;
  const pending = useRef<{ r: number; c: number } | null>(null);
  const dragging = useRef(false);
  const history = useRef<T[][]>([]);

  const closeSuggest = () => setSg(null);

  // ── Ô gợi ý ──
  /** Danh sách của ô đang mở (tính lại mỗi lần vẽ theo chữ đang gõ) */
  const ac = (() => {
    if (!sg) return null;
    const col = o.suggest?.(sg.c);
    const row = o.rows[sg.r];
    if (!col || !row) return null;
    const q = o.cellText(row, sg.c);
    if (col.free && !q.trim()) return null;
    const items = filterSuggestions(q, col.items, col.limit ?? (col.free ? 12 : 25));
    if (col.free && items.length === 1 && items[0]!.name.toLowerCase() === q.trim().toLowerCase()) return null;
    const createText = col.create && q.trim() && !findByName(q, col.items) ? q.trim() : null;
    if (!items.length && !createText) return null;
    return { col, items, createText, header: `${col.label} · ${items.length} kết quả` };
  })();
  const acRef = useRef(ac);
  acRef.current = ac;
  const sgRef = useRef(sg);
  sgRef.current = sg;
  /** Mở danh sách ở ô (r, c); autoPick = đang gõ → tô sáng sẵn mục khớp nhất để Enter / Tab điền luôn */
  const openSuggest = (r: number, c: number, autoPick: boolean, text = '') => {
    const col = optsRef.current.suggest?.(c);
    const el = cellEl(r, c);
    if (!col || !el) { setSg(null); return; }
    const has = filterSuggestions(text, col.items, 1).length > 0;
    setSg({ r, c, anchor: rectOf(el.closest('td') ?? el), active: autoPick && text.trim() && has ? 0 : -1 });
  };
  const pickSuggest = (index: number) => {
    const cur = sgRef.current, a = acRef.current;
    if (!cur || !a) return;
    setSg(null);
    const { r, c } = cur;
    const item = a.items[index];
    snapshot();
    if (item) optsRef.current.onPick?.(r, c, item.name);
    else if (a.createText && a.col.create) void a.col.create(a.createText).then((name) => { if (name) optsRef.current.onPick?.(r, c, name); });
  };
  /** Gắn vào onChange của ô chữ */
  const cellTyped = (r: number, c: number, text: string) => { if (optsRef.current.suggest?.(c)) openSuggest(r, c, true, text); };
  /** Gắn vào onBlur của ô chữ */
  const cellBlur = (r: number, c: number) => setSg((x) => (x && x.r === r && x.c === c ? null : x));
  useEffect(() => {
    const close = () => setSg(null);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, []);
  const suggestPanel: ReactNode = sg && ac
    ? <SuggestPanel anchor={sg.anchor} header={ac.header} items={ac.items} active={sg.active} createText={ac.createText} onPick={pickSuggest} />
    : null;

  const range = rangeOf(sel);
  const multi = range.r1 !== range.r2 || range.c1 !== range.c2;
  const lastCol = o.colCount - 1;

  const cellEl = (r: number, c: number) => o.tableRef.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`) ?? null;
  /** Đưa con trỏ tới ô (r, c) sau lần vẽ kế tiếp; ô chữ thì bôi đen sẵn để gõ là ghi đè */
  const go = (r: number, c: number) => { pending.current = { r, c }; setTick((t) => t + 1); };
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    const el = cellEl(p.r, p.c);
    if (!el) return;
    pending.current = null;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  });

  // ── Hoàn tác: chụp lại lưới trước mỗi lần sửa (vào ô mới, dán, xóa, điền) ──
  const snapshot = () => {
    const cur = rowsRef.current;
    if (history.current.at(-1) !== cur) history.current = [...history.current.slice(-49), cur];
  };
  const undo = () => {
    let prev = history.current.pop();
    if (prev === rowsRef.current) prev = history.current.pop();
    if (!prev) return false;
    optsRef.current.setRows(prev);
    history.current.push(prev);
    return true;
  };
  const update = (fn: (rows: T[]) => T[]) => { snapshot(); optsRef.current.setRows((rs) => fn(rs)); };

  const clampR = (r: number) => Math.max(0, Math.min(r, rowsRef.current.length - 1));
  const clampC = (c: number) => Math.max(0, Math.min(c, optsRef.current.colCount - 1));
  const moveTo = (r: number, c: number) => {
    if (r < 0 || r >= rowsRef.current.length) return;
    const cc = clampC(c);
    setSel({ ar: r, ac: cc, fr: r, fc: cc });
    go(r, cc);
  };
  const extendTo = (r: number, c: number) => {
    const rr = clampR(r), cc = clampC(c);
    setSel((s) => ({ ...s, fr: rr, fc: cc }));
    go(rr, cc);
  };
  const addRowAndGo = (r: number, c: number) => {
    optsRef.current.setRows((rs) => (r >= rs.length - 1 ? [...rs, optsRef.current.newRow(rs)] : rs));
    setSel({ ar: r + 1, ac: c, fr: r + 1, fc: c });
    go(r + 1, c);
  };
  /** Enter: xuống dòng dưới cùng cột; ở dòng cuối thì thêm dòng */
  const enterNav = (r: number, c: number) => addRowAndGo(r, c);
  const tabNav = (r: number, c: number, back: boolean) => {
    const last = optsRef.current.colCount - 1;
    if (back) { if (c > 0) moveTo(r, c - 1); else if (r > 0) moveTo(r - 1, last); }
    else if (c < last) moveTo(r, c + 1);
    else if (r < rowsRef.current.length - 1) moveTo(r + 1, 0);
    else addRowAndGo(r, 0);
  };

  const clearRange = (g: SheetRange) => {
    closeSuggest();
    update((rs) => rs.map((row, i) => {
      if (i < g.r1 || i > g.r2) return row;
      let x = row;
      for (let j = g.c1; j <= g.c2; j++) x = optsRef.current.clear(x, j);
      return x;
    }));
  };
  const pasteText = (text: string, at: { r: number; c: number }, size?: { rows: number; cols: number }) => {
    let matrix = parseTsv(text);
    if (!matrix.length) return false;
    if (size) matrix = tileMatrix(matrix, size.rows, size.cols);
    closeSuggest();
    update((rs) => optsRef.current.paste(rs, matrix, at.r, at.c));
    const width = Math.max(...matrix.map((m) => m.length));
    setSel({ ar: at.r, ac: at.c, fr: at.r + matrix.length - 1, fc: Math.min(optsRef.current.colCount - 1, at.c + width - 1) });
    return true;
  };
  const rangeTsv = (g: SheetRange) => {
    const out: string[] = [];
    for (let r = g.r1; r <= Math.min(g.r2, rowsRef.current.length - 1); r++) {
      const cells: string[] = [];
      for (let c = g.c1; c <= g.c2; c++) cells.push(optsRef.current.cellText(rowsRef.current[r]!, c).replace(/[\t\r\n]+/g, ' '));
      out.push(cells.join('\t'));
    }
    return out.join('\r\n');
  };

  /**
   * Phím chung của lưới. Trả true nếu đã xử lý (bên gọi dừng lại). Phím của danh sách gợi ý thì bên gọi xử lý TRƯỚC khi gọi hàm này.
   */
  const handleKey = (e: KeyboardEvent<HTMLElement>, r: number, c: number): boolean => {
    const el = e.currentTarget;
    const input = el instanceof HTMLInputElement ? el : null;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key;
    const k = key.toLowerCase();
    if (ctrl && k === 's') { e.preventDefault(); optsRef.current.onSave?.(); return true; }
    const cur0 = sgRef.current, a = acRef.current;
    if (cur0 && a && cur0.r === r && cur0.c === c) {
      const max = a.items.length + (a.createText ? 1 : 0);
      if (key === 'ArrowDown') { e.preventDefault(); setSg({ ...cur0, active: Math.min(max - 1, cur0.active + 1) }); return true; }
      if (key === 'ArrowUp') { e.preventDefault(); setSg({ ...cur0, active: Math.max(-1, cur0.active - 1) }); return true; }
      if (key === 'Escape') { e.preventDefault(); setSg(null); return true; }
      if (key === 'Enter' || (key === 'Tab' && !e.shiftKey)) { if (cur0.active >= 0) pickSuggest(cur0.active); else setSg(null); }
      else if (key === 'Tab') setSg(null);
    }
    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); closeSuggest(); undo(); return true; }
    if (key === 'Enter') { e.preventDefault(); enterNav(r, c); return true; }
    if (key === 'Tab') { e.preventDefault(); tabNav(r, c, e.shiftKey); return true; }

    const len = input?.value.length ?? 0;
    const s0 = input?.selectionStart ?? 0, s1 = input?.selectionEnd ?? 0;
    const all = !input || len === 0 || (s0 === 0 && s1 === len);
    const atStart = all || (s0 === 0 && s1 === 0);
    const atEnd = all || (s0 === len && s1 === len);
    const cur = selRef.current;
    const isMulti = cur.ar !== cur.fr || cur.ac !== cur.fc;

    if (key === 'ArrowDown' || key === 'ArrowUp') {
      e.preventDefault();
      const d = key === 'ArrowDown' ? 1 : -1;
      if (e.shiftKey) extendTo(cur.fr + d, cur.fc); else moveTo(r + d, c);
      return true;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const d = key === 'ArrowRight' ? 1 : -1;
      const edge = d === 1 ? atEnd : atStart;
      if (e.shiftKey) { if (isMulti || edge) { e.preventDefault(); extendTo(cur.fr, cur.fc + d); } return true; }
      if (edge && c + d >= 0 && c + d < optsRef.current.colCount) { e.preventDefault(); moveTo(r, c + d); }
      return true;
    }
    // Delete: xóa ô / vùng. Backspace khi đang chọn nhiều ô (hoặc ô không phải ô chữ) cũng xóa vùng như Sheet.
    if (key === 'Delete' || (key === 'Backspace' && (isMulti || !input))) {
      e.preventDefault();
      clearRange(isMulti ? rangeOf(cur) : { r1: r, r2: r, c1: c, c2: c });
      return true;
    }
    if (ctrl && k === 'd') {
      e.preventDefault();
      const g = rangeOf(cur);
      const from = isMulti ? g.r1 : r - 1;
      if (from >= 0) {
        closeSuggest();
        const cd = optsRef.current.copyDown;
        update((rs) => rs.map((row, i) => {
          if (isMulti ? i <= g.r1 || i > g.r2 : i !== r) return row;
          let x = row;
          for (let j = isMulti ? g.c1 : c; j <= (isMulti ? g.c2 : c); j++) {
            x = cd ? cd(x, rs[from]!, j) : optsRef.current.paste([x], [[optsRef.current.cellText(rs[from]!, j)]], 0, j)[0]!;
          }
          return x;
        }));
      }
      return true;
    }
    if (ctrl && k === 'a' && (!input || all)) {
      e.preventDefault();
      setSel({ ar: 0, ac: 0, fr: rowsRef.current.length - 1, fc: optsRef.current.colCount - 1 });
      return true;
    }
    return false;
  };

  // ── Copy / dán vùng (gắn vào <table onCopy onPaste>) ──
  const onCopy = (e: ClipboardEvent) => {
    const t = e.target;
    const g = rangeOf(selRef.current);
    const isMulti = g.r1 !== g.r2 || g.c1 !== g.c2;
    if (!isMulti && t instanceof HTMLInputElement && t.selectionStart !== t.selectionEnd && !(t.selectionStart === 0 && t.selectionEnd === t.value.length)) return; // bôi 1 phần chữ → trình duyệt tự copy
    e.preventDefault();
    const tsv = rangeTsv(g);
    e.clipboardData.setData('text/plain', tsv);
    memoryClip = tsv;
  };
  /** keepSingle(c): dán 1 ô chữ vào cột này thì để trình duyệt chèn vào chỗ con trỏ (ô nội dung dài) */
  const onPaste = (e: ClipboardEvent, keepSingle?: (c: number) => boolean) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const matrix = parseTsv(text);
    const single = matrix.length === 1 && matrix[0]!.length === 1;
    const g = rangeOf(selRef.current);
    const isMulti = g.r1 !== g.r2 || g.c1 !== g.c2;
    if (single && !isMulti && keepSingle?.(selRef.current.fc)) return;
    e.preventDefault();
    pasteText(text, { r: g.r1, c: g.c1 }, isMulti ? { rows: g.r2 - g.r1 + 1, cols: g.c2 - g.c1 + 1 } : undefined);
  };

  // ── Kéo ô vuông góc dưới vùng chọn để điền xuống (như Sheet) ──
  useEffect(() => {
    const up = () => {
      dragging.current = false;
      const to = fillRef.current;
      if (to === null) return;
      setFillTo(null);
      const g = rangeOf(selRef.current);
      if (to <= g.r2) return;
      const src: string[][] = [];
      for (let r = g.r1; r <= g.r2; r++) {
        const line: string[] = [];
        for (let c = g.c1; c <= g.c2; c++) line.push(optsRef.current.cellText(rowsRef.current[r]!, c));
        src.push(line);
      }
      const n = to - g.r2;
      const matrix = Array.from({ length: n }, (_, i) => src[i % src.length]!);
      update((rs) => optsRef.current.paste(rs, matrix, g.r2 + 1, g.c1));
      setSel((s) => ({ ar: g.r1, ac: g.c1, fr: to, fc: g.c2 === s.fc ? s.fc : g.c2 }));
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Chuột trên ô: bấm chọn, Shift+bấm mở rộng, kéo chọn vùng, kéo góc điền */
  const cellMouse = (r: number, c: number) => ({
    onMouseDown: (e: MouseEvent) => {
      if (e.button !== 0) return;
      dragging.current = true;
      if (e.shiftKey) { e.preventDefault(); extendTo(r, c); } else setSel({ ar: r, ac: c, fr: r, fc: c });
    },
    onMouseEnter: (e: MouseEvent) => {
      if (e.buttons !== 1) return;
      if (fillRef.current !== null) { const g = rangeOf(selRef.current); setFillTo(Math.max(g.r2, r)); return; }
      if (!dragging.current) return;
      setSel((s) => (s.fr === r && s.fc === c ? s : { ...s, fr: r, fc: c }));
      if (selRef.current.ar !== r || selRef.current.ac !== c) window.getSelection()?.removeAllRanges();
    },
  });
  /** Ô nhận con trỏ: chọn ô (giữ nguyên vùng nếu ô nằm trong vùng) + chụp lại để Ctrl+Z quay về */
  const cellFocus = (r: number, c: number) => {
    snapshot();
    // mới vào ô: hiện danh sách nhưng KHÔNG tô sáng sẵn (Tab / Enter chỉ di chuyển)
    if (optsRef.current.suggest?.(c)?.openOnFocus) openSuggest(r, c, false, optsRef.current.cellText(rowsRef.current[r]!, c)); else setSg(null);
    const s = selRef.current;
    const g = rangeOf(s);
    const within = r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2;
    if (!within) setSel({ ar: r, ac: c, fr: r, fc: c });
  };
  /** Chọn cả dòng (bấm cột #) */
  const selectRow = (r: number) => { closeSuggest(); setSel({ ar: r, ac: 0, fr: r, fc: lastCol }); go(r, 0); };

  const inRange = (r: number, c: number) => r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
  const inFill = (r: number, c: number) => fillTo !== null && r > range.r2 && r <= fillTo && c >= range.c1 && c <= range.c2;
  const isActive = (r: number, c: number) => sel.fr === r && sel.fc === c;
  /** Ô vuông kéo điền: chỉ vẽ ở góc dưới phải của vùng chọn */
  const fillHandle = (r: number, c: number): ReactNode => (r === range.r2 && c === range.c2 ? (
    <span
      aria-hidden data-testid="fill-handle" title="Kéo xuống để điền"
      className="absolute -right-[4px] -bottom-[4px] z-[2] size-[8px] cursor-crosshair border border-surface bg-accent"
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); closeSuggest(); setFillTo(range.r2); }}
    />
  ) : null);

  return {
    sel, setSel, range, multi, go, moveTo, extendTo, enterNav, tabNav, handleKey, onCopy, onPaste, pasteText, rangeTsv,
    cellMouse, cellFocus, cellTyped, cellBlur, selectRow, inRange, inFill, isActive, fillHandle, snapshot, undo, clearRange, filling: fillTo !== null,
    suggestPanel, closeSuggest,
  };
}

/** Lớp tô ô theo vùng chọn (dùng chung để 2 bảng nhìn giống nhau) */
export function sheetCellClass(g: { inRange: boolean; multi: boolean; active: boolean; fill: boolean; wrong?: boolean }): string {
  return [
    'relative !p-0 border-r border-line-soft last:border-r-0',
    g.inRange && g.multi ? '!bg-accent-soft' : '',
    g.fill ? '!bg-accent-soft outline-1 outline-dashed -outline-offset-1 outline-accent' : '',
    g.wrong ? '!bg-bad-soft' : '',
    g.active ? 'z-[1] outline outline-2 -outline-offset-2 outline-accent !bg-accent-soft' : '',
  ].filter(Boolean).join(' ');
}

/** Dòng chú thích phím dưới bảng (chung 2 bảng) */
export function SheetKeysHint({ extra }: { extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted [&_kbd]:mr-1 [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-b-2 [&_kbd]:border-line [&_kbd]:bg-surface [&_kbd]:px-[5px] [&_kbd]:font-sans [&_kbd]:text-[11px] [&_kbd]:text-fg">
      <span><kbd>Enter</kbd>xuống dòng</span><span><kbd>Tab</kbd>sang ô kế</span><span><kbd>↑↓←→</kbd>di chuyển</span>
      <span><kbd>Shift</kbd><kbd>↑↓←→</kbd>chọn vùng</span><span><kbd>Ctrl</kbd><kbd>C</kbd>/<kbd>V</kbd>chép, dán vùng Excel</span>
      <span><kbd>Ctrl</kbd><kbd>D</kbd>chép ô trên</span><span>kéo <b className="inline-block size-2 bg-accent align-middle" /> góc ô để điền xuống</span>
      <span><kbd>Delete</kbd>xóa ô</span><span><kbd>Ctrl</kbd><kbd>Z</kbd>hoàn tác</span><span><kbd>Ctrl</kbd><kbd>S</kbd>lưu</span>
      {extra}
    </div>
  );
}
