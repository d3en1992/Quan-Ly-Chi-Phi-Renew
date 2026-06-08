// ============================================================================
//  core/sync.js  —  TẦNG KẾT NỐI (Layer 2): Bộ đồng bộ đám mây (Sync Engine)
// ----------------------------------------------------------------------------
//  ĐÂY LÀ "BỘ NÃO" ĐỒNG BỘ. Nó ngồi TRÊN 2 lớp dưới:
//     - core/store.js   : đọc/ghi bản ghi ở IndexedDB (local).
//     - core/firebase.js: đọc/ghi document trên Firestore (cloud) qua REST.
//  …và nối chúng lại theo TRIẾT LÝ ĐÃ CHỐT (doc 10):
//
//     ┌─────────────────────────────────────────────────────────────────┐
//     │  OFFLINE-FIRST  ·  CLOUD LÀ NGUỒN CHUẨN  ·  LWW + TOMBSTONE       │
//     ├─────────────────────────────────────────────────────────────────┤
//     │  PULL = TẢI cloud về → THAY THẾ nguyên "lát năm" đó ở local       │
//     │         (sau pull, năm đó ở local = đúng những gì cloud có)        │
//     │  PUSH = đọc cloud → GỘP (mergeById) với local → ghi đè doc        │
//     │         (gộp để KHÔNG đè mất dữ liệu máy khác cùng ghi 1 năm)      │
//     │  XUNG ĐỘT: tombstone (đã xóa) ưu tiên, rồi updatedAt mới hơn thắng │
//     └─────────────────────────────────────────────────────────────────┘
//
//  TIẾT KIỆM QUOTA (gói Spark): chia nhỏ 1 document / kho / NĂM. "Push ngầm" chỉ
//  đẩy NĂM HIỆN TẠI + kho VỪA ĐỔI (dirty) → cực ít lượt ghi. "Push đầy đủ" (khi
//  bấm Sync tay / sau import) mới đẩy tất cả năm.
//
//  GIAO DIỆN chấm trạng thái/banner là việc của file sync.ui.js (làm sau). File
//  này chỉ lo LOGIC; có gọi toast/setLoading để báo nhanh khi sync tay.
//
//  ⚠️ Khi CHƯA dán config Firebase: fbReady()=false → mọi push/pull tự bỏ qua
//     êm ru, app chạy offline bình thường. Thay đổi vẫn được nhớ (dirty) để đẩy
//     sau khi có config / có mạng lại.
// ============================================================================

import { STORE, DEVICE_ID, idbSet } from './db.js';
import { load, setPushScheduler } from './store.js';
import { fbReady, cloudGet, cloudSet, docYearCat, docMeta } from './firebase.js';
import { DATE_FIELD, getRecordYear, filterByYear } from '../utils/year.js';
import { toast, setLoading } from '../utils/ui.js';

// ----------------------------------------------------------------------------
//  PHÂN LOẠI KHO:
//   - YEAR_STORES : có lọc theo năm → 1 doc / kho / năm (cpct_data/y2026_invoices).
//   - META_STORES : kho nền dùng chung → 1 doc / kho (cpct_data/meta_projects).
//  YEAR_STORES suy thẳng từ DATE_FIELD (nguồn sự thật về kho nào lọc theo năm).
// ----------------------------------------------------------------------------
const YEAR_STORES = Object.keys(DATE_FIELD); // [invoices, timesheets, advances, equipment, receipts]
const META_STORES = Object.values(STORE).filter((s) => !YEAR_STORES.includes(s)); // [projects, categories, contracts, subcontracts, users]

// Năm hiện tại (mặc định dùng cho push ngầm & pull khi không truyền năm cụ thể).
function currentYear() { return new Date().getFullYear(); }

// field mốc thời gian của 1 kho theo năm (mặc định 'date').
function dateFieldOf(store) { return DATE_FIELD[store] || 'date'; }

// Liệt kê các năm THỰC SỰ có dữ liệu trong 1 mảng record (để push đầy đủ mọi năm).
function distinctYears(records, dateField) {
  const tap = new Set();
  for (const r of (records || [])) {
    const y = getRecordYear(r, dateField);
    if (y) tap.add(y);
  }
  return [...tap];
}

// ============================================================================
//  PHẦN 1 — BA NGUYÊN THỦY MERGE (lõi LWW, thuần hàm, dễ kiểm thử)
// ============================================================================

