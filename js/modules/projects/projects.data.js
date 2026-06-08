// ============================================================================
//  modules/projects/projects.data.js  —  TẦNG DỮ LIỆU LÕI (Layer 3): Công Trình
// ----------------------------------------------------------------------------
//  @module projects.data
//
//  Tab Công Trình là THỰC THỂ LÕI (master hub) của toàn app: mọi hóa đơn, chấm
//  công, ứng, thu... đều "vin" vào công trình qua trường projectId. File này lo
//  PHẦN DỮ LIỆU thuần (KHÔNG đụng DOM):
//    - CRUD công trình: tạo / sửa / hoàn thành / quyết toán / xóa mềm.
//    - Truy vấn: getProjectById, getProjectName, getSortedProjects, options dropdown.
//    - Ràng buộc: tên không trùng (so sánh KHÔNG DẤU), khóa CT đã quyết toán,
//      chỉ xóa khi không còn dữ liệu liên kết.
//    - Phân bổ chi phí chung CÔNG TY theo "số ngày thi công × hệ số loại hình".
//
//  QUY TẮC VÀNG: liên kết DUY NHẤT bằng projectId (UUID). KHÔNG lưu tên CT trong
//  record con — tên luôn lấy realtime qua getProjectName(). Vì vậy đổi tên CT là
//  thao tác O(1) (sửa đúng 1 record), toàn hệ thống tự cập nhật theo.
//
//  CƠ CHẾ CACHE: giữ 1 mảng _projects trong RAM (gồm cả bản đã xóa mềm) để các
//  hàm TRUY VẤN chạy ĐỒNG BỘ (sync) — UI gọi getProjectName() khỏi cần await.
//  Các hàm GHI (create/update/...) là async: nạp cache nếu cần → sửa → lưu DB.
// ============================================================================

import { STORE } from '../../core/db.js';
import {
  load, save, createRecord, markUpdated, softDelete, activeOnly, getById,
} from '../../core/store.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';

// ----------------------------------------------------------------------------
//  HẰNG SỐ & ENUM (nguồn sự thật duy nhất — UI lấy lại từ đây, không gõ tay)
// ----------------------------------------------------------------------------

// Trạng thái công trình: key (lưu DB) → nhãn tiếng Việt (hiển thị).
export const PROJECT_STATUS = Object.freeze({
  planning:  'Chuẩn bị thi công',
  active:    'Đang thi công',
  completed: 'Đã hoàn thành (chưa quyết toán)',
  closed:    'Đã quyết toán',
});
// Danh sách key trạng thái hợp lệ (dùng để validate).
export const PROJECT_STATUS_KEYS = Object.keys(PROJECT_STATUS);

// Loại hình công trình hợp lệ + nhãn hiển thị.
export const PROJECT_TYPES = ['CT', 'SC', 'OTHER'];
export const PROJECT_TYPE_LABELS = Object.freeze({
  CT: 'Xây mới', SC: 'Sửa chữa', OTHER: 'Khác',
});

// Hệ số phân bổ chi phí chung theo loại hình (CT gánh nhiều nhất).
export const ALLOCATION_FACTORS = Object.freeze({ CT: 1.6, SC: 1.0, OTHER: 1.2 });

// 🏢 CÔNG TY — cost center đặc biệt, KHÔNG lưu trong storage, luôn tồn tại.
// Là nơi hứng chi phí chung (văn phòng, lương cán bộ...) không thuộc CT nào.
export const COMPANY = Object.freeze({
  id: 'COMPANY', name: 'CÔNG TY', type: 'OTHER', status: 'active',
});

// Thứ tự ưu tiên khi sắp xếp danh sách (số nhỏ lên trước).
const STATUS_ORDER = { planning: 0, active: 1, completed: 2, closed: 3 };
const TYPE_ORDER = { CT: 0, SC: 1, OTHER: 2 };

const MS_PER_DAY = 86400000; // số mili-giây trong 1 ngày

