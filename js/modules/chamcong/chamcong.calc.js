// ============================================================================
//  modules/chamcong/chamcong.calc.js  —  TẦNG DỮ LIỆU (Layer 5): LOGIC CHẤM CÔNG
// ----------------------------------------------------------------------------
//  @module chamcong.calc
//
//  LOGIC THUẦN cho tab Chấm công (doc 04) — KHÔNG đụng DOM, KHÔNG đọc/ghi DB.
//  Gom mọi công thức để form (week) / lịch sử (history) / phiếu lương (report)
//  cùng gọi 1 nguồn, kết quả luôn nhất quán:
//    • totalDays / laborPay / takeHome / debtAfter — tính cho 1 công nhân.
//    • calcDebtBefore — nợ lũy kế TRƯỚC 1 tuần (snapshot đóng băng khi lưu, §4).
//    • weekLaborTotal / weekToLaborRow — đổi 1 tuần → "dòng lương ảo" cho Tab 03 (§3).
//    • sundayISO / saturdayISO / snapToSunday / weekLabel — tiện ích NGÀY (tuần CN→T7).
//
//  QUY ƯỚC (doc 04 §1,§2): tuần bắt đầu CHỦ NHẬT; days[] 7 phần tử (0=CN…6=T7),
//  mỗi ô = 1 | 0.5 | 0. "Vay Mới" & "HĐ Mua Lẻ" CỘNG vào thực lãnh; "Trừ Nợ" TRỪ.
// ============================================================================

import { normalizeVietnamese } from '../../utils/autocomplete.js';

// num(x) — Ép số an toàn ('' / không hợp lệ → 0). KHÔNG dùng parseMoney cho ngày
// công vì parseMoney bỏ phần thập phân (0.5 → 5) — ở đây cần giữ nguyên 0.5.
const num = (x) => Number(x) || 0;

// round1(n) — Làm tròn 1 chữ số thập phân (tổng công có thể lẻ 0.5).
const round1 = (n) => Math.round(num(n) * 10) / 10;

// ----------------------------------------------------------------------------
//  CÔNG THỨC THEO 1 CÔNG NHÂN (doc 04 §2)
// ----------------------------------------------------------------------------

// totalDays(w) — Tổng công = cộng 7 ngày (1 cả ngày, 0.5 nửa ngày).
export function totalDays(w) {
  const days = (w && Array.isArray(w.days)) ? w.days : [];
  return round1(days.reduce((s, v) => s + num(v), 0));
}

// laborPay(w) — Lương theo công = tổng công × lương/ngày.
export function laborPay(w) {
  return totalDays(w) * num(w && w.wage);
}

// takeHome(w) — Thực lãnh tuần = lương + phụ cấp + vay mới + HĐ mua lẻ − trừ nợ.
//   Có thể ÂM (công nhân trả nợ nhiều hơn nhận) → UI hiển thị ngoặc đỏ.
export function takeHome(w) {
  return laborPay(w)
    + num(w && w.allowance)
    + num(w && w.loanAmount)
    + num(w && w.retailInvoice)
    - num(w && w.deduction);
}

// debtAfter(w) — Nợ hiện tại SAU tuần = nợ cũ (snapshot) + vay mới − trừ nợ (§4).
export function debtAfter(w) {
  return num(w && w.debtBefore) + num(w && w.loanAmount) - num(w && w.deduction);
}

