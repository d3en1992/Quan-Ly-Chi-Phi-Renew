// LƯỚI NHẬP NHANH kiểu Excel (PAGES.nhap của mẫu). Hành vi phím chép từ hoadon.sheet-grid.js của app cũ:
// phím / chọn vùng / chép dán / kéo điền / hoàn tác dùng chung ở components/ui/sheet-grid (cùng hệ với dòng vật tư Hóa đơn chi tiết).
// Space bật tắt Đã TT. Ô gợi ý (Loại, Công trình, Người mua, NCC, Nội dung) cũng do sheet-grid lo — ở đây chỉ khai báo từng cột.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon } from '@/components/ui/button';
import type { SuggestItem } from '@/components/ui/combo';
import { ConfirmDialog } from '@/components/ui/confirm';
import { Card, Note } from '@/components/ui/misc';
import { sheetCellClass, sheetClip, SheetKeysHint, useSheetGrid, type SheetSuggestCol } from '@/components/ui/sheet-grid';
import { useToast } from '@/components/ui/toast';
import { sumAmounts } from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCreateExpenses, type CreatableKind, type EntryExpense } from './api';
import {
  blankRows, cellText, checkRow, clearCell, COL_LABEL, COLS, commitCell, effectiveDates, isBlank, isCellWrong, nextRowAfter, pasteMatrix, toTsv, typeCell,
  type Col, type GridRow,
} from './grid-model';
import { findDuplicates, historySuggest, isoToVn, type DupHit } from './logic';
import type { ExpenseInput } from './schema';
import { DuplicateDialog, toDupCandidate, type Lists } from './shared';

const WIDTHS = [36, 92, 170, 250, 116, 0, 110, 170, 62];
const AC_LABEL: Partial<Record<Col, string>> = { type: 'Loại chi phí', project: 'Công trình', buyer: 'Người mua', supplier: 'Nhà cung cấp', description: 'Nội dung đã nhập' };
const CREATE_KIND: Partial<Record<Col, CreatableKind>> = { type: 'expense_type', buyer: 'person', supplier: 'supplier' };

