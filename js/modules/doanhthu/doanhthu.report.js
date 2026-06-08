// ============================================================================
//  modules/doanhthu/doanhthu.report.js  —  TẦNG GIAO DIỆN (Layer 6)
// ----------------------------------------------------------------------------
//  @module doanhthu.report
//
//  Màn BÁO CÁO CÔNG NỢ PHẢI THU (Chủ Đầu Tư) của tab Doanh Thu (doc 08 §5,§6) —
//  gom theo TỪNG CÔNG TRÌNH: Tổng HĐ − Đã thu = Còn phải thu, kèm 3 thẻ KPI tổng và
//  nút [⬇ CSV] xuất tập đang lọc (UTF-8 BOM cho Excel đọc tiếng Việt đúng).
//    • Số liệu DERIVED — tính lại mỗi render, KHÔNG lưu store riêng.
//    • Lọc theo NĂM đang chọn GIỐNG calcKpi (năm 0 = mọi năm) → tổng chân bảng
//      khớp đúng 3 thẻ KPI của sub-tab Thống kê (1 nguồn sự thật).
//    • Cột Công Trình + Chủ Đầu Tư đọc REALTIME (getProjectName/getProjectById) —
//      đổi ở Tab 01 là đổi theo, không lưu trùng.
//
//  EXPORT: computeReceivables({ year }) (hàm thuần, tiện test) + renderReceivableReport(host).
// ============================================================================

import { toast } from '../../utils/ui.js';
import { formatMoney } from '../../utils/fmt.js';
import { normalizeKey } from '../../utils/cat.js';
import { getSelectedYear } from '../../topbar.js';
import { loadProjects, getProjectName, getProjectById } from '../projects/projects.data.js';
import { getAllContracts, getReceipts, contractTotal } from './doanhthu.data.js';

const num = (x) => Number(x) || 0;

// escapeHtml(s) — Chống XSS khi đổ chuỗi người dùng vào ô.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// investorOf(pid) — Chủ Đầu Tư realtime của 1 CT (— nếu không có).
const investorOf = (pid) => getProjectById(pid)?.investor || '—';

// TRẠNG THÁI MÀN — chỉ sống trong lần render hiện tại.
let _host = null;
let _rows = [];   // mọi dòng công nợ của năm (chưa lọc client)

// ----------------------------------------------------------------------------
//  computeReceivables({ year }) — Gom công nợ phải thu theo CÔNG TRÌNH (derived).
//   Trả về { rows, totals }. rows = [{ projectId, name, investor, tongHD, daThu,
//   conPhaiThu, pct }] sắp Còn phải thu giảm dần (nợ nhiều lên trước). Năm 0 = mọi năm.
// ----------------------------------------------------------------------------
export async function computeReceivables({ year = getSelectedYear() } = {}) {
  const contracts = (await getAllContracts())
    .filter((c) => !year || String(c.date || '').startsWith(String(year)));
  const receipts = await getReceipts({ year });

  const hd = new Map();   // projectId → Tổng giá trị HĐ
  for (const c of contracts) hd.set(c.projectId, num(hd.get(c.projectId)) + contractTotal(c));
  const thu = new Map();  // projectId → Đã thu
  for (const r of receipts) thu.set(r.projectId, num(thu.get(r.projectId)) + num(r.amount));

  const rows = [...new Set([...hd.keys(), ...thu.keys()])].map((pid) => {
    const tongHD = num(hd.get(pid));
    const daThu = num(thu.get(pid));
    return {
      projectId: pid,
      name: getProjectName(pid),
      investor: investorOf(pid),
      tongHD,
      daThu,
      conPhaiThu: tongHD - daThu,
      pct: tongHD > 0 ? daThu / tongHD : (daThu > 0 ? 1 : 0),
    };
  }).sort((a, b) => b.conPhaiThu - a.conPhaiThu || a.name.localeCompare(b.name, 'vi'));

  const totals = rows.reduce((t, r) => ({
    tongHD: t.tongHD + r.tongHD, daThu: t.daThu + r.daThu, conPhaiThu: t.conPhaiThu + r.conPhaiThu,
  }), { tongHD: 0, daThu: 0, conPhaiThu: 0 });

  return { rows, totals };
}

