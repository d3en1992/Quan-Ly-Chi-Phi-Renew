// ============================================================================
//  modules/backup/backup.js  —  TẦNG TỔNG HỢP (Layer 7): Ảnh chụp & khôi phục
// ----------------------------------------------------------------------------
//  @module backup
//
//  NHIỆM VỤ: SAO LƯU NHANH NGAY TRONG MÁY (không cần tải file). Khác với
//  nhapxuat.export (xuất ra file rời) — file này lưu "ảnh chụp" (snapshot) toàn
//  bộ dữ liệu vào chính IndexedDB, để lỡ tay làm hỏng còn bấm KHÔI PHỤC lại.
//    • createSnapshot(label?) — chụp cả 10 kho → thêm vào danh sách (giữ tối đa
//      MAX bản gần nhất để khỏi phình IndexedDB).
//    • listSnapshots()        — danh sách metadata (id, lúc, số bản ghi) để vẽ UI.
//    • restoreSnapshot(id)    — GHI ĐÈ toàn bộ kho bằng dữ liệu trong ảnh chụp
//      (khôi phục cứng). Mỗi save() tự lên lịch đẩy đồng bộ.
//    • deleteSnapshot(id)     — xóa 1 ảnh chụp khỏi danh sách.
//
//  Danh sách ảnh chụp nằm ở 1 key riêng trong IndexedDB (SNAP_KEY) — KHÔNG nằm
//  trong 10 kho nghiệp vụ nên KHÔNG bị đẩy lên cloud (chỉ là phao cứu sinh local).
// ============================================================================

import { STORE, idbGet, idbSet } from '../../core/db.js';
import { save } from '../../core/store.js';
import { gatherAll } from '../nhapxuat/nhapxuat.export.js';

const SNAP_KEY = 'cpct_snapshots'; // key IndexedDB chứa MẢNG ảnh chụp
const MAX_SNAPSHOTS = 10;           // chỉ giữ 10 bản gần nhất (cũ hơn tự rụng)

// Thứ tự kho khi khôi phục (categories là đối tượng, còn lại mảng).
const ALL_STORES = Object.values(STORE);

// ----------------------------------------------------------------------------
//  countRecords(data) — Đếm tổng bản ghi trong 1 gói data (categories cộng nhóm).
// ----------------------------------------------------------------------------
function countRecords(data) {
  let n = 0;
  for (const name of ALL_STORES) {
    const v = data[name];
    if (Array.isArray(v)) n += v.length;
    else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) if (Array.isArray(v[k])) n += v[k].length;
    }
  }
  return n;
}

// ----------------------------------------------------------------------------
//  loadList() / saveList(list) — Đọc/ghi MẢNG ảnh chụp ở key riêng.
// ----------------------------------------------------------------------------
async function loadList() {
  const arr = await idbGet(SNAP_KEY);
  return Array.isArray(arr) ? arr : [];
}
function saveList(list) {
  return idbSet(SNAP_KEY, list);
}

// ----------------------------------------------------------------------------
//  createSnapshot(label) — Chụp toàn bộ dữ liệu hiện tại thành 1 ảnh chụp mới.
//  Trả metadata của ảnh vừa tạo. Giữ tối đa MAX_SNAPSHOTS bản (mới nhất đứng đầu).
// ----------------------------------------------------------------------------
export async function createSnapshot(label = '') {
  const data = await gatherAll();
  const snap = {
    id: crypto.randomUUID(),
    at: Date.now(),
    label: String(label || '').trim(),
    records: countRecords(data),
    data,
  };
  const list = await loadList();
  list.unshift(snap);                 // mới nhất lên đầu
  if (list.length > MAX_SNAPSHOTS) list.length = MAX_SNAPSHOTS; // cắt bớt bản cũ
  await saveList(list);
  return { id: snap.id, at: snap.at, label: snap.label, records: snap.records };
}

// ----------------------------------------------------------------------------
//  listSnapshots() — Trả metadata các ảnh chụp (KHÔNG kèm data nặng) để vẽ UI.
// ----------------------------------------------------------------------------
export async function listSnapshots() {
  const list = await loadList();
  return list.map((s) => ({ id: s.id, at: s.at, label: s.label || '', records: s.records || 0 }));
}

// ----------------------------------------------------------------------------
//  restoreSnapshot(id) — GHI ĐÈ toàn bộ 10 kho bằng dữ liệu trong ảnh chụp.
//  Trả số bản ghi đã khôi phục, hoặc ném lỗi nếu không tìm thấy ảnh.
//  Lưu ý: đây là khôi phục CỨNG (replace), không merge — dùng khi muốn "quay về".
// ----------------------------------------------------------------------------
export async function restoreSnapshot(id) {
  const list = await loadList();
  const snap = list.find((s) => s.id === id);
  if (!snap) throw new Error('Không tìm thấy bản sao lưu.');

  for (const name of ALL_STORES) {
    const fallback = name === STORE.CATEGORIES ? {} : [];
    const value = (snap.data && snap.data[name] != null) ? snap.data[name] : fallback;
    await save(name, value); // ghi đè local + lên lịch đẩy đồng bộ
  }
  return snap.records || countRecords(snap.data || {});
}

// ----------------------------------------------------------------------------
//  deleteSnapshot(id) — Xóa 1 ảnh chụp khỏi danh sách. Trả true nếu có xóa.
// ----------------------------------------------------------------------------
export async function deleteSnapshot(id) {
  const list = await loadList();
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  await saveList(next);
  return true;
}
