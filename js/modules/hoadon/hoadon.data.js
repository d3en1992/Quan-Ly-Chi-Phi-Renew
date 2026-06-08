// ============================================================================
//  modules/hoadon/hoadon.data.js  —  TẦNG DỮ LIỆU (Layer 5): Hóa đơn / Chi phí
// ----------------------------------------------------------------------------
//  @module hoadon.data
//
//  Tầng LÕI dữ liệu cho tab Nhập Chi Phí (doc 02). Chỉ lo đọc/ghi/xóa-mềm hóa đơn
//  + các tiện ích dùng chung cho 2 form nhập (nhanh / chi tiết) ở các prompt sau:
//    - applyDiscount   : tính chiết khấu linh hoạt (% hoặc tiền) — dùng cả 2 cấp.
//    - buildNoteFromItems : tự ghép Nội dung từ tên các mặt hàng.
//    - stringSimilarity / findDuplicates : dò trùng hóa đơn (hệ số Dice).
//    - getInvoices / saveInvoice / deleteInvoice : CRUD + xóa mềm.
//
//  QUY ƯỚC VÀNG (doc 02): hóa đơn CHỈ liên kết công trình qua `projectId` (KHÔNG
//  lưu tên CT). Chi phí lương KHÔNG nằm ở đây (suy ra từ chấm công). Mọi sửa đổi
//  đi qua 6 trường hệ thống (id/createdAt/updatedAt/deletedAt/deviceId + projectId).
// ============================================================================

import { STORE } from '../../core/db.js';
import { load, save, createRecord, markUpdated, softDelete, restore, activeOnly, deletedOnly, getById } from '../../core/store.js';
import { parseMoney } from '../../utils/fmt.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';
import { getSelectedYear } from '../../topbar.js';
import { loadProjects, getProjectById, isProjectLocked } from '../projects/projects.data.js';

// num(x) — Ép về số an toàn (chuỗi rỗng/không hợp lệ → 0).
const num = (x) => Number(x) || 0;

// ----------------------------------------------------------------------------
//  applyDiscount(base, discount) — Chiết khấu linh hoạt (doc 02 §4).
//   discount: '' (không) | '5%' (theo phần trăm) | '50000' (trừ thẳng số tiền).
//   Trả về số tiền sau chiết khấu (đã làm tròn về đồng).
// ----------------------------------------------------------------------------
export function applyDiscount(base, discount) {
  const b = num(base);
  const d = String(discount ?? '').trim();
  if (!d) return Math.round(b);
  if (d.endsWith('%')) return Math.round(b * (1 - (parseFloat(d) || 0) / 100));
  return Math.round(b - parseMoney(d));
}

// ----------------------------------------------------------------------------
//  buildNoteFromItems(items) — Ghép tên các mặt hàng thành Nội dung hóa đơn.
//   vd [{name:'Gạch đinh'},{name:'Xi măng'}] → 'Gạch đinh, Xi măng'.
// ----------------------------------------------------------------------------
export function buildNoteFromItems(items) {
  return (items || [])
    .map((it) => String(it && it.name ? it.name : '').trim())
    .filter(Boolean)
    .join(', ');
}

// ----------------------------------------------------------------------------
//  stringSimilarity(a, b) — Hệ số tương đồng Dice trên cặp ký tự (bigram).
//   Trả 0..1. Dùng để dò trùng nội dung hóa đơn. So sánh KHÔNG dấu, thường hóa.
//   Quy ước: hai chuỗi đều rỗng → 1 (coi như giống). Chuỗi <2 ký tự → so bằng tuyệt đối.
// ----------------------------------------------------------------------------
export function stringSimilarity(a, b) {
  const A = normalizeVietnamese(a || '');
  const B = normalizeVietnamese(b || '');
  if (!A && !B) return 1;
  if (A === B) return 1;
  if (A.length < 2 || B.length < 2) return 0;

  // Đếm bội số bigram của A, rồi "tiêu thụ" dần khi gặp ở B (multiset intersection).
  const counts = new Map();
  for (let i = 0; i < A.length - 1; i++) {
    const g = A.slice(i, i + 2);
    counts.set(g, (counts.get(g) || 0) + 1);
  }
  let matches = 0;
  for (let i = 0; i < B.length - 1; i++) {
    const g = B.slice(i, i + 2);
    const c = counts.get(g) || 0;
    if (c > 0) { counts.set(g, c - 1); matches++; }
  }
  return (2 * matches) / ((A.length - 1) + (B.length - 1));
}

// ----------------------------------------------------------------------------
//  findDuplicates(newRow, invoices) — Tìm hóa đơn nghi trùng với 1 DÒNG MỚI (doc 02 §5).
//   Ứng viên = cùng date + cùng projectId + cùng amount. So nội dung bằng Dice:
//     ≥0.99 → 'exact' (trùng hoàn toàn) · ≥0.70 → 'similar' (giống N%).
//   Trả mảng { invoice, score, label, percent }. Chỉ xét hóa đơn còn dùng.
// ----------------------------------------------------------------------------
export function findDuplicates(newRow, invoices) {
  const out = [];
  const date = newRow.date;
  const pid = newRow.projectId;
  const amount = num(newRow.amount);

  for (const inv of activeOnly(invoices)) {
    if (inv.id === newRow.id) continue;                 // bỏ qua chính nó (khi sửa)
    if (inv.date !== date || inv.projectId !== pid || num(inv.amount) !== amount) continue;

    const score = stringSimilarity(newRow.note, inv.note);
    if (score >= 0.99) out.push({ invoice: inv, score, label: 'exact', percent: 100 });
    else if (score >= 0.70) out.push({ invoice: inv, score, label: 'similar', percent: Math.round(score * 100) });
  }
  return out;
}

