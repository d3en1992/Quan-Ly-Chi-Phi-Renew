// ============================================================================
//  modules/danhmuc/danhmuc.data.js  —  TẦNG DỮ LIỆU (Layer 5): Tab Danh Mục
// ----------------------------------------------------------------------------
//  @module danhmuc.data
//
//  Phần LÕI NHẸ của danh mục (6 nhóm tên gọi, chuẩn hóa, chống trùng, đọc/ghi
//  document) đã nằm ở utils/cat.js — file này KHÔNG chép lại, chỉ IMPORT dùng.
//
//  File này lo phần "ĐỤNG NHIỀU STORE" mà cat.js cố ý để dành cho tab Danh Mục:
//    1. CACHE RAM document categories → UI truy vấn ĐỒNG BỘ (groupItems).
//    2. Mutator có lưu: addItem / renameItem / deleteItem / setWorkerRole.
//    3. ĐỔI TÊN = CASCADE: sửa tên lan ra mọi store đang lưu tên cũ (doc 07 §4).
//    4. XÓA AN TOÀN: chặn xóa nếu tên còn được dùng ở store liên quan (doc 07 §5).
//    5. getUsedKeys(year): tập khóa tên "đang dùng" theo NĂM → cho UI gắn badge.
//
//  NGUYÊN TẮC VÀNG: các tab khác lưu THẲNG chuỗi tên (denormalized), KHÔNG lưu id
//  → đổi tên phải quét-thay theo tên. So khớp bằng normalizeKey (không dấu).
// ============================================================================

import { STORE } from '../../core/db.js';
import { load, save, activeOnly, markUpdated } from '../../core/store.js';
import { getSelectedYear } from '../../topbar.js';
import {
  GROUP_KEYS, WORKER_ROLES, normalizeName, normalizeKey,
  loadCategories, saveCategories, getCategory, addCategoryItem, findByKey,
} from '../../utils/cat.js';

// ----------------------------------------------------------------------------
//  CACHE RAM — giữ document categories sau lần đọc đầu để UI query đồng bộ.
// ----------------------------------------------------------------------------
let _doc = null;

// ensureLoaded() — Đọc document 1 lần vào cache (gọi đầu mỗi lần render tab).
export async function ensureLoaded() {
  if (!_doc) _doc = await loadCategories();
  return _doc;
}

// groupItems(group) — Mảng item của 1 nhóm trong cache (rỗng nếu chưa nạp).
export function groupItems(group) {
  return _doc ? getCategory(_doc, group) : [];
}

// ----------------------------------------------------------------------------
//  BẢNG CASCADE — nhóm danh mục → store/field bị ảnh hưởng khi đổi tên (doc 07 §4).
//  costType→invoices.category · supplier→invoices.supplier · performer→invoices.performer
//  subcontractor→advances.partner (lọc type) · worker→timesheets.workers[].name
//  equipment→equipment.name. (worker + equipment xử lý riêng vì lồng/đặc thù.)
// ----------------------------------------------------------------------------
const INVOICE_FIELD = { costType: 'category', supplier: 'supplier', performer: 'performer' };

