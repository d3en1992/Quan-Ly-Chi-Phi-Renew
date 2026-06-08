// ============================================================================
//  modules/auth/auth.data.js  —  TẦNG DỮ LIỆU LÕI (Layer 3): Dữ liệu tài khoản
// ----------------------------------------------------------------------------
//  NHIỆM VỤ: Lo phần "DỮ LIỆU" của đăng nhập — KHÔNG đụng tới giao diện:
//    - Băm (hash) mật khẩu bằng SHA-256 (Web Crypto) → KHÔNG bao giờ lưu mật khẩu thô.
//    - Đọc/ghi danh sách tài khoản trong IndexedDB (kho STORE.USERS).
//    - Tạo sẵn 3 tài khoản mặc định (admin / giám đốc / kế toán) lần đầu chạy.
//    - Chuẩn hóa bản ghi user + gộp (merge) khi đồng bộ nhiều máy (bảo vệ mật khẩu local).
//
//  QUY ƯỚC QUAN TRỌNG (khớp core/sync.js):
//    - Mật khẩu (đã băm) lưu ở field tên `password`. Khi đồng bộ, sync.js TỰ ĐỘNG
//      GỠ field `password` trước khi đẩy lên đám mây → mật khẩu CHỈ nằm trên máy,
//      không bao giờ rời thiết bị. Danh sách user (tên, vai trò) vẫn đồng bộ bình thường.
//
//  GỢI Ý BẢO MẬT: SHA-256 chỉ là rào chắn cơ bản (chống lộ mật khẩu thô trong DB
//  trình duyệt). Đây là app nội bộ; tài khoản mặc định bên dưới NÊN được đổi mật khẩu
//  sau lần đăng nhập đầu.
// ============================================================================

import { STORE, DEVICE_ID } from '../../core/db.js';
import { load, save, createRecord, markUpdated, activeOnly } from '../../core/store.js';

// 3 vai trò hợp lệ — nguồn sự thật để chuẩn hóa (giá trị lạ → ép về 'ketoan' an toàn nhất).
export const VALID_ROLES = ['admin', 'giamdoc', 'ketoan'];

// ----------------------------------------------------------------------------
//  3 TÀI KHOẢN MẶC ĐỊNH — tạo sẵn lần đầu mở app để có thể đăng nhập ngay.
//  (Mật khẩu ghi dạng THÔ ở đây chỉ để BĂM lúc khởi tạo; sau khi băm sẽ không
//   còn lưu lại bản thô. Người dùng nên đổi mật khẩu sau lần đăng nhập đầu.)
// ----------------------------------------------------------------------------
export const DEFAULT_ACCOUNTS = [
  { username: 'admin',   displayName: 'Quản trị viên', role: 'admin',   pass: 'admin123' },
  { username: 'giamdoc', displayName: 'Giám đốc',      role: 'giamdoc', pass: 'giamdoc123' },
  { username: 'ketoan',  displayName: 'Kế toán',       role: 'ketoan',  pass: 'ketoan123' },
];

