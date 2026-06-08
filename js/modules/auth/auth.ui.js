// ============================================================================
//  modules/auth/auth.ui.js  —  TẦNG ĐĂNG NHẬP (Layer 4): Giao diện xác thực + Phiên
// ----------------------------------------------------------------------------
//  NHIỆM VỤ: Phần "NGƯỜI DÙNG NHÌN THẤY" của đăng nhập:
//    - Dựng FORM đăng nhập (tên + mật khẩu) và xử lý bấm Đăng nhập.
//    - Giữ PHIÊN làm việc: nhớ ai đang đăng nhập (localStorage) để mở lại app khỏi gõ lại.
//    - Đăng xuất, lấy user hiện tại, cập nhật header, "nhịp tim" phiên (lastActive).
//    - Bắc cầu sang phân quyền: mỗi lần đăng nhập/đăng xuất đẩy vai trò vào auth.roles.
//
//  PHÂN TÁCH: file này lo GIAO DIỆN + PHIÊN; logic dữ liệu (băm, đọc/ghi user) nằm ở
//  auth.data.js; logic ẩn/hiện theo quyền nằm ở auth.roles.js.
// ============================================================================

import { loadUsers, checkPassword, findUserByUsername, saveUsers, touchLastActive } from './auth.data.js';
import { setCurrentRole, applyRoleUI, getRoleLabel } from './auth.roles.js';
import { toast } from '../../utils/ui.js';

// Khóa lưu PHIÊN trong localStorage: chỉ lưu ID người đang đăng nhập (KHÔNG lưu mật khẩu).
const SESSION_KEY = 'cpct_session';

// User đang đăng nhập (giữ trong bộ nhớ runtime). null = chưa đăng nhập.
let _currentUser = null;
let _heartbeatTimer = null;

// ----------------------------------------------------------------------------
//  setSession(user) / clearSession() — Ghi/nhớ ai đang đăng nhập qua localStorage.
//  Cập nhật luôn vai trò sang auth.roles để phân quyền dùng được ngay.
// ----------------------------------------------------------------------------
function setSession(user) {
  _currentUser = user;
  localStorage.setItem(SESSION_KEY, user.id);
  setCurrentRole(user.role);
}
function clearSession() {
  _currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  setCurrentRole(null);
}

// ----------------------------------------------------------------------------
//  initAuth() — Gọi lúc khởi động app: khôi phục phiên cũ (nếu có).
//  Trả về true nếu đang có phiên hợp lệ (đã đăng nhập), false nếu cần hiện form.
// ----------------------------------------------------------------------------
export async function initAuth() {
  const savedId = localStorage.getItem(SESSION_KEY);
  if (!savedId) return false;

  const users = await loadUsers();
  const user = users.find((u) => u.id === savedId && !u.deletedAt); // phiên trỏ tới user còn dùng?
  if (!user) { clearSession(); return false; }                       // user bị xóa → bỏ phiên

  _currentUser = user;
  setCurrentRole(user.role);
  return true;
}

// ----------------------------------------------------------------------------
//  login(username, pass) — Thử đăng nhập.
//  Trả về { ok, user?, reason?, message } để nơi gọi tự xử lý (KHÔNG ném lỗi):
//    - reason='notfound'  : không có tài khoản tên đó.
//    - reason='wrongpass' : sai mật khẩu.
//  Thành công → lưu phiên + cập nhật lastActive.
// ----------------------------------------------------------------------------
export async function login(username, pass) {
  const users = await loadUsers();
  const user = findUserByUsername(users, username);
  if (!user) return { ok: false, reason: 'notfound', message: 'Tài khoản không tồn tại' };

  const ok = await checkPassword(pass, user.password);
  if (!ok) return { ok: false, reason: 'wrongpass', message: 'Sai mật khẩu' };

  setSession(user);
  touchLastActive(user, users);
  await saveUsers(users);        // ghi lại mốc hoạt động
  return { ok: true, user };
}

// ----------------------------------------------------------------------------
//  logout() — Đăng xuất: xóa phiên + dừng nhịp tim. (Nơi gọi tự quyết hiện lại form.)
// ----------------------------------------------------------------------------
export function logout() {
  clearSession();
  stopSessionHeartbeat();
}

