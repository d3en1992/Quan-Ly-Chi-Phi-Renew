// ============================================================================
//  modules/projects/projects.list.js  —  TẦNG GIAO DIỆN (Layer 6): Tab Công Trình
// ----------------------------------------------------------------------------
//  @module projects.list
//
//  Vẽ TOÀN BỘ giao diện tab Công Trình:
//    1. Dashboard mini (KPI): tổng số CT + đếm theo trạng thái + KPI tài chính
//       (Tổng Chi đỏ / Tổng Thu / Lãi-Lỗ theo NĂM đang chọn).
//    2. Thanh lọc: ô tìm kiếm + lọc Trạng thái + Loại hình + Tình trạng tài chính.
//    3. Danh sách công trình dạng Card (mobile-first) + nút Chi tiết/Thêm/Sửa/Xóa/đổi trạng thái.
//
//  Modal "Chi tiết" + 3 công thức tài chính nằm ở projects.stats.js (P11).
//
//  Mọi thao tác dữ liệu đi qua projects.data.js (tầng lõi). File này chỉ lo DOM,
//  bộ lọc giữ trong state NỘI BỘ module (không global var). Tên/chủ đầu tư/ghi chú
//  là dữ liệu người dùng nhập → LUÔN escape HTML trước khi đổ vào innerHTML.
// ============================================================================

import { registerTab } from '../../router.js';
import { toast, confirm2, setLoading } from '../../utils/ui.js';
import { formatDate, formatMoney } from '../../utils/fmt.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';
import { getSelectedYear } from '../../topbar.js';
import {
  loadProjects, getSortedProjects, deleteProject,
  completeProject, closeProject, getProjectById,
  PROJECT_STATUS, PROJECT_STATUS_KEYS, PROJECT_TYPES, PROJECT_TYPE_LABELS,
} from './projects.data.js';
import { openProjectDetail, getAllProjectsFinance, financialStatus } from './projects.stats.js';
import { openProjectForm } from './projects.form.js';

// ----------------------------------------------------------------------------
//  STATE NỘI BỘ — ô DOM gốc của tab + bộ lọc hiện hành.
// ----------------------------------------------------------------------------
let _host = null;
let _filter = { search: '', status: '', type: '', profit: '' };
// _finance: Map<projectId, đối tượng tài chính> của NĂM đang xem (nạp ở reload()).
let _finance = new Map();

// Nhãn + màu badge cho tình trạng tài chính (khớp financialStatus()).
const PROFIT_BADGE = {
  profit: { label: 'Có lãi', cls: 'bg-success' },
  loss:   { label: 'Đang lỗ', cls: 'bg-danger' },
  none:   { label: 'Chưa đủ dữ liệu', cls: 'bg-secondary' },
};

// Màu badge Bootstrap cho từng trạng thái (để card nhìn ra nhanh).
const STATUS_BADGE = {
  planning: 'bg-secondary',
  active: 'bg-primary',
  completed: 'bg-success',
  closed: 'bg-dark',
};

// escapeHtml(s) — Chống XSS: đổi ký tự nhạy cảm thành thực thể HTML trước khi render.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ----------------------------------------------------------------------------
//  renderProjectsTab(host) — Hàm vẽ ĐƯỢC ROUTER GỌI khi mở tab Công Trình.
//  Dựng khung tĩnh 1 lần (KPI + filter + list rỗng), gắn sự kiện, rồi nạp dữ liệu.
// ----------------------------------------------------------------------------
function renderProjectsTab(host) {
  _host = host;
  host.innerHTML = `
    <!-- KHU 1: Dashboard mini (KPI) -->
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
      <h2 class="h5 mb-0">🏗️ Công trình</h2>
      <button class="btn btn-primary btn-sm" data-add>+ Thêm Công Trình</button>
    </div>
    <div class="row g-2 mb-2" data-kpi></div>
    <div class="row g-2 mb-3" data-kpi-fin></div>

    <!-- KHU 2: Thanh lọc -->
    <div class="row g-2 mb-3">
      <div class="col-12 col-md-6">
        <input type="search" class="form-control" placeholder="🔎 Tìm theo tên / chủ đầu tư…" data-f-search>
      </div>
      <div class="col-6 col-md-2">
        <select class="form-select" data-f-status>
          <option value="">— Mọi trạng thái —</option>
          ${PROJECT_STATUS_KEYS.map((k) => `<option value="${k}">${PROJECT_STATUS[k]}</option>`).join('')}
        </select>
      </div>
      <div class="col-6 col-md-2">
        <select class="form-select" data-f-type>
          <option value="">— Mọi loại hình —</option>
          ${PROJECT_TYPES.map((t) => `<option value="${t}">${PROJECT_TYPE_LABELS[t]}</option>`).join('')}
        </select>
      </div>
      <div class="col-12 col-md-2">
        <select class="form-select" data-f-profit>
          <option value="">— Tài chính —</option>
          <option value="profit">Có lãi</option>
          <option value="loss">Đang lỗ</option>
          <option value="none">Chưa đủ dữ liệu</option>
        </select>
      </div>
    </div>

    <!-- KHU 3: Danh sách công trình -->
    <div data-list><div class="text-center text-muted py-5"><div class="spinner-border"></div></div></div>`;

  // Gắn sự kiện: nút thêm + 3 ô lọc (đổi filter → vẽ lại danh sách).
  host.querySelector('[data-add]').addEventListener('click', () => openForm(null));
  host.querySelector('[data-f-search]').addEventListener('input', (e) => {
    _filter.search = e.target.value; renderList();
  });
  host.querySelector('[data-f-status]').addEventListener('change', (e) => {
    _filter.status = e.target.value; renderList();
  });
  host.querySelector('[data-f-type]').addEventListener('change', (e) => {
    _filter.type = e.target.value; renderList();
  });
  host.querySelector('[data-f-profit]').addEventListener('change', (e) => {
    _filter.profit = e.target.value; renderList();
  });

  reload();
}