// safeTs(ts) — Chuẩn hóa mốc thời gian, CHỐNG lệch giờ máy:
//   - timestamp < 2020 → coi như "chưa đặt" (trả 0, sẽ thua khi so).
//   - timestamp ở tương lai xa (> hôm nay + 1 ngày) → kẹp về now (tránh "thắng giả"
//     do ai đó đặt sai ngày hệ thống thành 2099).
const TS_EPOCH = 1577836800000; // 2020-01-01 00:00:00 UTC
export function safeTs(ts) {
  const n = Number(ts) || 0;
  if (n < TS_EPOCH) return 0;
  if (n > Date.now() + 86400000) return Date.now();
  return n;
}

// resolveConflict(local, cloud) — Cùng 1 id ở 2 nơi, chọn bản THẮNG:
//   1) Đã xóa (tombstone) ưu tiên: bản có deletedAt thắng → record không "sống lại".
//   2) Nếu cùng trạng thái sống/chết → updatedAt (đã safeTs) mới hơn thắng (LWW).
export function resolveConflict(local, cloud) {
  if (local.deletedAt && !cloud.deletedAt) return local; // local đã xóa → giữ tombstone
  if (!local.deletedAt && cloud.deletedAt) return cloud;  // cloud đã xóa → lan tombstone về
  const lt = safeTs(local.updatedAt || local.createdAt);
  const ct = safeTs(cloud.updatedAt || cloud.createdAt);
  return lt >= ct ? local : cloud; // hòa giờ → ưu tiên local (đỡ ghi đè không cần thiết)
}

// mergeById(local, cloud) — Gộp 2 mảng record theo id, mỗi id giữ bản thắng.
export function mergeById(local, cloud) {
  const map = new Map();
  (local || []).forEach((r) => map.set(String(r.id), r));
  (cloud || []).forEach((c) => {
    const k = String(c.id);
    const l = map.get(k);
    map.set(k, l ? resolveConflict(l, c) : c); // chưa có ở local → lấy luôn bản cloud
  });
  return [...map.values()];
}

// ============================================================================
//  PHẦN 2 — TRẠNG THÁI ĐỒNG BỘ (bộ nhớ trong + localStorage)
// ============================================================================
const LAST_SYNC_KEY = 'cpct_last_sync';

let _syncing  = false;           // đang chạy 1 lượt sync? (chặn chạy chồng)
let _dirty    = new Set();       // các kho có thay đổi chưa đẩy (để push ngầm)
let _pending  = 0;               // đếm số thao tác chưa đẩy (hiển thị cho người dùng)
let _timer    = null;            // hẹn giờ debounce cho schedulePush
let _lastFlush = 0;              // mốc lần "flush khi ẩn tab" gần nhất (chặn dồn dập)

export function isSyncing() { return _syncing; }
export function getLastSync() {
  const v = Number(localStorage.getItem(LAST_SYNC_KEY));
  return v > 0 ? v : null;
}
export function getPendingCount() { return _pending; }

// ----------------------------------------------------------------------------
//  BÁO TRẠNG THÁI CHO TẦNG UI (sync.ui.js "cắm" vào qua setSyncStateListener,
//  giống setPushScheduler — sync.js KHÔNG import sync.ui.js để tránh phụ thuộc vòng).
//  Trạng thái: 'syncing' (đang chạy) · 'ok' (xong) · 'error' (lỗi) · 'offline' (mất mạng).
//  _emit() không tham số → tự suy trạng thái nền (đang sync? mất mạng? mặc định ok)
//  để dùng khi chỉ có pending đổi (sau save) mà không thay đổi pha sync.
// ----------------------------------------------------------------------------
let _onState = null;
export function setSyncStateListener(fn) { _onState = fn; }
function _emit(state) {
  if (typeof _onState !== 'function') return;
  let s = state;
  if (s === undefined) {
    if (_syncing) s = 'syncing';
    else if (typeof navigator !== 'undefined' && navigator.onLine === false) s = 'offline';
    else s = 'ok';
  }
  try { _onState(s, { lastSync: getLastSync(), pending: _pending, syncing: _syncing }); }
  catch (e) { /* lỗi UI không được làm hỏng đồng bộ */ }
}

function _markSynced() {
  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  _dirty.clear();
  _pending = 0;
}

// ============================================================================
//  PHẦN 3 — ĐẨY 1 KHO (helper nội bộ cho pushChanges)
// ============================================================================

// users: KHÔNG đẩy mật khẩu lên mây (chỉ giữ local). Bỏ field password trước khi gửi.
function stripPassword(u) {
  const { password, ...rest } = u;
  return rest;
}
// Sau khi merge từ cloud (bản cloud không có mật khẩu) → vá lại mật khẩu từ local theo id.
function reattachPasswords(mergedUsers, localUsers) {
  const pwById = new Map((localUsers || []).map((u) => [String(u.id), u.password]));
  return mergedUsers.map((u) => {
    const pw = pwById.get(String(u.id));
    return pw !== undefined ? { ...u, password: pw } : u;
  });
}

