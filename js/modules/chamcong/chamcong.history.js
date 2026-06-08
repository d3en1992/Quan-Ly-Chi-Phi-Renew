// ============================================================================
//  modules/chamcong/chamcong.history.js  —  TẦNG GIAO DIỆN (Layer 6): Lịch Sử Tuần
// ----------------------------------------------------------------------------
//  @module chamcong.history
//
//  Vỏ sub-tab "📊 Tổng lương / Lịch sử" (doc 04 §6+§7) — 1 nút chuyển 2 màn:
//    • 📊 Tổng lương tuần  → renderWeeklySalary (chamcong.salary.js).
//    • 📜 Lịch sử tuần      → renderHistory (file này, THÀNH PHẦN 3, doc 04 §7).
//
//  LỊCH SỬ: bảng GOM THEO (tuần × công trình) — mỗi dòng = 1 bản ghi tuần. Lọc CT/
//  tuần/tìm (không dấu), phân trang + chân tổng. Thao tác: [↩ Tải] đổ lại vào form
//  tuần để sửa (qua callback shell) · [✕ Xóa] xóa mềm. Lọc theo NĂM đang chọn.
// ============================================================================

import { getSelectedYear } from '../../topbar.js';
import { toast, confirm2, setLoading } from '../../utils/ui.js';
import { formatMoney, formatNumber } from '../../utils/fmt.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';
import { loadProjects, getProjectOptions, getProjectName } from '../projects/projects.data.js';
import { getTimesheetWeeks, deleteWeek } from './chamcong.data.js';
import { totalDays, takeHome, weekLaborTotal, weekLabel } from './chamcong.calc.js';
import { renderWeeklySalary } from './chamcong.salary.js';
import { exportHistoryCsv } from './chamcong.report.js';

const PAGE_SIZE = 15;
const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// ----------------------------------------------------------------------------
//  TRẠNG THÁI MODULE.
// ----------------------------------------------------------------------------
let _host = null;
let _onLoadWeek = null;   // callback(weekId, projectId) shell cấp để mở form sửa
let _all = [];            // các bản ghi tuần còn dùng trong năm
let _page = 1;
let _view = 'salary';     // màn đang xem trong sub-tab (nhớ giữa các lần vẽ)

const q = (sel) => _host.querySelector(sel);
const num = (x) => Number(x) || 0;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const day = (v) => (num(v) ? formatNumber(v) : '');

// ----------------------------------------------------------------------------
//  renderSalaryHistory(host, opts) — Vỏ 2 màn. opts.onLoadWeek(id, projectId) để
//  từ Lịch sử bấm [↩ Tải] nhảy sang form Sổ chấm công.
// ----------------------------------------------------------------------------
export async function renderSalaryHistory(host, opts = {}) {
  _onLoadWeek = typeof opts.onLoadWeek === 'function' ? opts.onLoadWeek : null;
  host.innerHTML = `
    <div class="btn-group btn-group-sm mb-3" role="group">
      <button type="button" class="btn ${_view === 'salary' ? 'btn-primary' : 'btn-outline-primary'}" data-v="salary">📊 Tổng lương tuần</button>
      <button type="button" class="btn ${_view === 'history' ? 'btn-primary' : 'btn-outline-primary'}" data-v="history">📜 Lịch sử tuần</button>
    </div>
    <div data-view></div>`;

  host.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
    if (_view === b.dataset.v) return;
    _view = b.dataset.v;
    renderSalaryHistory(host, opts);
  }));

  const inner = host.querySelector('[data-view]');
  if (_view === 'salary') await renderWeeklySalary(inner);
  else await renderHistory(inner);
}

