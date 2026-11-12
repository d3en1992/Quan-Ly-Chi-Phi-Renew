// TN02 — đầu trang mỗi sheet: tên công ty, tên file, bộ lọc đã áp, người xuất, ghi chú bắt buộc (danh bạ lọc theo phát sinh,
// năm chấm công theo Chủ nhật, tổng hóa đơn khác Lợi Nhuận) và dòng ĐỎ cảnh báo dữ liệu cá nhân.
import type { Font, Worksheet } from 'exceljs';

export type DauTrang = {
  company: string;
  title: string;
  filterText: string;
  exportedBy: string;
  exportedAt: string;
  notes: string[];
  privateWarning: boolean;
};

export const PRIVATE_WARNING = '⚠ FILE NÀY CHỨA DỮ LIỆU CÁ NHÂN (SĐT / CCCD / SỐ TÀI KHOẢN). Không gửi qua nhóm chat.';

/** Vẽ đầu trang từ dòng 1, trả về dòng trống kế tiếp. `span` = số cột để gộp ô. */
export function drawDauTrang(ws: Worksheet, d: DauTrang, span: number, withWarning: boolean): number {
  const last = Math.max(6, span);
  let r = 1;
  const line = (text: string, font: Partial<Font>) => {
    ws.mergeCells(r, 1, r, last);
    const c = ws.getCell(r, 1);
    c.value = text; c.font = font; c.alignment = { wrapText: false, vertical: 'middle' };
    r++;
  };
  if (withWarning && d.privateWarning) line(PRIVATE_WARNING, { bold: true, size: 11, color: { argb: 'FFC00000' } });
  line(d.company.toUpperCase(), { bold: true, size: 13, color: { argb: 'FF1F4E79' } });
  line(d.title, { bold: true, size: 15 });
  line(`Bộ lọc: ${d.filterText}`, { size: 10 });
  line(`Xuất lúc ${d.exportedAt} · bởi ${d.exportedBy}`, { italic: true, size: 9, color: { argb: 'FF808080' } });
  for (const n of d.notes) line(`• ${n}`, { italic: true, size: 9, color: { argb: 'FF595959' } });
  return r + 1;
}
