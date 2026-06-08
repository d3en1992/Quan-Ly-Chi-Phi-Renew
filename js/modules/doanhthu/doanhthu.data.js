// ============================================================================
//  modules/doanhthu/doanhthu.data.js  —  TẦNG DỮ LIỆU (Layer 5): Doanh thu
// ----------------------------------------------------------------------------
//  @module doanhthu.data
//
//  Tầng LÕI dữ liệu cho tab Doanh Thu (doc 08) — quản lý DÒNG TIỀN VÀO của công ty
//  qua 3 thực thể riêng, đều liên kết công trình CHỈ qua `projectId`:
//    • HĐ Chính   (STORE.contracts)    — 1 CÔNG TRÌNH = 1 HỢP ĐỒNG → lưu dạng
//      ĐỐI TƯỢNG map { [projectId]: record } (khóa = projectId, lưu lần 2 = ghi đè).
//    • Thu Tiền   (STORE.receipts)     — N đợt thu / CT (mảng), có loại khoản thu.
//    • HĐ Thầu Phụ(STORE.subcontracts) — N hợp đồng khoán ngoài / CT (mảng), có
//      bảng khối lượng items[]; có items → value = Σ(SL×đơn giá), không thì nhập tay.
//
//  Chủ Đầu Tư KHÔNG lưu ở đây — UI đọc realtime từ project.investor (1 nguồn sự thật).
//  KPI (Tổng HĐ / Đã thu / Còn phải thu) là DERIVED — calcKpi() tính lại mỗi render.
//  Xóa = soft-delete (deletedAt). Mọi bản ghi mang 6 trường hệ thống.
//
//  GHI CHÚ phạm vi: hàm công nợ chéo-tab (calcDebtSubcontractor/Supplier, doc §4)
//  để DÀNH cho sub-tab Công Nợ (`doanhthu.debt.js`) — gom từ subcontracts + tiền
//  ứng (Tab 05) + hóa đơn NCC (Tab 02); KHÔNG nằm trong file LÕI CRUD này.
// ============================================================================

import { STORE } from '../../core/db.js';
import { load, save, createRecord, markUpdated, softDelete, restore, activeOnly, getById } from '../../core/store.js';
import { parseMoney } from '../../utils/fmt.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';
import { getSelectedYear } from '../../topbar.js';
import { loadProjects, getProjectById, isProjectLocked } from '../projects/projects.data.js';
import { getAdvances } from '../tienung/tienung.data.js';
import { getInvoices } from '../hoadon/hoadon.data.js';

// num(x) — Ép về số an toàn (chuỗi rỗng/không hợp lệ → 0). Giữ được số thập phân.
const num = (x) => Number(x) || 0;

// 3 loại khoản thu (doc 08 §1) → nhãn + màu badge cho UI vẽ tỷ trọng.
export const PAYMENT_TYPES = Object.freeze({
  advance:    { label: 'Tạm ứng',    style: 'warning' },
  phase:      { label: 'Giai đoạn',  style: 'info'    },
  settlement: { label: 'Quyết toán', style: 'success' },
});
export const PAYMENT_TYPE_KEYS = Object.keys(PAYMENT_TYPES);

// normPaymentType(t) — Chuẩn hóa về 1 mã hợp lệ (mặc định 'phase').
function normPaymentType(t) {
  return PAYMENT_TYPE_KEYS.includes(t) ? t : 'phase';
}

// inYear(date, year) — Bản ghi thuộc năm lọc? (year=0 → mọi năm).
function inYear(date, year) {
  return !year || String(date || '').startsWith(String(year));
}

// ----------------------------------------------------------------------------
//  VALIDATE CHUNG — liên kết công trình bắt buộc + chặn công trình đã quyết toán.
// ----------------------------------------------------------------------------
function assertProjectUsable(projectId) {
  if (!projectId) throw new Error('Thiếu Công trình.');
  const proj = getProjectById(projectId);
  if (!proj) throw new Error('Công trình không tồn tại (projectId sai).');
  if (isProjectLocked(projectId)) {
    throw new Error(`🔒 Công trình "${proj.name}" đã quyết toán — không thể khai báo/thu mới.`);
  }
}

