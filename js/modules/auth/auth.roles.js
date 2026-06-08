// ============================================================================
//  modules/auth/auth.roles.js  —  TẦNG ĐĂNG NHẬP (Layer 4): Phân quyền theo vai trò
// ----------------------------------------------------------------------------
//  NHIỆM VỤ: Quyết định AI ĐƯỢC THẤY/LÀM GÌ theo vai trò, và ẨN/HIỆN nút & tab
//  trên giao diện cho khớp. Gom TẬP TRUNG ở đây — KHÔNG rải logic phân quyền khắp nơi.
//
//  3 VAI TRÒ:  admin (Quản trị) · giamdoc (Giám đốc) · ketoan (Kế toán).
//
//  MA TRẬN QUYỀN (rút từ thiết kế các tab):
//    - Mọi vai trò: xem & nhập/sửa/xóa các nghiệp vụ chính (công trình, hóa đơn,
//      chấm công, tiền ứng, thiết bị, danh mục).
//    - Doanh Thu & Dashboard:           CHỈ admin + giamdoc  (ketoan KHÔNG thấy).
//    - Tools / Danh mục nâng cao:       CHỈ admin.
//  → Quy ước: quyền NÀO KHÔNG khai báo hạn chế thì MẶC ĐỊNH mọi vai trò đều có.
//
//  CÁCH HOẠT ĐỘNG VỚI GIAO DIỆN:
//    Phần tử nào cần kiểm soát chỉ cần gắn thuộc tính:
//       <a data-perm="viewDashboard">…</a>     → ẩn nếu vai trò không có quyền "viewDashboard".
//       <button data-role="admin,giamdoc">…</button> → ẩn nếu vai trò không nằm trong danh sách.
//    Rồi gọi applyRoleUI() (hoặc để startRoleObserver() tự chạy lại khi DOM đổi).
//
//  TRÁNH PHỤ THUỘC VÒNG: file này KHÔNG import auth.ui.js. Vai trò hiện tại được
//  auth.ui.js "đẩy vào" qua setCurrentRole() mỗi khi đăng nhập/đăng xuất.
// ============================================================================

// Nhãn tiếng Việt của từng vai trò (hiển thị trên giao diện).
export const ROLE_LABELS = {
  admin:   'Quản trị',
  giamdoc: 'Giám đốc',
  ketoan:  'Kế toán',
};

// ----------------------------------------------------------------------------
//  PERM_ROLES — Bảng quyền BỊ HẠN CHẾ → danh sách vai trò ĐƯỢC PHÉP.
//  Quyền không có trong bảng này = mặc định MỌI vai trò đều có (nghiệp vụ chung).
// ----------------------------------------------------------------------------
export const PERM_ROLES = {
  viewDashboard: ['admin', 'giamdoc'],  // xem tab Dashboard
  viewDoanhThu:  ['admin', 'giamdoc'],  // xem tab Doanh Thu + nút Doanh Thu trong CT
  manageTools:   ['admin'],             // khu vực Tools / Danh mục nâng cao
};

// ----------------------------------------------------------------------------
//  VAI TRÒ HIỆN TẠI — giữ riêng ở đây (auth.ui đẩy vào) để né phụ thuộc vòng.
// ----------------------------------------------------------------------------
let _currentRole = null;

// auth.ui.js gọi mỗi khi đăng nhập (truyền role) / đăng xuất (truyền null).
export function setCurrentRole(role) {
  _currentRole = role || null;
}
export function getCurrentRole() {
  return _currentRole;
}

// ----------------------------------------------------------------------------
//  hasPermission(perm, role) — Vai trò `role` có quyền `perm` không?
//   - role bỏ trống → dùng vai trò đang đăng nhập.
//   - Chưa đăng nhập (role null) → không có quyền gì.
//   - perm không khai báo hạn chế → mọi vai trò đều có (true).
// ----------------------------------------------------------------------------
export function hasPermission(perm, role = _currentRole) {
  if (!role) return false;
  const allowed = PERM_ROLES[perm];
  if (!allowed) return true;          // quyền chung → ai cũng có
  return allowed.includes(role);
}

// ----------------------------------------------------------------------------
//  getRoleLabel(role) — Lấy nhãn tiếng Việt của vai trò (mặc định: vai trò hiện tại).
// ----------------------------------------------------------------------------
export function getRoleLabel(role = _currentRole) {
  return ROLE_LABELS[role] || '';
}

// ----------------------------------------------------------------------------
//  applyPermissions(root) — LÕI ẩn/hiện: quét mọi phần tử có [data-perm] hoặc
//  [data-role] trong `root`, bật/tắt class .d-none của Bootstrap theo vai trò hiện tại.
//   - data-perm="x"        : hiện nếu hasPermission('x').
//   - data-role="a,b"      : hiện nếu vai trò hiện tại nằm trong danh sách a,b.
//  Cũng ghi vai trò lên <body data-role="..."> để CSS/khác có thể móc vào nếu cần.
// ----------------------------------------------------------------------------
function applyPermissions(root = document) {
  if (document.body) document.body.dataset.role = _currentRole || '';

  // Theo QUYỀN (data-perm).
  root.querySelectorAll('[data-perm]').forEach((el) => {
    el.classList.toggle('d-none', !hasPermission(el.dataset.perm));
  });

  // Theo DANH SÁCH VAI TRÒ trực tiếp (data-role="admin,giamdoc").
  root.querySelectorAll('[data-role]').forEach((el) => {
    if (el === document.body) return; // bỏ qua chính <body> (ta vừa set data-role lên nó)
    const roles = el.dataset.role.split(',').map((s) => s.trim()).filter(Boolean);
    const visible = !!_currentRole && roles.includes(_currentRole);
    el.classList.toggle('d-none', !visible);
  });
}

// ----------------------------------------------------------------------------
//  applyRoleUI(root) — Áp phân quyền cho các NÚT/khu chức năng (gọi sau khi render UI).
//  applyNavPermissions(root) — Áp phân quyền cho thanh điều hướng (TAB).
//  Cùng dùng chung 1 lõi (data-perm/data-role) nên để 2 tên cho đúng ngữ nghĩa nơi gọi.
// ----------------------------------------------------------------------------
export function applyRoleUI(root = document) {
  applyPermissions(root);
}
export function applyNavPermissions(root = document) {
  applyPermissions(root);
}

// ----------------------------------------------------------------------------
//  startRoleObserver() — Theo dõi DOM: khi có phần tử mới được thêm (vd: render tab),
//  tự động áp lại phân quyền để nút/tab mới cũng được ẩn/hiện đúng.
//  Chỉ quan sát childList (thêm/bớt node) — KHÔNG quan sát class → tránh tự kích vô hạn
//  (applyPermissions chỉ đổi class). Trả về observer để caller tắt khi cần (disconnect).
// ----------------------------------------------------------------------------
let _observer = null;
export function startRoleObserver() {
  if (_observer) return _observer;       // đã chạy → không tạo trùng
  _observer = new MutationObserver(() => applyRoleUI());
  _observer.observe(document.body, { childList: true, subtree: true });
  return _observer;
}
