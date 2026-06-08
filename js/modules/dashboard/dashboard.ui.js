// ============================================================================
//  modules/dashboard/dashboard.ui.js  —  TẦNG GIAO DIỆN (Layer 6): Vỏ tab
// ----------------------------------------------------------------------------
//  @module dashboard.ui
//
//  VỎ điều phối tab 📊 Tổng quan (doc 09) — "trung tâm chỉ huy" CHỈ ĐỌC. Đọc DB
//  một lần qua loadDashboard(), rồi vẽ: hàng KPI + biểu đồ cột (tuần/tháng) +
//  pie tỷ trọng + 3 khối chi tiết theo CT. Tự đăng ký vào router qua
//  registerTab('dashboard', render) (side-effect import từ app.js).
//
//  Bộ lọc trong tab (KHÔNG đọc DB lại — tính từ costRows đã có):
//    • Khoảng tuần (chỉ chế độ 1 năm): Toàn bộ / 12 / 8 / 4 tuần → vẽ lại cột.
//    • Công trình: chỉ ảnh hưởng Top CT + 2 khối chi tiết, KHÔNG đổi KPI/biểu đồ.
//  Đổi năm ở topbar → router gọi lại render → tự reset 2 bộ lọc trên.
// ============================================================================

import { registerTab } from '../../router.js';
import { getSelectedYear } from '../../topbar.js';
import { toast, setLoading } from '../../utils/ui.js';
import {
  loadDashboard, calcKpi, weeklyCost, monthlyCost, costByType, topProjects, buildCsv,
} from './dashboard.data.js';
import { barChart, pieChart } from './dashboard.charts.js';
import {
  kpiCards, topProjectsBlock, advancesBlock, equipmentBlock,
} from './dashboard.cards.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const RANGES = [['all', 'Toàn bộ'], ['12', '12 tuần'], ['8', '8 tuần'], ['4', '4 tuần']];

let _host = null;        // ô nội dung tab
let _bundle = null;      // gói dữ liệu đã đọc (costRows + ứng + thiết bị)
let _range = 'all';      // khoảng tuần đang chọn (chế độ 1 năm)
let _project = '';       // CT đang lọc ('' = tất cả)

// ----------------------------------------------------------------------------
//  render(host) — Vẽ toàn bộ tab. Reset bộ lọc mỗi lần vào / đổi năm.
// ----------------------------------------------------------------------------
async function render(host) {
  _host = host;
  _range = 'all';
  _project = '';

  host.innerHTML = `<div class="text-center text-muted py-5">Đang tải tổng quan…</div>`;

  setLoading(true, 'Đang tổng hợp…');
  try {
    _bundle = await loadDashboard({ year: getSelectedYear() });
  } catch (e) {
    host.innerHTML = `<div class="alert alert-danger">Không tải được dữ liệu: ${escapeHtml(e.message || e)}</div>`;
    return;
  } finally {
    setLoading(false);
  }

  host.innerHTML = shell();
  bind();
  paintAll();
}

// shell() — Khung tĩnh: thanh công cụ + các ô để vẽ động vào.
function shell() {
  const projOpts = topProjects(_bundle.costRows)
    .map((p) => `<option value="${escapeHtml(p.projectId)}">${escapeHtml(p.name)}</option>`).join('');

  const rangeBtns = _bundle.singleYear ? `
    <div class="btn-group btn-group-sm" role="group" data-range-group>
      ${RANGES.map(([v, l]) =>
        `<button class="btn btn-outline-secondary${v === _range ? ' active' : ''}" data-range="${v}">${l}</button>`).join('')}
    </div>` : '';

  return `
    <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
      <h2 class="h5 mb-0">📊 Tổng quan</h2>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <select class="form-select form-select-sm" style="width:auto;" data-project>
          <option value="">— Tất cả công trình —</option>
          ${projOpts}
        </select>
        <button class="btn btn-sm btn-outline-success" data-csv>⬇ Xuất CSV</button>
      </div>
    </div>

    <div data-kpi></div>

    <div class="row g-3 mb-3">
      <div class="col-lg-8">
        <div class="card shadow-sm h-100">
          <div class="card-header py-2 d-flex flex-wrap gap-2 justify-content-between align-items-center">
            <span class="fw-semibold small">${_bundle.singleYear ? 'Chi phí theo tuần (CN→T7)' : 'Chi phí theo tháng'}</span>
            ${rangeBtns}
          </div>
          <div class="card-body" data-bar></div>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="card shadow-sm h-100">
          <div class="card-header py-2 fw-semibold small">Tỷ trọng loại chi phí</div>
          <div class="card-body" data-pie></div>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-md-4" data-top></div>
      <div class="col-md-4" data-adv></div>
      <div class="col-md-4" data-equip></div>
    </div>`;
}

// bind() — Gắn sự kiện cho thanh công cụ + nút khoảng tuần.
function bind() {
  const proj = _host.querySelector('[data-project]');
  if (proj) proj.onchange = () => { _project = proj.value; paintDetails(); };

  _host.querySelector('[data-csv]').onclick = exportCsv;

  const group = _host.querySelector('[data-range-group]');
  if (group) {
    group.onclick = (e) => {
      const btn = e.target.closest('[data-range]');
      if (!btn) return;
      _range = btn.dataset.range;
      group.querySelectorAll('[data-range]').forEach((b) => b.classList.toggle('active', b === btn));
      paintBar();
    };
  }
}

// ----------------------------------------------------------------------------
//  Vẽ động — tính từ _bundle.costRows đã có trong bộ nhớ (không đọc DB lại).
// ----------------------------------------------------------------------------
function paintAll() { paintKpi(); paintBar(); paintPie(); paintDetails(); }

function paintKpi() {
  const kpi = calcKpi(_bundle.costRows, _bundle.year);
  _host.querySelector('[data-kpi]').innerHTML = kpiCards(kpi, _bundle.year);
}

function paintBar() {
  const html = _bundle.singleYear
    ? barChart(weeklyCost(_bundle.costRows, _range), { stacked: true })
    : barChart(monthlyCost(_bundle.costRows, _bundle.year), { stacked: false });
  _host.querySelector('[data-bar]').innerHTML = html;
}

function paintPie() {
  _host.querySelector('[data-pie]').innerHTML = pieChart(costByType(_bundle.costRows));
}

function paintDetails() {
  const tp = topProjects(_bundle.costRows, _project);
  const adv = _project ? _bundle.advByProject.filter((r) => r.projectId === _project) : _bundle.advByProject;
  const eq = _project ? _bundle.equipByProject.filter((r) => r.projectId === _project) : _bundle.equipByProject;

  _host.querySelector('[data-top]').innerHTML = topProjectsBlock(tp);
  _host.querySelector('[data-adv]').innerHTML = advancesBlock(adv);
  _host.querySelector('[data-equip]').innerHTML = equipmentBlock(eq);
}

// ----------------------------------------------------------------------------
//  exportCsv() — Xuất CSV tổng hợp (UTF-8 BOM + CRLF) để Excel đọc tiếng Việt.
// ----------------------------------------------------------------------------
function exportCsv() {
  const text = buildCsv(_bundle, _range);
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const yr = _bundle.singleYear ? _bundle.year : 'tatca';
  const a = document.createElement('a');
  a.href = url; a.download = `Dashboard_${yr}_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('⬇️ Đã xuất CSV tổng quan.', 'success');
}

registerTab('dashboard', render);