// ============================================================================
//  A. HỢP ĐỒNG CHÍNH (STORE.contracts) — map { [projectId]: record }, 1 CT = 1 HĐ.
// ============================================================================

// cleanContract(data) — Chuẩn hóa phần nghiệp vụ 1 hợp đồng chính.
function cleanContract(data) {
  return {
    value:      parseMoney(data.value),       // giá trị HĐ chính
    addonValue: parseMoney(data.addonValue),  // giá trị HĐ phụ / bổ sung
    extraValue: parseMoney(data.extraValue),  // phát sinh
    performer:  String(data.performer || '').trim(),
    note:       String(data.note || '').trim(),
    date:       data.date || '',
  };
}

// contractTotal(c) — Tổng giá trị 1 HĐ = chính + phụ + phát sinh.
export const contractTotal = (c) => c ? num(c.value) + num(c.addonValue) + num(c.extraValue) : 0;

// ----------------------------------------------------------------------------
//  getContract(projectId) — Đọc HĐ chính CÒN dùng của 1 CT (chưa có → null).
// ----------------------------------------------------------------------------
export async function getContract(projectId) {
  const map = await load(STORE.CONTRACTS, {});
  const rec = map[projectId];
  return rec && !rec.deletedAt ? rec : null;
}

// getAllContracts() — Mảng mọi HĐ chính CÒN dùng (cho KPI + bảng thống kê).
export async function getAllContracts() {
  const map = await load(STORE.CONTRACTS, {});
  return Object.values(map).filter((r) => !r.deletedAt);
}

// ----------------------------------------------------------------------------
//  saveContract(projectId, data) — Tạo HOẶC ghi đè HĐ chính theo projectId.
//   Khóa = projectId nên lưu lần 2 cho cùng CT = SỬA (giữ id/createdAt), không tạo
//   bản trùng. Nếu HĐ từng bị xóa mềm → tự khôi phục. Trả về bản ghi đã lưu.
// ----------------------------------------------------------------------------
export async function saveContract(projectId, data) {
  await loadProjects();
  if (!data.date) throw new Error('Thiếu Ngày ký hợp đồng.');
  assertProjectUsable(projectId);

  const map = await load(STORE.CONTRACTS, {});
  const fields = cleanContract(data);
  let rec = map[projectId];
  if (rec) {
    Object.assign(rec, fields);     // giữ id/createdAt cũ
    if (rec.deletedAt) restore(rec);  // hồi sinh nếu trước đó đã xóa mềm
    else markUpdated(rec);
  } else {
    rec = createRecord({ projectId, ...fields });
    map[projectId] = rec;
  }
  await save(STORE.CONTRACTS, map);
  return rec;
}

// ----------------------------------------------------------------------------
//  deleteContract(projectId) — XÓA MỀM HĐ chính của 1 CT. Trả true nếu xóa được.
// ----------------------------------------------------------------------------
export async function deleteContract(projectId) {
  const map = await load(STORE.CONTRACTS, {});
  const rec = map[projectId];
  if (!rec || rec.deletedAt) return false;
  softDelete(rec);
  await save(STORE.CONTRACTS, map);
  return true;
}

// ============================================================================
//  B. THU TIỀN (STORE.receipts) — mảng, N đợt thu / CT.
// ============================================================================

// cleanReceipt(data) — Chuẩn hóa phần nghiệp vụ 1 đợt thu tiền.
function cleanReceipt(data) {
  return {
    projectId:   data.projectId,
    amount:      parseMoney(data.amount),
    paymentType: normPaymentType(data.paymentType),
    performer:   String(data.performer || '').trim(),
    note:        String(data.note || '').trim(),
    date:        data.date || '',
  };
}

