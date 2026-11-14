// BẢNG DÒNG VẬT TƯ của Hóa đơn chi tiết — cùng hệ lưới kiểu Google Sheet với Nhập nhanh (components/ui/sheet-grid):
// chọn vùng, Enter / Tab / mũi tên, Ctrl+C / Ctrl+V vùng (dán thẳng nhiều dòng từ Excel / Zalo, tự thêm dòng), kéo góc điền xuống,
// Delete, Ctrl+D, Ctrl+Z. Chọn tên vật tư từ gợi ý → tự điền ĐVT + đơn giá lần mua trước (nếu ô còn trống).
import { useRef, type Dispatch, type SetStateAction } from 'react';
import { Icon } from '@/components/ui/button';
import { cleanMoney, cleanQuantity, sheetCellClass, useSheetGrid, type SheetSuggestCol } from '@/components/ui/sheet-grid';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { LineHistory } from './InvoiceForm';
import { blankLine, lineIsBlank, lineTotal, type InvoiceDraft, type LineDraft } from './invoice-model';

const LCOLS = ['name', 'unit', 'quantity', 'unitPrice'] as const;
type LCol = (typeof LCOLS)[number];
export { cleanMoney, cleanQuantity };
const LABEL: Record<LCol, string> = { name: 'Tên vật tư', unit: 'ĐVT', quantity: 'Số lượng', unitPrice: 'Đơn giá' };

function setCol(l: LineDraft, col: LCol, raw: string): LineDraft {
  if (col === 'name') return { ...l, name: raw.slice(0, 300) };
  if (col === 'unit') return { ...l, unit: raw.trim().slice(0, 30) };
  if (col === 'quantity') return { ...l, quantity: cleanQuantity(raw) };
  return { ...l, unitPrice: cleanMoney(raw) };
}
const colText = (l: LineDraft, col: LCol) => (col === 'unitPrice' ? (l.unitPrice ? String(l.unitPrice) : '') : l[col]);

/** Dán ma trận vào các dòng từ ô (r0, c0); thiếu dòng thì thêm */
export function pasteLines(lines: readonly LineDraft[], matrix: string[][], r0: number, c0: number): LineDraft[] {
  const out = [...lines];
  while (out.length < r0 + matrix.length) out.push(blankLine());
  matrix.forEach((cells, i) => {
    let l = out[r0 + i]!;
    cells.forEach((raw, j) => { const col = LCOLS[c0 + j]; if (col) l = setCol(l, col, raw); });
    out[r0 + i] = l;
  });
  return out;
}

