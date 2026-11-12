// TN02 — vẽ MỘT khối dữ liệu vào sheet ExcelJS (đặc tả 5.5):
//   ▐ 1. TIÊU ĐỀ (dải vàng nhạt) · chú thích nghiêng xám · hàng cột (xanh đậm, chữ trắng, viền) · dữ liệu · TỔNG CỘNG (=SUBTOTAL(9,…)).
// Cột tiền là số thật, định dạng #,##0;[Red]-#,##0;"-". Ngày là chữ dd/mm/yyyy. Cột A = STT.
import type { Worksheet } from 'exceljs';
import { sumAmounts } from '@/lib/calc';
import { vnDate } from './ten-file';

export type KhoiCol = { key: string; label: string; width: number; type: 'money' | 'num' | 'dec' | 'date' | 'text' | 'bool'; sum: boolean };
export type Khoi = { title: string; caption: string; columns: KhoiCol[]; rows: (string | number | null)[][] };
export type KhoiResult = { endRow: number; headerRow: number; totalRow: number | null; colOf: (key: string) => string | null; rowCount: number };

export const FMT = { money: '#,##0;[Red]-#,##0;"-"', dec: '#,##0.0;[Red]-#,##0.0;"-"' };
const COLOR = { band: 'FFFFF2CC', head: 'FF1F4E79', headFg: 'FFFFFFFF', total: 'FFDDEBF7', caption: 'FF808080', border: 'FFB4C6E7' };
const thin = { style: 'thin' as const, color: { argb: COLOR.border } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

/** Chữ cột Excel: 1 → A, 27 → AA */
export function colLetter(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** Nới độ rộng cột của sheet theo khối (lấy lớn nhất giữa các khối) */
function widen(ws: Worksheet, idx: number, width: number) {
  const c = ws.getColumn(idx);
  if (!c.width || c.width < width) c.width = width;
}

export function drawKhoi(ws: Worksheet, startRow: number, k: Khoi, opt: { index: number; autoFilter?: boolean; freeze?: boolean }): KhoiResult {
  const nCols = k.columns.length + 1; // + STT
  let r = startRow;
  widen(ws, 1, 6);
  k.columns.forEach((c, i) => widen(ws, i + 2, c.width));

  // Dải tiêu đề
  ws.mergeCells(r, 1, r, nCols);
  const t = ws.getCell(r, 1);
  t.value = `${opt.index}. ${k.title}`;
  t.font = { bold: true, size: 12 };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.band } };
  ws.getRow(r).height = 20;
  r++;
  // Chú thích
  ws.mergeCells(r, 1, r, nCols);
  const cap = ws.getCell(r, 1);
  cap.value = `${k.rows.length.toLocaleString('vi-VN')} dòng${k.caption ? ` · ${k.caption}` : ''}`;
  cap.font = { italic: true, size: 9, color: { argb: COLOR.caption } };
  r++;
  // Hàng cột
  const headerRow = r;
  const head = ws.getRow(r);
  ['STT', ...k.columns.map((c) => c.label)].forEach((label, i) => {
    const cell = head.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: COLOR.headFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.head } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER;
  });
  head.height = 30;
  r++;
  const first = r;
  if (!k.rows.length) {
    ws.mergeCells(r, 1, r, nCols);
    const e = ws.getCell(r, 1);
    e.value = 'Không có dữ liệu trong bộ lọc đã chọn';
    e.font = { italic: true, color: { argb: COLOR.caption } };
    r++;
  }
  k.rows.forEach((row, i) => {
    const xr = ws.getRow(r);
    const stt = xr.getCell(1);
    stt.value = i + 1; stt.border = BORDER; stt.alignment = { horizontal: 'center' };
    k.columns.forEach((c, j) => {
      const cell = xr.getCell(j + 2);
      const v = row[j];
      if (c.type === 'date') cell.value = v == null ? null : vnDate(v) || String(v);
      else if ((c.type === 'money' || c.type === 'num' || c.type === 'dec') && v != null && v !== '') {
        cell.value = Number(v);
        cell.numFmt = c.type === 'dec' ? FMT.dec : FMT.money;
      } else cell.value = v == null ? null : String(v);
      cell.border = BORDER;
      if (c.type === 'text' && c.width >= 30) cell.alignment = { wrapText: true, vertical: 'top' };
    });
    r++;
  });
  const lastData = r - 1;
  // Dòng tổng: chỉ cộng cột tiền (và cột đánh dấu sum), dùng SUBTOTAL để lọc / sắp xếp / xóa dòng vẫn đúng
  let totalRow: number | null = null;
  if (k.rows.length && k.columns.some((c) => c.sum)) {
    totalRow = r;
    const xr = ws.getRow(r);
    for (let i = 1; i <= nCols; i++) {
      const cell = xr.getCell(i);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.total } };
      cell.font = { bold: true };
      cell.border = BORDER;
    }
    const firstSum = k.columns.findIndex((c) => c.sum);
    xr.getCell(firstSum === 0 ? 1 : 2).value = 'TỔNG CỘNG';
    k.columns.forEach((c, j) => {
      if (!c.sum) return;
      const L = colLetter(j + 2);
      const vals = k.rows.map((x) => Number(x[j]) || 0);
      const result = c.type === 'money' ? sumAmounts(vals) : Math.round(vals.reduce((s, x) => s + x, 0) * 100) / 100;
      const cell = xr.getCell(j + 2);
      cell.value = { formula: `SUBTOTAL(9,${L}${first}:${L}${lastData})`, result };
      cell.numFmt = c.type === 'dec' ? FMT.dec : FMT.money;
    });
    r++;
  }
  if (opt.autoFilter && k.rows.length) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastData, column: nCols } };
  if (opt.freeze) ws.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 0 }];
  return {
    endRow: r, headerRow, totalRow, rowCount: k.rows.length,
    colOf: (key) => { const j = k.columns.findIndex((c) => c.key === key); return j < 0 ? null : colLetter(j + 2); },
  };
}

/** Khổ in: A4 ngang, vừa 1 trang rộng, chân trang "Trang x/y" */
export function setupPrint(ws: Worksheet) {
  ws.pageSetup = { ...ws.pageSetup, paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } };
  ws.headerFooter = { oddFooter: '&CTrang &P/&N' };
}