// ----------------------------------------------------------------------------
//  calcDebtBefore(name, fromDate, weeks, forceLive) — Nợ lũy kế TRƯỚC tuần fromDate
//  của 1 công nhân = Σ (vay mới − trừ nợ) của MỌI tuần (mọi công trình) có
//  fromDate < tuần hiện tại. >0 = đang nợ, <0 = dư, =0 = sạch nợ. (doc 04 §4)
//
//  So tên KHÔNG dấu (normalizeVietnamese) để khớp dù lệch hoa/thường/dấu.
//  Lọc `< fromDate` (chặt) nên tự loại trừ chính tuần đang lưu (kể cả tuần khác CT
//  cùng ngày) → tránh tự tham chiếu vòng. `forceLive` giữ cho đúng API doc §10:
//  hàm LUÔN tính từ dữ liệu thật (live) nên kết quả luôn chuẩn; cờ này dành cho
//  caller diễn đạt ý "bỏ qua snapshot cũ" lúc đóng băng khi lưu — không đổi kết quả.
// ----------------------------------------------------------------------------
export function calcDebtBefore(name, fromDate, weeks, forceLive = false) {
  void forceLive;                                   // luôn tính live (xem chú thích trên)
  const key = normalizeVietnamese(String(name || ''));
  const before = String(fromDate || '');
  let debt = 0;

  for (const w of (weeks || [])) {
    if (w.deletedAt) continue;                      // bỏ tuần đã xóa mềm
    if (!(String(w.fromDate || '') < before)) continue;
    for (const wk of (w.workers || [])) {
      if (normalizeVietnamese(String(wk.name || '')) !== key) continue;
      debt += num(wk.loanAmount) - num(wk.deduction);
    }
  }
  return debt;
}

// ----------------------------------------------------------------------------
//  DÒNG LƯƠNG ẢO CHO TAB 03 (doc 04 §3) — KHÔNG lưu vào invoices.
// ----------------------------------------------------------------------------

// weekLaborTotal(week) — Tổng lương theo công của CẢ tuần (Σ laborPay từng người).
export function weekLaborTotal(week) {
  return (week && Array.isArray(week.workers) ? week.workers : [])
    .reduce((s, w) => s + laborPay(w), 0);
}

// weekToLaborRow(week) — Đổi 1 tuần → 1 "dòng lương ảo" để Tab 03 gộp view realtime.
export function weekToLaborRow(week) {
  return {
    category: 'Nhân công',
    source: 'timesheet',
    key: { weekId: week.id, projectId: week.projectId },
    projectId: week.projectId,
    amount: weekLaborTotal(week),
    date: week.toDate,
  };
}

// ----------------------------------------------------------------------------
//  TIỆN ÍCH NGÀY — tuần Chủ Nhật → Thứ Bảy. ISO = 'YYYY-MM-DD' theo giờ ĐỊA PHƯƠNG
//  (tự dựng từ Y/M/D, KHÔNG dùng toISOString để tránh lệch múi giờ).
// ----------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// parseISO(s) — 'YYYY-MM-DD' → Date (đầu ngày, giờ địa phương). Sai → null.
function parseISO(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// snapToSunday(date) — Bất kỳ ngày (Date | 'YYYY-MM-DD') → Chủ Nhật của tuần đó (ISO).
export function snapToSunday(date) {
  let d = (date instanceof Date) ? new Date(date) : (parseISO(date) || new Date(date));
  if (Number.isNaN(d.getTime())) d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());            // getDay(): 0=CN → lùi về CN
  return toISO(d);
}

// sundayISO(offset) — Chủ Nhật của tuần cách tuần hiện tại `offset` tuần (0 = tuần này).
export function sundayISO(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + num(offset) * 7);
  return toISO(d);
}

// saturdayISO(sunISO) — Chủ Nhật (ISO) → Thứ Bảy cuối tuần (ISO, +6 ngày).
export function saturdayISO(sunISO) {
  const d = parseISO(sunISO);
  if (!d) return '';
  d.setDate(d.getDate() + 6);
  return toISO(d);
}

// weekLabel(sunISO) — Nhãn tuần gọn cho UI: "CN dd/mm → T7 dd/mm/yyyy".
export function weekLabel(sunISO) {
  const sun = parseISO(sunISO);
  const sat = parseISO(saturdayISO(sunISO));
  if (!sun || !sat) return '';
  const f = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
  return `CN ${f(sun)} → T7 ${f(sat)}/${sat.getFullYear()}`;
}
