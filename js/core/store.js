// ============================================================================
//  core/store.js  —  TẦNG HẠ TẦNG (Layer 1): Lớp đọc/ghi bản ghi nghiệp vụ
// ----------------------------------------------------------------------------
//  Đây là lớp NẰM TRÊN db.js. Trong khi db.js chỉ biết "đọc/ghi 1 cục blob theo
//  key", thì store.js hiểu về "BẢN GHI" (record) có 6 field hệ thống và lo:
//   - load()         : đọc cả kho ra (luôn an toàn, kho rỗng → trả mảng [] mặc định)
//   - save()         : ghi cả kho xuống IndexedDB + lên lịch đẩy đồng bộ (sync)
//   - createRecord() : tạo 1 bản ghi mới đã gắn sẵn 6 field hệ thống
//   - markUpdated()  : đóng dấu "vừa sửa" (cập nhật updatedAt + deviceId cho LWW)
//   - softDelete()   : XÓA MỀM (đặt deletedAt) — không xóa cứng để còn khôi phục
//   - restore()      : khôi phục bản ghi từ thùng rác
//   - upsert()       : thêm-mới-hoặc-cập-nhật 1 bản ghi trong mảng
//   - activeOnly()/deletedOnly()/getById() : lọc nhanh
//
//  6 FIELD HỆ THỐNG (mọi bản ghi giao dịch đều có):
//   id, createdAt, updatedAt, deletedAt, deviceId, projectId
// ============================================================================

import { DEVICE_ID, idbGet, idbSet } from './db.js';

// ----------------------------------------------------------------------------
//  MÓC ĐẨY ĐỒNG BỘ (push hook)
//  store.js KHÔNG import sync.js (tránh phụ thuộc vòng). Thay vào đó, khi sync.js
//  ra đời (P4) nó sẽ "cắm" hàm lên lịch đẩy của mình vào đây qua setPushScheduler().
//  Trước khi cắm, _pushScheduler = null → app vẫn chạy offline bình thường.
// ----------------------------------------------------------------------------
let _pushScheduler = null;

// sync.js gọi hàm này 1 lần lúc khởi động để đăng ký bộ lên lịch đẩy.
export function setPushScheduler(fn) {
  _pushScheduler = fn;
}

// ----------------------------------------------------------------------------
//  load(storeName, fallback) — Đọc toàn bộ dữ liệu của 1 kho.
//   - Kho dạng MẢNG (invoices, timesheets, advances...) → để fallback mặc định [].
//   - Kho dạng ĐỐI TƯỢNG (categories, contracts...)     → truyền fallback = {}.
//  Luôn trả về giá trị dùng được ngay, không bao giờ trả null.
// ----------------------------------------------------------------------------
export async function load(storeName, fallback = []) {
  const data = await idbGet(storeName);
  return data ?? fallback;
}

// ----------------------------------------------------------------------------
//  save(storeName, data) — Ghi ĐÈ toàn bộ dữ liệu của 1 kho xuống IndexedDB,
//  rồi LÊN LỊCH đẩy lên đám mây (nếu sync đã bật). Trả lại chính data đã ghi.
// ----------------------------------------------------------------------------
export async function save(storeName, data) {
  await idbSet(storeName, data);                 // 1) lưu local trước (offline-first)
  if (_pushScheduler) _pushScheduler(storeName); // 2) báo sync đẩy lên (debounce ở sync.js)
  return data;
}

// ----------------------------------------------------------------------------
//  createRecord(fields) — Tạo 1 bản ghi MỚI, tự gắn 5 field hệ thống chung.
//  Caller truyền phần nghiệp vụ + projectId qua tham số fields.
//  Ví dụ: createRecord({ projectId, date:'2026-06-05', amount:1500000 })
// ----------------------------------------------------------------------------
export function createRecord(fields = {}) {
  const now = Date.now();
  return {
    id:        crypto.randomUUID(), // mã duy nhất toàn cục
    createdAt: now,                 // thời điểm tạo (không đổi về sau)
    updatedAt: now,                 // thời điểm sửa gần nhất (LWW dùng field này)
    deletedAt: null,                // null = còn dùng | số = đã xóa mềm
    deviceId:  DEVICE_ID,           // máy nào tạo/sửa gần nhất
    ...fields,                      // projectId + dữ liệu nghiệp vụ do caller đưa vào
  };
}

// ----------------------------------------------------------------------------
//  markUpdated(record) — Đóng dấu "vừa được sửa": cập nhật updatedAt + deviceId.
//  Phải gọi MỖI KHI sửa nội dung 1 bản ghi để đồng bộ LWW so đúng bản mới nhất.
//  Sửa thẳng trên object truyền vào và trả lại nó (tiện gọi nối chuỗi).
// ----------------------------------------------------------------------------
export function markUpdated(record) {
  record.updatedAt = Date.now();
  record.deviceId  = DEVICE_ID;
  return record;
}

// ----------------------------------------------------------------------------
//  softDelete(record) — XÓA MỀM: đặt deletedAt = bây giờ. Bản ghi vẫn nằm trong
//  kho (để đồng bộ "tombstone" và để khôi phục), nhưng được coi là đã xóa.
// ----------------------------------------------------------------------------
export function softDelete(record) {
  record.deletedAt = Date.now();
  return markUpdated(record); // xóa cũng là 1 lần "sửa" → cập nhật mốc LWW
}

// ----------------------------------------------------------------------------
//  restore(record) — Khôi phục bản ghi từ thùng rác (bỏ dấu deletedAt).
// ----------------------------------------------------------------------------
export function restore(record) {
  record.deletedAt = null;
  return markUpdated(record);
}

// ----------------------------------------------------------------------------
//  upsert(records, record) — Thêm mới NẾU chưa có, hoặc cập nhật NẾU đã có
//  (so theo id). Trả về chính mảng đã chỉnh để tiện gọi save() ngay sau đó.
// ----------------------------------------------------------------------------
export function upsert(records, record) {
  const list = records || [];
  const i = list.findIndex((r) => r.id === record.id);
  if (i >= 0) list[i] = record; // đã tồn tại → ghi đè
  else list.push(record);       // chưa có → thêm vào cuối
  return list;
}

// ----------------------------------------------------------------------------
//  Bộ lọc nhanh dùng khắp nơi:
//   - activeOnly()  : các bản ghi CÒN dùng (chưa xóa mềm) — dùng để hiển thị bảng.
//   - deletedOnly() : các bản ghi ĐÃ xóa mềm — dùng để hiển thị Thùng rác.
//   - getById()     : tìm 1 bản ghi theo id.
// ----------------------------------------------------------------------------
export function activeOnly(records) {
  return (records || []).filter((r) => !r.deletedAt);
}

export function deletedOnly(records) {
  return (records || []).filter((r) => r.deletedAt);
}

export function getById(records, id) {
  return (records || []).find((r) => r.id === id) || null;
}