export function LinesGrid({ draft, setDraft, suggestions, compact, bad, unsure, total, onSave }: {
  draft: InvoiceDraft; /** Tổng hóa đơn (invoiceTotal → lib/calc) */ total: number; setDraft: Dispatch<SetStateAction<InvoiceDraft>>; suggestions: LineHistory; compact: boolean; bad: boolean;
  /** Ô AI đọc chưa chắc, dạng `${key dòng}:${cột 0–3}` */
  unsure: readonly string[];
  onSave?: () => void;
}) {
  const lines = draft.lines ?? [];
  const tableRef = useRef<HTMLTableElement>(null);
  const setLines: Dispatch<SetStateAction<LineDraft[]>> = (v) =>
    setDraft((d) => ({ ...d, lines: typeof v === 'function' ? v(d.lines ?? []) : v }));
  const grid = useSheetGrid<LineDraft>({
    rows: lines, setRows: setLines, colCount: LCOLS.length, tableRef,
    cellText: (l, c) => colText(l, LCOLS[c]!),
    paste: pasteLines,
    clear: (l, c) => setCol(l, LCOLS[c]!, ''),
    newRow: () => blankLine(),
    onSave,
    // Tên vật tư + ĐVT: gợi ý từ những gì đã nhập, gõ khác vẫn được; ĐVT vừa vào ô là hiện danh sách
    suggest: (c): SheetSuggestCol | null => (LCOLS[c] === 'name' ? { items: suggestions.names, label: 'Vật tư đã nhập', free: true }
      : LCOLS[c] === 'unit' ? { items: suggestions.units, label: 'Đơn vị tính', free: true, openOnFocus: true } : null),
    // Chọn tên vật tư → tự điền ĐVT + đơn giá lần mua gần nhất (ô nào còn trống)
    onPick: (r, c, name) => setLines((ls) => ls.map((l, i) => {
      if (i !== r) return l;
      const col = LCOLS[c]!;
      let x = setCol(l, col, name);
      if (col === 'name') {
        const last = suggestions.last.get(name.trim().toLowerCase());
        if (last && !x.unit.trim() && last.unit) x = { ...x, unit: last.unit };
        if (last && !x.unitPrice && last.unitPrice) x = { ...x, unitPrice: last.unitPrice };
      }
      return x;
    })),
  });
  const { multi } = grid;

  const removeLine = (key: number) => {
    grid.snapshot();
    grid.closeSuggest();
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [blankLine()]));
  };

  const cellInput = 'block h-[34px] w-full min-w-0 truncate bg-transparent px-2.5 text-[13px] text-fg outline-none placeholder:text-faint';
  return (
    <div className={cn('tbl rounded-lg border', bad ? 'border-bad' : 'border-line')}>
      <table ref={tableRef} data-testid="invoice-lines" className="!w-full table-fixed select-none [&_th]:border-r [&_th]:border-line-soft [&_tr>*:last-child]:border-r-0"
        style={{ minWidth: compact ? 600 : 680 }} onCopy={grid.onCopy} onPaste={(e) => grid.onPaste(e, (c) => LCOLS[c] === 'name')}>
        <colgroup><col style={{ width: 34 }} /><col style={{ minWidth: 160 }} /><col style={{ width: 70 }} /><col style={{ width: 80 }} /><col style={{ width: 112 }} /><col style={{ width: 112 }} /><col style={{ width: 36 }} /></colgroup>
        <thead>
          <tr><th className="!px-0 !text-center">#</th><th>Tên vật tư</th><th>ĐVT</th><th className="!text-right">Số lượng</th><th className="!text-right">Đơn giá</th><th className="!text-right">Thành tiền</th><th /></tr>
        </thead>
        <tbody>
          {lines.map((l, r) => (
            <tr key={l.key}>
              <td className="cursor-pointer !px-0 !py-0 text-center text-[12px] text-faint" onMouseDown={(e) => { e.preventDefault(); grid.selectRow(r); }}>{r + 1}</td>
              {LCOLS.map((col, c) => {
                const shown = col === 'unitPrice' ? (l.unitPrice ? formatMoney(l.unitPrice) : '') : l[col];
                const td = sheetCellClass({ inRange: grid.inRange(r, c), multi, active: grid.isActive(r, c), fill: grid.inFill(r, c) });
                return (
                  <td key={col} className={cn(td, unsure.includes(`${l.key}:${c}`) && '!bg-warn-soft')} {...grid.cellMouse(r, c)}>
                    <input
                      data-r={r} data-c={c} aria-label={`${LABEL[col]} dòng ${r + 1}`} autoComplete="off" spellCheck={false}
                      inputMode={col === 'quantity' ? 'decimal' : col === 'unitPrice' ? 'numeric' : undefined}
                      maxLength={col === 'name' ? 300 : col === 'unit' ? 30 : undefined}
                      className={cn(cellInput, (col === 'quantity' || col === 'unitPrice') && 'num text-right')}
                      value={shown} title={shown || undefined}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((ls) => ls.map((x, i) => (i !== r ? x : col === 'unit' ? { ...x, unit: v.slice(0, 30) } : setCol(x, col, v))));
                        grid.cellTyped(r, c, v);
                      }}
                      onFocus={() => grid.cellFocus(r, c)}
                      onBlur={() => grid.cellBlur(r, c)}
                      onKeyDown={(e) => grid.handleKey(e, r, c)}
                    />
                    {grid.fillHandle(r, c)}
                  </td>
                );
              })}
              <td className="num text-right">{lineIsBlank(l) ? '' : formatMoney(lineTotal(l))}{l.discount.trim() ? <div className="text-[11px] text-muted">CK {l.discount}</div> : null}</td>
              <td className="!p-0 text-center"><button type="button" tabIndex={-1} aria-label={`Xóa dòng ${r + 1}`} className="grid h-[34px] w-full place-items-center text-faint hover:text-bad" onClick={() => removeLine(l.key)}><Icon name="close" className="text-[17px]" /></button></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold [&>td]:bg-surface-2">
            <td />
            <td colSpan={4}>Tổng hóa đơn</td>
            <td className="num text-right" data-testid="invoice-total">{formatMoney(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {grid.suggestPanel}
    </div>
  );
}
