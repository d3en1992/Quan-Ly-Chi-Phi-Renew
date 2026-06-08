// ============================================================================
//  modules/doanhthu/doanhthu.debt.js  —  TẦNG GIAO DIỆN (Layer 6)
// ----------------------------------------------------------------------------
//  @module doanhthu.debt
//
//  Sub-tab "CÔNG NỢ ĐỐI TÁC" của tab Doanh Thu (doc 08 §4) — 2 bảng DERIVED gom
//  theo TỪNG (Công trình + đối tác):
//    A) Công Nợ Thầu Phụ : Tổng HĐ thầu phụ − Đã ứng = Còn phải trả.
//    B) Công Nợ Nhà Cung Cấp : Đã ứng − Tổng hóa đơn NCC = Chênh lệch
//       (>0 ứng dư / NCC nợ lại · <0 còn phải trả NCC).
//  Số liệu tính lại mỗi render (calcDebtSubcontractor/Supplier ở data layer),
//  KHÔNG lưu store riêng. Bộ lọc CT + tìm không dấu chạy ĐỘC LẬP (state riêng,
//  doc §4) — không ảnh hưởng các sub-tab khác. Tên CT đọc REALTIME từ Tab 01.
//
//  EXPORT: renderDebt(host).
// ============================================================================

import { formatMoney } from '../../utils/fmt.js';
import { normalizeKey } from '../../utils/cat.js';
import { loadProjects, getProjectName } from '../projects/projects.data.js';
import { calcDebtSubcontractor, calcDebtSupplier } from './doanhthu.data.js';

// escapeHtml(s) — Chống XSS khi đổ chuỗi người dùng vào ô.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// TRẠNG THÁI MÀN — chỉ sống trong lần render hiện tại (độc lập sub-tab khác).
let _host = null;
let _subRows = [];   // công nợ thầu phụ (mọi CT, chưa lọc client)
let _supRows = [];   // công nợ NCC (mọi CT, chưa lọc client)

