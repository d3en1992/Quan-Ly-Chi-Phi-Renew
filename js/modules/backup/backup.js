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

import { STORE, idbGet, idbSet, idbDelete } from '../../core/db.js';
import { save } from '../../core/store.js';
import { gatherAll } from '../nhapxuat/nhapxuat.export.js';

const SNAP_KEY = 'cpct_snapshots'; // key IndexedDB chứa CHỈ MỤC (metadata) các ảnh chụp
const MAX_SNAPSHOTS = 10;           // chỉ giữ 10 bản gần nhất (cũ hơn tự rụng)

// dataKey(id) — Key riêng chứa cục `data` NẶNG của 1 ảnh chụp (tách khỏi chỉ mục).
//  TRƯỚC ĐÂY mọi ảnh chụp (kèm cả bản sao dữ liệu) nhồi chung vào MỘT key SNAP_KEY →
//  mỗi lần tạo/đọc phải nuốt cả ~10 bản sao toàn bộ DB (rất chậm). Nay mỗi ảnh chụp
//  để `data` ở key riêng, SNAP_KEY chỉ giữ metadata nhẹ → mở tab & tạo ảnh đều tức thì.
const dataKey = (id) => `cpct_snap_${id}`;

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
//  loadList() — Đọc CHỈ MỤC ảnh chụp (metadata nhẹ). Tự DI TRÚ định dạng cũ:
//  nếu phát hiện entry còn nhồi `data` inline (kiểu lưu cũ), tách `data` ra key
//  riêng rồi viết lại chỉ mục gọn — chỉ tốn 1 lần, các lần sau đọc tức thì.
// ----------------------------------------------------------------------------
async function loadList() {
  const arr = await idbGet(SNAP_KEY);
  if (!Array.isArray(arr)) return [];

  const needsMigration = arr.some((s) => s && s.data != null);
  if (!needsMigration) return arr;

  const index = [];
  for (const s of arr) {
    if (!s || !s.id) continue;
    if (s.data != null) {
      await idbSet(dataKey(s.id), s.data);          // tách cục nặng ra key riêng
    }
    index.push({ id: s.id, at: s.at, label: s.label || '', records: s.records || 0 });
  }
  await saveList(index);                             // chỉ mục mới chỉ còn metadata
  return index;
}

// saveList(list) — Ghi CHỈ MỤC (metadata) — luôn nhẹ vì không chứa `data`.
function saveList(list) {
  return idbSet(SNAP_KEY, list);
}

// ----------------------------------------------------------------------------
//  createSnapshot(label) — Chụp toàn bộ dữ liệu hiện tại thành 1 ảnh chụp mới.
//  Trả metadata của ảnh vừa tạo. Giữ tối đa MAX_SNAPSHOTS bản (mới nhất đứng đầu).
// ----------------------------------------------------------------------------
export async function createSnapshot(label = '') {
  const data = await gatherAll();
  const id = crypto.randomUUID();
  const meta = {
    id,
    at: Date.now(),
    label: String(label || '').trim(),
    records: countRecords(data),
  };
  await idbSet(dataKey(id), data);    // cục NẶNG để ở key riêng (không đụng các ảnh khác)

  const list = await loadList();
  list.unshift(meta);                 // mới nhất lên đầu (chỉ mục nhẹ)
  const dropped = list.splice(MAX_SNAPSHOTS);                  // cắt bớt bản cũ quá MAX
  await saveList(list);
  for (const d of dropped) await idbDelete(dataKey(d.id));     // dọn data của bản bị rụng
  return meta;
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
  const meta = list.find((s) => s.id === id);
  if (!meta) throw new Error('Không tìm thấy bản sao lưu.');

  const data = await idbGet(dataKey(id));   // nạp cục nặng ĐÚNG ảnh này (không nạp ảnh khác)
  if (!data) throw new Error('Dữ liệu bản sao lưu đã mất hoặc rỗng.');

  for (const name of ALL_STORES) {
    const fallback = name === STORE.CATEGORIES ? {} : [];
    const value = data[name] != null ? data[name] : fallback;
    await save(name, value); // ghi đè local + lên lịch đẩy đồng bộ
  }
  return meta.records || countRecords(data);
}

// ----------------------------------------------------------------------------
//  deleteSnapshot(id) — Xóa 1 ảnh chụp khỏi danh sách. Trả true nếu có xóa.
// ----------------------------------------------------------------------------
export async function deleteSnapshot(id) {
  const list = await loadList();
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  await saveList(next);
  await idbDelete(dataKey(id));   // dọn luôn cục data nặng của ảnh bị xóa
  return true;
}
