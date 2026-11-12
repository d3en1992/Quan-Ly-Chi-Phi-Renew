// Tải nhanh MỘT bảng thành file Excel có trình bày (dùng lại excel-khoi của TN02) — thay các nút CSV lẻ (ví dụ bảng đối chiếu NCC).
import { drawDauTrang } from './dau-trang';
import { drawKhoi, setupPrint, type Khoi } from './excel-khoi';
import { sheetName } from './ten-file';

export async function downloadKhoi(k: Khoi, file: string, meta: { company: string; by: string; filterText: string; notes?: string[] }): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet(sheetName(k.title, new Set()));
  setupPrint(ws);
  const now = new Date();
  const r = drawDauTrang(ws, { company: meta.company, title: k.title, filterText: meta.filterText, exportedBy: meta.by, exportedAt: now.toLocaleString('vi-VN'), notes: meta.notes ?? [], privateWarning: false }, k.columns.length + 1, false);
  drawKhoi(ws, r, k, { index: 1, autoFilter: true, freeze: true });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = file;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
