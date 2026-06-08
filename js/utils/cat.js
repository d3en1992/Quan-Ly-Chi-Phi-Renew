// ============================================================================
//  utils/cat.js  —  TẦNG KẾT NỐI (Layer 2): Danh mục dùng chung (Single Source)
// ----------------------------------------------------------------------------
//  ĐÂY LÀ "NGUỒN SỰ THẬT" cho mọi TÊN GỌI lặp lại trong app (loại chi phí, nhà
//  cung cấp, người thực hiện, thầu phụ, công nhân, thiết bị). Các tab khác lưu
//  THẲNG chuỗi tên (denormalized) và đọc gợi ý từ đây → thêm 1 tên ở đây là dùng
//  được ngay khắp nơi.
//
//  FILE NÀY LO PHẦN "DỮ LIỆU NỀN" của danh mục:
//   - 6 nhóm chuẩn (GROUPS) + quy tắc hiển thị (Title Case / UPPERCASE).
//   - Chuẩn hóa tên lúc nhập (normalizeName) + khóa chống trùng (normalizeKey).
//   - Đọc/ghi document categories, thêm item (chống trùng), liệt kê tên cho gợi ý.
//
//  PHẦN CÒN LẠI (để cho module danhmuc ở sprint sau):
//   - Đổi tên CASCADE (sửa tên lan ra các store khác), xóa an toàn (pre-flight),
//     xuất/nhập JSON-Excel, giao diện thẻ. Những thứ đó đụng nhiều store nên tách
//     riêng; cat.js chỉ giữ phần lõi nhẹ, ai cũng import được mà không kéo theo cả tab.
//
//  SCHEMA document STORE.categories (1 document gộp — xem doc 07):
//     {
//       costType:[{id,name}], supplier:[{id,name}], performer:[{id,name}],
//       subcontractor:[{id,name}], worker:[{id,name,role}], equipment:[{id,name}],
//       createdAt, updatedAt, deletedAt, deviceId   ← 4 field hệ thống cấp document
//     }
// ============================================================================

import { STORE, DEVICE_ID } from '../core/db.js';
import { load, save } from '../core/store.js';
import { normalizeVietnamese } from './autocomplete.js';

// ----------------------------------------------------------------------------
//  6 NHÓM DANH MỤC — nguồn sự thật về tên nhóm + quy tắc hiển thị.
//   display:'title' → Title Case (Vật Tư) | display:'upper' → UPPERCASE (CTY ABC)
//   hasRole:true    → nhóm có thêm vai trò (chỉ 'worker': Chính/Thời vụ/Phụ)
// ----------------------------------------------------------------------------
export const GROUPS = [
  { key: 'costType',      label: 'Loại chi phí',     display: 'title' },
  { key: 'supplier',      label: 'Nhà cung cấp',     display: 'upper' },
  { key: 'performer',     label: 'Người thực hiện',  display: 'upper' },
  { key: 'subcontractor', label: 'Thầu phụ',         display: 'upper' },
  { key: 'worker',        label: 'Công nhân',        display: 'upper', hasRole: true },
  { key: 'equipment',     label: 'Thiết bị',         display: 'title' },
];

// Danh sách khóa nhóm (tiện lặp + kiểm tra hợp lệ).
export const GROUP_KEYS = GROUPS.map((g) => g.key);

// Vai trò công nhân (chỉ dùng cho nhóm 'worker').
export const WORKER_ROLES = {
  C: { label: 'Chính',   desc: 'Thợ chính' },
  T: { label: 'Thời vụ', desc: 'Thợ thời vụ' },
  P: { label: 'Phụ',     desc: 'Thợ phụ' },
};

// Tra nhanh cấu hình 1 nhóm theo khóa.
function groupCfg(group) {
  return GROUPS.find((g) => g.key === group) || null;
}

// ----------------------------------------------------------------------------
//  CHUẨN HÓA TÊN
// ----------------------------------------------------------------------------

