// ============================================================================
//  utils/fmt.js  —  TẦNG MÓNG (Layer 0): Định dạng & bóc tách Tiền tệ + Ngày tháng
// ----------------------------------------------------------------------------
//  NHIỆM VỤ: Gom mọi việc "biến số thành chữ đẹp" và "biến chữ về lại số" vào 1 nơi
//  để toàn app hiển thị TIỀN và NGÀY nhất quán theo kiểu Việt Nam:
//     - Tiền : phân tách hàng nghìn bằng dấu CHẤM   →  1500000  ➜ "1.500.000"
//     - Ngày : dd/mm/yyyy                            →  (mốc thời gian) ➜ "05/06/2026"
//
//  File này KHÔNG phụ thuộc file nào khác → là một trong các file viết đầu tiên.
//  Cố tình tự cài đặt (không dựa vào Intl/locale của trình duyệt) để kết quả
//  LUÔN giống nhau trên mọi máy, mọi trình duyệt.
// ============================================================================

// ----------------------------------------------------------------------------
//  formatMoney(value) — Số tiền ➜ chuỗi có dấu chấm ngăn cách hàng nghìn.
//  Ví dụ:  formatMoney(1500000)  ➜  "1.500.000"
//          formatMoney(-2000)    ➜  "-2.000"
//          formatMoney(null)     ➜  "0"
//  Lưu ý: chỉ hiển thị phần NGUYÊN (làm tròn), không kèm chữ "đ".
// ----------------------------------------------------------------------------
export function formatMoney(value) {
  // Ép về số; nếu không hợp lệ (null, "", "abc"...) coi như 0. Làm tròn về số nguyên đồng.
  const n = Math.round(Number(value) || 0);
  // Tách dấu trừ ra xử lý riêng để regex chèn dấu chấm gọn hơn.
  const sign = n < 0 ? '-' : '';
  // Lấy phần trị tuyệt đối dạng chuỗi, rồi chèn dấu "." sau mỗi nhóm 3 chữ số (tính từ phải).
  // \B(?=(\d{3})+(?!\d)) : vị trí giữa các chữ số mà phía sau còn đúng bội số của 3 chữ số.
  const digits = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return sign + digits;
}

// ----------------------------------------------------------------------------
//  parseMoney(text) — Chuỗi tiền (có dấu chấm, chữ "đ"...) ➜ Số nguyên.
//  Ví dụ:  parseMoney("1.500.000")   ➜  1500000
//          parseMoney("2.000 đ")     ➜  2000
//          parseMoney("")            ➜  0
//  Dùng khi đọc số tiền người dùng gõ vào ô input để lưu vào DB.
// ----------------------------------------------------------------------------
export function parseMoney(text) {
  if (typeof text === 'number') return Math.round(text); // đã là số thì trả luôn
  if (!text) return 0;
  // Bỏ mọi ký tự KHÔNG phải chữ số và dấu trừ (loại dấu chấm, khoảng trắng, "đ", "VNĐ"...).
  const cleaned = String(text).replace(/[^\d-]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? 0 : n; // gõ linh tinh không ra số → 0
}

// ----------------------------------------------------------------------------
//  formatDate(value) — Mốc thời gian/Date ➜ chuỗi "dd/mm/yyyy".
//  Nhận: số mili-giây (Date.now()), chuỗi ngày, hoặc đối tượng Date.
//  Ví dụ:  formatDate(Date.now())  ➜  "05/06/2026"
//          formatDate(null)        ➜  ""   (rỗng để hiển thị an toàn trên UI)
// ----------------------------------------------------------------------------
export function formatDate(value) {
  if (value === null || value === undefined || value === '') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return ''; // giá trị không phải ngày hợp lệ → rỗng
  const dd   = String(d.getDate()).padStart(2, '0');      // ngày: luôn 2 chữ số
  const mm   = String(d.getMonth() + 1).padStart(2, '0'); // tháng: +1 vì JS đếm từ 0
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ----------------------------------------------------------------------------
//  formatDateTime(value) — Như formatDate nhưng kèm giờ:phút  "dd/mm/yyyy HH:MM".
//  Ví dụ:  formatDateTime(Date.now())  ➜  "05/06/2026 14:30"
//  Dùng cho các chỗ cần biết thời điểm tạo/sửa (vd: nhật ký, lịch sử).
// ----------------------------------------------------------------------------
export function formatDateTime(value) {
  const datePart = formatDate(value);
  if (!datePart) return '';
  const d  = new Date(value);
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  return `${datePart} ${HH}:${MM}`;
}

// ----------------------------------------------------------------------------
//  parseDate(text) — Chuỗi "dd/mm/yyyy" ➜ mốc thời gian (mili-giây) để lưu DB.
//  Chấp nhận dấu phân cách "/", "-" hoặc ".".  Sai định dạng ➜ null.
//  Ví dụ:  parseDate("05/06/2026")  ➜  1780...000 (ms)
//          parseDate("không phải ngày") ➜ null
// ----------------------------------------------------------------------------
export function parseDate(text) {
  if (!text) return null;
  // Bắt đúng 3 nhóm số: ngày(1-2 chữ số) - tháng(1-2) - năm(4), ngăn bởi / - hoặc .
  const m = String(text).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  const day   = Number(m[1]);
  const month = Number(m[2]);
  const year  = Number(m[3]);
  const d = new Date(year, month - 1, day); // month - 1 vì JS đếm tháng từ 0
  // Kiểm tra ngày có "tràn" không (vd 31/02 sẽ bị JS đẩy sang tháng 3) → coi là sai.
  if (d.getDate() !== day || d.getMonth() !== month - 1 || d.getFullYear() !== year) {
    return null;
  }
  return d.getTime();
}

// ----------------------------------------------------------------------------
//  formatNumber(value) — Định dạng số chung (không phải tiền) có ngăn cách nghìn.
//  Giữ tối đa 2 chữ số thập phân nếu có. Ví dụ: 1234.5 ➜ "1.234,5" (dấu phẩy thập phân kiểu VN).
//  Dùng cho khối lượng, số công, hệ số... những chỗ có thể lẻ.
// ----------------------------------------------------------------------------
export function formatNumber(value) {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  // Tách phần nguyên và phần lẻ (làm tròn 2 số lẻ, bỏ số 0 thừa ở cuối).
  const [intPart, decPart] = abs.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').split('.');
  const intStr = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // chấm ngăn nghìn
  return sign + (decPart ? `${intStr},${decPart}` : intStr);    // phẩy ngăn phần lẻ
}
