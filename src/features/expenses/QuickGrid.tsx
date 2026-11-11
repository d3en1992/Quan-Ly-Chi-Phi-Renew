// LƯỚI NHẬP NHANH kiểu Excel (PAGES.nhap của mẫu). Hành vi phím chép từ hoadon.sheet-grid.js của app cũ:
// Enter xuống · Tab sang phải · mũi tên · Shift+mũi tên / kéo chuột chọn vùng · Ctrl+C / Ctrl+V vùng · Ctrl+D chép ô trên ·
// Delete xóa ô / vùng · Space bật tắt Đã TT · Ctrl+S lưu. Gợi ý hiện ngay dưới ô đang gõ, Enter / Tab để điền.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { rectOf, SuggestPanel, type AnchorRect, type SuggestItem } from '@/components/ui/combo';
import { ConfirmDialog } from '@/components/ui/confirm';
import { Card, Note } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { sumAmounts } from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCreateExpenses, type CreatableKind, type EntryExpense } from './api';
import {
  blankRows, checkRow, clearCell, COL_LABEL, COLS, commitCell, effectiveDates, isBlank, isCellWrong, nextRowAfter, pasteMatrix, toTsv, typeCell,
  type Col, type GridRow,
} from './grid-model';
import { filterSuggestions, findByName, findDuplicates, historySuggest, isoToVn, parseTsv, tileMatrix, type DupHit } from './logic';
import type { ExpenseInput } from './schema';
import { DuplicateDialog, toDupCandidate, type Lists } from './shared';

type Sel = { ar: number; ac: number; fr: number; fc: number };
type Suggest = { r: number; c: number; anchor: AnchorRect; active: number };

const WIDTHS = [36, 92, 170, 250, 116, 0, 110, 170, 62];
const AC_LABEL: Partial<Record<Col, string>> = { type: 'Loại chi phí', project: 'Công trình', buyer: 'Người mua', supplier: 'Nhà cung cấp', description: 'Nội dung đã nhập' };
const CREATE_KIND: Partial<Record<Col, CreatableKind>> = { type: 'expense_type', buyer: 'person', supplier: 'supplier' };
const PAID_COL = COLS.indexOf('paid');
/** Bộ nhớ tạm của nút Copy / Dán khi trình duyệt không cho đọc clipboard */
let memoryClip = '';

