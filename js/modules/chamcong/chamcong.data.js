// ============================================================================
//  modules/chamcong/chamcong.data.js  —  TẦNG DỮ LIỆU (Layer 5): Chấm công tuần
// ----------------------------------------------------------------------------
//  @module chamcong.data
//
//  Đọc/ghi/xóa-mềm BẢN GHI TUẦN chấm công (doc 04). Mỗi bản ghi = 1 tuần × 1 công
//  trình (khóa duy nhất `fromDate` + `projectId`), bên trong là mảng `workers[]`.
//  API (doc 04 §10):
//    • getTimesheetWeeks({ year, projectId }) — các tuần còn dùng, lọc năm/CT.
//    • saveWeek({ id?, projectId, fromDate, toDate?, workers }) — tạo/cập nhật:
//        chuẩn hóa workers · ĐÓNG BĂNG debtBefore (snapshot nợ cũ) · dedup khóa tuần.
//    • deleteWeek(id) / loadWeek(id) — xóa mềm / nạp lại 1 tuần để sửa.
//
//  QUY ƯỚC VÀNG (doc 04 §1,§3): liên kết công trình CHỈ qua `projectId`; chi phí
//  lương KHÔNG đẩy vào `invoices` (Tab 03 đọc realtime qua weekToLaborRow).
// ============================================================================

import { STORE } from '../../core/db.js';
import { load, save, createRecord, markUpdated, softDelete, activeOnly, getById } from '../../core/store.js';
import { parseMoney } from '../../utils/fmt.js';
import { getSelectedYear } from '../../topbar.js';
import { loadProjects, getProjectById, isProjectLocked } from '../projects/projects.data.js';
import { calcDebtBefore, saturdayISO } from './chamcong.calc.js';

// num(x) — Ép số an toàn (giữ phần thập phân cho ngày công 0.5).
const num = (x) => Number(x) || 0;

// yearOf(iso) — Lấy 4 ký tự năm từ 'YYYY-MM-DD'.
const yearOf = (iso) => String(iso || '').slice(0, 4);

// ----------------------------------------------------------------------------
//  normDays(days) — Chuẩn hóa mảng ngày công về đúng 7 phần tử số (0=CN…6=T7).
// ----------------------------------------------------------------------------
function normDays(days) {
  const out = [0, 0, 0, 0, 0, 0, 0];
  if (Array.isArray(days)) for (let i = 0; i < 7; i++) out[i] = num(days[i]);
  return out;
}

// sumDays(days) — Tổng công của 1 mảng ngày (để lọc dòng rỗng).
function sumDays(days) {
  return (Array.isArray(days) ? days : []).reduce((s, v) => s + num(v), 0);
}

// ----------------------------------------------------------------------------
//  normalizeWorker(w) — Chuẩn hóa 1 công nhân trước khi lưu. Tiền dùng parseMoney
//  (nhận cả số lẫn chuỗi "350.000"); ngày công dùng num (giữ 0.5). debtBefore để 0
//  ở đây — sẽ ĐÓNG BĂNG bằng calcDebtBefore trong saveWeek.
// ----------------------------------------------------------------------------
function normalizeWorker(w) {
  return {
    name: String(w.name || '').trim(),
    role: String(w.role || '').trim(),
    wage: parseMoney(w.wage),
    days: normDays(w.days),
    allowance: parseMoney(w.allowance),
    retailInvoice: parseMoney(w.retailInvoice),
    loanAmount: parseMoney(w.loanAmount),
    deduction: parseMoney(w.deduction),
    note: String(w.note || '').trim(),
    debtBefore: 0,
  };
}

// ----------------------------------------------------------------------------
//  getTimesheetWeeks({ year, projectId }) — Các tuần CÒN DÙNG, lọc tùy chọn.
//   - year: tuần GIAO THOA năm này (năm của fromDate HOẶC toDate). year=0 → mọi năm.
//   - projectId: chỉ 1 công trình.
//  Trả mảng sắp xếp tuần mới nhất trước (fromDate giảm dần, rồi createdAt).
// ----------------------------------------------------------------------------
export async function getTimesheetWeeks({ year = getSelectedYear(), projectId } = {}) {
  let list = activeOnly(await load(STORE.TIMESHEETS, []));

  if (year) {
    const y = String(year);
    list = list.filter((w) => yearOf(w.fromDate) === y || yearOf(w.toDate) === y);
  }
  if (projectId) list = list.filter((w) => w.projectId === projectId);

  return list.sort((a, b) =>
    (b.fromDate || '').localeCompare(a.fromDate || '') || num(b.createdAt) - num(a.createdAt));
}