// reload() — Nạp CT + tài chính (theo năm đang chọn) rồi vẽ KPI + danh sách.
async function reload() {
  await loadProjects();
  try {
    _finance = await getAllProjectsFinance(getSelectedYear());
  } catch {
    _finance = new Map(); // lỗi đọc số liệu → vẫn vẽ danh sách (KPI tài chính = 0)
  }
  renderKPI();
  renderList();
}

// ----------------------------------------------------------------------------
//  renderKPI() — Đếm số công trình theo trạng thái + tổng. (KHÔNG lọc theo năm:
//  công trình sống lâu dài, có thể kéo nhiều năm.)
// ----------------------------------------------------------------------------
function renderKPI() {
  if (!_host) return;
  const all = getSortedProjects();
  const dem = Object.fromEntries(PROJECT_STATUS_KEYS.map((k) => [k, 0]));
  all.forEach((p) => { dem[p.status] = (dem[p.status] || 0) + 1; });

  const the = (label, value, cls) => `
    <div class="col-6 col-md">
      <div class="card border-0 shadow-sm h-100">
        <div class="card-body p-2 text-center">
          <div class="fs-4 fw-bold ${cls || ''}">${value}</div>
          <div class="small text-muted">${label}</div>
        </div>
      </div>
    </div>`;

  _host.querySelector('[data-kpi]').innerHTML =
    the('Tổng số', all.length, 'text-primary') +
    PROJECT_STATUS_KEYS.map((k) => the(PROJECT_STATUS[k], dem[k])).join('');

  // Hàng KPI tài chính (theo NĂM đang chọn): tổng Chi (đỏ) / Thu / Lãi-Lỗ.
  let chi = 0, thu = 0, lai = 0;
  _finance.forEach((f) => { chi += f.redValue; thu += f.totalReceived; lai += f.profit; });
  const laiCls = lai > 0 ? 'text-success' : (lai < 0 ? 'text-danger' : 'text-secondary');
  const tien = (label, value, cls) => `
    <div class="col-12 col-md-4">
      <div class="card border-0 shadow-sm h-100">
        <div class="card-body p-2 text-center">
          <div class="fs-5 fw-bold ${cls}">${formatMoney(value)}</div>
          <div class="small text-muted">${label}</div>
        </div>
      </div>
    </div>`;
  _host.querySelector('[data-kpi-fin]').innerHTML =
    tien('Tổng Chi (đỏ)', chi, 'text-danger') +
    tien('Tổng Thu', thu, 'text-primary') +
    tien('Lãi / Lỗ', lai, laiCls);
}

// applyFilter(list) — Lọc danh sách theo state _filter (tìm kiếm KHÔNG DẤU).
function applyFilter(list) {
  const q = normalizeVietnamese(_filter.search);
  return list.filter((p) => {
    if (_filter.status && p.status !== _filter.status) return false;
    if (_filter.type && p.type !== _filter.type) return false;
    if (_filter.profit && financialStatus(_finance.get(p.id)) !== _filter.profit) return false;
    if (q && !normalizeVietnamese(`${p.name} ${p.investor || ''}`).includes(q)) return false;
    return true;
  });
}

// ----------------------------------------------------------------------------
//  renderList() — Vẽ danh sách Card theo bộ lọc hiện hành.
// ----------------------------------------------------------------------------
function renderList() {
  if (!_host) return;
  const box = _host.querySelector('[data-list]');
  const list = applyFilter(getSortedProjects());

  if (list.length === 0) {
    box.innerHTML = `<div class="text-center text-muted py-5">Không có công trình nào khớp bộ lọc.</div>`;
    return;
  }
  box.innerHTML = list.map(cardHtml).join('');

  // Gắn sự kiện cho nút trên từng card (ủy quyền qua data-id + data-act).
  box.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => onCardAction(btn.dataset.act, btn.dataset.id));
  });
}

