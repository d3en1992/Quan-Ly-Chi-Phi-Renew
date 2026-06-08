// ============================================================================
//  app.js  —  TẦNG KHUNG APP (Layer 8): ĐIỂM KHỞI ĐỘNG DUY NHẤT của ứng dụng
// ----------------------------------------------------------------------------
//  NHIỆM VỤ: Ráp toàn bộ khung lại và quyết định người dùng thấy gì:
//    1) Khởi động → khôi phục phiên cũ (initAuth).
//    2) CHƯA đăng nhập → hiện MÀN HÌNH ĐĂNG NHẬP (mountLoginForm).
//    3) ĐÃ đăng nhập   → hiện MÀN HÌNH APP: thanh công cụ (topbar) + điều hướng
//       tab (router) + nội dung tab. Đăng xuất thì quay lại bước 2.
//
//  Đây là file DUY NHẤT được index.html nạp (<script type="module" src="js/app.js">).
//  Mọi thứ khác được kéo vào qua import — không dùng biến toàn cục.
//
//  GIAI ĐOẠN SKELETON (Sprint 1): các tab còn trống (router hiện khung tạm). Mục
//  tiêu: mở app → đăng nhập → bấm chuyển tab mượt, KHÔNG lỗi console.
// ============================================================================

import { initAuth, mountLoginForm, logout, syncAuthUI,
         startSessionHeartbeat, stopSessionHeartbeat } from './modules/auth/auth.ui.js';
import { startRoleObserver } from './modules/auth/auth.roles.js';
import { mountTopbar, getSelectedYear } from './topbar.js';
import { startRouter, navigate, getActiveTab } from './router.js';

// Nạp các MODULE TAB để chúng tự đăng ký hàm vẽ vào router (side-effect import).
// Thêm dần từng tab ở mỗi sprint. Hiện có: Công trình (P10), Danh mục (P12), Hóa đơn (P14).
import './modules/projects/projects.list.js';
import './modules/danhmuc/danhmuc.ui.js';
import './modules/hoadon/hoadon.ui.js';
import './modules/chamcong/chamcong.ui.js';
import './modules/tienung/tienung.ui.js';
import './modules/doanhthu/doanhthu.ui.js';
import './modules/thietbi/thietbi.ui.js';
import './modules/dashboard/dashboard.ui.js';
import './modules/nhapxuat/nhapxuat.ui.js';

// Các ô DOM chính trong index.html (app.js tự dựng nội dung vào).
let _root, _loginScreen, _appScreen, _topbarHost, _contentHost;

// ----------------------------------------------------------------------------
//  buildShell() — Dựng KHUNG DOM rỗng 1 lần: 2 màn hình (login / app) + các ô
//  để topbar và router cắm vào. Giữ tham chiếu để bật/tắt nhanh khi vào/ra.
// ----------------------------------------------------------------------------
function buildShell() {
  _root = document.getElementById('app-root');
  _root.innerHTML = `
    <!-- MÀN HÌNH ĐĂNG NHẬP: căn giữa, gọn cho di động -->
    <div data-screen="login" class="min-vh-100 d-flex align-items-center justify-content-center p-3 bg-light">
      <div class="card shadow-sm" style="max-width:380px;width:100%;">
        <div class="card-body">
          <h1 class="h5 text-center mb-1">🏗️ Quản Lý Chi Phí Công Trình</h1>
          <p class="text-center text-muted small mb-4">Đăng nhập để tiếp tục</p>
          <div data-login-host></div>
        </div>
      </div>
    </div>

    <!-- MÀN HÌNH APP: topbar (tự chứa sidebar offcanvas + thanh dưới) + nội dung tab -->
    <div data-screen="app" class="d-none min-vh-100 d-flex flex-column bg-light">
      <div data-topbar-host></div>
      <main class="app-main flex-grow-1 container-fluid py-3"><div data-content-host></div></main>
    </div>`;

  _loginScreen = _root.querySelector('[data-screen="login"]');
  _appScreen   = _root.querySelector('[data-screen="app"]');
  _topbarHost  = _root.querySelector('[data-topbar-host]');
  _contentHost = _root.querySelector('[data-content-host]');
}

// ----------------------------------------------------------------------------
//  showLogin() — Hiện màn hình đăng nhập, ẩn màn hình app. Dựng lại form đăng nhập;
//  đăng nhập THÀNH CÔNG → chuyển sang màn hình app.
// ----------------------------------------------------------------------------
function showLogin() {
  _appScreen.classList.add('d-none');
  _loginScreen.classList.remove('d-none');
  mountLoginForm(_loginScreen.querySelector('[data-login-host]'), () => showApp());
}

// ----------------------------------------------------------------------------
//  showApp() — Hiện màn hình app (đã đăng nhập):
//    - Dựng topbar (ô chọn năm, nút đồng bộ, người dùng, đăng xuất).
//    - Khởi động router (thanh tab + nội dung).
//    - Đồng bộ giao diện theo phiên + bật "nhịp tim" phiên.
// ----------------------------------------------------------------------------
function showApp() {
  _loginScreen.classList.add('d-none');
  _appScreen.classList.remove('d-none');

  // Thanh công cụ: đổi năm thì vẽ lại tab đang xem; bấm thoát thì đăng xuất.
  // mountTopbar tự dựng sidebar offcanvas chứa [data-nav-host] bên trong.
  mountTopbar(_topbarHost, {
    onYearChange: () => navigate(getActiveTab()),
    onLogout: handleLogout,
  });

  // Lấy nav-host từ bên trong offcanvas (topbar.js vừa dựng) rồi khởi động router.
  const navHost = _topbarHost.querySelector('[data-nav-host]');
  startRouter({ navHost, contentHost: _contentHost });

  // Cập nhật tên/vai trò + ẩn/hiện theo quyền, rồi bật nhịp tim phiên.
  syncAuthUI(_appScreen);
  startSessionHeartbeat();

  // Ghi chú: getSelectedYear() có sẵn cho các module tab dùng ở sprint sau.
  void getSelectedYear;
}

// ----------------------------------------------------------------------------
//  handleLogout() — Đăng xuất: dừng nhịp tim, xóa phiên, quay về form đăng nhập.
// ----------------------------------------------------------------------------
function handleLogout() {
  stopSessionHeartbeat();
  logout();
  showLogin();
}

// ----------------------------------------------------------------------------
//  start() — Trình tự khởi động app khi trang đã sẵn sàng.
// ----------------------------------------------------------------------------
async function start() {
  buildShell();
  startRoleObserver();                 // tự áp lại phân quyền khi DOM đổi (tab/nút mới)

  const dangNhap = await initAuth();   // còn phiên cũ hợp lệ?
  if (dangNhap) showApp();
  else showLogin();
}

// Chạy khi DOM sẵn sàng (script type=module mặc định defer nên thường đã xong).
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