// ----------------------------------------------------------------------------
//  renderDebt(host) — Vẽ bộ lọc + 2 bảng công nợ (thầu phụ / NCC).
// ----------------------------------------------------------------------------
export async function renderDebt(host) {
  _host = host;

  host.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
          <div>
            <label class="form-label small mb-1">Công trình</label>
            <select class="form-select form-select-sm" data-f-project style="min-width:170px">
              <option value="">— Tất cả —</option>
            </select>
          </div>
          <div class="flex-fill" style="min-width:160px">
            <label class="form-label small mb-1">🔍 Tìm</label>
            <input class="form-control form-control-sm" data-f-search placeholder="Công trình / Đối tác">
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-reset>↺ Xóa lọc</button>
        </div>

        <h6 class="fw-bold mb-2">🤝 Công nợ Thầu phụ</h6>
        <div class="table-responsive border rounded mb-1">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th style="min-width:150px">Công trình</th>
                <th style="min-width:130px">Thầu phụ</th>
                <th style="width:140px" class="text-end">Tổng HĐ</th>
                <th style="width:140px" class="text-end">Đã ứng</th>
                <th style="width:150px" class="text-end">Còn phải trả</th>
              </tr>
            </thead>
            <tbody data-sub-rows></tbody>
          </table>
        </div>
        <div class="mb-4"><span class="badge bg-secondary-subtle text-secondary-emphasis" data-sub-sum></span></div>

        <h6 class="fw-bold mb-2">🏭 Công nợ Nhà cung cấp</h6>
        <div class="table-responsive border rounded mb-1">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th style="min-width:150px">Công trình</th>
                <th style="min-width:130px">Nhà cung cấp</th>
                <th style="width:140px" class="text-end">Đã ứng</th>
                <th style="width:140px" class="text-end">Tổng hóa đơn</th>
                <th style="width:150px" class="text-end">Chênh lệch</th>
              </tr>
            </thead>
            <tbody data-sup-rows></tbody>
          </table>
        </div>
        <div><span class="badge bg-secondary-subtle text-secondary-emphasis" data-sup-sum></span></div>
        <p class="small text-muted mt-2 mb-0">Chênh lệch NCC = Đã ứng − Tổng hóa đơn · <span class="text-success-emphasis">dương = ứng dư</span> / <span class="text-warning-emphasis">âm = còn phải trả NCC</span>.</p>
      </div>
    </div>`;

  await loadAndCompute();
  fillProjectFilter();
  bindEvents();
  renderTables();
}

// loadAndCompute() — Nạp công nợ (mọi CT, all-time) + gắn tên CT realtime để tìm/sắp.
async function loadAndCompute() {
  await loadProjects();
  const withName = (r) => ({ ...r, name: getProjectName(r.projectId) });
  _subRows = (await calcDebtSubcontractor({})).map(withName);
  _supRows = (await calcDebtSupplier({})).map(withName);
}

// fillProjectFilter() — Đổ CT có phát sinh công nợ (gộp 2 bảng) vào dropdown lọc.
function fillProjectFilter() {
  const seen = new Map();   // projectId → name (loại trùng)
  for (const r of [..._subRows, ..._supRows]) if (!seen.has(r.projectId)) seen.set(r.projectId, r.name);
  const opts = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  _host.querySelector('[data-f-project]').insertAdjacentHTML('beforeend',
    opts.map(([pid, name]) => `<option value="${pid}">${escapeHtml(name)}</option>`).join(''));
}

// bindEvents() — Gắn sự kiện cho bộ lọc (1 lần mỗi render).
function bindEvents() {
  _host.querySelector('[data-f-project]').addEventListener('input', renderTables);
  _host.querySelector('[data-f-search]').addEventListener('input', renderTables);
  _host.querySelector('[data-reset]').addEventListener('click', () => {
    _host.querySelector('[data-f-project]').value = '';
    _host.querySelector('[data-f-search]').value = '';
    renderTables();
  });
}

// filterFn() — Trả hàm lọc (CT + tìm không dấu trên tên CT + tên đối tác) hiện hành.
function filterFn(partnerKey) {
  const pid = _host.querySelector('[data-f-project]').value;
  const kw = normalizeKey(_host.querySelector('[data-f-search]').value.trim());
  return (r) => {
    if (pid && r.projectId !== pid) return false;
    if (!kw) return true;
    return normalizeKey(`${r.name} ${r[partnerKey]}`).includes(kw);
  };
}

// ----------------------------------------------------------------------------
//  renderTables() — Vẽ lại 2 bảng + chân tổng theo bộ lọc đang áp.
// ----------------------------------------------------------------------------
function renderTables() {
  // A) Thầu phụ.
  const subs = _subRows.filter(filterFn('partner'));
  const subTotal = subs.reduce((s, r) => s + r.conPhaiTra, 0);
  _host.querySelector('[data-sub-rows]').innerHTML = subs.length ? subs.map((r) => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.partner)}</td>
      <td class="text-end">${formatMoney(r.tongHD)}</td>
      <td class="text-end">${formatMoney(r.daUng)}</td>
      <td class="text-end fw-semibold ${r.conPhaiTra > 0 ? 'text-warning-emphasis' : 'text-success-emphasis'}">${formatMoney(r.conPhaiTra)}</td>
    </tr>`).join('')
    : '<tr><td colspan="5" class="text-center text-muted py-3">Chưa có công nợ thầu phụ.</td></tr>';
  _host.querySelector('[data-sub-sum]').textContent =
    `${subs.length} đối tác · Còn phải trả ${formatMoney(subTotal)}`;

  // B) Nhà cung cấp.
  const sups = _supRows.filter(filterFn('supplier'));
  const supTotal = sups.reduce((s, r) => s + r.chenhLech, 0);
  _host.querySelector('[data-sup-rows]').innerHTML = sups.length ? sups.map((r) => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.supplier)}</td>
      <td class="text-end">${formatMoney(r.daUng)}</td>
      <td class="text-end">${formatMoney(r.tongHoaDon)}</td>
      <td class="text-end fw-semibold ${r.chenhLech >= 0 ? 'text-success-emphasis' : 'text-warning-emphasis'}">${formatMoney(r.chenhLech)}</td>
    </tr>`).join('')
    : '<tr><td colspan="5" class="text-center text-muted py-3">Chưa có công nợ nhà cung cấp.</td></tr>';
  _host.querySelector('[data-sup-sum]').textContent =
    `${sups.length} đối tác · Chênh lệch ${formatMoney(supTotal)}`;
}