// cardHtml(p) — Một thẻ công trình. Hiện badge trạng thái, loại hình, tài chính, ngày, chủ đầu tư.
function cardHtml(p) {
  const pb = PROFIT_BADGE[financialStatus(_finance.get(p.id))];
  const dates = [
    p.startDate ? `BĐ ${formatDate(p.startDate)}` : '',
    p.endDate ? `HT ${formatDate(p.endDate)}` : '',
    p.closedDate ? `QT ${formatDate(p.closedDate)}` : '',
  ].filter(Boolean).join(' · ');

  // Nút đổi trạng thái tùy ngữ cảnh.
  let stepBtns = '';
  if (p.status === 'planning' || p.status === 'active') {
    stepBtns += `<button class="btn btn-sm btn-outline-success" data-act="complete" data-id="${p.id}">✅ Hoàn thành</button>`;
  }
  if (p.status === 'completed') {
    stepBtns += `<button class="btn btn-sm btn-outline-dark" data-act="close" data-id="${p.id}">🔒 Quyết toán</button>`;
  }

  return `
    <div class="card border-0 shadow-sm mb-2">
      <div class="card-body p-3">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="flex-grow-1 min-w-0">
            <div class="fw-semibold text-truncate">${escapeHtml(p.name)}</div>
            <div class="small text-muted">
              <span class="badge ${STATUS_BADGE[p.status] || 'bg-secondary'}">${PROJECT_STATUS[p.status] || p.status}</span>
              <span class="badge bg-light text-dark border">${PROJECT_TYPE_LABELS[p.type] || p.type}</span>
              <span class="badge ${pb.cls}">${pb.label}</span>
              ${p.investor ? `· 👤 ${escapeHtml(p.investor)}` : ''}
            </div>
            ${dates ? `<div class="small text-muted mt-1">${dates}</div>` : ''}
          </div>
        </div>
        <div class="d-flex flex-wrap gap-1 mt-2">
          <button class="btn btn-sm btn-outline-info" data-act="detail" data-id="${p.id}">📊 Chi tiết</button>
          ${stepBtns}
          <button class="btn btn-sm btn-outline-primary" data-act="edit" data-id="${p.id}">✏️ Sửa</button>
          <button class="btn btn-sm btn-outline-danger" data-act="delete" data-id="${p.id}">🗑️ Xóa</button>
        </div>
      </div>
    </div>`;
}

// ----------------------------------------------------------------------------
//  onCardAction(act, id) — Xử lý nút trên card: sửa / xóa / hoàn thành / quyết toán.
// ----------------------------------------------------------------------------
async function onCardAction(act, id) {
  const p = getProjectById(id);
  if (!p) return;

  if (act === 'detail') { openProjectDetail(id); return; }
  if (act === 'edit') { openForm(p); return; }

  if (act === 'delete') {
    if (!(await confirm2(`Xóa công trình "${escapeHtml(p.name)}"?`))) return;
    await guard(() => deleteProject(id), 'Đã xóa công trình.');
    return;
  }

  if (act === 'complete') {
    // Nếu chưa có ngày hoàn thành → hỏi (mặc định hôm nay) qua form sửa cho rõ ràng.
    if (!p.endDate) { openForm(p, { focusStatus: 'completed' }); return; }
    if (!(await confirm2(`Đánh dấu "${escapeHtml(p.name)}" đã hoàn thành?`, { danger: false }))) return;
    await guard(() => completeProject(id), 'Đã chuyển sang Hoàn thành.');
    return;
  }

  if (act === 'close') {
    if (!p.closedDate) { openForm(p, { focusStatus: 'closed' }); return; }
    if (!(await confirm2(`Quyết toán "${escapeHtml(p.name)}"? Sau đó sẽ KHÓA thêm dữ liệu mới.`, { danger: false }))) return;
    await guard(() => closeProject(id), 'Đã quyết toán công trình.');
  }
}

// guard(fn, okMsg) — Chạy 1 thao tác data: hiện loading, bắt lỗi → toast, rồi reload.
async function guard(fn, okMsg) {
  setLoading(true);
  try {
    await fn();
    toast(okMsg, 'success');
    await reload();
  } catch (e) {
    toast(e.message || 'Có lỗi xảy ra.', 'error');
  } finally {
    setLoading(false);
  }
}

// openForm(project, opts) — Mở modal Thêm/Sửa (ở projects.form.js); lưu xong → reload().
function openForm(project, opts = {}) {
  openProjectForm(project, opts, reload);
}

// ----------------------------------------------------------------------------
//  ĐĂNG KÝ tab với router: từ giờ mở tab "Công trình" sẽ gọi renderProjectsTab.
// ----------------------------------------------------------------------------
registerTab('congtrinh', renderProjectsTab);