// validateReceipt(rec) — Ràng buộc bắt buộc của 1 đợt thu.
function validateReceipt(rec) {
  if (!rec.date) throw new Error('Thiếu Ngày thu.');
  if (!(num(rec.amount) > 0)) throw new Error('Số tiền thu phải lớn hơn 0.');
  assertProjectUsable(rec.projectId);
}

// ----------------------------------------------------------------------------
//  getReceipts({ year, projectId }) — Đọc đợt thu CÒN dùng + lọc tùy chọn.
//   Sắp xếp mới nhất trước (date giảm dần, rồi createdAt).
// ----------------------------------------------------------------------------
export async function getReceipts({ year = getSelectedYear(), projectId } = {}) {
  let list = activeOnly(await load(STORE.RECEIPTS, []));
  if (year) list = list.filter((r) => inYear(r.date, year));
  if (projectId) list = list.filter((r) => r.projectId === projectId);
  return list.sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') || num(b.createdAt) - num(a.createdAt));
}

// saveReceipt(data) — Tạo MỚI 1 đợt thu. Trả về bản ghi đã lưu.
export async function saveReceipt(data) {
  await loadProjects();
  const fields = cleanReceipt(data);
  validateReceipt(fields);
  const list = await load(STORE.RECEIPTS, []);
  const rec = createRecord(fields);
  list.push(rec);
  await save(STORE.RECEIPTS, list);
  return rec;
}

// updateReceipt(id, data) — CẬP NHẬT 1 đợt thu (giữ id/createdAt).
export async function updateReceipt(id, data) {
  await loadProjects();
  const list = await load(STORE.RECEIPTS, []);
  const rec = getById(list, id);
  if (!rec) throw new Error('Không tìm thấy đợt thu để cập nhật.');
  const fields = cleanReceipt(data);
  validateReceipt(fields);
  Object.assign(rec, fields);
  markUpdated(rec);
  await save(STORE.RECEIPTS, list);
  return rec;
}

// deleteReceipt(id) — XÓA MỀM 1 đợt thu. Trả true nếu xóa được.
export async function deleteReceipt(id) {
  const list = await load(STORE.RECEIPTS, []);
  const rec = getById(list, id);
  if (!rec) return false;
  softDelete(rec);
  await save(STORE.RECEIPTS, list);
  return true;
}

// ============================================================================
//  C. HỢP ĐỒNG THẦU PHỤ (STORE.subcontracts) — mảng, có bảng khối lượng items[].
// ============================================================================

// cleanItem(it) — 1 dòng khối lượng: tên/ĐVT + SL × đơn giá.
function cleanItem(it) {
  return {
    name:      String(it.name || '').trim(),
    unit:      String(it.unit || '').trim(),
    quantity:  num(it.quantity),
    unitPrice: parseMoney(it.unitPrice),
  };
}

// itemsTotal(items) — Tổng chi tiết = Σ(SL × đơn giá) các dòng có tên.
function itemsTotal(items) {
  return (items || []).reduce((s, it) => s + num(it.quantity) * parseMoney(it.unitPrice), 0);
}

// cleanSubcontract(data) — Chuẩn hóa 1 HĐ thầu phụ. Có items → value tự tính
// (khóa = tổng chi tiết, chống lệch); không items → value nhập tay.
function cleanSubcontract(data) {
  const items = (data.items || []).map(cleanItem).filter((it) => it.name);
  const value = items.length ? itemsTotal(items) : parseMoney(data.value);
  return {
    projectId: data.projectId,
    partner:   String(data.partner || '').trim(),
    value,
    items,
    note:      String(data.note || '').trim(),
    date:      data.date || '',
  };
}

// validateSubcontract(rec) — Ràng buộc bắt buộc của 1 HĐ thầu phụ.
function validateSubcontract(rec) {
  if (!rec.date) throw new Error('Thiếu Ngày hợp đồng thầu phụ.');
  if (!rec.partner) throw new Error('Thiếu tên Thầu phụ.');
  assertProjectUsable(rec.projectId);
}