// ----------------------------------------------------------------------------
//  usageValues(group, year) — Liệt kê MỌI chuỗi tên đang được dùng bởi 1 nhóm.
//  year>0 → lọc theo năm (hóa đơn/tiền ứng theo `date`, chấm công theo `toDate`);
//  year=0 → mọi năm. Thiết bị KHÔNG lọc năm. Chỉ xét bản ghi còn dùng (activeOnly).
// ----------------------------------------------------------------------------
async function usageValues(group, year) {
  const inYear = (rec, field) => !year || String(rec[field] || '').startsWith(String(year));
  const out = [];

  if (INVOICE_FIELD[group]) {
    const field = INVOICE_FIELD[group];
    for (const r of activeOnly(await load(STORE.INVOICES, []))) {
      if (inYear(r, 'date') && r[field]) out.push(r[field]);
    }
  } else if (group === 'subcontractor') {
    for (const r of activeOnly(await load(STORE.ADVANCES, []))) {
      if (r.type === 'subcontractor' && inYear(r, 'date') && r.partner) out.push(r.partner);
    }
  } else if (group === 'worker') {
    for (const t of activeOnly(await load(STORE.TIMESHEETS, []))) {
      if (year && !String(t.toDate || '').startsWith(String(year))) continue;
      for (const w of (t.workers || [])) if (w.name) out.push(w.name);
    }
  } else if (group === 'equipment') {
    for (const e of activeOnly(await load(STORE.EQUIPMENT, []))) {
      if (e.name) out.push(e.name);
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
//  getUsedKeys(year) — Trả { [group]: Set(normalizeKey) } các tên ĐANG DÙNG trong
//  năm. UI dùng để gắn badge "✓ đang dùng". Đọc các store liên quan SONG SONG.
// ----------------------------------------------------------------------------
export async function getUsedKeys(year = getSelectedYear()) {
  const out = {};
  await Promise.all(GROUP_KEYS.map(async (g) => {
    const vals = await usageValues(g, year);
    out[g] = new Set(vals.map(normalizeKey));
  }));
  return out;
}

// countItemUse(group, name) — Đếm số bản ghi đang dùng tên này (MỌI năm) → pre-flight xóa.
async function countItemUse(group, name) {
  const key = normalizeKey(name);
  const vals = await usageValues(group, 0);
  return vals.filter((v) => normalizeKey(v) === key).length;
}

// isItemInUse(group, name) — true nếu tên còn được tham chiếu ở store liên quan.
export async function isItemInUse(group, name) {
  return (await countItemUse(group, name)) > 0;
}

// ----------------------------------------------------------------------------
//  cascadeRename(group, oldName, newName) — Quét store liên quan, thay tên cũ→mới
//  (so khớp không dấu). Đóng dấu updatedAt (LWW) cho mỗi bản ghi đổi. Trả số bản ghi đã sửa.
// ----------------------------------------------------------------------------
async function cascadeRename(group, oldName, newName) {
  const key = normalizeKey(oldName);
  let changed = 0;

  if (INVOICE_FIELD[group]) {
    const field = INVOICE_FIELD[group];
    const arr = await load(STORE.INVOICES, []);
    for (const r of arr) if (normalizeKey(r[field] || '') === key) { r[field] = newName; markUpdated(r); changed++; }
    if (changed) await save(STORE.INVOICES, arr);
  } else if (group === 'subcontractor') {
    const arr = await load(STORE.ADVANCES, []);
    for (const r of arr) if (r.type === 'subcontractor' && normalizeKey(r.partner || '') === key) { r.partner = newName; markUpdated(r); changed++; }
    if (changed) await save(STORE.ADVANCES, arr);
  } else if (group === 'worker') {
    const arr = await load(STORE.TIMESHEETS, []);
    for (const t of arr) {
      let hit = false;
      for (const w of (t.workers || [])) if (normalizeKey(w.name || '') === key) { w.name = newName; hit = true; }
      if (hit) { markUpdated(t); changed++; }
    }
    if (changed) await save(STORE.TIMESHEETS, arr);
  } else if (group === 'equipment') {
    const arr = await load(STORE.EQUIPMENT, []);
    for (const e of arr) if (normalizeKey(e.name || '') === key) { e.name = newName; markUpdated(e); changed++; }
    if (changed) await save(STORE.EQUIPMENT, arr);
  }
  return changed;
}

// cascadeWorkerRole(name, role) — Đồng bộ vai trò công nhân vào timesheets.workers[].role.
async function cascadeWorkerRole(name, role) {
  const key = normalizeKey(name);
  const arr = await load(STORE.TIMESHEETS, []);
  let changed = 0;
  for (const t of arr) {
    let hit = false;
    for (const w of (t.workers || [])) if (normalizeKey(w.name || '') === key && w.role !== role) { w.role = role; hit = true; }
    if (hit) { markUpdated(t); changed++; }
  }
  if (changed) await save(STORE.TIMESHEETS, arr);
  return changed;
}

// ----------------------------------------------------------------------------
//  MUTATOR CÔNG KHAI (đều tự lưu document + trả kết quả cho UI báo toast).
// ----------------------------------------------------------------------------

// addItem(group, rawName, role) — Thêm item (chuẩn hóa + chống trùng) rồi lưu.
//  Trả { ok, item } | { ok:false, reason:'empty'|'duplicate'|'group', item? }.
export async function addItem(group, rawName, role) {
  await ensureLoaded();
  const res = addCategoryItem(_doc, group, rawName, role);
  if (res.ok) await saveCategories(_doc);
  return res;
}

// renameItem(group, id, newRaw) — Đổi tên item + CASCADE ra các store khác.
//  Trả { ok:true, item, changed } | { ok:false, reason:'empty'|'duplicate'|'notfound', item? }.
export async function renameItem(group, id, newRaw) {
  await ensureLoaded();
  const item = groupItems(group).find((i) => i.id === id);
  if (!item) return { ok: false, reason: 'notfound' };

  const newName = normalizeName(group, newRaw);
  if (!newName) return { ok: false, reason: 'empty' };

  // Chỉ đổi HOA-THƯỜNG/định dạng (cùng khóa không dấu) → cập nhật hiển thị + cascade luôn.
  const sameKey = normalizeKey(newName) === normalizeKey(item.name);
  if (!sameKey) {
    const dup = findByKey(_doc, group, newName);
    if (dup && dup.id !== id) return { ok: false, reason: 'duplicate', item: dup };
  }

  const oldName = item.name;
  item.name = newName;
  const changed = await cascadeRename(group, oldName, newName);
  await saveCategories(_doc);
  return { ok: true, item, changed };
}

// deleteItem(group, id) — Xóa item; CHẶN nếu còn được dùng (trả count để báo).
//  Trả { ok:true } | { ok:false, reason:'inuse', count } | { ok:false, reason:'notfound' }.
export async function deleteItem(group, id) {
  await ensureLoaded();
  const arr = groupItems(group);
  const item = arr.find((i) => i.id === id);
  if (!item) return { ok: false, reason: 'notfound' };

  const count = await countItemUse(group, item.name);
  if (count > 0) return { ok: false, reason: 'inuse', count };

  arr.splice(arr.indexOf(item), 1);
  await saveCategories(_doc);
  return { ok: true };
}

// setWorkerRole(id, role) — Đổi vai trò công nhân (C/T/P) + đồng bộ sang chấm công.
export async function setWorkerRole(id, role) {
  await ensureLoaded();
  if (!WORKER_ROLES[role]) return { ok: false, reason: 'role' };
  const item = groupItems('worker').find((i) => i.id === id);
  if (!item) return { ok: false, reason: 'notfound' };

  item.role = role;
  const changed = await cascadeWorkerRole(item.name, role);
  await saveCategories(_doc);
  return { ok: true, changed };
}
