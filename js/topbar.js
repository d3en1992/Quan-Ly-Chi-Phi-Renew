// ============================================================================
//  topbar.js  —  TẦNG KHUNG APP (Layer 8): Thanh công cụ trên cùng
// ----------------------------------------------------------------------------
//  NHIỆM VỤ: Dựng THANH TRÊN CÙNG luôn hiện khi đã đăng nhập, gồm:
//    - Tên app (thu gọn trên di động).
//    - Ô CHỌN NĂM: app xem dữ liệu theo từng năm; đổi năm → vẽ lại tab đang xem.
//    - Nút ĐỒNG BỘ: gọi đồng bộ thủ công với đám mây (Firestore).
//    - Khu NGƯỜI DÙNG: tên + nhãn vai trò (đổ qua data-user-name/role) + Đăng xuất.
//
//  GIỮ "NĂM ĐANG XEM" Ở ĐÂY: topbar là nơi tự nhiên nắm năm đang chọn; các module
//  khác sẽ import getSelectedYear() khi cần lọc dữ liệu theo năm (ở các sprint sau).
// ============================================================================

import { activeYears } from './utils/year.js';
import { manualSync } from './core/sync.js';
import { mountSyncStatus } from './core/sync.ui.js';
import { navigate } from './router.js';

// Các tab hiện trên thanh nhanh dưới cùng (mobile) — 4 tab dùng nhiều nhất.
const BOTTOM_TABS = [
  { id: 'congtrinh', label: 'Công trình', icon: 'bi-building'       },
  { id: 'hoadon',    label: 'Hóa đơn',    icon: 'bi-receipt'        },
  { id: 'chamcong',  label: 'Chấm công',  icon: 'bi-calendar-check' },
  { id: 'tienung',   label: 'Tiền ứng',   icon: 'bi-wallet2'        },
];

// Năm đang xem — khởi tạo bằng năm hiện tại. Các module khác đọc qua getSelectedYear().
let _selectedYear = new Date().getFullYear();

// ----------------------------------------------------------------------------
//  getSelectedYear() / setSelectedYear(y) — Đọc/ghi năm đang xem.
// ----------------------------------------------------------------------------
export function getSelectedYear() {
  return _selectedYear;
}
export function setSelectedYear(y) {
  _selectedYear = Number(y) || _selectedYear;
}

