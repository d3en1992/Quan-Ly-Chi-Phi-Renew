// ============================================================================
//  router.js  —  TẦNG KHUNG APP (Layer 8): Điều hướng giữa các TAB
// ----------------------------------------------------------------------------
//  NHIỆM VỤ: Quản lý việc "đang xem tab nào" và vẽ nội dung tab đó ra màn hình.
//    - Khai báo DANH SÁCH TAB của app (id + nhãn + quyền xem nếu có).
//    - Dựng thanh điều hướng (nav) — bấm 1 tab → chuyển sang tab đó.
//    - Cho mỗi module ĐĂNG KÝ hàm vẽ của mình (registerTab); chưa có thì hiện
//      khung tạm "đang xây dựng" (đúng tinh thần SKELETON của Sprint 1).
//    - Đồng bộ với thanh địa chỉ (#hash) để F5 vẫn ở đúng tab; tôn trọng phân
//      quyền: tab nào vai trò không được xem thì tự bỏ qua.
//
//  PHÂN QUYỀN: mỗi nút tab gắn data-perm (nếu có) → auth.roles tự ẩn/hiện. Router
//  cũng tự né khi điều hướng tới tab đang bị ẩn (nhảy về tab hợp lệ đầu tiên).
// ============================================================================

import { hasPermission } from './modules/auth/auth.roles.js';

// ----------------------------------------------------------------------------
//  TABS — DANH SÁCH TAB của app (đúng thứ tự hiển thị trên thanh điều hướng).
//   - id   : mã tab (dùng cho #hash + đăng ký hàm vẽ).
//   - label: nhãn tiếng Việt hiện trên nút.
//   - perm : (tùy chọn) quyền cần có để THẤY tab. Bỏ trống = mọi vai trò đều thấy.
//  Quyền lấy từ auth.roles: viewDashboard / viewDoanhThu chỉ admin + giám đốc.
// ----------------------------------------------------------------------------
export const TABS = [
  { id: 'dashboard', label: 'Tổng quan',  icon: 'bi-speedometer2',   perm: 'viewDashboard' },
  { id: 'congtrinh', label: 'Công trình', icon: 'bi-building'        },
  { id: 'hoadon',    label: 'Hóa đơn',    icon: 'bi-receipt'         },
  { id: 'chamcong',  label: 'Chấm công',  icon: 'bi-calendar-check'  },
  { id: 'tienung',   label: 'Tiền ứng',   icon: 'bi-wallet2'         },
  { id: 'doanhthu',  label: 'Doanh thu',  icon: 'bi-graph-up-arrow', perm: 'viewDoanhThu' },
  { id: 'thietbi',   label: 'Thiết bị',   icon: 'bi-tools'           },
  { id: 'danhmuc',   label: 'Danh mục',   icon: 'bi-folder2-open'    },
  { id: 'saoluu',    label: 'Sao lưu',    icon: 'bi-cloud-upload',   perm: 'manageTools' },
];

// ----------------------------------------------------------------------------
//  TRẠNG THÁI NỘI BỘ của router (không lộ ra ngoài).
//   - _navHost / _contentHost: 2 ô DOM để vẽ nav và nội dung tab.
//   - _renderers: bản đồ id-tab → hàm vẽ do module đăng ký (registerTab).
//   - _active   : id tab đang xem.
// ----------------------------------------------------------------------------
let _navHost = null;
let _contentHost = null;
const _renderers = new Map();
let _active = null;

// ----------------------------------------------------------------------------
//  registerTab(id, renderFn) — Module gọi để "cắm" hàm vẽ của mình vào tab.
//  renderFn(host) nhận sẵn ô nội dung để tự đổ giao diện vào. Khi tab đang mở
//  được đăng ký lại (vd: load module trễ) → vẽ lại ngay cho kịp.
// ----------------------------------------------------------------------------
export function registerTab(id, renderFn) {
  _renderers.set(id, renderFn);
  if (_active === id) renderActive(); // tab đang xem vừa có hàm vẽ → cập nhật ngay
}

// ----------------------------------------------------------------------------
//  isTabVisible(tab) — Vai trò hiện tại có được THẤY tab này không?
//  Không khai báo perm → ai cũng thấy; có perm → hỏi auth.roles.
// ----------------------------------------------------------------------------
function isTabVisible(tab) {
  return !tab.perm || hasPermission(tab.perm);
}

