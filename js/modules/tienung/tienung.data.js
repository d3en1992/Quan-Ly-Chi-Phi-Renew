// ============================================================================
//  modules/tienung/tienung.data.js  —  TẦNG DỮ LIỆU (Layer 5): Tiền ứng
// ----------------------------------------------------------------------------
//  @module tienung.data
//
//  Tầng LÕI dữ liệu cho tab Tiền Ứng (doc 05). Theo dõi các khoản TẠM ỨNG cho
//  THẦU PHỤ (type='subcontractor') và NHÀ CUNG CẤP (type='supplier') theo từng
//  công trình. Là dữ liệu đầu vào cộng dồn cho Tab Công Trình (tổng chi → redValue)
//  và Tab Doanh Thu (công nợ theo đối tác).
//
//  QUY ƯỚC VÀNG (doc 05 §1): liên kết công trình CHỈ qua `projectId` (KHÔNG lưu
//  tên CT). Tên đối tác so khớp danh mục (categories.subcontractor / .supplier).
//  Xóa = soft-delete (deletedAt). Mọi bản ghi đi qua 6 trường hệ thống.
//
//  SCHEMA bản ghi (STORE.advances):
//    { id, date, type, partner, projectId, amount, note,
//      createdAt, updatedAt, deletedAt, deviceId }
// ============================================================================

import { STORE } from '../../core/db.js';
import { load, save, createRecord, markUpdated, softDelete, activeOnly, getById } from '../../core/store.js';
import { parseMoney } from '../../utils/fmt.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';
import { getSelectedYear } from '../../topbar.js';
import { loadProjects, getProjectById, isProjectLocked } from '../projects/projects.data.js';

// num(x) — Ép về số an toàn (chuỗi rỗng/không hợp lệ → 0).
const num = (x) => Number(x) || 0;

// 2 loại đối tác hợp lệ → nhóm danh mục tương ứng (doc 05 §1).
export const ADVANCE_TYPES = Object.freeze({
  subcontractor: { label: 'Thầu phụ',      catGroup: 'subcontractor' },
  supplier:      { label: 'Nhà cung cấp',  catGroup: 'supplier' },
});
export const ADVANCE_TYPE_KEYS = Object.keys(ADVANCE_TYPES);

// normType(t) — Chuẩn hóa về 1 trong 2 key hợp lệ (mặc định 'subcontractor').
function normType(t) {
  return t === 'supplier' ? 'supplier' : 'subcontractor';
}

// ----------------------------------------------------------------------------
//  getAdvances({ year, type, projectId }) — Đọc tiền ứng còn dùng + lọc tùy chọn.
//   - year: lọc theo năm của `date` (year=0 → mọi năm). Mặc định = năm đang chọn.
//   - type: 'subcontractor' | 'supplier' (bỏ trống → cả hai).
//   - projectId: chỉ ứng của 1 công trình.
//  Trả mảng sắp xếp mới nhất trước (date giảm dần, rồi createdAt).
// ----------------------------------------------------------------------------
export async function getAdvances({ year = getSelectedYear(), type, projectId } = {}) {
  let list = activeOnly(await load(STORE.ADVANCES, []));

  if (year) list = list.filter((r) => String(r.date || '').startsWith(String(year)));
  if (type) list = list.filter((r) => r.type === type);
  if (projectId) list = list.filter((r) => r.projectId === projectId);

  return list.sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') || num(b.createdAt) - num(a.createdAt));
}

// ----------------------------------------------------------------------------
//  validateAdvance(rec) — Kiểm tra ràng buộc bắt buộc (doc 05 §2). Ném Error có
//  thông điệp tiếng Việt nếu sai (caller bắt → toast).
// ----------------------------------------------------------------------------
function validateAdvance(rec) {
  if (!rec.date) throw new Error('Thiếu Ngày ứng.');
  if (!rec.partner || !String(rec.partner).trim()) throw new Error('Thiếu tên Đối tác.');
  if (!rec.projectId) throw new Error('Thiếu Công trình.');

  const proj = getProjectById(rec.projectId);
  if (!proj) throw new Error('Công trình không tồn tại (projectId sai).');
  if (isProjectLocked(rec.projectId)) {
    throw new Error(`🔒 Công trình "${proj.name}" đã quyết toán — không thể thêm/sửa tiền ứng.`);
  }
}

