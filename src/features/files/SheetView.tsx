// Xem nhanh Excel .xlsx: bảng chữ + số của từng trang tính (không có ảnh, biểu đồ, định dạng — cần thì Tải về).
import { useEffect, useState } from 'react';

const MAX_ROWS = 400, MAX_COLS = 40;
type SheetData = { name: string; rows: { n: number; cells: { text: string; num: boolean; span: number }[] }[]; more: boolean };

const two = (n: number) => String(n).padStart(2, '0');
/** Giá trị ô → chữ hiện (số kiểu Việt Nam, ngày dd/mm/yyyy, công thức lấy kết quả) */
export function cellText(v: unknown, numFmt = ''): { text: string; num: boolean } {
  if (v === null || v === undefined) return { text: '', num: false };
  if (typeof v === 'number') {
    if (numFmt.includes('%')) return { text: `${(Math.round(v * 10000) / 100).toLocaleString('vi-VN')}%`, num: true };
    return { text: v.toLocaleString('vi-VN', { maximumFractionDigits: 3 }), num: true };
  }
  if (v instanceof Date) return { text: `${two(v.getUTCDate())}/${two(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`, num: false };
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown; formula?: unknown; sharedFormula?: unknown; error?: unknown };
    if (o.richText) return { text: o.richText.map((t) => t.text).join(''), num: false };
    if ('result' in o) return cellText(o.result, numFmt);
    if (o.formula || o.sharedFormula) return { text: '', num: false };
    if (o.text !== undefined) return cellText(o.text, numFmt);
    return { text: o.error ? String(o.error) : '', num: false };
  }
  return { text: String(v), num: false };
}

async function readSheets(data: Blob): Promise<SheetData[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await data.arrayBuffer());
  return wb.worksheets.filter((w) => !w.state || w.state === 'visible').map((ws) => {
    const rows: SheetData['rows'] = [];
    let more = false;
    const cols = Math.min(ws.actualColumnCount ? ws.columnCount : 0, MAX_COLS);
    ws.eachRow((row, n) => {
      if (rows.length >= MAX_ROWS) { more = true; return; }
      const cells: SheetData['rows'][number]['cells'] = [];
      for (let c = 1; c <= cols; c++) {
        const cell = row.getCell(c);
        // Ô gộp ngang: ô đầu chiếm nhiều cột; ô gộp dọc lặp lại thì để trống
        if (cell.isMerged && cell.master.address !== cell.address) {
          if (Number(cell.master.row) === n) { const last = cells[cells.length - 1]; if (last) { last.span++; continue; } }
          cells.push({ text: '', num: false, span: 1 });
          continue;
        }
        cells.push({ ...cellText(cell.value, cell.numFmt ?? ''), span: 1 });
      }
      if (cells.some((x) => x.text)) rows.push({ n, cells });
    });
    return { name: ws.name, rows, more };
  }).filter((s) => s.rows.length);
}

export default function SheetView({ data, onError }: { data: Blob; onError: (msg: string) => void }) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    let live = true;
    readSheets(data).then((s) => { if (live) setSheets(s); }, () => { if (live) onError('Không mở được tệp Excel này — bấm Tải về để mở.'); });
    return () => { live = false; };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sheets) return <div className="grid h-40 place-items-center text-[13px] text-muted">Đang mở Excel…</div>;
  if (!sheets.length) return <div className="grid h-40 place-items-center text-[13px] text-muted">Tệp không có dữ liệu chữ / số.</div>;
  const s = sheets[Math.min(at, sheets.length - 1)]!;
  return (
    <div className="grid h-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-surface" data-testid="sheet-view">
      <div role="tablist" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line p-1.5">
        {sheets.map((x, i) => (
          <button key={x.name} type="button" role="tab" aria-selected={i === at} onClick={() => setAt(i)}
            className="shrink-0 rounded-md px-3 py-1.5 text-[13px] whitespace-nowrap text-muted aria-selected:bg-accent-soft aria-selected:font-semibold aria-selected:text-accent">{x.name}</button>
        ))}
      </div>
      <div className="min-h-0 overflow-auto overscroll-contain">
        <table className="border-collapse text-[12.5px] [&_td]:border [&_td]:border-line-soft [&_td]:px-2 [&_td]:py-1 [&_td]:align-top">
          <tbody>
            {s.rows.map((r) => (
              <tr key={r.n}>
                <td className="sticky left-0 bg-surface-2 text-right text-[11px] text-faint">{r.n}</td>
                {r.cells.map((c, i) => <td key={i} colSpan={c.span} className={c.num ? 'num text-right whitespace-nowrap' : 'max-w-[340px] min-w-[40px] whitespace-pre-wrap'}>{c.text}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 border-t border-line px-3 py-1.5 text-[12px] text-muted">{s.more ? `Chỉ hiện ${MAX_ROWS} dòng đầu. ` : ''}Xem nhanh: không có ảnh, màu, biểu đồ. Cần đủ thì bấm Tải về.</p>
    </div>
  );
}