// ----------------------------------------------------------------------------
//  validateWeek(fromDate, projectId) — Ràng buộc bắt buộc (doc 04 §5). Ném Error
//  tiếng Việt nếu sai (caller bắt → toast). Chặn công trình đã quyết toán.
// ----------------------------------------------------------------------------
function validateWeek(fromDate, projectId) {
  if (!fromDate) throw new Error('Thiếu ngày bắt đầu tuần (Chủ Nhật).');
  if (!projectId) throw new Error('Thiếu Công trình.');

  const proj = getProjectById(projectId);
  if (!proj) throw new Error('Công trình không tồn tại (projectId sai).');
  if (isProjectLocked(projectId)) {
    throw new Error(`🔒 Công trình "${proj.name}" đã quyết toán — không thể chấm công.`);
  }
}

// ----------------------------------------------------------------------------
//  saveWeek({ id?, projectId, fromDate, toDate?, workers }) — Tạo MỚI hoặc CẬP NHẬT
//  1 tuần chấm công.
//   1) Validate + chặn CT đã quyết toán.
//   2) Chuẩn hóa workers, BỎ dòng rỗng (không tên & không công).
//   3) ĐÓNG BĂNG debtBefore mỗi worker = calcDebtBefore(name, fromDate, list, true)
//      — tính từ TOÀN BỘ lịch sử local tại thời điểm lưu (an toàn khi sync, §4).
//   4) Tìm bản ghi theo id (sửa) hoặc theo khóa fromDate+projectId (gộp).
//   5) DEDUP: xóa mềm mọi bản ghi trùng khóa còn sót → đảm bảo 1 tuần×1 CT = 1 record.
//  Trả về bản ghi đã lưu.
// ----------------------------------------------------------------------------
export async function saveWeek(input = {}) {
  await loadProjects();                 // đảm bảo cache CT sẵn sàng cho validate
  const fromDate = String(input.fromDate || '');
  const projectId = input.projectId;
  validateWeek(fromDate, projectId);

  const toDate = input.toDate || saturdayISO(fromDate);
  const list = await load(STORE.TIMESHEETS, []);

  // Chuẩn hóa + lọc dòng rỗng + đóng băng nợ cũ.
  const workers = (Array.isArray(input.workers) ? input.workers : [])
    .map(normalizeWorker)
    .filter((w) => w.name || sumDays(w.days) > 0);
  for (const w of workers) {
    w.debtBefore = calcDebtBefore(w.name, fromDate, list, true);
  }

  const fields = { projectId, fromDate, toDate, workers };

  // Bản ghi đích: ưu tiên theo id (đang sửa), sau đó theo khóa tuần+CT (gộp trùng).
  let saved = input.id ? getById(list, input.id) : null;
  if (!saved) {
    saved = list.find((r) => !r.deletedAt && r.fromDate === fromDate && r.projectId === projectId) || null;
  }

  if (saved) {
    Object.assign(saved, fields);       // giữ id/createdAt cũ
    markUpdated(saved);                 // làm mới mốc LWW
  } else {
    saved = createRecord(fields);       // gắn 6 trường hệ thống
    list.push(saved);
  }

  // Dedup: xóa mềm các bản ghi trùng khóa khác (giữ lại 'saved' vừa cập nhật mới nhất).
  for (const r of list) {
    if (r !== saved && !r.deletedAt && r.fromDate === fromDate && r.projectId === projectId) {
      softDelete(r);
    }
  }

  await save(STORE.TIMESHEETS, list);
  return saved;
}

// ----------------------------------------------------------------------------
//  deleteWeek(id) — XÓA MỀM 1 tuần (giữ lại để khôi phục/đồng bộ). Trả true nếu xóa.
// ----------------------------------------------------------------------------
export async function deleteWeek(id) {
  const list = await load(STORE.TIMESHEETS, []);
  const rec = getById(list, id);
  if (!rec) return false;
  softDelete(rec);
  await save(STORE.TIMESHEETS, list);
  return true;
}

// ----------------------------------------------------------------------------
//  loadWeek(id) — Nạp lại 1 tuần CÒN DÙNG theo id (để đổ vào form sửa). Null nếu
//  không có hoặc đã xóa mềm.
// ----------------------------------------------------------------------------
export async function loadWeek(id) {
  const rec = getById(await load(STORE.TIMESHEETS, []), id);
  return (rec && !rec.deletedAt) ? rec : null;
}