// ----------------------------------------------------------------------------
//  hashPassword(plain) — Băm mật khẩu thô → chuỗi HEX 64 ký tự (SHA-256).
//  Dùng Web Crypto API có sẵn trong trình duyệt (không cần thư viện ngoài).
//  Cùng 1 input luôn cho cùng 1 output → so khớp được khi đăng nhập.
// ----------------------------------------------------------------------------
export async function hashPassword(plain) {
  const bytes = new TextEncoder().encode(String(plain ?? ''));   // chuỗi → mảng byte
  const digest = await crypto.subtle.digest('SHA-256', bytes);   // băm SHA-256
  // Đổi mảng byte kết quả sang chuỗi HEX để lưu/so sánh cho gọn.
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ----------------------------------------------------------------------------
//  checkPassword(plain, hash) — Kiểm tra mật khẩu thô có khớp chuỗi băm đã lưu không.
//  Trả về true/false. (Băm lại mật khẩu vừa nhập rồi so với hash lưu trong DB.)
// ----------------------------------------------------------------------------
export async function checkPassword(plain, hash) {
  if (!hash) return false;                 // user chưa có mật khẩu → không cho qua
  return (await hashPassword(plain)) === hash;
}

// ----------------------------------------------------------------------------
//  normalizeUserRecord(u) — Đảm bảo 1 bản ghi user có ĐỦ field & đúng kiểu.
//  Dùng khi đọc từ DB / nhận từ cloud (dữ liệu có thể thiếu field do version cũ).
// ----------------------------------------------------------------------------
export function normalizeUserRecord(u = {}) {
  return {
    id:          u.id || crypto.randomUUID(),
    username:    String(u.username ?? '').trim().toLowerCase(), // tên đăng nhập: thường hóa để so khớp
    displayName: u.displayName || u.username || '',            // tên hiển thị trên giao diện
    role:        VALID_ROLES.includes(u.role) ? u.role : 'ketoan',
    password:    u.password || '',          // CHUỖI BĂM (không phải mật khẩu thô); rỗng nếu chưa đặt
    createdAt:   u.createdAt || Date.now(),
    updatedAt:   u.updatedAt || Date.now(), // LWW dùng field này khi gộp nhiều máy
    deletedAt:   u.deletedAt ?? null,       // xóa mềm tài khoản
    deviceId:    u.deviceId || DEVICE_ID,
    lastActive:  u.lastActive || 0,         // mốc hoạt động gần nhất (heartbeat phiên)
  };
}

// ----------------------------------------------------------------------------
//  createUser({ username, displayName, role, password }) — Tạo 1 tài khoản mới.
//  `password` truyền vào là MẬT KHẨU THÔ → được băm trước khi lưu.
// ----------------------------------------------------------------------------
export async function createUser({ username, displayName, role, password }) {
  const rec = createRecord({
    username:    String(username ?? '').trim().toLowerCase(),
    displayName: displayName || username || '',
    role:        VALID_ROLES.includes(role) ? role : 'ketoan',
    password:    await hashPassword(password),
    lastActive:  0,
  });
  return normalizeUserRecord(rec);
}

// ----------------------------------------------------------------------------
//  seedDefaultAccounts() — Sinh 3 bản ghi tài khoản mặc định (đã băm mật khẩu).
//  Chỉ gọi khi kho USERS đang RỖNG (xem loadUsers).
// ----------------------------------------------------------------------------
async function seedDefaultAccounts() {
  const out = [];
  for (const a of DEFAULT_ACCOUNTS) {
    out.push(await createUser({ username: a.username, displayName: a.displayName, role: a.role, password: a.pass }));
  }
  return out;
}

// ----------------------------------------------------------------------------
//  loadUsers() — Đọc danh sách tài khoản từ IndexedDB (đã chuẩn hóa).
//  Lần đầu (kho rỗng) → tạo sẵn 3 tài khoản mặc định và lưu lại.
// ----------------------------------------------------------------------------
export async function loadUsers() {
  let arr = await load(STORE.USERS, []);
  if (!Array.isArray(arr) || arr.length === 0) {
    arr = await seedDefaultAccounts();
    await save(STORE.USERS, arr); // lưu xuống IDB (sync sẽ tự gỡ mật khẩu khi đẩy mây)
    return arr;
  }
  return arr.map(normalizeUserRecord);
}

// ----------------------------------------------------------------------------
//  saveUsers(arr) — Lưu danh sách tài khoản (chuẩn hóa trước khi ghi).
//  Đi qua store.save → ghi IDB + lên lịch đẩy đồng bộ (mật khẩu được sync gỡ lại).
// ----------------------------------------------------------------------------
export async function saveUsers(arr) {
  const clean = (arr || []).map(normalizeUserRecord);
  await save(STORE.USERS, clean);
  return clean;
}

// ----------------------------------------------------------------------------
//  findUserByUsername(users, username) — Tìm 1 tài khoản CÒN dùng theo tên đăng nhập.
//  So khớp không phân biệt hoa/thường (đã thường hóa username). Không thấy → null.
// ----------------------------------------------------------------------------
export function findUserByUsername(users, username) {
  const key = String(username ?? '').trim().toLowerCase();
  if (!key) return null;
  return activeOnly(users).find((u) => u.username === key) || null;
}

// ----------------------------------------------------------------------------
//  touchLastActive(user, users) — Cập nhật mốc hoạt động gần nhất của 1 user.
//  Trả về mảng users đã chỉnh (chưa lưu — caller tự gọi saveUsers nếu cần).
// ----------------------------------------------------------------------------
export function touchLastActive(user, users) {
  const u = (users || []).find((x) => x.id === user.id);
  if (u) { u.lastActive = Date.now(); markUpdated(u); }
  return users;
}

// ----------------------------------------------------------------------------
//  mergeUsers(local, cloud) — Gộp danh sách user local + cloud theo LWW (updatedAt),
//  NHƯNG luôn GIỮ mật khẩu local (cloud không mang mật khẩu) để không mất đăng nhập.
//  (core/sync.js cũng tự xử lý việc này; hàm đây để tab/quản trị dùng độc lập khi cần.)
// ----------------------------------------------------------------------------
export function mergeUsers(local, cloud) {
  const byId = new Map();
  for (const u of (local || [])) byId.set(String(u.id), normalizeUserRecord(u));
  for (const c of (cloud || [])) {
    const id = String(c.id);
    const l = byId.get(id);
    // Cloud thắng khi MỚI hơn (hoặc chưa có ở local); luôn vá mật khẩu từ local nếu cloud trống.
    if (!l || (c.updatedAt || 0) > (l.updatedAt || 0)) {
      byId.set(id, normalizeUserRecord({ ...c, password: c.password || l?.password || '' }));
    }
  }
  return [...byId.values()];
}

// ----------------------------------------------------------------------------
//  getDeviceId() — Trả mã thiết bị (tiện cho lớp UI/quản trị gọi mà khỏi import db.js).
// ----------------------------------------------------------------------------
export function getDeviceId() {
  return DEVICE_ID;
}