// ----------------------------------------------------------------------------
//  renderHistory(host) — Màn Lịch sử (bảng theo tuần × CT).
// ----------------------------------------------------------------------------
export async function renderHistory(host) {
  _host = host;
  _page = 1;
  host.innerHTML = `
    <div class="row g-2 align-items-end mb-3">
      <div class="col-12 col-md-4">
        <label class="form-label small mb-1 fw-semibold">🏗️ Công trình</label>
        <select class="form-select form-select-sm" data-fproject></select>
      </div>
      <div class="col-6 col-md-4">
        <label class="form-label small mb-1 fw-semibold">🗓️ Tuần</label>
        <select class="form-select form-select-sm" data-fweek></select>
      </div>
      <div class="col-6 col-md-4">
        <label class="form-label small mb-1 fw-semibold">🔍 Tìm</label>
        <input class="form-control form-control-sm" data-search placeholder="Tên CT / công nhân…">
      </div>
    </div>
    <div data-results></div>`;

  setLoading(true, 'Đang tải lịch sử…');
  try {
    await loadProjects();
    _all = await getTimesheetWeeks({ year: getSelectedYear() });
  } finally {
    setLoading(false);
  }

  fillFilters();
  ['[data-fproject]', '[data-fweek]', '[data-search]'].forEach((sel) =>
    q(sel).addEventListener('input', () => { _page = 1; renderTable(); }));
  renderTable();
}