// ----------------------------------------------------------------------------
//  CACHE RAM + nạp dữ liệu
//  _projects giữ TOÀN BỘ bản ghi (kể cả đã xóa mềm) để còn khôi phục & dò mồ côi.
//  _loaded đánh dấu đã nạp từ DB lần đầu chưa (tránh nạp lại thừa).
// ----------------------------------------------------------------------------
let _projects = [];
let _loaded = false;

// ensureLoaded() — Nạp cache lần đầu nếu chưa có. Các hàm ghi gọi hàm này trước.
async function ensureLoaded() {
  if (!_loaded) {
    _projects = await load(STORE.PROJECTS, []);
    _loaded = true;
  }
  return _projects;
}

// loadProjects() — Ép NẠP LẠI từ DB (gọi lúc khởi động app hoặc sau khi sync về).
export async function loadProjects() {
  _projects = await load(STORE.PROJECTS, []);
  _loaded = true;
  return _projects;
}

// saveProjects() — Ghi cache xuống IndexedDB + lên lịch đẩy đồng bộ.
async function saveProjects() {
  await save(STORE.PROJECTS, _projects);
  return _projects;
}

// ----------------------------------------------------------------------------
//  TIỆN ÍCH NGÀY THÁNG (nội bộ)
// ----------------------------------------------------------------------------