// cleanFields(row) — Chuẩn hóa phần nghiệp vụ 1 dòng (dùng chung tạo mới & cập nhật).
function cleanFields(row) {
  return {
    date:      row.date,
    type:      normType(row.type),
    partner:   String(row.partner || '').trim(),
    projectId: row.projectId,
    amount:    parseMoney(row.amount),   // chấp nhận cả số lẫn chuỗi "500.000"
    note:      String(row.note || '').trim(),
  };
}

// ----------------------------------------------------------------------------
//  saveAdvances(rows) — Tạo MỚI hàng loạt nhiều khoản ứng cùng lúc (doc 05 §2).
//   Mỗi dòng = 1 bản ghi. Validate từng dòng; dòng lỗi gom vào `errors` (KHÔNG
//   chặn các dòng hợp lệ khác). Ghi đè cả mảng advances 1 lần → lên lịch đẩy đồng bộ.
//  Trả về { ok: số dòng đã lưu, errors: [thông điệp...] , saved: [bản ghi...] }.
// ----------------------------------------------------------------------------
export async function saveAdvances(rows) {
  await loadProjects();                 // đảm bảo cache công trình sẵn sàng cho validate
  const list = await load(STORE.ADVANCES, []);
  const saved = [];
  const errors = [];

  for (const row of rows || []) {
    const fields = cleanFields(row);
    try {
      validateAdvance(fields);
      const rec = createRecord(fields); // gắn 6 trường hệ thống
      list.push(rec);
      saved.push(rec);
    } catch (e) {
      errors.push(e.message);
    }
  }

  if (saved.length) await save(STORE.ADVANCES, list);
  return { ok: saved.length, errors, saved };
}

// ----------------------------------------------------------------------------
//  updateAdvance(id, data) — CẬP NHẬT 1 khoản ứng đã có (giữ id/createdAt).
//   Trả về bản ghi đã sửa. Không tìm thấy hoặc vi phạm ràng buộc → throw.
// ----------------------------------------------------------------------------
export async function updateAdvance(id, data) {
  await loadProjects();
  const list = await load(STORE.ADVANCES, []);
  const rec = getById(list, id);
  if (!rec) throw new Error('Không tìm thấy khoản ứng để cập nhật.');

  const fields = cleanFields(data);
  validateAdvance(fields);
  Object.assign(rec, fields);           // giữ id/createdAt cũ
  markUpdated(rec);                     // cập nhật mốc LWW
  await save(STORE.ADVANCES, list);
  return rec;
}

// ----------------------------------------------------------------------------
//  deleteAdvance(id) — XÓA MỀM 1 khoản ứng (đặt deletedAt, giữ lại để đồng bộ).
//   Trả true nếu xóa được, false nếu không tìm thấy.
// ----------------------------------------------------------------------------
export async function deleteAdvance(id) {
  const list = await load(STORE.ADVANCES, []);
  const rec = getById(list, id);
  if (!rec) return false;
  softDelete(rec);
  await save(STORE.ADVANCES, list);
  return true;
}

// ----------------------------------------------------------------------------
//  CỘNG DỒN (cross-tab) — đọc thẳng từ DB, dùng cho Tab Công Trình & Doanh Thu.
// ----------------------------------------------------------------------------

// sumAdvancesByProject(projectId, type) — Tổng tiền ứng của 1 CT (lọc loại nếu có).
//  Dùng cho Tab 01: subcontractorAdvance / supplierAdvance riêng → redValue.
export async function sumAdvancesByProject(projectId, type) {
  const list = activeOnly(await load(STORE.ADVANCES, []));
  return list.reduce((s, r) => {
    if (r.projectId !== projectId) return s;
    if (type && r.type !== type) return s;
    return s + num(r.amount);
  }, 0);
}

// sumAdvancesByPartner(partner) — Tổng tiền ứng với 1 đối tác (gộp mọi CT).
//  So tên KHÔNG dấu. Dùng cho Tab 08 (công nợ đối tác).
export async function sumAdvancesByPartner(partner) {
  const key = normalizeVietnamese(partner);
  const list = activeOnly(await load(STORE.ADVANCES, []));
  return list.reduce((s, r) =>
    (normalizeVietnamese(r.partner) === key ? s + num(r.amount) : s), 0);
}
