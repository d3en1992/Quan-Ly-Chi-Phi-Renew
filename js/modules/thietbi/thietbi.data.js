// ============================================================================
//  modules/thietbi/thietbi.data.js  —  TẦNG DỮ LIỆU (Layer 5): Theo dõi Thiết bị
// ----------------------------------------------------------------------------
//  @module thietbi.data
//
//  Tầng LÕI dữ liệu cho tab Thiết Bị (doc 06): quản lý TỒN KHO thiết bị/giàn giáo
//  phân bổ tại từng công trình + KHO TỔNG, và LUÂN CHUYỂN giữa các nơi.
//
//  NGUYÊN TẮC VÀNG (doc 06 §1):
//   - 1 dòng tồn kho = khóa gộp (projectId + name + condition). Nhập/chuyển trùng
//     khóa → CỘNG DỒN vào dòng có sẵn (không tạo dòng mới).
//   - Kho Tổng là "công trình đặc biệt" projectId = 'COMPANY' (WAREHOUSE_ID).
//   - Liên kết công trình CHỈ qua projectId. Tên thiết bị bắt buộc khớp danh mục
//     categories.equipment (chống rác chính tả).
//   - Tình trạng lưu MÃ ('active'|'maintenance'|'repair'), hiển thị nhãn qua CONDITIONS.
//   - Xóa = soft-delete; luân chuyển = soft-delete bản gốc rồi tạo lại (an toàn sync LWW).
//
//  SCHEMA bản ghi (STORE.equipment):
//    { id, projectId, name, quantity, condition, note, date,
//      createdAt, updatedAt, deletedAt, deviceId }
// ============================================================================

import { STORE } from '../../core/db.js';
import { load, save, createRecord, markUpdated, softDelete, activeOnly, getById } from '../../core/store.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';
import { getSelectedYear } from '../../topbar.js';
import { loadProjects, getProjectById, isProjectLocked } from '../projects/projects.data.js';

// num(x) — Ép về số nguyên ≥ 0 an toàn (chuỗi rỗng/sai → 0).
const num = (x) => Math.max(0, Math.floor(Number(x) || 0));

// Mã Kho Tổng — trùng id cost center COMPANY của Tab Công Trình.
export const WAREHOUSE_ID = 'COMPANY';

// 3 tình trạng hợp lệ: mã (lưu DB) → nhãn + style badge Bootstrap (doc 06 §1).
export const CONDITIONS = Object.freeze({
  active:      { label: 'Đang hoạt động', style: 'success' },
  maintenance: { label: 'Cần bảo trì',    style: 'warning' },
  repair:      { label: 'Cần sửa chữa',   style: 'danger'  },
});
export const CONDITION_KEYS = Object.keys(CONDITIONS);

// normCond(c) — Chuẩn hóa về 1 mã hợp lệ (mặc định 'active').
function normCond(c) {
  return CONDITION_KEYS.includes(c) ? c : 'active';
}

// today() — Ngày hôm nay 'YYYY-MM-DD' cho trường date (ngày cập nhật cuối).
function today() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// mergeKey(rec) — Khóa gộp 1 dòng tồn kho: vị trí + tên (không dấu) + tình trạng.
const mergeKey = (projectId, name, condition) =>
  `${projectId}|${normalizeVietnamese(name)}|${condition}`;

// ----------------------------------------------------------------------------
//  getEquipment({ projectId, condition, year }) — Đọc tồn kho còn dùng + lọc.
//   - projectId: chỉ 1 vị trí (CT hoặc 'COMPANY').
//   - condition: chỉ 1 tình trạng.
//   - year: lọc theo năm của `date` (year=0 → mọi năm). Mặc định = năm đang chọn.
//  Trả mảng sắp xếp theo tên TB (A→Z tiếng Việt) rồi tình trạng.
// ----------------------------------------------------------------------------
export async function getEquipment({ projectId, condition, year = getSelectedYear() } = {}) {
  let list = activeOnly(await load(STORE.EQUIPMENT, []));

  if (projectId) list = list.filter((r) => r.projectId === projectId);
  if (condition) list = list.filter((r) => r.condition === condition);
  if (year) list = list.filter((r) => String(r.date || '').startsWith(String(year)));

  return list.sort((a, b) =>
    String(a.name).localeCompare(String(b.name), 'vi')
    || CONDITION_KEYS.indexOf(a.condition) - CONDITION_KEYS.indexOf(b.condition));
}