// ----------------------------------------------------------------------------
//  CATEGORIES là TRƯỜNG HỢP ĐẶC BIỆT trong META_STORES: nó KHÔNG phải mảng record
//  mà là 1 DOCUMENT đối tượng { nhóm: [item,...], updatedAt, deviceId }. Vì thế
//  không thể mergeById thẳng như các meta khác (sẽ lỗi local.forEach). Ta gộp
//  TỪNG NHÓM theo id, và lưu/đọc trên cloud dưới khóa `doc` (thay vì `records`).
// ----------------------------------------------------------------------------
// mergeCategoryDocs(a, b) — Gộp 2 document danh mục: hợp các nhóm, mỗi nhóm gộp
// theo id (LWW + tombstone). Giữ mốc hệ thống mới hơn (updatedAt/deviceId/createdAt).
export function mergeCategoryDocs(a, b) {
  const la = (a && typeof a === 'object') ? a : {};
  const lb = (b && typeof b === 'object') ? b : {};
  const out = {};
  const groups = new Set(
    [...Object.keys(la), ...Object.keys(lb)].filter((k) => Array.isArray(la[k]) || Array.isArray(lb[k])),
  );
  for (const g of groups) {
    out[g] = mergeById(Array.isArray(la[g]) ? la[g] : [], Array.isArray(lb[g]) ? lb[g] : []);
  }
  out.updatedAt = Math.max(safeTs(la.updatedAt), safeTs(lb.updatedAt)) || Date.now();
  out.deviceId  = safeTs(la.updatedAt) >= safeTs(lb.updatedAt) ? (la.deviceId || lb.deviceId) : (lb.deviceId || la.deviceId);
  const created = [la.createdAt, lb.createdAt].map(Number).filter(Boolean);
  if (created.length) out.createdAt = Math.min(...created);
  return out;
}

// Đẩy DOCUMENT danh mục: đọc cloud (khóa `doc`) → gộp theo nhóm → ghi đè → cập nhật local.
async function _pushCategories(store) {
  const path     = docMeta(store);
  const localDoc = await load(store, {});
  const cloudWrap = await cloudGet(path);
  const cloudDoc  = (cloudWrap && typeof cloudWrap.doc === 'object') ? cloudWrap.doc : null;
  const merged = mergeCategoryDocs(localDoc, cloudDoc);
  await cloudSet(path, { doc: merged, updatedAt: Date.now() });
  await idbSet(store, merged);
}

// Đẩy 1 kho NỀN (meta): đọc cloud → gộp → ghi đè doc → cập nhật lại local (đã gộp).
async function _pushMetaStore(store) {
  if (store === STORE.CATEGORIES) return _pushCategories(store); // doc đối tượng, gộp riêng
  const local = await load(store, []);
  const path  = docMeta(store);

  const cloudDoc     = await cloudGet(path);
  const cloudRecords = (cloudDoc && Array.isArray(cloudDoc.records)) ? cloudDoc.records : [];

  // users: gỡ mật khẩu trước khi gộp/đẩy.
  const localForPush = (store === STORE.USERS) ? local.map(stripPassword) : local;
  const merged = mergeById(localForPush, cloudRecords);

  await cloudSet(path, { records: merged, updatedAt: Date.now() });

  // Ghi bản đã gộp về local để hội tụ ngay (không cần chờ pull). users vá lại mật khẩu.
  const localMerged = (store === STORE.USERS) ? reattachPasswords(merged, local) : merged;
  await idbSet(store, localMerged);
}

// Đẩy 1 kho THEO NĂM cho ĐÚNG 1 năm: đọc cloud năm đó → gộp với lát năm local → ghi đè.
async function _pushYearStore(store, year) {
  const df       = dateFieldOf(store);
  const localAll = await load(store, []);
  const localSlice = filterByYear(localAll, year, df);
  const path = docYearCat(year, store);

  const cloudDoc     = await cloudGet(path);
  const cloudRecords = (cloudDoc && Array.isArray(cloudDoc.records)) ? cloudDoc.records : [];

  // Cả 2 phía đều rỗng → không có gì để đẩy, bỏ qua (tiết kiệm 1 lượt ghi quota).
  if (localSlice.length === 0 && cloudRecords.length === 0) return;

  const merged = mergeById(localSlice, cloudRecords);
  await cloudSet(path, { records: merged, updatedAt: Date.now() });

  // Thay lát năm đó ở local bằng bản đã gộp (giữ nguyên các năm khác) → hội tụ ngay.
  const rest = localAll.filter((r) => getRecordYear(r, df) !== Number(year));
  await idbSet(store, [...rest, ...merged]);
}

