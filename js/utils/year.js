// ============================================================================
//  utils/year.js  —  TẦNG HẠ TẦNG (Layer 1): Lọc dữ liệu theo NĂM
// ----------------------------------------------------------------------------
//  App xem/nhập dữ liệu theo TỪNG NĂM (hóa đơn 2025, 2026...). File này lo:
//   - Biết mỗi kho dữ liệu dùng field NÀO làm "mốc thời gian" để suy ra năm.
//   - getRecordYear(): lấy năm của 1 bản ghi.
//   - filterByYear() : lọc danh sách chỉ giữ bản ghi đúng năm đang xem.
//   - activeYears()  : liệt kê các năm CÓ dữ liệu (để đổ vào ô chọn năm).
//
//  Vì sao mỗi kho 1 field khác nhau? Hóa đơn/tiền ứng/thu tiền/thiết bị mốc theo
//  ngày 'date'; còn chấm công lưu theo TUẦN nên mốc theo ngày đầu tuần 'fromDate'.
// ============================================================================

import { STORE } from '../core/db.js';

// ----------------------------------------------------------------------------
//  DATE_FIELD — Bản đồ: tên kho giao dịch → field chứa mốc thời gian.
//  Chỉ các kho "theo năm" mới có mặt ở đây. Các kho nền (projects, categories,
//  users, contracts, subcontracts) KHÔNG lọc theo năm nên không liệt kê.
// ----------------------------------------------------------------------------
export const DATE_FIELD = {
  [STORE.INVOICES]:   'date',     // hóa đơn — ngày hóa đơn (YYYY-MM-DD)
  [STORE.TIMESHEETS]: 'fromDate', // chấm công — Chủ Nhật đầu tuần (YYYY-MM-DD)
  [STORE.ADVANCES]:   'date',     // tiền ứng — ngày ứng
  [STORE.RECEIPTS]:   'date',     // thu tiền — ngày thu
  [STORE.EQUIPMENT]:  'date',     // thiết bị — ngày cập nhật cuối
};

// ----------------------------------------------------------------------------
//  getRecordYear(record, dateField) — Lấy NĂM (số, vd 2026) của 1 bản ghi.
//  Hỗ trợ cả 2 dạng mốc thời gian: chuỗi 'YYYY-MM-DD' và số mili-giây (timestamp).
//  Không đọc được năm → trả null.
// ----------------------------------------------------------------------------
export function getRecordYear(record, dateField = 'date') {
  const giaTri = record ? record[dateField] : null;
  if (!giaTri) return null;

  // Trường hợp chuỗi 'YYYY-MM-DD' (hoặc 'YYYY-...') → lấy 4 chữ số đầu.
  if (typeof giaTri === 'string') {
    const m = giaTri.match(/^(\d{4})/);
    return m ? Number(m[1]) : null;
  }

  // Trường hợp số mili-giây → dựng Date rồi lấy năm.
  const d = new Date(giaTri);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

// ----------------------------------------------------------------------------
//  filterByYear(records, year, dateField) — Giữ lại các bản ghi thuộc đúng 1 năm.
//  Ví dụ:  filterByYear(invoices, 2026)                      // mặc định field 'date'
//          filterByYear(timesheets, 2026, 'fromDate')        // chấm công
// ----------------------------------------------------------------------------
export function filterByYear(records, year, dateField = 'date') {
  const nam = Number(year);
  return (records || []).filter((r) => getRecordYear(r, dateField) === nam);
}

// ----------------------------------------------------------------------------
//  inActiveYear(record, year, dateField) — Bản ghi này có thuộc năm đang xem không?
//  Trả về true/false. Tiện dùng trong các vòng lặp lọc thủ công.
// ----------------------------------------------------------------------------
export function inActiveYear(record, year, dateField = 'date') {
  return getRecordYear(record, dateField) === Number(year);
}

// ----------------------------------------------------------------------------
//  activeYears(records, dateField) — Danh sách các NĂM có dữ liệu, sắp xếp giảm dần
//  (năm mới nhất lên đầu). LUÔN kèm năm hiện tại để người dùng nhập liệu mới được
//  ngay cả khi kho còn rỗng. Dùng để đổ vào ô <select> chọn năm trên thanh công cụ.
// ----------------------------------------------------------------------------
export function activeYears(records, dateField = 'date') {
  const tap = new Set();
  tap.add(new Date().getFullYear()); // luôn có năm nay

  for (const r of (records || [])) {
    const y = getRecordYear(r, dateField);
    if (y) tap.add(y);
  }

  return [...tap].sort((a, b) => b - a); // giảm dần: mới nhất trước
}
