// ============================================================================
//  utils/csv.js  —  TẦNG TIỆN ÍCH (Layer 2): Xuất CSV cho Excel (tiếng Việt)
// ----------------------------------------------------------------------------
//  @module utils.csv
//
//  NHIỆM VỤ: gom 1 CHỖ DUY NHẤT cách xuất CSV của app để các màn dùng chung,
//  khỏi lặp code (trước đây mỗi màn tự viết csvCell + tạo <a download>).
//    • csvCell(v)            — bọc 1 ô theo RFC 4180 (thêm "" nếu có dấu , " xuống dòng).
//    • toCsv(rows)           — mảng-các-hàng (mỗi hàng là mảng ô) → chuỗi CSV (CRLF).
//    • downloadCsv(name, rows)— ghép BOM (UTF-8) + tải file .csv về máy.
//
//  QUY ƯỚC (đã chốt từ doc xuất dữ liệu): UTF-8 BOM ('﻿') để Excel đọc đúng
//  tiếng Việt + ngắt dòng CRLF ('\r\n'). Tên file tự thêm đuôi .csv nếu thiếu.
// ============================================================================

// csvCell(v) — Bọc 1 giá trị thành ô CSV an toàn (RFC 4180).
export function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// toCsv(rows) — rows = [[ô,ô,...], ...] → 1 chuỗi CSV (các ô nối bằng dấu phẩy,
// các hàng nối bằng CRLF). KHÔNG kèm BOM (để hàm khác tự ghép khi tải).
export function toCsv(rows) {
  return (rows || []).map((row) => (row || []).map(csvCell).join(',')).join('\r\n');
}

// downloadCsv(filename, rows) — Tạo Blob (BOM + CSV) rồi kích tải về máy.
//  Trả về số HÀNG đã ghi (tiện kiểm thử). filename thiếu ".csv" sẽ tự thêm.
export function downloadCsv(filename, rows) {
  const name = /\.csv$/i.test(filename) ? filename : `${filename}.csv`;
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return (rows || []).length;
}
