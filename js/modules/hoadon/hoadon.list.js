// ============================================================================
//  modules/hoadon/hoadon.list.js  —  TẦNG GIAO DIỆN (Layer 6): DANH SÁCH hóa đơn
// ----------------------------------------------------------------------------
//  @module hoadon.list
//
//  Sub-tab "📑 Danh sách" của tab Hóa đơn: liệt kê MỌI hóa đơn trong NĂM đang chọn,
//  kèm bộ LỌC (tìm không dấu / công trình / loại CP / nguồn / khoảng ngày) và
//  PHÂN TRANG. Mỗi dòng có nút ✏️ Sửa (mở đúng form nhập qua callback onEdit của
//  shell) và 🗑 Xóa mềm (đưa vào Thùng rác).
//
//  Chỉ ĐỌC + xóa mềm — không tự dựng form nhập (việc đó là quick/detail).
// ============================================================================

import { getSelectedYear } from '../../topbar.js';
import { toast, confirm2, setLoading } from '../../utils/ui.js';
import { formatMoney } from '../../utils/fmt.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';
import { loadCategories, listNames } from '../../utils/cat.js';
import { loadProjects, getProjectOptions, getProjectName } from '../projects/projects.data.js';
import { getInvoices, deleteInvoice } from './hoadon.data.js';

const PAGE_SIZE = 20;                 // số dòng mỗi trang

// ----------------------------------------------------------------------------
//  TRẠNG THÁI MODULE — sống trong lần render hiện tại của sub-tab.
// ----------------------------------------------------------------------------
let _host = null;
let _onEdit = null;     // callback(invoice) do shell cung cấp để mở form sửa
let _all = [];          // toàn bộ hóa đơn còn dùng trong năm (đã tải)
let _page = 1;

// Lấy nhanh các ô trong layout.
const q = (sel) => _host.querySelector(sel);

// escapeHtml(s) — chống vỡ HTML khi đổ chuỗi người dùng vào bảng/option.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ----------------------------------------------------------------------------
//  renderList(host, opts) — Vẽ bộ lọc + bảng danh sách. opts.onEdit(invoice) để sửa.
// ----------------------------------------------------------------------------
export async function renderList(host, opts = {}) {
  _host = host;
  _onEdit = typeof opts.onEdit === 'function' ? opts.onEdit : null;
  _page = 1;

  host.innerHTML = `
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-body">
        <div class="row g-2 align-items-end">
          <div class="col-12 col-md-4">
            <label class="form-label small mb-1 fw-semibold">🔍 Tìm kiếm</label>
            <input class="form-control form-control-sm" data-search placeholder="Nội dung, loại CP, NCC, người TH…">
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1 fw-semibold">Công trình</label>
            <select class="form-select form-select-sm" data-fproject></select>
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small mb-1 fw-semibold">Loại CP</label>
            <select class="form-select form-select-sm" data-fcat></select>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1 fw-semibold">Nguồn</label>
            <select class="form-select form-select-sm" data-fsource>
              <option value="">Tất cả</option>
              <option value="quick">⚡ Nhập nhanh</option>
              <option value="detail">📋 Chi tiết</option>
            </select>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1 fw-semibold">Từ ngày</label>
            <input type="date" class="form-control form-control-sm" data-from>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1 fw-semibold">Đến ngày</label>
            <input type="date" class="form-control form-control-sm" data-to>
          </div>
          <div class="col-12 col-md-3 d-flex gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary w-100" data-reset>↺ Xóa lọc</button>
          </div>
        </div>
      </div>
    </div>
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <div data-results></div>
      </div>
    </div>`;

  setLoading(true, 'Đang tải hóa đơn…');
  try {
    const [cats] = await Promise.all([loadCategories(), loadProjects()]);
    fillFilterOptions(cats);
    _all = await getInvoices({ year: getSelectedYear() });
  } finally {
    setLoading(false);
  }

  // Lọc realtime: gõ/đổi select → về trang 1 rồi vẽ lại.
  ['[data-search]', '[data-fproject]', '[data-fcat]', '[data-fsource]', '[data-from]', '[data-to]']
    .forEach((sel) => q(sel).addEventListener('input', () => { _page = 1; renderTable(); }));
  q('[data-reset]').addEventListener('click', resetFilters);

  renderTable();
}

// fillFilterOptions(cats) — Đổ option Công trình + Loại CP cho 2 ô lọc.
function fillFilterOptions(cats) {
  const projOpts = getProjectOptions({});      // gồm cả CT đã quyết toán (xem lại lịch sử)
  q('[data-fproject]').innerHTML = `<option value="">Tất cả công trình</option>` +
    projOpts.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join('');
  q('[data-fcat]').innerHTML = `<option value="">Tất cả loại CP</option>` +
    listNames(cats, 'costType').map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
}

// resetFilters() — Xóa toàn bộ điều kiện lọc, về trang 1.
function resetFilters() {
  ['[data-search]', '[data-from]', '[data-to]'].forEach((s) => { q(s).value = ''; });
  ['[data-fproject]', '[data-fcat]', '[data-fsource]'].forEach((s) => { q(s).value = ''; });
  _page = 1;
  renderTable();
}