// ----------------------------------------------------------------------------
//  mergeInto(list, fields) — CỘNG DỒN 1 lô vào dòng cùng khóa (projectId+name+
//  condition) nếu có (chưa xóa), ngược lại tạo bản ghi mới. Cập nhật `date`.
//  Trả về bản ghi đích (đã sửa/đã tạo). Dùng chung cho lưu nhập & luân chuyển.
// ----------------------------------------------------------------------------
function mergeInto(list, { projectId, name, condition, quantity, note, date }) {
  const cond = normCond(condition);
  const key = mergeKey(projectId, name, cond);
  const hit = list.find((r) => !r.deletedAt && mergeKey(r.projectId, r.name, r.condition) === key);

  if (hit) {
    hit.quantity = num(hit.quantity) + num(quantity);
    hit.date = date || today();
    if (note) hit.note = note;            // ghi chú mới (nếu có) ghi đè
    markUpdated(hit);
    return hit;
  }
  const rec = createRecord({
    projectId, name, condition: cond,
    quantity: num(quantity), note: String(note || '').trim(), date: date || today(),
  });
  list.push(rec);
  return rec;
}

// ----------------------------------------------------------------------------
//  saveEquipment(location, rows) — Nhập nhiều dòng vào 1 vị trí (doc 06 §2).
//   location: projectId vị trí ('COMPANY' = Kho Tổng).
//   rows: [{ name, quantity, condition, note }] — bỏ dòng chưa chọn tên.
//  Cộng dồn theo khóa. CT đã quyết toán → chặn. Trả { ok, errors }.
// ----------------------------------------------------------------------------
export async function saveEquipment(location, rows) {
  await loadProjects();
  if (!location) throw new Error('Chưa chọn vị trí (Công trình / Kho Tổng).');
  if (!getProjectById(location)) throw new Error('Vị trí không tồn tại (projectId sai).');
  if (isProjectLocked(location)) {
    throw new Error('🔒 Công trình đã quyết toán — không thể nhập thiết bị.');
  }

  const list = await load(STORE.EQUIPMENT, []);
  let ok = 0;
  const errors = [];
  for (const row of rows || []) {
    const name = String(row.name || '').trim();
    if (!name) continue;                  // bỏ dòng chưa chọn tên
    if (num(row.quantity) <= 0) { errors.push(`"${name}": số lượng phải > 0.`); continue; }
    mergeInto(list, {
      projectId: location, name, condition: row.condition,
      quantity: row.quantity, note: row.note, date: today(),
    });
    ok++;
  }

  if (ok) await save(STORE.EQUIPMENT, list);
  return { ok, errors };
}

// ----------------------------------------------------------------------------
//  updateCondition(id, condition) — Đổi tình trạng tại chỗ 1 dòng (doc 06 §3.A).
//   Chỉ cập nhật trường condition + date (KHÔNG gộp dòng — giữ inline mượt).
// ----------------------------------------------------------------------------
export async function updateCondition(id, condition) {
  const list = await load(STORE.EQUIPMENT, []);
  const rec = getById(list, id);
  if (!rec) throw new Error('Không tìm thấy dòng thiết bị.');
  rec.condition = normCond(condition);
  rec.date = today();
  markUpdated(rec);
  await save(STORE.EQUIPMENT, list);
  return rec;
}