// toTitleCase('vật tư') → 'Vật Tư'. Viết hoa chữ đầu MỖI từ, phần còn lại thường.
export function toTitleCase(v) {
  return String(v)
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// normalizeName(group, raw) — Tên hiển thị CHUẨN của 1 nhóm (áp ngay lúc nhập).
//  Bỏ khoảng trắng thừa, rồi Title Case (costType/equipment) hoặc UPPERCASE (4 nhóm còn lại).
export function normalizeName(group, raw) {
  const v = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!v) return '';
  const cfg = groupCfg(group);
  return cfg && cfg.display === 'title' ? toTitleCase(v) : v.toUpperCase();
}

// normalizeKey(v) — Khóa SO TRÙNG (không dấu, thường hóa). Chỉ để so sánh, KHÔNG hiển thị.
//  Dùng chung 1 thuật toán với ô gợi ý → "Xi Măng" ≡ "xi mang" ≡ "XI MĂNG".
export const normalizeKey = normalizeVietnamese;

// ----------------------------------------------------------------------------
//  ĐỌC / GHI DOCUMENT CATEGORIES
// ----------------------------------------------------------------------------

// Tạo khung document rỗng đủ 6 nhóm + 4 field hệ thống.
function emptyCategories() {
  const now = Date.now();
  const doc = { createdAt: now, updatedAt: now, deletedAt: null, deviceId: DEVICE_ID };
  for (const k of GROUP_KEYS) doc[k] = [];
  return doc;
}

// Đảm bảo document có ĐỦ 6 mảng nhóm (phòng khi đọc về thiếu nhóm nào đó).
function ensureShape(doc) {
  const d = doc && typeof doc === 'object' ? doc : emptyCategories();
  for (const k of GROUP_KEYS) if (!Array.isArray(d[k])) d[k] = [];
  if (!d.deviceId) d.deviceId = DEVICE_ID;
  if (!d.createdAt) d.createdAt = Date.now();
  return d;
}

// loadCategories() — Đọc document danh mục (luôn trả về khung đủ 6 nhóm, không null).
export async function loadCategories() {
  const doc = await load(STORE.CATEGORIES, null);
  return ensureShape(doc);
}

// saveCategories(doc) — Đóng dấu "vừa sửa" rồi lưu (kéo theo lên lịch đẩy đồng bộ).
export async function saveCategories(doc) {
  doc.updatedAt = Date.now();
  doc.deviceId  = DEVICE_ID;
  await save(STORE.CATEGORIES, doc);
  return doc;
}

// ----------------------------------------------------------------------------
//  TRUY VẤN NHÓM
// ----------------------------------------------------------------------------

// getCategory(doc, group) — Mảng item của 1 nhóm (vd toàn bộ nhà cung cấp).
export function getCategory(doc, group) {
  return (doc && Array.isArray(doc[group])) ? doc[group] : [];
}

// listNames(doc, group) — Chỉ danh sách TÊN của 1 nhóm → đổ thẳng vào ô gợi ý.
export function listNames(doc, group) {
  return getCategory(doc, group).map((it) => it.name);
}

// findByKey(doc, group, name) — Tìm item theo khóa không dấu (phát hiện trùng).
export function findByKey(doc, group, name) {
  const key = normalizeKey(name);
  return getCategory(doc, group).find((it) => normalizeKey(it.name) === key) || null;
}

// ----------------------------------------------------------------------------
//  THÊM ITEM (chuẩn hóa + chống trùng)
//  Lưu ý: chỉ CHỈNH trên doc trong bộ nhớ, KHÔNG tự lưu — caller gọi saveCategories(doc).
//  Trả về:
//     { ok:true,  item }                 khi thêm thành công
//     { ok:false, reason:'empty' }       khi tên rỗng
//     { ok:false, reason:'duplicate', item } khi đã có (item là cái đang tồn tại)
// ----------------------------------------------------------------------------
export function addCategoryItem(doc, group, rawName, role) {
  if (!GROUP_KEYS.includes(group)) return { ok: false, reason: 'group' };
  const name = normalizeName(group, rawName);
  if (!name) return { ok: false, reason: 'empty' };

  const trung = findByKey(doc, group, name);
  if (trung) return { ok: false, reason: 'duplicate', item: trung };

  const item = { id: crypto.randomUUID(), name };
  if (groupCfg(group).hasRole) item.role = WORKER_ROLES[role] ? role : 'C'; // mặc định 'C'
  getCategory(doc, group).push(item);
  return { ok: true, item };
}