// ----------------------------------------------------------------------------
//  getCurrentUser() / getCurrentRole() / canEdit() — Truy vấn nhanh trạng thái phiên.
//  canEdit(): cả 3 vai trò đều được nhập/sửa nghiệp vụ → chỉ cần đã đăng nhập là true.
// ----------------------------------------------------------------------------
export function getCurrentUser() {
  return _currentUser;
}
export function getCurrentRole() {
  return _currentUser ? _currentUser.role : null;
}
export function canEdit() {
  return !!_currentUser;
}

// ----------------------------------------------------------------------------
//  syncAuthUI(root) — Cập nhật giao diện theo phiên hiện tại:
//    - Đổ tên + nhãn vai trò vào các ô [data-user-name] / [data-user-role].
//    - Ẩn/hiện vùng [data-when="auth"] (chỉ khi đã đăng nhập) và [data-when="guest"].
//    - Áp phân quyền (applyRoleUI) để nút/tab hiện đúng theo vai trò.
//  Viết "phòng thủ": phần tử nào không có thì bỏ qua (khung topbar đầy đủ làm ở P8).
// ----------------------------------------------------------------------------
export function syncAuthUI(root = document) {
  const u = _currentUser;
  root.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = u ? u.displayName : ''; });
  root.querySelectorAll('[data-user-role]').forEach((el) => { el.textContent = u ? getRoleLabel(u.role) : ''; });

  root.querySelectorAll('[data-when="auth"]').forEach((el) => el.classList.toggle('d-none', !u));
  root.querySelectorAll('[data-when="guest"]').forEach((el) => el.classList.toggle('d-none', !!u));

  applyRoleUI(root);
}

// ----------------------------------------------------------------------------
//  startSessionHeartbeat() — Cứ mỗi phút, đóng dấu "còn hoạt động" cho user hiện tại.
//  (Phục vụ thống kê/đăng xuất tự động sau này.) stopSessionHeartbeat() để dừng.
// ----------------------------------------------------------------------------
export function startSessionHeartbeat() {
  stopSessionHeartbeat();
  _heartbeatTimer = setInterval(async () => {
    if (!_currentUser) return;
    const users = await loadUsers();
    touchLastActive(_currentUser, users);
    await saveUsers(users);
  }, 60000); // 60 giây/lần
}
export function stopSessionHeartbeat() {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
}

// ----------------------------------------------------------------------------
//  mountLoginForm(container, onSuccess) — Dựng FORM đăng nhập vào `container`.
//  Gõ tên + mật khẩu → Đăng nhập. Sai → viền đỏ + toast báo lỗi. Đúng → gọi onSuccess(user)
//  và tự cập nhật giao diện theo phiên. Trả về hàm gỡ form (dọn khi không cần).
// ----------------------------------------------------------------------------
export function mountLoginForm(container, onSuccess = () => {}) {
  container.innerHTML = `
    <form class="sg-login" autocomplete="off" novalidate>
      <div class="mb-3">
        <label class="form-label small mb-1">Tên đăng nhập</label>
        <input name="username" class="form-control" placeholder="admin / giamdoc / ketoan" autocomplete="username" />
      </div>
      <div class="mb-3">
        <label class="form-label small mb-1">Mật khẩu</label>
        <input name="password" type="password" class="form-control" autocomplete="current-password" />
      </div>
      <div class="invalid-feedback d-block text-danger small mb-2" data-login-error style="min-height:1.2em"></div>
      <button type="submit" class="btn btn-primary w-100">Đăng nhập</button>
    </form>
  `;

  const form = container.querySelector('form');
  const errEl = form.querySelector('[data-login-error]');
  const userInp = form.querySelector('[name="username"]');
  const passInp = form.querySelector('[name="password"]');

  const showError = (msg, focusEl) => {
    errEl.textContent = msg;
    userInp.classList.toggle('is-invalid', focusEl === userInp);
    passInp.classList.toggle('is-invalid', focusEl === passInp);
    if (focusEl) focusEl.focus();
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    userInp.classList.remove('is-invalid');
    passInp.classList.remove('is-invalid');

    const res = await login(userInp.value, passInp.value);
    if (!res.ok) {
      // notfound → nhắc ở ô tên; wrongpass → nhắc ở ô mật khẩu.
      showError(res.message, res.reason === 'notfound' ? userInp : passInp);
      toast(res.message, 'danger');
      return;
    }
    toast('Đăng nhập thành công: ' + res.user.displayName, 'success');
    syncAuthUI();
    startSessionHeartbeat();
    onSuccess(res.user);
  };

  form.addEventListener('submit', onSubmit);
  return function unmount() {
    form.removeEventListener('submit', onSubmit);
    container.innerHTML = '';
  };
}