export function QuickGrid({ lists, expenses, today, onActiveDate }: {
  lists: Lists; expenses: readonly EntryExpense[]; today: string; onActiveDate: (iso: string) => void;
}) {
  const toast = useToast();
  const createExpenses = useCreateExpenses();
  const year = Number(today.slice(0, 4));
  const [rows, setRows] = useState<GridRow[]>(() => blankRows(10));
  const [tried, setTried] = useState(false);
  const [dups, setDups] = useState<{ hits: DupHit[]; inputs: ExpenseInput[]; lastDate: string } | null>(null);
  const [askClear, setAskClear] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const saveRef = useRef<() => void>(() => undefined);
  const history = useMemo<SuggestItem[]>(
    () => historySuggest(expenses.map((e) => ({ text: e.description, date: e.date }))).map((name) => ({ id: name, name })),
    [expenses],
  );
  /** Ô gợi ý từng cột: Loại / Công trình / Người mua / NCC đúng danh mục (có "+ Thêm mới" trừ Công trình); Nội dung gõ tự do */
  const suggestFor = (c: number): SheetSuggestCol | null => {
    const col = COLS[c]!;
    const items = col === 'type' ? lists.types : col === 'project' ? lists.projectOptions : col === 'buyer' ? lists.buyers : col === 'supplier' ? lists.suppliers : col === 'description' ? history : null;
    if (!items) return null;
    const kind = CREATE_KIND[col];
    return { items, label: AC_LABEL[col] ?? '', free: col === 'description', openOnFocus: col !== 'description', create: kind ? (t) => lists.create(kind, t) : undefined };
  };
  const grid = useSheetGrid<GridRow>({
    rows, setRows, colCount: COLS.length, tableRef,
    cellText: (row, c) => cellText(row, COLS[c]!),
    paste: (rs, m, r0, c0) => pasteMatrix(rs, m, r0, c0, lists, year),
    clear: (row, c) => clearCell(row, COLS[c]!, lists),
    newRow: (rs) => nextRowAfter(rs[rs.length - 1]),
    copyDown: (row, above, c) => {
      const col = COLS[c]!;
      if (col === 'paid') return { ...row, paid: above.paid, auto: false };
      return above[col] !== '' ? commitCell({ ...row, auto: false }, col, above[col], lists, year) : row;
    },
    onSave: () => saveRef.current(),
    suggest: suggestFor,
    onPick: (r, c, name) => commit(r, c, name),
  });
  const { sel, setSel, multi, go } = grid;

  const dates = useMemo(() => effectiveDates(rows, today), [rows, today]);
  const checks = useMemo(() => rows.map((r, i) => checkRow(r, dates[i] ?? null, lists)), [rows, dates, lists]);
  const valid = checks.flatMap((c) => (c.state === 'valid' ? [c.input] : []));
  const total = sumAmounts(valid.map((v) => v.amount));

  // Ngày của dòng đang đứng → bảng "Hóa đơn trong ngày" bên dưới
  const activeDate = dates[sel.fr] ?? today;
  useEffect(() => { onActiveDate(activeDate); }, [activeDate, onActiveDate]);

  const setCell = (r: number, c: number, fn: (row: GridRow, col: Col) => GridRow) =>
    setRows((rs) => rs.map((row, i) => (i === r ? fn(row, COLS[c]!) : row)));
  const commit = (r: number, c: number, raw: string) => setCell(r, c, (row, col) => commitCell(row, col, raw, lists, year));

  // ── Lưu ──
  const doSave = (inputs: ExpenseInput[], lastDate: string) => {
    createExpenses.mutate(inputs, {
      onSuccess: () => {
        toast(`Đã lưu ${inputs.length} hóa đơn · ${formatMoney(sumAmounts(inputs.map((i) => i.amount)))} đ`);
        // Làm sạch bảng (chống bấm lưu 2 lần); giữ ngày đang nhập nếu không phải hôm nay — như app cũ
        const fresh = blankRows(5);
        if (lastDate !== today) fresh[0] = { ...fresh[0]!, date: isoToVn(lastDate) };
        setRows(fresh); setTried(false); setDups(null); grid.closeSuggest();
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
  saveRef.current = save;

  // ── Nút trên đầu bảng ──
  const copyAll = async () => {
    const filled = rows.filter((r) => !isBlank(r));
    if (!filled.length) { toast('Bảng đang trống, chưa có gì để copy.', 'error'); return; }
    const tsv = toTsv(filled, 0, 0, filled.length - 1, COLS.length - 1);
    sheetClip.set(tsv);
    try { await navigator.clipboard.writeText(tsv); } catch { /* trình duyệt chặn clipboard → vẫn giữ trong bộ nhớ tạm của app */ }
    toast(`Đã copy ${filled.length} dòng (dán được vào Excel hoặc bấm Dán)`);
  };
  const pasteAll = async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { text = sheetClip.get(); }
    if (!text.trim()) text = sheetClip.get();
    if (!text.trim()) { toast('Chưa có gì để dán. Copy vùng trong Excel rồi bấm vào một ô và nhấn Ctrl+V.', 'error'); return; }
    const firstFree = rows.findIndex((r) => isBlank(r));
    const at = { r: firstFree < 0 ? rows.length : firstFree, c: 0 };
    grid.pasteText(text, at);
    go(at.r, 0);
  };
  const clearAll = () => { setRows(blankRows(10)); setTried(false); grid.closeSuggest(); setAskClear(false); setSel({ ar: 0, ac: 0, fr: 0, fc: 0 }); go(0, 0); };

  const cellInput = 'block h-[38px] w-full min-w-0 truncate bg-transparent px-3 text-[13px] text-fg outline-none placeholder:text-faint';

  return (
    <Card>
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <h3 className="m-0 text-sm font-bold">Nhập nhanh</h3>
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => void copyAll()}><Icon name="content_copy" />Copy</Button>
        <Button variant="ghost" onClick={() => void pasteAll()}><Icon name="content_paste" />Dán</Button>
        <Button variant="ghost" onClick={() => (rows.some((r) => !isBlank(r)) ? setAskClear(true) : clearAll())}><Icon name="delete_sweep" />Xóa bảng</Button>
        <Button variant="primary" data-testid="grid-save" disabled={createExpenses.isPending} onClick={save}>
          <Icon name="save" />{createExpenses.isPending ? 'Đang lưu…' : `Lưu ${valid.length} dòng`}
        </Button>
      </header>
      <div className="tbl">
        <table ref={tableRef} data-testid="quick-grid" className="!w-full table-fixed select-none" style={{ minWidth: 1140 }} onCopy={grid.onCopy} onPaste={(e) => grid.onPaste(e, (c) => COLS[c] === 'description')}>
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
                    onMouseDown={(e) => { e.preventDefault(); grid.selectRow(r); }}
                  >{r + 1}</td>
                  {COLS.map((col, c) => {
                    const wrong = isCellWrong(row, col, lists, year) || missing.includes(col);
                    const tdClass = sheetCellClass({ inRange: grid.inRange(r, c), multi, active: grid.isActive(r, c), fill: grid.inFill(r, c), wrong });
                    const mouse = grid.cellMouse(r, c);
                    const onFocus = () => grid.cellFocus(r, c);
                    if (col === 'paid') {
                      return (
                        <td key={col} className={tdClass} {...mouse}>
                          <button
                            type="button" role="checkbox" aria-checked={row.paid} aria-label={`Đã TT dòng ${r + 1}`} data-r={r} data-c={c}
                            className="flex h-[38px] w-full items-center justify-center outline-none"
                            onFocus={() => { onFocus(); grid.closeSuggest(); }}
                            onKeyDown={(e) => grid.handleKey(e, r, c)}
                            onClick={() => setCell(r, c, (x) => ({ ...x, paid: !x.paid, auto: false }))}
                          >
                            <Icon name={row.paid ? 'check_box' : 'check_box_outline_blank'} className={row.paid ? 'text-accent' : 'text-faint'} />
                          </button>
                          {grid.fillHandle(r, c)}
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
                            grid.cellTyped(r, c, v);
                          }}
                          onFocus={onFocus}
                          onBlur={() => {
                            grid.cellBlur(r, c);
                            commit(r, c, rowsRef.current[r]?.[col] ?? '');
                          }}
                          onKeyDown={(e) => grid.handleKey(e, r, c)}
                        />
                        {grid.fillHandle(r, c)}
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
      <div className="border-t border-line-soft px-4 py-2.5"><SheetKeysHint extra={<span><kbd>Space</kbd>bật/tắt Đã TT</span>} /></div>
      <div className="px-4 pb-3.5">
        <Note><b>Đã TT</b> (đã thanh toán lúc mua) tự tích sẵn. Chọn nhà cung cấp đang bật <b>Mua nợ</b> thì tự bỏ tích, hóa đơn đó vào Công nợ NCC. Ô <b>Ngày</b> để trống = lấy ngày của dòng trên (dòng đầu là hôm nay).</Note>
      </div>
      {grid.suggestPanel}
      <DuplicateDialog hits={dups?.hits ?? null} lists={lists} busy={createExpenses.isPending} onCancel={() => setDups(null)} onConfirm={() => { if (dups) doSave(dups.inputs, dups.lastDate); }} />
      <ConfirmDialog open={askClear} onOpenChange={setAskClear} title="Xóa trắng bảng nhập?" message="Mọi dòng đang gõ (chưa lưu) sẽ bị bỏ." confirmLabel="Xóa bảng" danger onConfirm={clearAll} />
    </Card>
  );
}