// ----------------------------------------------------------------------------
//  mountNav(host) — Dựng các NÚT ĐIỀU HƯỚNG DỌC (sidebar) vào `host`.
//  Mỗi nút có 1 Bootstrap Icon + nhãn. Gắn data-tab và (nếu có) data-perm để
//  auth.roles tự ẩn/hiện. data-bs-dismiss="offcanvas" → Bootstrap tự đóng
//  sidebar trượt khi chọn tab (không cần code đóng thủ công).
// ----------------------------------------------------------------------------
function mountNav(host) {
  host.innerHTML = TABS.map((t) => `
    <button type="button"
            class="nav-sidebar-btn"
            data-tab="${t.id}"
            ${t.perm ? `data-perm="${t.perm}"` : ''}
            data-bs-dismiss="offcanvas">
      <i class="bi ${t.icon}"></i>
      ${t.label}
    </button>`).join('');

  // Bấm 1 nút tab → điều hướng sang tab đó.
  host.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.tab));
  });
}

// ----------------------------------------------------------------------------
//  renderActive() — Vẽ NỘI DUNG của tab đang xem vào ô nội dung.
//  Có hàm đăng ký → gọi hàm đó; chưa có → hiện khung tạm "đang xây dựng".
//  Cũng tô đậm (active) đúng nút tab trên thanh điều hướng.
// ----------------------------------------------------------------------------
function renderActive() {
  if (!_contentHost) return;

  // Tô đậm nút tab đang chọn.
  if (_navHost) {
    _navHost.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === _active);
    });
  }

  const fn = _renderers.get(_active);
  if (fn) {
    _contentHost.innerHTML = '';
    fn(_contentHost);            // module tự vẽ vào ô nội dung
  } else {
    // SKELETON: tab chưa có module → khung tạm cho biết sẽ làm ở sprint sau.
    const tab = TABS.find((t) => t.id === _active);
    _contentHost.innerHTML = `
      <div class="card border-0 shadow-sm">
        <div class="card-body text-center text-muted py-5">
          <div class="display-6 mb-2">${tab ? tab.label : ''}</div>
          <p class="mb-0">Khu vực này sẽ được xây dựng ở các bước tiếp theo.</p>
        </div>
      </div>`;
  }
}

// ----------------------------------------------------------------------------
//  navigate(id) — Chuyển sang tab `id`. Nếu tab không tồn tại hoặc đang bị ẩn
//  theo phân quyền → tự nhảy về tab HỢP LỆ đầu tiên. Cập nhật #hash để F5 nhớ.
// ----------------------------------------------------------------------------
export function navigate(id) {
  let tab = TABS.find((t) => t.id === id && isTabVisible(t));
  if (!tab) tab = TABS.find(isTabVisible); // không hợp lệ → tab xem được đầu tiên
  if (!tab) return;                         // chưa đăng nhập / không có tab nào

  _active = tab.id;
  if (location.hash.slice(1) !== _active) location.hash = _active; // sync địa chỉ
  renderActive();
}

// ----------------------------------------------------------------------------
//  getActiveTab() — Trả id tab đang xem (tiện cho topbar/đổi năm gọi vẽ lại).
// ----------------------------------------------------------------------------
export function getActiveTab() {
  return _active;
}

// ----------------------------------------------------------------------------
//  startRouter({ navHost, contentHost }) — Khởi động điều hướng:
//    - Nhớ 2 ô DOM, dựng thanh nav.
//    - Mở tab theo #hash (nếu hợp lệ) hoặc tab đầu tiên.
//    - Lắng nghe đổi #hash (nút back/tới của trình duyệt) để chuyển tab theo.
//  Gọi 1 lần sau khi đăng nhập xong (app.js lo việc đó).
// ----------------------------------------------------------------------------
export function startRouter({ navHost, contentHost }) {
  _navHost = navHost;
  _contentHost = contentHost;
  mountNav(_navHost);

  // Đổi #hash thủ công (hoặc back/forward) → đồng bộ tab.
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id && id !== _active) navigate(id);
  });

  navigate(location.hash.slice(1) || (TABS[0] && TABS[0].id));
}