// ----------------------------------------------------------------------------
//  mountTopbar(host, { onYearChange, onLogout }) — Dựng thanh công cụ vào `host`.
//    - onYearChange(year): gọi khi người dùng đổi năm (app.js sẽ vẽ lại tab).
//    - onLogout()        : gọi khi bấm Đăng xuất (app.js sẽ hiện lại form login).
//  Năm trong ô <select> lấy từ activeYears() — tối thiểu luôn có năm hiện tại.
// ----------------------------------------------------------------------------
export function mountTopbar(host, { onYearChange = () => {}, onLogout = () => {} } = {}) {
  // Danh sách năm để chọn (skeleton: kho rỗng → chỉ có năm nay; sau này đổ từ dữ liệu thật).
  const years = activeYears([]);
  if (!years.includes(_selectedYear)) years.unshift(_selectedYear);

  host.innerHTML = `
    <!-- THANH TRÊN CÙNG: nền đen, logo vàng, sticky -->
    <header class="topbar">
      <div class="topbar-row1">
        <!-- Nút ☰ mở sidebar trượt (Offcanvas của Bootstrap) -->
        <button type="button" class="tb-btn" data-bs-toggle="offcanvas"
                data-bs-target="#sidebar-nav" aria-controls="sidebar-nav" title="Menu">
          <i class="bi bi-list"></i>
        </button>

        <!-- Tên app: rút gọn còn icon trên màn hình nhỏ -->
        <span class="app-name">
          <i class="bi bi-building-fill-gear"></i>
          <span class="d-none d-sm-inline">Quản Lý Chi Phí Công Trình</span>
        </span>

        <span class="topbar-spacer"></span>

        <!-- Ô chọn năm xem dữ liệu -->
        <select class="year-select" data-year aria-label="Chọn năm">
          ${years.map((y) => `<option value="${y}" ${y === _selectedYear ? 'selected' : ''}>${y}</option>`).join('')}
        </select>

        <!-- Chấm trạng thái đồng bộ (xanh/vàng/đỏ/xám) + số thay đổi chờ -->
        <span data-sync-status></span>

        <!-- Nút đồng bộ thủ công -->
        <button type="button" class="tb-btn" data-sync title="Đồng bộ đám mây">
          <i class="bi bi-cloud-arrow-up"></i><span class="btn-text d-none d-md-inline"> Đồng bộ</span>
        </button>

        <!-- Người dùng (tên + vai trò) -->
        <span class="top-stat d-none d-sm-flex">
          <i class="bi bi-person-circle"></i>
          <span class="top-stat-val" data-user-name></span>
          <span class="top-stat-role" data-user-role></span>
        </span>

        <!-- Đăng xuất -->
        <button type="button" class="tb-btn tb-btn-danger" data-logout title="Đăng xuất">
          <i class="bi bi-box-arrow-right"></i><span class="btn-text d-none d-md-inline"> Thoát</span>
        </button>
      </div>
    </header>

    <!-- SIDEBAR TRƯỢT TỪ TRÁI — router.js sẽ điền danh sách tab vào [data-nav-host] -->
    <div class="offcanvas offcanvas-start" id="sidebar-nav" tabindex="-1"
         aria-labelledby="sidebar-nav-label">
      <div class="offcanvas-header">
        <span class="offcanvas-title" id="sidebar-nav-label">
          <i class="bi bi-building-fill-gear"></i> Chi Phí Công Trình
        </span>
        <button class="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Đóng"></button>
      </div>
      <div class="offcanvas-body p-0">
        <nav data-nav-host></nav>
      </div>
    </div>

    <!-- THANH NHANH DƯỚI CÙNG (chỉ hiện trên điện thoại) -->
    <nav class="mobile-bottom-bar">
      <button type="button" class="mbb-btn" data-bs-toggle="offcanvas"
              data-bs-target="#sidebar-nav" aria-controls="sidebar-nav">
        <i class="bi bi-list"></i>Menu
      </button>
      ${BOTTOM_TABS.map((t) => `
        <button type="button" class="mbb-btn" data-bottom-tab="${t.id}">
          <i class="bi ${t.icon}"></i>${t.label}
        </button>`).join('')}
    </nav>`;

  // Đổi năm → nhớ năm mới + báo cho app vẽ lại tab đang xem.
  host.querySelector('[data-year]').addEventListener('change', (e) => {
    setSelectedYear(e.target.value);
    onYearChange(_selectedYear);
  });

  // Bấm Đồng bộ → gọi đồng bộ thủ công năm đang xem (tự báo toast nếu chưa cấu hình Firebase).
  host.querySelector('[data-sync]').addEventListener('click', () => manualSync(_selectedYear));

  // Chấm trạng thái đồng bộ: tự nghe trạng thái sync để đổi màu + số chờ.
  mountSyncStatus(host.querySelector('[data-sync-status]'));

  // Bấm Đăng xuất → để app.js xử lý (dừng phiên + hiện lại form).
  host.querySelector('[data-logout]').addEventListener('click', () => onLogout());

  // Thanh nhanh dưới cùng → điều hướng tab tương ứng.
  host.querySelectorAll('[data-bottom-tab]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.bottomTab));
  });

  // Tô đậm nút thanh dưới theo tab đang xem (đồng bộ với #hash).
  const syncBottomActive = () => {
    const cur = location.hash.slice(1);
    host.querySelectorAll('[data-bottom-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.bottomTab === cur);
    });
  };
  window.addEventListener('hashchange', syncBottomActive);
  syncBottomActive();
}