// ----------------------------------------------------------------------------
//  getSubcontracts({ year, projectId }) — Đọc HĐ thầu phụ CÒN dùng + lọc tùy chọn.
// ----------------------------------------------------------------------------
export async function getSubcontracts({ year = getSelectedYear(), projectId } = {}) {
  let list = activeOnly(await load(STORE.SUBCONTRACTS, []));
  if (year) list = list.filter((r) => inYear(r.date, year));
  if (projectId) list = list.filter((r) => r.projectId === projectId);
  return list.sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') || num(b.createdAt) - num(a.createdAt));
}

// saveSubcontract(data) — Tạo MỚI 1 HĐ thầu phụ. Trả về bản ghi đã lưu.
export async function saveSubcontract(data) {
  await loadProjects();
  const fields = cleanSubcontract(data);
  validateSubcontract(fields);
  const list = await load(STORE.SUBCONTRACTS, []);
  const rec = createRecord(fields);
  list.push(rec);
  await save(STORE.SUBCONTRACTS, list);
  return rec;
}

// updateSubcontract(id, data) — CẬP NHẬT 1 HĐ thầu phụ (giữ id/createdAt).
export async function updateSubcontract(id, data) {
  await loadProjects();
  const list = await load(STORE.SUBCONTRACTS, []);
  const rec = getById(list, id);
  if (!rec) throw new Error('Không tìm thấy hợp đồng thầu phụ để cập nhật.');
  const fields = cleanSubcontract(data);
  validateSubcontract(fields);
  Object.assign(rec, fields);
  markUpdated(rec);
  await save(STORE.SUBCONTRACTS, list);
  return rec;
}

// deleteSubcontract(id) — XÓA MỀM 1 HĐ thầu phụ. Trả true nếu xóa được.
export async function deleteSubcontract(id) {
  const list = await load(STORE.SUBCONTRACTS, []);
  const rec = getById(list, id);
  if (!rec) return false;
  softDelete(rec);
  await save(STORE.SUBCONTRACTS, list);
  return true;
}

// ============================================================================
//  D. KPI & CỘNG DỒN (derived) — tính lại mỗi render, không lưu store riêng.
// ============================================================================

// ----------------------------------------------------------------------------
//  calcKpi({ year, projectId }) — 3 số KPI derived của tab (doc 08 §5):
//    tongHD     = Σ contracts(value + addonValue + extraValue)
//    daThu      = Σ receipts.amount
//    conPhaiThu = tongHD − daThu
//  Lọc theo năm (trên `date` của từng bản ghi) + công trình (tùy chọn).
// ----------------------------------------------------------------------------
export async function calcKpi({ year = getSelectedYear(), projectId } = {}) {
  const contracts = (await getAllContracts())
    .filter((c) => inYear(c.date, year) && (!projectId || c.projectId === projectId));
  const receipts = activeOnly(await load(STORE.RECEIPTS, []))
    .filter((r) => inYear(r.date, year) && (!projectId || r.projectId === projectId));

  const tongHD = contracts.reduce((s, c) => s + contractTotal(c), 0);
  const daThu  = receipts.reduce((s, r) => s + num(r.amount), 0);
  return { tongHD, daThu, conPhaiThu: tongHD - daThu };
}

// ----------------------------------------------------------------------------
//  sumReceiptsByProject(projectId) — Tổng đã thu của 1 CT (mọi năm). Cấp số "đã
//  thu" cho Tab Công Trình (Tab 01) tính lãi.
// ----------------------------------------------------------------------------
export async function sumReceiptsByProject(projectId) {
  const list = activeOnly(await load(STORE.RECEIPTS, []));
  return list.reduce((s, r) => (r.projectId === projectId ? s + num(r.amount) : s), 0);
}