// fillFilters() — Đổ dropdown CT (bỏ CÔNG TY) + tuần (mới nhất trước).
function fillFilters() {
  const projOpts = getProjectOptions({}).filter((o) => o.id !== 'COMPANY');
  q('[data-fproject]').innerHTML = `<option value="">Tất cả công trình</option>` +
    projOpts.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');

  const seen = new Map();
  for (const w of _all) if (w.fromDate && !seen.has(w.fromDate)) seen.set(w.fromDate, weekLabel(w.fromDate));
  const items = [...seen.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  q('[data-fweek]').innerHTML = `<option value="">Tất cả tuần</option>` +
    items.map(([f, l]) => `<option value="${f}">${esc(l)}</option>`).join('');
}

// filteredList() — Áp lọc CT/tuần/tìm (tên CT + tên công nhân, không dấu).
function filteredList() {
  const pid = q('[data-fproject]').value;
  const fweek = q('[data-fweek]').value;
  const kw = normalizeVietnamese(q('[data-search]').value.trim());
  return _all.filter((w) => {
    if (pid && w.projectId !== pid) return false;
    if (fweek && w.fromDate !== fweek) return false;
    if (kw) {
      const names = (w.workers || []).map((x) => x.name || '').join(' ');
      const hay = normalizeVietnamese(`${getProjectName(w.projectId)} ${names}`);
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

// rowOf(w) — Tổng hợp 1 bản ghi tuần thành các số để vẽ 1 dòng bảng.
function rowOf(w) {
  const days = [0, 0, 0, 0, 0, 0, 0];
  let td = 0, allow = 0, retail = 0, take = 0;
  const notes = new Set();
  for (const wk of (w.workers || [])) {
    const d = Array.isArray(wk.days) ? wk.days : [];
    for (let i = 0; i < 7; i++) days[i] += num(d[i]);
    td += totalDays(wk);
    allow += num(wk.allowance);
    retail += num(wk.retailInvoice);
    take += takeHome(wk);
    if (wk.note) notes.add(wk.note);
  }
  const pay = weekLaborTotal(w);
  return { days, td, pay, avg: td ? pay / td : 0, allow, retail, take, note: [...notes].join('; ') };
}

// ----------------------------------------------------------------------------
//  renderTable() — Bảng lịch sử (đã lọc) trang hiện tại + phân trang + chân tổng.
// ----------------------------------------------------------------------------
function renderTable() {
  const box = q('[data-results]');
  const list = filteredList();

  if (!list.length) {
    box.innerHTML = '<p class="text-muted small mb-0">Không có tuần chấm công nào khớp điều kiện.</p>';
    return;
  }

  let sumPay = 0, sumTotal = 0;
  for (const w of list) { const r = rowOf(w); sumPay += r.pay; sumTotal += r.take; }

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (_page > pages) _page = pages;
  const start = (_page - 1) * PAGE_SIZE;
  const rows = list.slice(start, start + PAGE_SIZE);

  const dayHead = DAY_NAMES.map((n) => `<th class="text-center">${n}</th>`).join('');

  box.innerHTML = `
    <div class="d-flex flex-wrap align-items-center mb-2 gap-2">
      <span class="badge bg-secondary-subtle text-secondary-emphasis">${list.length} tuần</span>
      <button type="button" class="btn btn-sm btn-outline-secondary" data-csv>⬇ Tải CSV</button>
      <span class="ms-auto fw-semibold">Tổng lương: ${formatMoney(sumPay)} · Tổng cộng: ${formatMoney(sumTotal)}</span>
    </div>
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle mb-2">
        <thead class="table-light"><tr>
          <th>Kỳ tuần</th><th>Công trình</th>${dayHead}
          <th class="text-center">TC</th><th class="text-end">TB/ngày</th>
          <th class="text-end">Tổng lương</th><th class="text-end">Phụ cấp</th>
          <th class="text-end">HĐ lẻ</th><th>Nội dung</th><th class="text-end">Tổng cộng</th>
          <th style="width:84px"></th>
        </tr></thead>
        <tbody>
          ${rows.map((w) => {
            const r = rowOf(w);
            const dcells = r.days.map((v) => `<td class="text-center">${day(v)}</td>`).join('');
            return `<tr>
              <td class="text-nowrap">${esc(weekLabel(w.fromDate))}</td>
              <td>${esc(getProjectName(w.projectId))}</td>
              ${dcells}
              <td class="text-center">${formatNumber(r.td)}</td>
              <td class="text-end">${formatMoney(r.avg)}</td>
              <td class="text-end">${formatMoney(r.pay)}</td>
              <td class="text-end">${formatMoney(r.allow)}</td>
              <td class="text-end">${formatMoney(r.retail)}</td>
              <td>${esc(r.note)}</td>
              <td class="text-end fw-semibold ${r.take < 0 ? 'text-danger' : ''}">${formatMoney(r.take)}</td>
              <td class="text-nowrap">
                <button class="btn btn-sm btn-link p-0 me-2" data-load="${w.id}" title="Tải lại để sửa">↩</button>
                <button class="btn btn-sm btn-link text-danger p-0" data-del="${w.id}" title="Xóa">✕</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="d-flex align-items-center justify-content-between">
      <button type="button" class="btn btn-sm btn-outline-secondary" data-prev ${_page <= 1 ? 'disabled' : ''}>‹ Trước</button>
      <span class="small text-muted">Trang ${_page}/${pages}</span>
      <button type="button" class="btn btn-sm btn-outline-secondary" data-next ${_page >= pages ? 'disabled' : ''}>Sau ›</button>
    </div>`;

  box.querySelector('[data-csv]').addEventListener('click', () => exportHistoryCsv({
    dayNames: DAY_NAMES,
    list: list.map((w) => ({ ...rowOf(w), label: weekLabel(w.fromDate), projName: getProjectName(w.projectId) })),
  }));
  box.querySelector('[data-prev]').addEventListener('click', () => { if (_page > 1) { _page--; renderTable(); } });
  box.querySelector('[data-next]').addEventListener('click', () => { if (_page < pages) { _page++; renderTable(); } });
  box.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', () => handleLoad(b.dataset.load)));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => handleDelete(b.dataset.del)));
}

// handleLoad(id) — Nhờ shell mở Sổ chấm công và đổ đúng tuần + CT lên form.
function handleLoad(id) {
  const w = _all.find((r) => r.id === id);
  if (!w) { toast('Không tìm thấy tuần.', 'warning'); return; }
  if (_onLoadWeek) _onLoadWeek(w.id, w.projectId);
  else toast('Không mở được form tuần.', 'warning');
}

// handleDelete(id) — Xác nhận → xóa mềm → bỏ khỏi danh sách RAM → vẽ lại.
async function handleDelete(id) {
  if (!(await confirm2('Xóa tuần chấm công này? (có thể khôi phục khi đồng bộ)'))) return;
  await deleteWeek(id);
  _all = _all.filter((r) => r.id !== id);
  toast('Đã xóa tuần chấm công.', 'success');
  renderTable();
}