// ymdToMs('2026-01-15') → mốc mili-giây (giờ địa phương 00:00). Sai định dạng → null.
function ymdToMs(ymd) {
  const m = String(ymd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

// todayYmd() → chuỗi 'YYYY-MM-DD' của hôm nay (dùng làm startDate mặc định).
function todayYmd() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ----------------------------------------------------------------------------
//  TRUY VẤN (đồng bộ — đọc thẳng từ cache RAM)
// ----------------------------------------------------------------------------

// getProjectById(id) — 'COMPANY' trả hằng số COMPANY; còn lại tìm trong cache
// (kể cả bản đã xóa mềm, để lộ record mồ côi khi test). Không thấy → null.
export function getProjectById(id) {
  if (id === COMPANY.id) return COMPANY;
  return getById(_projects, id);
}

// getProjectName(projectId) — Tên hiển thị, LUÔN lấy realtime theo projectId.
// Record mồ côi (projectId trỏ vào CT đã mất) → '(Không xác định)' lộ ra ngay.
export function getProjectName(projectId) {
  const p = getProjectById(projectId);
  return p ? p.name : '(Không xác định)';
}

// getSortedProjects() — Danh sách CT CÒN dùng (KHÔNG gồm COMPANY), sắp 3 cấp:
// 1) trạng thái  2) loại hình  3) tên A→Z (tiếng Việt).
export function getSortedProjects() {
  return activeOnly(_projects).slice().sort((a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (s) return s;
    const t = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
    if (t) return t;
    return String(a.name).localeCompare(String(b.name), 'vi');
  });
}

// getProjectOptions({ excludeLocked, includeId }) — Dữ liệu [{id, name}] cho dropdown.
// CÔNG TY luôn được GHIM LÊN ĐẦU (nơi nhận chi phí chung). Khi nhập MỚI (excludeLocked
// = true) thì ẩn CT đã quyết toán; nhưng giữ lại includeId để sửa record cũ không mất giá trị.
export function getProjectOptions({ excludeLocked = false, includeId = null } = {}) {
  const opts = [{ id: COMPANY.id, name: COMPANY.name }];
  for (const p of getSortedProjects()) {
    if (excludeLocked && p.status === 'closed' && p.id !== includeId) continue;
    opts.push({ id: p.id, name: p.name });
  }
  return opts;
}

// isProjectLocked(id) — CT đã quyết toán (closed) → true (chặn nhập liệu mới).
// COMPANY không bao giờ bị khóa.
export function isProjectLocked(id) {
  if (id === COMPANY.id) return false;
  const p = getById(_projects, id);
  return !!p && p.status === 'closed';
}

// isNameTaken(name, exceptId) — (nội bộ) Tên đã có ở CT khác chưa? So sánh KHÔNG DẤU.
function isNameTaken(name, exceptId = null) {
  const key = normalizeVietnamese(name);
  return activeOnly(_projects).some(
    (p) => p.id !== exceptId && normalizeVietnamese(p.name) === key,
  );
}

// ----------------------------------------------------------------------------
//  CRUD (async — nạp cache → validate → sửa → lưu)
// ----------------------------------------------------------------------------

// createProject(data) — Tạo công trình mới. Bắt buộc: name không rỗng & không trùng.
// type mặc định 'CT', status mặc định 'active', startDate mặc định = hôm nay.
// Trả về bản ghi vừa tạo. Vi phạm ràng buộc → throw Error (UI bắt để toast).
export async function createProject(data = {}) {
  await ensureLoaded();
  const name = String(data.name ?? '').trim();
  if (!name) throw new Error('Tên công trình không được để trống.');
  if (isNameTaken(name)) throw new Error(`Công trình "${name}" đã tồn tại.`);

  const rec = createRecord({
    name,
    type:       PROJECT_TYPES.includes(data.type) ? data.type : 'CT',
    status:     PROJECT_STATUS_KEYS.includes(data.status) ? data.status : 'active',
    startDate:  data.startDate || todayYmd(),
    endDate:    data.endDate || null,
    closedDate: data.closedDate || null,
    investor:   String(data.investor ?? '').trim(),
    note:       String(data.note ?? '').trim(),
  });

  _projects.push(rec);
  await saveProjects();
  return rec;
}

// updateProject(id, changes) — Sửa công trình. KHÔNG cho ghi đè id/createdAt.
// COMPANY không sửa. status='completed' cần endDate; status='closed' cần closedDate.
export async function updateProject(id, changes = {}) {
  await ensureLoaded();
  if (id === COMPANY.id) throw new Error('Không thể sửa CÔNG TY (cost center hệ thống).');
  const p = getById(_projects, id);
  if (!p) throw new Error('Không tìm thấy công trình.');

  // Loại bỏ id/createdAt khỏi thay đổi để tránh ghi đè field bất biến.
  const { id: _ignoreId, createdAt: _ignoreCreated, ...safe } = changes;

  if (safe.name !== undefined) {
    const nm = String(safe.name).trim();
    if (!nm) throw new Error('Tên công trình không được để trống.');
    if (isNameTaken(nm, id)) throw new Error(`Công trình "${nm}" đã tồn tại.`);
    safe.name = nm;
  }
  if (safe.type !== undefined && !PROJECT_TYPES.includes(safe.type)) {
    throw new Error('Loại hình công trình không hợp lệ.');
  }
  if (safe.status !== undefined && !PROJECT_STATUS_KEYS.includes(safe.status)) {
    throw new Error('Trạng thái công trình không hợp lệ.');
  }

  // Giá trị SAU khi áp thay đổi (chưa ghi) để kiểm tra ràng buộc trạng thái ↔ ngày.
  const nextStatus = safe.status     ?? p.status;
  const nextEnd    = safe.endDate    ?? p.endDate;
  const nextClosed = safe.closedDate ?? p.closedDate;
  if (nextStatus === 'completed' && !nextEnd) {
    throw new Error('Trạng thái "Đã hoàn thành" cần ngày hoàn thành (endDate).');
  }
  if (nextStatus === 'closed' && !nextClosed) {
    throw new Error('Trạng thái "Đã quyết toán" cần ngày quyết toán (closedDate).');
  }

  Object.assign(p, safe);
  markUpdated(p);
  await saveProjects();
  return p;
}

// completeProject(id, endDate?) — Đánh dấu "Đã hoàn thành". Thiếu endDate → lấy hôm nay.
export async function completeProject(id, endDate = null) {
  await ensureLoaded();
  const p = getById(_projects, id);
  const day = endDate || p?.endDate || todayYmd();
  return updateProject(id, { status: 'completed', endDate: day });
}

// closeProject(id, closedDate?) — Quyết toán CT. Thiếu closedDate → lấy hôm nay.
// Sau khi closed → isProjectLocked()=true, mọi form nhập liệu mới bị chặn.
export async function closeProject(id, closedDate = null) {
  await ensureLoaded();
  const p = getById(_projects, id);
  const day = closedDate || p?.closedDate || todayYmd();
  return updateProject(id, { status: 'closed', closedDate: day });
}

// canDeleteProject(id) — Chỉ xóa được khi KHÔNG còn dữ liệu liên kết (hóa đơn,
// chấm công, ứng, thu, thiết bị) trỏ vào CT này. Trả về Promise<boolean>.
export async function canDeleteProject(id) {
  const linkedStores = [
    STORE.INVOICES, STORE.TIMESHEETS, STORE.ADVANCES, STORE.RECEIPTS, STORE.EQUIPMENT,
  ];
  for (const s of linkedStores) {
    const arr = await load(s, []);
    if (activeOnly(arr).some((r) => r.projectId === id)) return false;
  }
  return true;
}

// deleteProject(id) — XÓA MỀM (đặt deletedAt). COMPANY không xóa. Còn dữ liệu liên kết → throw.
export async function deleteProject(id) {
  await ensureLoaded();
  if (id === COMPANY.id) throw new Error('Không thể xóa CÔNG TY (cost center hệ thống).');
  const p = getById(_projects, id);
  if (!p) throw new Error('Không tìm thấy công trình.');
  if (!(await canDeleteProject(id))) {
    throw new Error('Công trình còn dữ liệu liên kết — không thể xóa.');
  }
  softDelete(p);
  await saveProjects();
  return p;
}

// ----------------------------------------------------------------------------
//  PHÂN BỔ CHI PHÍ CHUNG (tính realtime, KHÔNG lưu DB)
//  Chia chi phí CÔNG TY cho từng CT theo trọng số = số ngày thi công × hệ số loại hình.
// ----------------------------------------------------------------------------

// projectDays(p, year) — Số ngày thi công GIAO với năm đang xem.
//  - year = 0  → toàn bộ thời lượng (startDate → endDate hoặc hôm nay nếu chưa xong).
//  - year > 0  → chỉ phần nằm trong [01/01..31/12] của năm đó; không giao → 0 ngày.
export function projectDays(p, year = 0) {
  if (!p || !p.startDate) return 0;
  const start = ymdToMs(p.startDate);
  if (start == null) return 0;

  let end = p.endDate ? ymdToMs(p.endDate) : Date.now();
  if (end == null) end = Date.now();
  if (end < start) end = start; // dữ liệu lệch → coi như thi công 1 ngày

  let lo = start, hi = end;
  if (Number(year) > 0) {
    const yLo = new Date(Number(year), 0, 1).getTime();   // 01/01
    const yHi = new Date(Number(year), 11, 31).getTime(); // 31/12
    lo = Math.max(start, yLo);
    hi = Math.min(end, yHi);
    if (hi < lo) return 0; // không giao với năm này
  }
  return Math.floor((hi - lo) / MS_PER_DAY) + 1; // tính cả ngày đầu và ngày cuối
}

// projectWeight(p, year) — Trọng số phân bổ = số ngày × hệ số loại hình.
export function projectWeight(p, year = 0) {
  const factor = ALLOCATION_FACTORS[p?.type] ?? ALLOCATION_FACTORS.OTHER;
  return projectDays(p, year) * factor;
}

// allocateCompanyCost(companyCost, year) — Chia companyCost cho các CT theo trọng số.
//  Trả về Map<projectId, số tiền được gánh>. Bất biến: Σ giá trị ≈ companyCost
//  (chỉ các CT có ngày thi công > 0 mới tham gia chia phần).
export function allocateCompanyCost(companyCost, year = 0) {
  const out = new Map();
  const cost = Number(companyCost) || 0;
  if (cost <= 0) return out;

  const weights = getSortedProjects().map((p) => ({ id: p.id, w: projectWeight(p, year) }));
  const total = weights.reduce((sum, x) => sum + x.w, 0);
  if (total <= 0) return out;

  for (const x of weights) {
    if (x.w > 0) out.set(x.id, cost * (x.w / total));
  }
  return out;
}