// ----------------------------------------------------------------------------
//  renderReceivableReport(host) — Vẽ KPI + bộ lọc + bảng công nợ phải thu + CSV.
// ----------------------------------------------------------------------------
export async function renderReceivableReport(host) {
  _host = host;

  host.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <div class="row g-2 mb-3" data-kpi></div>
        <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
          <div>
            <label class="form-label small mb-1">Công trình</label>
            <select class="form-select form-select-sm" data-f-project style="min-width:170px">
              <option value="">— Tất cả —</option>
            </select>
          </div>
          <div class="flex-fill" style="min-width:160px">
            <label class="form-label small mb-1">🔍 Tìm</label>
            <input class="form-control form-control-sm" data-f-search placeholder="Công trình / Chủ đầu tư">
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-reset>↺ Xóa lọc</button>
          <button type="button" class="btn btn-sm btn-success ms-auto" data-csv>⬇ CSV</button>
        </div>
        <div class="table-responsive border rounded">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th style="min-width:160px">Công trình</th>
                <th style="min-width:140px">Chủ đầu tư</th>
                <th style="width:140px" class="text-end">Tổng HĐ</th>
                <th style="width:140px" class="text-end">Đã thu</th>
                <th style="width:90px" class="text-end">% thu</th>
                <th style="width:150px" class="text-end">Còn phải thu</th>
              </tr>
            </thead>
            <tbody data-rows></tbody>
          </table>
        </div>
        <div class="mt-2">
          <span class="badge bg-secondary-subtle text-secondary-emphasis" data-sum></span>
        </div>
      </div>
    </div>`;

  const { rows } = await loadAndCompute();
  fillProjectFilter(rows);
  bindEvents();
  renderTable();
}

// loadAndCompute() — Nạp CT + tính công nợ năm đang chọn vào _rows.
async function loadAndCompute() {
  await loadProjects();
  const res = await computeReceivables({ year: getSelectedYear() });
  _rows = res.rows;
  return res;
}

// fillProjectFilter(rows) — Đổ CT có phát sinh công nợ vào dropdown lọc.
function fillProjectFilter(rows) {
  const sel = _host.querySelector('[data-f-project]');
  sel.insertAdjacentHTML('beforeend',
    rows.map((r) => `<option value="${r.projectId}">${escapeHtml(r.name)}</option>`).join(''));
}

// bindEvents() — Gắn sự kiện cho bộ lọc + nút CSV (1 lần mỗi render).
function bindEvents() {
  _host.querySelector('[data-f-project]').addEventListener('input', renderTable);
  _host.querySelector('[data-f-search]').addEventListener('input', renderTable);
  _host.querySelector('[data-reset]').addEventListener('click', () => {
    _host.querySelector('[data-f-project]').value = '';
    _host.querySelector('[data-f-search]').value = '';
    renderTable();
  });
  _host.querySelector('[data-csv]').addEventListener('click', exportCsv);
}

// filteredRows() — Áp bộ lọc CT + tìm không dấu (tên CT / Chủ đầu tư) lên _rows.
function filteredRows() {
  const pid = _host.querySelector('[data-f-project]').value;
  const kw = normalizeKey(_host.querySelector('[data-f-search]').value.trim());
  return _rows.filter((r) => {
    if (pid && r.projectId !== pid) return false;
    if (!kw) return true;
    return normalizeKey(`${r.name} ${r.investor}`).includes(kw);
  });
}

// kpiCard(label, value, cls) — 1 thẻ KPI tổng.
function kpiCard(label, value, cls) {
  return `<div class="col-12 col-sm-4">
    <div class="border rounded p-2 h-100 ${cls}">
      <div class="small text-muted">${label}</div>
      <div class="fs-5 fw-bold">${formatMoney(value)}</div>
    </div></div>`;
}

// ----------------------------------------------------------------------------
//  renderTable() — Vẽ KPI + bảng theo tập đang lọc + chân tổng.
// ----------------------------------------------------------------------------
function renderTable() {
  const list = filteredRows();
  const totals = list.reduce((t, r) => ({
    tongHD: t.tongHD + r.tongHD, daThu: t.daThu + r.daThu, conPhaiThu: t.conPhaiThu + r.conPhaiThu,
  }), { tongHD: 0, daThu: 0, conPhaiThu: 0 });

  _host.querySelector('[data-kpi]').innerHTML =
    kpiCard('Tổng giá trị HĐ', totals.tongHD, 'bg-primary-subtle')
    + kpiCard('Tổng đã thu', totals.daThu, 'bg-success-subtle')
    + kpiCard('Còn phải thu', totals.conPhaiThu,
        totals.conPhaiThu > 0 ? 'bg-warning-subtle' : 'bg-body-secondary');

  _host.querySelector('[data-rows]').innerHTML = list.length ? list.map((r) => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.investor)}</td>
      <td class="text-end">${formatMoney(r.tongHD)}</td>
      <td class="text-end">${formatMoney(r.daThu)}</td>
      <td class="text-end">${Math.round(r.pct * 100)}%</td>
      <td class="text-end fw-semibold ${r.conPhaiThu > 0 ? 'text-warning-emphasis' : 'text-success-emphasis'}">${formatMoney(r.conPhaiThu)}</td>
    </tr>`).join('')
    : '<tr><td colspan="6" class="text-center text-muted py-3">Chưa có dữ liệu công nợ.</td></tr>';

  _host.querySelector('[data-sum]').textContent =
    `${list.length} công trình · Còn phải thu ${formatMoney(totals.conPhaiThu)}`;
}

// ----------------------------------------------------------------------------
//  XUẤT CSV — UTF-8 BOM + CRLF để Excel đọc tiếng Việt đúng.
// ----------------------------------------------------------------------------
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// today2() — ddmmyy cho tên file.
function today2() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0')
    + String(d.getMonth() + 1).padStart(2, '0')
    + String(d.getFullYear()).slice(2);
}

// exportCsv() — Xuất tập công nợ đang lọc ra file CSV.
function exportCsv() {
  const list = filteredRows();
  if (!list.length) { toast('Không có dữ liệu để xuất.', 'warning'); return; }
  const head = ['#', 'Công trình', 'Chủ đầu tư', 'Tổng HĐ', 'Đã thu', '% thu', 'Còn phải thu'];
  const body = list.map((r, i) =>
    [i + 1, r.name, r.investor, formatMoney(r.tongHD), formatMoney(r.daThu),
      `${Math.round(r.pct * 100)}%`, formatMoney(r.conPhaiThu)]);
  const totals = list.reduce((t, r) => ({
    tongHD: t.tongHD + r.tongHD, daThu: t.daThu + r.daThu, conPhaiThu: t.conPhaiThu + r.conPhaiThu,
  }), { tongHD: 0, daThu: 0, conPhaiThu: 0 });
  body.push(['', 'TỔNG', '', formatMoney(totals.tongHD), formatMoney(totals.daThu), '',
    formatMoney(totals.conPhaiThu)]);

  const year = getSelectedYear() || 'tatca';
  const text = [head, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `CongNoPhaiThu_${year}_${today2()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('⬇️ Đã xuất CSV công nợ phải thu.', 'success');
}