export function QuickGrid({ lists, expenses, userName, today, onActiveDate }: {
  lists: Lists; expenses: readonly EntryExpense[]; userName: string; today: string; onActiveDate: (iso: string) => void;
}) {
  const toast = useToast();
  const createExpenses = useCreateExpenses();
  const year = Number(today.slice(0, 4));
  const [rows, setRows] = useState<GridRow[]>(() => blankRows(10));
  const [sel, setSel] = useState<Sel>({ ar: 0, ac: 0, fr: 0, fc: 0 });
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [tried, setTried] = useState(false);
  const [dups, setDups] = useState<{ hits: DupHit[]; inputs: ExpenseInput[]; lastDate: string } | null>(null);
  const [askClear, setAskClear] = useState(false);
  const [, setTick] = useState(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const pending = useRef<{ r: number; c: number } | null>(null);
  const dragging = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const selRef = useRef(sel);
  selRef.current = sel;

  const history = useMemo<SuggestItem[]>(
    () => historySuggest(expenses.map((e) => ({ text: e.description, date: e.date }))).map((name) => ({ id: name, name })),
    [expenses],
  );
  const dates = useMemo(() => effectiveDates(rows, today), [rows, today]);
  const checks = useMemo(() => rows.map((r, i) => checkRow(r, dates[i] ?? null, lists)), [rows, dates, lists]);
  const valid = checks.flatMap((c) => (c.state === 'valid' ? [c.input] : []));
  const total = sumAmounts(valid.map((v) => v.amount));
  const range = { r1: Math.min(sel.ar, sel.fr), r2: Math.max(sel.ar, sel.fr), c1: Math.min(sel.ac, sel.fc), c2: Math.max(sel.ac, sel.fc) };
  const multi = range.r1 !== range.r2 || range.c1 !== range.c2;

  // Ngày của dòng đang đứng → bảng "Hóa đơn trong ngày" bên dưới
  const activeDate = dates[sel.fr] ?? today;
  useEffect(() => { onActiveDate(activeDate); }, [activeDate, onActiveDate]);

  const cellEl = (r: number, c: number) => tableRef.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`) ?? null;
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
  useEffect(() => {
    const up = () => { dragging.current = false; };
    const close = () => setSuggest(null);
    window.addEventListener('mouseup', up);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, []);

  const sourceFor = (col: Col): readonly SuggestItem[] | null =>
    col === 'type' ? lists.types : col === 'project' ? lists.projectOptions : col === 'buyer' ? lists.buyers : col === 'supplier' ? lists.suppliers : col === 'description' ? history : null;

  /** Danh sách gợi ý của ô đang mở (tính lại mỗi lần vẽ theo chữ đang gõ) */
  const ac = (() => {
    if (!suggest) return null;
    const col = COLS[suggest.c]!;
    const row = rows[suggest.r];
    const src = sourceFor(col);
    if (!row || !src || col === 'paid') return null;
    const query = row[col];
    const items = filterSuggestions(query, src, col === 'description' ? 12 : 25);
    if (col === 'description' && (!query.trim() || (items.length === 1 && items[0]!.name.toLowerCase() === query.trim().toLowerCase()))) return null;
    const kind = CREATE_KIND[col];
    const createText = kind && query.trim() && !findByName(query, src) ? query.trim() : null;
    if (!items.length && !createText) return null;
    return { col, items, createText, kind, header: `${AC_LABEL[col]} · ${items.length} kết quả` };
  })();

  const openSuggest = (r: number, c: number, autoPick: boolean, text: string) => {
    const col = COLS[c]!;
    const src = sourceFor(col);
    const el = cellEl(r, c);
    if (!src || !el) { setSuggest(null); return; }
    const has = filterSuggestions(text, src, 1).length > 0;
    setSuggest({ r, c, anchor: rectOf(el.closest('td') ?? el), active: autoPick && text.trim() && has ? 0 : -1 });
  };

  const setCell = (r: number, c: number, fn: (row: GridRow, col: Col) => GridRow) =>
    setRows((rs) => rs.map((row, i) => (i === r ? fn(row, COLS[c]!) : row)));
  const commit = (r: number, c: number, raw: string) => setCell(r, c, (row, col) => commitCell(row, col, raw, lists, year));

  const pickSuggest = (index: number) => {
    if (!suggest || !ac) return;
    const { r, c } = suggest;
    setSuggest(null);
    const item = ac.items[index];
    if (item) commit(r, c, item.name);
    else if (ac.createText && ac.kind) void lists.create(ac.kind, ac.createText).then((name) => { if (name) commit(r, c, name); });
  };

  /** Xuống dòng dưới cùng cột; đang ở dòng cuối thì thêm dòng (tự chép Loại + Công trình) */
  const enterNav = (r: number, c: number) => {
    if (r >= rowsRef.current.length - 1) setRows((rs) => (r >= rs.length - 1 ? [...rs, nextRowAfter(rs[rs.length - 1])] : rs));
    setSel({ ar: r + 1, ac: c, fr: r + 1, fc: c });
    go(r + 1, c);
  };
  const moveTo = (r: number, c: number) => {
    if (r < 0 || r >= rowsRef.current.length) return;
    const cc = Math.max(0, Math.min(c, COLS.length - 1));
    setSel({ ar: r, ac: cc, fr: r, fc: cc });
    go(r, cc);
  };
  const extendTo = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(r, rowsRef.current.length - 1));
    const cc = Math.max(0, Math.min(c, COLS.length - 1));
    setSel((s) => ({ ...s, fr: rr, fc: cc }));
    go(rr, cc);
  };

  // ── Lưu ──
  const doSave = (inputs: ExpenseInput[], lastDate: string) => {
    createExpenses.mutate(inputs, {
      onSuccess: () => {
        toast(`Đã lưu ${inputs.length} hóa đơn · ${formatMoney(sumAmounts(inputs.map((i) => i.amount)))} đ`);
        // Làm sạch bảng (chống bấm lưu 2 lần); giữ ngày đang nhập nếu không phải hôm nay — như app cũ
        const fresh = blankRows(5);
        if (lastDate !== today) fresh[0] = { ...fresh[0]!, date: isoToVn(lastDate) };
        setRows(fresh); setTried(false); setDups(null); setSuggest(null);
        setSel({ ar: 0, ac: 1, fr: 0, fc: 1 });
        go(0, 1);
      },
      onError: (e) => { setDups(null); toast(`Chưa lưu được: ${e.message}`, 'error'); },
    });
  };
  const save = () => {
    if (createExpenses.isPending) return;
    // Chốt mọi ô trước (ô đang gõ dở chưa kịp rời)
    const fixed = rowsRef.current.map((row) => (isBlank(row) ? row : COLS.reduce((acc, col) => (col === 'paid' ? acc : commitCell(acc, col, acc[col], lists, year)), row)));
    setRows(fixed);
    const ds = effectiveDates(fixed, today);
    const cs = fixed.map((r, i) => checkRow(r, ds[i] ?? null, lists));
    const badRows = cs.filter((c) => c.state === 'invalid').length;
    if (badRows) { setTried(true); toast(`${badRows} dòng chưa đủ hoặc sai (ô tô đỏ). Cần Loại chi phí, Công trình đúng danh mục và Số tiền.`, 'error'); return; }
    const inputs = cs.flatMap((c) => (c.state === 'valid' ? [c.input] : []));
    if (!inputs.length) { toast('Chưa có dòng nào để lưu.', 'error'); return; }
    const lastDate = inputs[inputs.length - 1]!.date;
    const hits = findDuplicates(inputs.map((i) => ({ id: null, date: i.date, projectId: i.projectId, typeId: i.typeId, buyerId: i.buyerId, supplierId: i.supplierId, amount: i.amount, description: i.description })), expenses.map(toDupCandidate));
    if (hits.length) { setDups({ hits, inputs, lastDate }); return; }
    doSave(inputs, lastDate);
  };

  // ── Bàn phím ──
  const onKeyDown = (e: KeyboardEvent<HTMLElement>, r: number, c: number) => {
    const el = e.currentTarget;
    const input = el instanceof HTMLInputElement ? el : null;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key;
    if (ctrl && key.toLowerCase() === 's') { e.preventDefault(); save(); return; }

    const acOpen = !!ac && suggest?.r === r && suggest.c === c;
    if (acOpen && suggest && ac) {
      const max = ac.items.length + (ac.createText ? 1 : 0);
      if (key === 'ArrowDown') { e.preventDefault(); setSuggest({ ...suggest, active: Math.min(max - 1, suggest.active + 1) }); return; }
      if (key === 'ArrowUp') { e.preventDefault(); setSuggest({ ...suggest, active: Math.max(-1, suggest.active - 1) }); return; }
      if (key === 'Escape') { e.preventDefault(); setSuggest(null); return; }
      if (key === 'Enter') { e.preventDefault(); if (suggest.active >= 0) pickSuggest(suggest.active); else setSuggest(null); enterNav(r, c); return; }
      if (key === 'Tab') { if (suggest.active >= 0 && !e.shiftKey) pickSuggest(suggest.active); else setSuggest(null); }
    }

    if (key === 'Enter') { e.preventDefault(); enterNav(r, c); return; }
    if (key === 'Tab') {
      e.preventDefault();
      const last = COLS.length - 1;
      if (e.shiftKey) { if (c > 0) moveTo(r, c - 1); else if (r > 0) moveTo(r - 1, last); }
      else if (c < last) moveTo(r, c + 1);
      else if (r < rowsRef.current.length - 1) moveTo(r + 1, 0);
      else { setRows((rs) => [...rs, nextRowAfter(rs[rs.length - 1])]); setSel({ ar: r + 1, ac: 0, fr: r + 1, fc: 0 }); go(r + 1, 0); }
      return;
    }

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
      return;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const d = key === 'ArrowRight' ? 1 : -1;
      const edge = d === 1 ? atEnd : atStart;
      if (e.shiftKey) { if (isMulti || edge) { e.preventDefault(); extendTo(cur.fr, cur.fc + d); } return; }
      if (edge && c + d >= 0 && c + d < COLS.length) { e.preventDefault(); moveTo(r, c + d); }
      return;
    }
    if (key === 'Delete') {
      e.preventDefault();
      setSuggest(null);
      const g = { r1: Math.min(cur.ar, cur.fr), r2: Math.max(cur.ar, cur.fr), c1: Math.min(cur.ac, cur.fc), c2: Math.max(cur.ac, cur.fc) };
      const inRange = isMulti ? (i: number, j: number) => i >= g.r1 && i <= g.r2 && j >= g.c1 && j <= g.c2 : (i: number, j: number) => i === r && j === c;
      setRows((rs) => rs.map((row, i) => COLS.reduce((acc, col, j) => (inRange(i, j) ? clearCell(acc, col, lists) : acc), row)));
      return;
    }
    if (ctrl && key.toLowerCase() === 'd') {
      e.preventDefault();
      if (r > 0) {
        const above = rowsRef.current[r - 1]!;
        const col = COLS[c]!;
        if (col === 'paid') setCell(r, c, (row) => ({ ...row, paid: above.paid, auto: false }));
        else if (above[col] !== '') commit(r, c, above[col]);
        setSuggest(null);
      }
      return;
    }
    if (ctrl && key.toLowerCase() === 'a' && !input) {
      e.preventDefault();
      setSel({ ar: 0, ac: 0, fr: rowsRef.current.length - 1, fc: COLS.length - 1 });
    }
  };

  // ── Copy / dán vùng ──
  const onCopy = (e: ClipboardEvent) => {
    const t = e.target;
    if (!multi && t instanceof HTMLInputElement && t.selectionStart !== t.selectionEnd) return; // đang bôi chữ trong 1 ô → để trình duyệt copy
    e.preventDefault();
    const tsv = toTsv(rows, range.r1, range.c1, range.r2, range.c2);
    e.clipboardData.setData('text/plain', tsv);
    memoryClip = tsv;
  };
  const pasteText = (text: string, at: { r: number; c: number }, size?: { rows: number; cols: number }) => {
    let matrix = parseTsv(text);
    if (!matrix.length) return;
    if (size) matrix = tileMatrix(matrix, size.rows, size.cols);
    setSuggest(null);
    setRows((rs) => pasteMatrix(rs, matrix, at.r, at.c, lists, year));
    const width = Math.max(...matrix.map((m) => m.length));
    setSel({ ar: at.r, ac: at.c, fr: at.r + matrix.length - 1, fc: Math.min(COLS.length - 1, at.c + width - 1) });
  };
  const onPaste = (e: ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const matrix = parseTsv(text);
    const single = matrix.length === 1 && matrix[0]!.length === 1;
    const col = COLS[sel.fc]!;
    // Dán 1 ô chữ vào ô Nội dung → để trình duyệt chèn vào chỗ con trỏ như bình thường
    if (single && !multi && col === 'description') return;
    e.preventDefault();
    pasteText(text, { r: range.r1, c: range.c1 }, multi ? { rows: range.r2 - range.r1 + 1, cols: range.c2 - range.c1 + 1 } : undefined);
  };

  // ── Nút trên đầu bảng ──
  const copyAll = async () => {
    const filled = rows.filter((r) => !isBlank(r));
    if (!filled.length) { toast('Bảng đang trống, chưa có gì để copy.', 'error'); return; }
    const tsv = toTsv(filled, 0, 0, filled.length - 1, COLS.length - 1);
    memoryClip = tsv;
    try { await navigator.clipboard.writeText(tsv); } catch { /* trình duyệt chặn clipboard → vẫn giữ trong bộ nhớ tạm của app */ }
    toast(`Đã copy ${filled.length} dòng (dán được vào Excel hoặc bấm Dán)`);
  };
  const pasteAll = async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { text = memoryClip; }
    if (!text.trim()) text = memoryClip;
    if (!text.trim()) { toast('Chưa có gì để dán. Copy vùng trong Excel rồi bấm vào một ô và nhấn Ctrl+V.', 'error'); return; }
    const firstFree = rows.findIndex((r) => isBlank(r));
    const at = { r: firstFree < 0 ? rows.length : firstFree, c: 0 };
    pasteText(text, at);
    go(at.r, 0);
  };
  const clearAll = () => { setRows(blankRows(10)); setTried(false); setSuggest(null); setAskClear(false); setSel({ ar: 0, ac: 0, fr: 0, fc: 0 }); go(0, 0); };

  const cellInput = 'block h-[38px] w-full min-w-0 truncate bg-transparent px-3 text-[13px] text-fg outline-none placeholder:text-faint';

  return (
    <Card>
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <h3 className="m-0 text-sm font-bold">Nhập nhanh</h3>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-[5px] text-[12.5px] text-muted">
          <Icon name="badge" className="text-[16px]" />Người TH: <b className="text-fg">{userName}</b> (theo tài khoản)
        </span>
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => void copyAll()}><Icon name="content_copy" />Copy</Button>
        <Button variant="ghost" onClick={() => void pasteAll()}><Icon name="content_paste" />Dán</Button>
        <Button variant="ghost" onClick={() => (rows.some((r) => !isBlank(r)) ? setAskClear(true) : clearAll())}><Icon name="delete_sweep" />Xóa bảng</Button>
        <Button variant="primary" data-testid="grid-save" disabled={createExpenses.isPending} onClick={save}>
          <Icon name="save" />{createExpenses.isPending ? 'Đang lưu…' : `Lưu ${valid.length} dòng`}
        </Button>
      </header>
      <div className="tbl">
        <table ref={tableRef} data-testid="quick-grid" className="!w-full table-fixed select-none" style={{ minWidth: 1140 }} onCopy={onCopy} onPaste={onPaste}>
          <colgroup>{WIDTHS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
          <thead>
            <tr>
              <th className="!px-0 !text-center">#</th>
              {COLS.map((c) => (
                <th key={c} className={cn(c === 'amount' && '!text-right', c === 'paid' && '!text-center')} title={c === 'paid' ? 'Đã thanh toán lúc mua' : undefined}>{COL_LABEL[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const check = checks[r]!;
              const missing = tried && check.state === 'invalid' ? check.bad : [];
              return (
                <tr key={row.key} data-state={check.state}>
                  <td
                    className="cursor-pointer !px-0 !py-0 text-center text-[12px] text-faint"
                    onMouseDown={(e) => { e.preventDefault(); setSuggest(null); setSel({ ar: r, ac: 0, fr: r, fc: COLS.length - 1 }); go(r, 0); }}
                  >{r + 1}</td>
                  {COLS.map((col, c) => {
                    const inRange = r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
                    const active = sel.fr === r && sel.fc === c;
                    const wrong = isCellWrong(row, col, lists, year) || missing.includes(col);
                    const tdClass = cn(
                      'relative !p-0 border-r border-line-soft last:border-r-0',
                      inRange && multi && '!bg-accent-soft',
                      wrong && '!bg-bad-soft',
                      active && 'z-[1] outline outline-2 -outline-offset-2 outline-accent !bg-accent-soft',
                    );
                    const mouse = {
                      onMouseDown: (e: React.MouseEvent) => {
                        dragging.current = true;
                        if (e.shiftKey) { e.preventDefault(); extendTo(r, c); } else setSel({ ar: r, ac: c, fr: r, fc: c });
                      },
                      onMouseEnter: (e: React.MouseEvent) => {
                        if (!dragging.current || e.buttons !== 1) return;
                        setSel((s) => (s.fr === r && s.fc === c ? s : { ...s, fr: r, fc: c }));
                        if (sel.ar !== r || sel.ac !== c) window.getSelection()?.removeAllRanges();
                      },
                    };
                    const onFocus = () => {
                      const s = selRef.current;
                      const within = r >= Math.min(s.ar, s.fr) && r <= Math.max(s.ar, s.fr) && c >= Math.min(s.ac, s.fc) && c <= Math.max(s.ac, s.fc);
                      if (!within) setSel({ ar: r, ac: c, fr: r, fc: c });
                    };
                    if (col === 'paid') {
                      return (
                        <td key={col} className={tdClass} {...mouse}>
                          <button
                            type="button" role="checkbox" aria-checked={row.paid} aria-label={`Đã TT dòng ${r + 1}`} data-r={r} data-c={c}
                            className="flex h-[38px] w-full items-center justify-center outline-none"
                            onFocus={() => { onFocus(); setSuggest(null); }}
                            onKeyDown={(e) => onKeyDown(e, r, c)}
                            onClick={() => setCell(r, c, (x) => ({ ...x, paid: !x.paid, auto: false }))}
                          >
                            <Icon name={row.paid ? 'check_box' : 'check_box_outline_blank'} className={row.paid ? 'text-accent' : 'text-faint'} />
                          </button>
                        </td>
                      );
                    }
                    const shown = col === 'amount' ? (row.amount ? formatMoney(Number(row.amount)) : '') : row[col];
                    const placeholder = col === 'date' ? (dates[r] ? isoToVn(dates[r]).slice(0, 5) : '') : undefined;
                    return (
                      <td key={col} className={tdClass} {...mouse}>
                        <input
                          data-r={r} data-c={c} aria-label={`${COL_LABEL[col].replace(' *', '')} dòng ${r + 1}`} aria-invalid={wrong || undefined}
                          autoComplete="off" spellCheck={false} inputMode={col === 'amount' ? 'numeric' : undefined}
                          className={cn(cellInput, col === 'amount' && 'num text-right', col === 'date' && 'num', row.auto && (col === 'type' || col === 'project') && 'text-muted')}
                          value={shown} placeholder={placeholder} title={shown || undefined}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCell(r, c, (x) => typeCell(x, col, v));
                            if (sourceFor(col)) openSuggest(r, c, true, v); // đang gõ → tô sáng sẵn kết quả khớp nhất để Tab / Enter điền luôn
                          }}
                          onFocus={() => {
                            onFocus();
                            // mới vào ô: hiện danh sách nhưng KHÔNG tô sáng sẵn (Tab / Enter chỉ di chuyển)
                            if (col !== 'description' && sourceFor(col)) openSuggest(r, c, false, row[col]); else setSuggest(null);
                          }}
                          onBlur={() => {
                            setSuggest((s) => (s && s.r === r && s.c === c ? null : s));
                            commit(r, c, rowsRef.current[r]?.[col] ?? '');
                          }}
                          onKeyDown={(e) => onKeyDown(e, r, c)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold [&>td]:bg-surface-2">
              <td />
              <td colSpan={3}>Tổng <span data-testid="grid-count">{valid.length}</span> dòng hợp lệ</td>
              <td className="num text-right" data-testid="grid-total">{formatMoney(total)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line-soft px-4 py-2.5 text-[12px] text-muted [&_kbd]:mr-1 [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-b-2 [&_kbd]:border-line [&_kbd]:bg-surface [&_kbd]:px-[5px] [&_kbd]:font-sans [&_kbd]:text-[11px] [&_kbd]:text-fg">
        <span><kbd>Enter</kbd>xuống dòng</span><span><kbd>Tab</kbd>sang ô kế</span><span><kbd>↑↓←→</kbd>di chuyển</span>
        <span><kbd>Shift</kbd><kbd>↑↓←→</kbd>chọn vùng</span><span><kbd>Ctrl</kbd><kbd>V</kbd>dán vùng Excel</span><span><kbd>Ctrl</kbd><kbd>D</kbd>chép ô trên</span>
        <span><kbd>Delete</kbd>xóa ô</span><span><kbd>Space</kbd>bật/tắt Đã TT</span><span><kbd>Ctrl</kbd><kbd>S</kbd>lưu</span>
      </div>
      <div className="px-4 pb-3.5">
        <Note><b>Đã TT</b> (đã thanh toán lúc mua) tự tích sẵn. Chọn nhà cung cấp đang bật <b>Mua nợ</b> thì tự bỏ tích, hóa đơn đó vào Công nợ NCC. Ô <b>Ngày</b> để trống = lấy ngày của dòng trên (dòng đầu là hôm nay).</Note>
      </div>
      {suggest && ac ? <SuggestPanel anchor={suggest.anchor} header={ac.header} items={ac.items} active={suggest.active} createText={ac.createText} onPick={pickSuggest} /> : null}
      <DuplicateDialog hits={dups?.hits ?? null} lists={lists} busy={createExpenses.isPending} onCancel={() => setDups(null)} onConfirm={() => { if (dups) doSave(dups.inputs, dups.lastDate); }} />
      <ConfirmDialog open={askClear} onOpenChange={setAskClear} title="Xóa trắng bảng nhập?" message="Mọi dòng đang gõ (chưa lưu) sẽ bị bỏ." confirmLabel="Xóa bảng" danger onConfirm={clearAll} />
    </Card>
  );
}