// sumSubcontractsByProject(projectId) — Tổng giá trị HĐ thầu phụ (khoán ngoài) của
// 1 CT — chi phí COGS, dùng cho báo cáo & công nợ thầu phụ.
export async function sumSubcontractsByProject(projectId) {
  const list = activeOnly(await load(STORE.SUBCONTRACTS, []));
  return list.reduce((s, r) => (r.projectId === projectId ? s + num(r.value) : s), 0);
}

// ============================================================================
//  E. CÔNG NỢ ĐỐI TÁC (derived, chéo-tab) — doc 08 §4. Gom theo (CT + đối tác).
//     Lấy ALL-TIME (year:0): công nợ là SỐ DƯ luỹ kế, KHÔNG cắt theo năm chọn.
//     Nguồn: HĐ thầu phụ (file này) + tiền ứng (Tab 05) + hóa đơn NCC (Tab 02).
// ============================================================================

// pkey(pid, name) — Khóa gom 1 đối tác trong 1 CT (tên so KHÔNG dấu, chống lệch hoa/dấu).
const pkey = (pid, name) => `${pid}|${normalizeVietnamese(name)}`;

// ----------------------------------------------------------------------------
//  calcDebtSubcontractor({ projectId }) — Công nợ THẦU PHỤ theo (CT + thầu phụ):
//    Còn phải trả = Σ HĐ thầu phụ − Σ đã ứng (advances type='subcontractor').
//   Trả mảng [{ projectId, partner, tongHD, daUng, conPhaiTra }] (nợ nhiều lên trước).
// ----------------------------------------------------------------------------
export async function calcDebtSubcontractor({ projectId } = {}) {
  const subs = await getSubcontracts({ year: 0, projectId });
  const advs = await getAdvances({ year: 0, type: 'subcontractor', projectId });
  const map = new Map();
  const pick = (pid, partner) => {
    const k = pkey(pid, partner);
    if (!map.has(k)) map.set(k, { projectId: pid, partner, tongHD: 0, daUng: 0 });
    return map.get(k);
  };
  for (const s of subs) pick(s.projectId, s.partner).tongHD += num(s.value);
  for (const a of advs) pick(a.projectId, a.partner).daUng += num(a.amount);
  return [...map.values()]
    .map((g) => ({ ...g, conPhaiTra: g.tongHD - g.daUng }))
    .sort((a, b) => b.conPhaiTra - a.conPhaiTra
      || String(a.partner).localeCompare(String(b.partner), 'vi'));
}

// ----------------------------------------------------------------------------
//  calcDebtSupplier({ projectId }) — Công nợ NHÀ CUNG CẤP theo (CT + NCC):
//    Chênh lệch = Σ đã ứng (advances type='supplier') − Σ hóa đơn NCC (Tab 02).
//    >0: đã ứng dư (NCC còn nợ lại) · <0: còn phải trả NCC.
//   Chỉ tính hóa đơn CÓ tên NCC (supplier rỗng = chi phí lẻ, không vào công nợ).
//   Trả mảng [{ projectId, supplier, daUng, tongHoaDon, chenhLech }].
// ----------------------------------------------------------------------------
export async function calcDebtSupplier({ projectId } = {}) {
  const advs = await getAdvances({ year: 0, type: 'supplier', projectId });
  const invs = await getInvoices({ year: 0, projectId });
  const map = new Map();
  const pick = (pid, supplier) => {
    const k = pkey(pid, supplier);
    if (!map.has(k)) map.set(k, { projectId: pid, supplier, daUng: 0, tongHoaDon: 0 });
    return map.get(k);
  };
  for (const a of advs) pick(a.projectId, a.partner).daUng += num(a.amount);
  for (const v of invs) {
    if (!String(v.supplier || '').trim()) continue;       // bỏ hóa đơn không gắn NCC
    pick(v.projectId, v.supplier).tongHoaDon += num(v.amount);
  }
  return [...map.values()]
    .map((g) => ({ ...g, chenhLech: g.daUng - g.tongHoaDon }))
    .sort((a, b) => b.chenhLech - a.chenhLech
      || String(a.supplier).localeCompare(String(b.supplier), 'vi'));
}