// ----------------------------------------------------------------------------
//  getInvoices({ year, projectId, date }) — Đọc hóa đơn còn dùng + lọc tùy chọn.
//   - year: lọc theo năm của `date` (year=0 → mọi năm). Mặc định = năm đang chọn.
//   - projectId: chỉ hóa đơn của 1 công trình.
//   - date: chỉ hóa đơn đúng 1 ngày (YYYY-MM-DD) — dùng cho "bảng trong ngày".
//  Trả mảng đã sắp xếp mới nhất trước (theo date giảm dần, rồi createdAt).
// ----------------------------------------------------------------------------
export async function getInvoices({ year = getSelectedYear(), projectId, date } = {}) {
  let list = activeOnly(await load(STORE.INVOICES, []));

  if (date) list = list.filter((r) => r.date === date);
  else if (year) list = list.filter((r) => String(r.date || '').startsWith(String(year)));

  if (projectId) list = list.filter((r) => r.projectId === projectId);

  return list.sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') || num(b.createdAt) - num(a.createdAt));
}

// ----------------------------------------------------------------------------
//  validateInvoice(rec) — Kiểm tra ràng buộc bắt buộc (doc 02 §7). Ném Error có
//  thông điệp tiếng Việt nếu sai (caller bắt → toast). Trả về projectId hợp lệ.
// ----------------------------------------------------------------------------
function validateInvoice(rec) {
  if (!rec.date) throw new Error('Thiếu Ngày hóa đơn.');
  if (!rec.category || !String(rec.category).trim()) throw new Error('Thiếu Loại chi phí.');
  if (!rec.projectId) throw new Error('Thiếu Công trình.');

  const proj = getProjectById(rec.projectId);
  if (!proj) throw new Error('Công trình không tồn tại (projectId sai).');
  if (isProjectLocked(rec.projectId)) {
    throw new Error(`🔒 Công trình "${proj.name}" đã quyết toán — không thể thêm/sửa hóa đơn.`);
  }
}

// ----------------------------------------------------------------------------
//  saveInvoice(record) — Tạo MỚI (chưa có id) hoặc CẬP NHẬT (đã có id) 1 hóa đơn.
//   - Chuẩn hóa: amount→số, source mặc định 'quick', items chỉ giữ khi source==='detail'.
//   - Validate bắt buộc + chặn CT đã quyết toán.
//   - Ghi đè cả mảng invoices xuống IndexedDB (kéo theo lên lịch đẩy đồng bộ).
//  Trả về bản ghi đã lưu.
// ----------------------------------------------------------------------------
export async function saveInvoice(record) {
  await loadProjects();           // đảm bảo cache công trình sẵn sàng cho validate
  validateInvoice(record);

  const list = await load(STORE.INVOICES, []);
  const source = record.source === 'detail' ? 'detail' : 'quick';

  // Phần nghiệp vụ đã chuẩn hóa (chung cho tạo mới & cập nhật).
  const fields = {
    date: record.date,
    projectId: record.projectId,
    category: String(record.category).trim(),
    amount: parseMoney(record.amount),   // chấp nhận cả số lẫn chuỗi "500.000"
    note: String(record.note || '').trim(),
    performer: String(record.performer || '').trim(),
    supplier: String(record.supplier || '').trim(),
    source,
  };
  if (source === 'detail') {
    fields.items = Array.isArray(record.items) ? record.items : [];
    fields.totalDiscount = record.totalDiscount || '';
  }

  let saved;
  const existing = record.id ? getById(list, record.id) : null;
  if (existing) {
    Object.assign(existing, fields);   // giữ id/createdAt cũ
    markUpdated(existing);             // cập nhật mốc LWW
    saved = existing;
  } else {
    saved = createRecord(fields);      // gắn 6 trường hệ thống
    list.push(saved);
  }

  await save(STORE.INVOICES, list);
  return saved;
}

// ----------------------------------------------------------------------------
//  deleteInvoice(id) — XÓA MỀM 1 hóa đơn (đặt deletedAt, giữ lại để khôi phục/đồng bộ).
//   Trả true nếu xóa được, false nếu không tìm thấy.
// ----------------------------------------------------------------------------
export async function deleteInvoice(id) {
  const list = await load(STORE.INVOICES, []);
  const rec = getById(list, id);
  if (!rec) return false;
  softDelete(rec);
  await save(STORE.INVOICES, list);
  return true;
}

// ----------------------------------------------------------------------------
//  getTrashedInvoices() — Đọc các hóa đơn ĐÃ XÓA MỀM (deletedAt != null) cho Thùng rác.
//   Trả mảng sắp xếp theo lúc xóa mới nhất trước. (Không lọc năm — thùng rác xem hết.)
// ----------------------------------------------------------------------------
export async function getTrashedInvoices() {
  const list = deletedOnly(await load(STORE.INVOICES, []));
  return list.sort((a, b) => num(b.deletedAt) - num(a.deletedAt));
}

// ----------------------------------------------------------------------------
//  restoreInvoice(id) — KHÔI PHỤC 1 hóa đơn từ thùng rác (xóa cờ deletedAt).
//   Trả true nếu khôi phục được, false nếu không tìm thấy.
// ----------------------------------------------------------------------------
export async function restoreInvoice(id) {
  const list = await load(STORE.INVOICES, []);
  const rec = getById(list, id);
  if (!rec) return false;
  restore(rec);
  await save(STORE.INVOICES, list);
  return true;
}