// ----------------------------------------------------------------------------
//  deleteEquipment(id) — XÓA MỀM 1 dòng. CHỈ cho phép ở Kho Tổng (doc 06 §3.B):
//   thiết bị tại CT chỉ rời đi bằng luân chuyển. Trả true nếu xóa được.
// ----------------------------------------------------------------------------
export async function deleteEquipment(id) {
  const list = await load(STORE.EQUIPMENT, []);
  const rec = getById(list, id);
  if (!rec) return false;
  if (rec.projectId !== WAREHOUSE_ID) {
    throw new Error('Chỉ được xóa thiết bị ở Kho Tổng. Tại công trình hãy dùng Luân chuyển.');
  }
  softDelete(rec);
  await save(STORE.EQUIPMENT, list);
  return true;
}

// ----------------------------------------------------------------------------
//  transferEquipment(id, { toProjectId, qty, condition, note }) — Luân chuyển X
//  cái từ dòng nguồn sang vị trí đích (doc 06 §4). Không có DB transaction thật →
//  soft-delete bản gốc rồi tạo/cộng dồn: đích (X cái) + phần còn lại tại nguồn.
//   - Ràng buộc: 1 ≤ qty ≤ số lượng hiện tại; đích ≠ vị trí nguồn.
//   - condition/note áp cho LÔ CHUYỂN ĐI; phần còn lại giữ tình trạng gốc.
// ----------------------------------------------------------------------------
export async function transferEquipment(id, { toProjectId, qty, condition, note } = {}) {
  await loadProjects();
  const list = await load(STORE.EQUIPMENT, []);
  const src = getById(list, id);
  if (!src || src.deletedAt) throw new Error('Không tìm thấy dòng thiết bị nguồn.');

  const moveQty = num(qty);
  const have = num(src.quantity);
  if (moveQty < 1) throw new Error('Số lượng chuyển phải ≥ 1.');
  if (moveQty > have) throw new Error(`Chỉ còn ${have} cái — không thể chuyển ${moveQty}.`);
  if (!toProjectId) throw new Error('Chưa chọn vị trí đích.');
  if (toProjectId === src.projectId) throw new Error('Vị trí đích phải khác vị trí nguồn.');
  if (!getProjectById(toProjectId)) throw new Error('Vị trí đích không tồn tại.');
  if (isProjectLocked(toProjectId)) throw new Error('🔒 Công trình đích đã quyết toán.');

  const srcProjectId = src.projectId;
  const name = src.name;
  const srcCond = src.condition;
  const remaining = have - moveQty;

  // 1) Xóa mềm bản gốc (giữ vết cho sync LWW + tombstone).
  softDelete(src);
  // 2) Cộng dồn lô chuyển sang đích (cho đổi tình trạng + ghi chú).
  mergeInto(list, {
    projectId: toProjectId, name, condition: condition || srcCond,
    quantity: moveQty, note, date: today(),
  });
  // 3) Phần còn lại giữ tại nguồn (tình trạng gốc).
  if (remaining > 0) {
    mergeInto(list, {
      projectId: srcProjectId, name, condition: srcCond,
      quantity: remaining, note: src.note, date: today(),
    });
  }

  await save(STORE.EQUIPMENT, list);
  return true;
}

// ----------------------------------------------------------------------------
//  sumEquipmentByProject() — Gom tồn kho theo công trình (BỎ Kho Tổng) cho bảng
//  Thống Kê (doc 06 §3.C): mỗi CT → tổng số lượng + số LOẠI thiết bị (tên khác nhau).
//  Trả về [{ projectId, totalQty, typeCount }].
// ----------------------------------------------------------------------------
export async function sumEquipmentByProject() {
  const list = activeOnly(await load(STORE.EQUIPMENT, []))
    .filter((r) => r.projectId !== WAREHOUSE_ID);

  const byProj = new Map();
  for (const r of list) {
    if (!byProj.has(r.projectId)) byProj.set(r.projectId, { projectId: r.projectId, totalQty: 0, names: new Set() });
    const g = byProj.get(r.projectId);
    g.totalQty += num(r.quantity);
    if (r.name) g.names.add(normalizeVietnamese(r.name));
  }
  return [...byProj.values()].map((g) => ({
    projectId: g.projectId, totalQty: g.totalQty, typeCount: g.names.size,
  }));
}