// ----------------------------------------------------------------------------
//  filteredList() — Áp các điều kiện lọc lên _all (tìm không dấu + các select + ngày).
// ----------------------------------------------------------------------------
function filteredList() {
  const kw = normalizeVietnamese(q('[data-search]').value.trim());
  const pid = q('[data-fproject]').value;
  const cat = q('[data-fcat]').value;
  const src = q('[data-fsource]').value;
  const from = q('[data-from]').value;
  const to = q('[data-to]').value;

  return _all.filter((r) => {
    if (pid && r.projectId !== pid) return false;
    if (cat && r.category !== cat) return false;
    if (src && r.source !== src) return false;
    if (from && (r.date || '') < from) return false;
    if (to && (r.date || '') > to) return false;
    if (kw) {
      const hay = normalizeVietnamese(
        `${r.category || ''} ${r.note || ''} ${r.supplier || ''} ${r.performer || ''} ${getProjectName(r.projectId) || ''}`);
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

// ----------------------------------------------------------------------------
//  renderTable() — Vẽ bảng kết quả (đã lọc) cho trang hiện tại + phân trang + tổng.
// ----------------------------------------------------------------------------
function renderTable() {
  const box = q('[data-results]');
  const list = filteredList();
  const total = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  if (!list.length) {
    box.innerHTML = '<p class="text-muted small mb-0">Không có hóa đơn nào khớp điều kiện lọc.</p>';
    return;
  }

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (_page > pages) _page = pages;
  const start = (_page - 1) * PAGE_SIZE;
  const rows = list.slice(start, start + PAGE_SIZE);

  box.innerHTML = `
    <div class="d-flex flex-wrap align-items-center mb-2 gap-2">
      <span class="badge bg-secondary-subtle text-secondary-emphasis">${list.length} hóa đơn</span>
      <span class="ms-auto fw-semibold">Tổng: ${formatMoney(total)}</span>
    </div>
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle mb-2">
        <thead class="table-light">
          <tr>
            <th>Ngày</th><th>Loại CP</th><th>Công trình</th><th>Nội dung</th>
            <th>NCC</th><th class="text-end">Số tiền</th><th>Nguồn</th><th style="width:84px"></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td class="text-nowrap">${escapeHtml(r.date)}</td>
              <td>${escapeHtml(r.category)}</td>
              <td>${escapeHtml(getProjectName(r.projectId) || '—')}</td>
              <td>${escapeHtml(r.note)}</td>
              <td>${escapeHtml(r.supplier)}</td>
              <td class="text-end text-nowrap">${formatMoney(r.amount)}</td>
              <td>${r.source === 'detail'
                ? '<span class="badge bg-info-subtle text-info-emphasis">📋 Chi tiết</span>'
                : '<span class="badge bg-light text-secondary">⚡ Nhanh</span>'}</td>
              <td class="text-nowrap">
                <button class="btn btn-sm btn-link p-0 me-2" data-edit="${r.id}" title="Sửa">✏️</button>
                <button class="btn btn-sm btn-link text-danger p-0" data-del="${r.id}" title="Xóa">🗑</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="d-flex align-items-center justify-content-between">
      <button type="button" class="btn btn-sm btn-outline-secondary" data-prev ${_page <= 1 ? 'disabled' : ''}>‹ Trước</button>
      <span class="small text-muted">Trang ${_page}/${pages}</span>
      <button type="button" class="btn btn-sm btn-outline-secondary" data-next ${_page >= pages ? 'disabled' : ''}>Sau ›</button>
    </div>`;

  box.querySelector('[data-prev]').addEventListener('click', () => { if (_page > 1) { _page--; renderTable(); } });
  box.querySelector('[data-next]').addEventListener('click', () => { if (_page < pages) { _page++; renderTable(); } });
  box.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => handleEdit(b.dataset.edit)));
  box.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => handleDelete(b.dataset.del)));
}

// handleEdit(id) — Nhờ shell mở đúng sub-tab nhập (quick/detail) và đổ dữ liệu lên.
function handleEdit(id) {
  const inv = _all.find((r) => r.id === id);
  if (!inv) { toast('Không tìm thấy hóa đơn.', 'warning'); return; }
  if (_onEdit) _onEdit(inv);
  else toast('Không mở được form sửa.', 'warning');
}

// handleDelete(id) — Xác nhận → xóa mềm → cập nhật danh sách đã tải + vẽ lại.
async function handleDelete(id) {
  if (!(await confirm2('Xóa hóa đơn này? (có thể khôi phục trong Thùng rác)'))) return;
  await deleteInvoice(id);
  _all = _all.filter((r) => r.id !== id);     // bỏ khỏi danh sách RAM, khỏi tải lại cả năm
  toast('Đã chuyển hóa đơn vào Thùng rác.', 'success');
  renderTable();
}
