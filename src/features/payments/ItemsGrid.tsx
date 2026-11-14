// BẢNG HẠNG MỤC HỢP ĐỒNG (máy tính / máy tính bảng) — cùng hệ lưới kiểu Google Sheet với Nhập nhanh và dòng vật tư
// (components/ui/sheet-grid): chọn vùng, Enter / Tab / mũi tên, dán thẳng bảng khối lượng từ Excel dự toán / báo giá (tự thêm dòng),
// kéo góc điền xuống, Delete, Ctrl+D, Ctrl+Z. Thành tiền + tổng tính bằng contractItemsTotal (lib/calc).
import { useRef, useState, type SetStateAction } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { cleanMoney, cleanQuantity, sheetCellClass, useSheetGrid } from '@/components/ui/sheet-grid';
import { contractItemsTotal, type ContractItem } from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const ICOLS = ['name', 'donVi', 'sl', 'donGia'] as const;
type ICol = (typeof ICOLS)[number];
const LABEL: Record<ICol, string> = { name: 'Hạng mục', donVi: 'ĐVT', sl: 'Khối lượng', donGia: 'Đơn giá' };

export const blankItem = (): ContractItem => ({ name: '', donVi: '', sl: 0, donGia: 0 });
const parseSl = (raw: string) => Number(cleanQuantity(raw).replace(',', '.')) || 0;
const slText = (n: number) => (n ? String(n).replace('.', ',') : '');

function setCol(it: ContractItem, col: ICol, raw: string): ContractItem {
  if (col === 'name') return { ...it, name: raw };
  if (col === 'donVi') return { ...it, donVi: raw.trim() };
  if (col === 'sl') return { ...it, sl: parseSl(raw) };
  return { ...it, donGia: cleanMoney(raw) };
}
const colText = (it: ContractItem, col: ICol) => (col === 'sl' ? slText(it.sl) : col === 'donGia' ? (it.donGia ? String(it.donGia) : '') : it[col]);

/** Dán ma trận từ ô (r0, c0); thiếu dòng thì thêm */
export function pasteItems(items: readonly ContractItem[], matrix: string[][], r0: number, c0: number): ContractItem[] {
  const out = [...items];
  while (out.length < r0 + matrix.length) out.push(blankItem());
  matrix.forEach((cells, i) => {
    let it = out[r0 + i]!;
    cells.forEach((raw, j) => { const col = ICOLS[c0 + j]; if (col) it = setCol(it, col, raw); });
    out[r0 + i] = it;
  });
  return out;
}

export function ItemsGrid({ items, onChange, disabled }: { items: ContractItem[]; onChange: (v: ContractItem[]) => void; disabled?: boolean }) {
  const tableRef = useRef<HTMLTableElement>(null);
  // Bảng nhận items từ ngoài (onChange) → giữ bản mới nhất để các lần sửa liền nhau không đè nhau
  const latest = useRef(items);
  latest.current = items;
  const setItems = (v: SetStateAction<ContractItem[]>) => {
    if (disabled) return;
    const next = typeof v === 'function' ? v(latest.current) : v;
    latest.current = next;
    onChange(next);
  };
  // Ô Khối lượng đang gõ dở ("2," chưa thành số) → giữ nguyên chữ cho tới khi rời ô
  const [buf, setBuf] = useState<{ r: number; text: string } | null>(null);
  const grid = useSheetGrid<ContractItem>({
    rows: items, setRows: setItems, colCount: ICOLS.length, tableRef,
    cellText: (it, c) => colText(it, ICOLS[c]!),
    paste: pasteItems,
    clear: (it, c) => setCol(it, ICOLS[c]!, ''),
    newRow: () => blankItem(),
  });
  const { multi } = grid;
  const remove = (i: number) => { grid.snapshot(); setItems((xs) => xs.filter((_, j) => j !== i)); };

  const cellInput = 'block h-[34px] w-full min-w-0 truncate bg-transparent px-2.5 text-[13px] text-fg outline-none placeholder:text-faint';
  return (
    <div className="tbl rounded-lg border border-line">
      <table ref={tableRef} data-testid="items-table" className="!w-full table-fixed select-none [&_th]:border-r [&_th]:border-line-soft [&_tr>*:last-child]:border-r-0"
        style={{ minWidth: 620 }} onCopy={grid.onCopy} onPaste={(e) => { setBuf(null); grid.onPaste(e, (c) => ICOLS[c] === 'name'); }}>
        <colgroup><col style={{ width: 34 }} /><col style={{ minWidth: 160 }} /><col style={{ width: 70 }} /><col style={{ width: 90 }} /><col style={{ width: 120 }} /><col style={{ width: 130 }} /><col style={{ width: 36 }} /></colgroup>
        <thead>
          <tr><th className="!px-0 !text-center">#</th><th>Hạng mục</th><th>ĐVT</th><th className="!text-right">Khối lượng</th><th className="!text-right">Đơn giá</th><th className="!text-right">Thành tiền</th><th /></tr>
        </thead>
        <tbody>
          {items.map((it, r) => (
            <tr key={r}>
              <td className="cursor-pointer !px-0 !py-0 text-center text-[12px] text-faint" onMouseDown={(e) => { e.preventDefault(); grid.selectRow(r); }}>{r + 1}</td>
              {ICOLS.map((col, c) => {
                const shown = col === 'sl' ? (buf && buf.r === r ? buf.text : slText(it.sl)) : col === 'donGia' ? (it.donGia ? formatMoney(it.donGia) : '') : it[col];
                return (
                  <td key={col} className={sheetCellClass({ inRange: grid.inRange(r, c), multi, active: grid.isActive(r, c), fill: grid.inFill(r, c) })} {...grid.cellMouse(r, c)}>
                    <input
                      data-r={r} data-c={c} aria-label={`${LABEL[col]} ${r + 1}`} autoComplete="off" spellCheck={false} readOnly={disabled}
                      inputMode={col === 'sl' ? 'decimal' : col === 'donGia' ? 'numeric' : undefined}
                      className={cn(cellInput, (col === 'sl' || col === 'donGia') && 'num text-right')}
                      value={shown} title={shown || undefined}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (col === 'sl') setBuf({ r, text: cleanQuantity(v) });
                        setItems((xs) => xs.map((x, i) => (i !== r ? x : col === 'name' ? { ...x, name: v } : col === 'donVi' ? { ...x, donVi: v } : setCol(x, col, v))));
                      }}
                      onFocus={() => grid.cellFocus(r, c)}
                      onBlur={() => { if (col === 'sl') setBuf(null); }}
                      onKeyDown={(e) => { if (grid.handleKey(e, r, c)) setBuf(null); }}
                    />
                    {disabled ? null : grid.fillHandle(r, c)}
                  </td>
                );
              })}
              <td className="num text-right whitespace-nowrap">{formatMoney(contractItemsTotal([it]))}</td>
              <td className="!p-0 text-center">{disabled ? null : <Button size="icon" variant="ghost-danger" tabIndex={-1} aria-label={`Xóa hạng mục ${r + 1}`} onClick={() => remove(r)}><Icon name="close" /></Button>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="font-bold [&>td]:bg-surface-2"><td /><td colSpan={4}>Tổng hạng mục</td><td className="num text-right" data-testid="items-total">{formatMoney(contractItemsTotal(items))}</td><td /></tr></tfoot>
      </table>
    </div>
  );
}