// ============================================================================
//  PHẦN 4 — PUSH: đẩy local lên cloud
// ----------------------------------------------------------------------------
//  pushChanges(opts):
//    - silent=true  : PUSH NGẦM — chỉ kho "bẩn" (_dirty) + chỉ NĂM HIỆN TẠI.
//                     (gọi tự động sau khi save, debounce 800ms) → siêu tiết kiệm quota.
//    - silent=false : PUSH THỦ CÔNG — tất cả kho.
//        + allYears=true : đẩy MỌI NĂM có dữ liệu (sau import nhiều năm / sync tay).
//        + allYears=false: chỉ năm hiện tại.
//  Trả về true nếu đẩy xong (hoặc không cần đẩy), false nếu lỗi.
// ============================================================================
export async function pushChanges({ silent = false, allYears = false } = {}) {
  if (!fbReady()) return false;        // chưa cấu hình → giữ nguyên dirty, đẩy sau
  if (_syncing) return false;          // đang sync → tránh chạy chồng
  if (silent && _dirty.size === 0) return true; // ngầm mà không có gì bẩn → thôi

  _syncing = true;
  _emit('syncing');
  try {
    // Chọn danh sách kho cần đẩy.
    const stores = silent ? [..._dirty] : [...META_STORES, ...YEAR_STORES];

    for (const store of stores) {
      if (META_STORES.includes(store)) {
        await _pushMetaStore(store);
        continue;
      }
      // Kho theo năm: chọn (các) năm cần đẩy.
      const df = dateFieldOf(store);
      const localAll = await load(store, []);
      const years = allYears ? distinctYears(localAll, df) : [currentYear()];
      for (const y of years) await _pushYearStore(store, y);
    }

    _markSynced();
    _emit('ok');
    return true;
  } catch (e) {
    console.error('[sync] PUSH lỗi:', e);
    if (!silent) toast('Đẩy dữ liệu lên mây thất bại: ' + e.message, 'error');
    _emit('error');
    return false;
  } finally {
    _syncing = false;
  }
}

// ============================================================================
//  PHẦN 5 — PULL: tải cloud về, THAY THẾ lát năm ở local
// ----------------------------------------------------------------------------
//  pullChanges(year, cb):
//    - year=null  : kéo TẤT CẢ các năm đang có ở local.
//    - year=số    : chỉ kéo đúng năm đó (giữ nguyên các năm khác).
//  Doc cloud chưa có / sai định dạng → GIỮ NGUYÊN local (không xóa nhầm).
//  cb (tùy chọn): gọi sau khi pull xong để tầng trên reload biến toàn cục + render.
// ============================================================================
export async function pullChanges(year = null, cb = null) {
  if (!fbReady()) return false;
  if (_syncing) return false;

  _syncing = true;
  _emit('syncing');
  try {
    // 1) Kéo các kho NỀN trước (projects/categories/contracts… là gốc của mọi tab).
    for (const store of META_STORES) {
      // categories: document đối tượng (khóa `doc`) → gộp theo nhóm, không thay thế mảng.
      if (store === STORE.CATEGORIES) {
        const cloudWrap = await cloudGet(docMeta(store));
        if (cloudWrap && typeof cloudWrap.doc === 'object') {
          const localDoc = await load(store, {});
          await idbSet(store, mergeCategoryDocs(localDoc, cloudWrap.doc));
        }
        continue;
      }
      const cloudDoc = await cloudGet(docMeta(store));
      if (cloudDoc && Array.isArray(cloudDoc.records)) {
        // users: cloud không có mật khẩu → vá lại từ local để khỏi mất đăng nhập.
        if (store === STORE.USERS) {
          const localUsers = await load(store, []);
          await idbSet(store, reattachPasswords(cloudDoc.records, localUsers));
        } else {
          await idbSet(store, cloudDoc.records); // THAY THẾ toàn bộ (cloud là chuẩn)
        }
      }
      // cloud rỗng/sai → không đụng local
    }

    // 2) Kéo các kho THEO NĂM, thay thế từng lát năm.
    for (const store of YEAR_STORES) {
      const df = dateFieldOf(store);
      const localAll = await load(store, []);
      const years = (year !== null) ? [Number(year)] : distinctYears(localAll, df);

      let next = localAll;
      for (const y of years) {
        const cloudDoc = await cloudGet(docYearCat(y, store));
        if (cloudDoc && Array.isArray(cloudDoc.records)) {
          const rest = next.filter((r) => getRecordYear(r, df) !== Number(y));
          next = [...rest, ...cloudDoc.records]; // thay nguyên lát năm y
        }
        // cloud chưa có năm đó → giữ nguyên lát năm local
      }
      await idbSet(store, next);
    }

    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    if (typeof cb === 'function') cb();
    _emit('ok');
    return true;
  } catch (e) {
    console.error('[sync] PULL lỗi:', e);
    toast('Tải dữ liệu từ mây thất bại: ' + e.message, 'error');
    _emit('error');
    return false;
  } finally {
    _syncing = false;
  }
}

// ============================================================================
//  PHẦN 6 — LÊN LỊCH ĐẨY (debounce) + các cơ chế tự động chống mất dữ liệu
// ============================================================================

// schedulePush(storeName) — store.save() gọi hàm này sau mỗi lần ghi.
//  Ghi nhớ kho "bẩn" + đếm pending, rồi hẹn 800ms sau đẩy ngầm (gộp nhiều thao
//  tác liên tiếp thành 1 lượt đẩy → đỡ tốn quota).
export function schedulePush(storeName) {
  if (storeName) _dirty.add(storeName);
  _pending += 1;
  _emit();                         // báo UI cập nhật số thay đổi chờ đẩy

  if (!fbReady()) return;          // chưa cấu hình → chỉ nhớ dirty, đẩy khi sẵn sàng
  clearTimeout(_timer);
  _timer = setTimeout(() => { pushChanges({ silent: true }); }, 800);
}

// cancelScheduledPush() — Hủy lượt đẩy đang hẹn (ít dùng; vd trước khi pull tay).
export function cancelScheduledPush() {
  clearTimeout(_timer);
  _timer = null;
}

// manualSync(year) — Nút 🔄 Sync thủ công: đẩy pending → kéo năm đang xem → đẩy đầy đủ.
//  Trình tự này đảm bảo: không mất thay đổi local, năm đang xem khớp cloud, rồi
//  đẩy nốt mọi năm lên cho chắc.
export async function manualSync(year = currentYear()) {
  if (!fbReady()) { toast('Chưa cấu hình Firebase — đang chạy offline.', 'warning'); return false; }

  setLoading(true, 'Đang đồng bộ…');
  try {
    cancelScheduledPush();
    await pushChanges({ silent: false });            // 1) đẩy pending (năm hiện tại)
    await pullChanges(year);                          // 2) kéo năm đang xem về (cloud chuẩn)
    await pushChanges({ silent: false, allYears: true }); // 3) đẩy đầy đủ mọi năm
    toast('Đã đồng bộ xong.', 'success');
    return true;
  } catch (e) {
    console.error('[sync] manualSync lỗi:', e);
    toast('Đồng bộ thất bại: ' + e.message, 'error');
    return false;
  } finally {
    setLoading(false);
  }
}

// flushOnHide() — Khi ẩn/đóng tab (đặc biệt khóa màn hình mobile giữa lúc gõ): đẩy
//  nốt thay đổi. Chặn dồn dập tối đa 1 lần / 10 giây.
function flushOnHide() {
  if (!fbReady() || _dirty.size === 0) return;
  const now = Date.now();
  if (now - _lastFlush < 10000) return;
  _lastFlush = now;
  cancelScheduledPush();
  pushChanges({ silent: true }); // không await — tab có thể đóng ngay
}

// Gắn các sự kiện tự động (chỉ khi chạy trong trình duyệt).
if (typeof window !== 'undefined') {
  // Tab bị ẩn / điều hướng đi → đẩy nốt.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnHide();
  });
  window.addEventListener('pagehide', flushOnHide);
  // Có mạng trở lại → đẩy nốt những gì đã lưu lúc offline + cập nhật chấm trạng thái.
  window.addEventListener('online', () => {
    _emit();
    if (_dirty.size > 0) pushChanges({ silent: true });
  });
  // Mất mạng → chấm chuyển xám offline.
  window.addEventListener('offline', () => _emit('offline'));
}

// ----------------------------------------------------------------------------
//  ĐĂNG KÝ móc đẩy vào store.js: từ giờ mỗi save() sẽ tự gọi schedulePush().
//  (store.js cố tình KHÔNG import sync.js để tránh phụ thuộc vòng — nó chờ được
//   "cắm" hàm vào đây.) Chỉ cần import sync.js ở điểm khởi động app là kích hoạt.
// ----------------------------------------------------------------------------
setPushScheduler(schedulePush);
