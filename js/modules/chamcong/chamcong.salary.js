// ============================================================================
//  modules/chamcong/chamcong.salary.js  —  TẦNG GIAO DIỆN (Layer 6): Tổng Lương Tuần
// ----------------------------------------------------------------------------
//  @module chamcong.salary
//
//  THÀNH PHẦN 2 (doc 04 §6): bảng GOM THEO CÔNG NHÂN để chốt lương.
//    • Lọc 1 tuần cụ thể → group (tuần × tên), hiện thêm cột Trừ Nợ + Thực Lãnh
//      và cho tick chọn nhiều người → tổng Thực Lãnh đang chọn (xuất phiếu lương).
//    • "Tất cả tuần" → group theo tên (gộp nhiều tuần), ẨN Trừ Nợ/Thực Lãnh
//      (cộng dồn nhiều tuần không có nghĩa chốt).
//  Mỗi dòng: 7 ngày cộng dồn · TC · TC Lương (lương+PC) · Lương TB/ngày · các CT
//  tham gia (badge +N nếu >1). Desktop = bảng; mobile (<992px) = card view.
//
//  Là 1 trong 2 màn của sub-tab "📊 Tổng lương / Lịch sử" (vỏ ở chamcong.history.js).
// ============================================================================

import { getSelectedYear } from '../../topbar.js';
import { setLoading } from '../../utils/ui.js';
import { formatMoney, formatNumber } from '../../utils/fmt.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';
import { loadProjects, getProjectName } from '../projects/projects.data.js';
import { getTimesheetWeeks } from './chamcong.data.js';
import { totalDays, laborPay, takeHome, weekLabel } from './chamcong.calc.js';
import { exportTltCsv, exportSalarySlip } from './chamcong.report.js';

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// ----------------------------------------------------------------------------
//  TRẠNG THÁI MODULE — sống trong lần render hiện tại của màn.
// ----------------------------------------------------------------------------
let _host = null;
let _weeks = [];        // các tuần còn dùng trong NĂM đang chọn
let _list = [];         // kết quả gom hiện đang vẽ (cho xuất CSV/phiếu lương)
let _single = false;    // đang lọc đơn-tuần? (mới có cột Thực Lãnh + phiếu lương)
let _weekText = '';     // nhãn tuần đang lọc (đặt tên file)

const q = (sel) => _host.querySelector(sel);
const num = (x) => Number(x) || 0;

// esc(s) — chống vỡ HTML khi đổ chuỗi người dùng vào bảng/option.
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// day(v) — hiển thị ô ngày: '' nếu 0, ngược lại số (giữ 0,5).
const day = (v) => (num(v) ? formatNumber(v) : '');

// ----------------------------------------------------------------------------
//  renderWeeklySalary(host) — Vẽ bộ lọc (tuần + tìm) + bảng/card tổng lương.
// ----------------------------------------------------------------------------
export async function renderWeeklySalary(host) {
  _host = host;
  host.innerHTML = `
    <div class="row g-2 align-items-end mb-3">
      <div class="col-12 col-md-4">
        <label class="form-label small mb-1 fw-semibold">🗓️ Tuần</label>
        <select class="form-select form-select-sm" data-fweek></select>
      </div>
      <div class="col-12 col-md-4">
        <label class="form-label small mb-1 fw-semibold">🔍 Tìm công nhân</label>
        <input class="form-control form-control-sm" data-search placeholder="Tên công nhân…">
      </div>
    </div>
    <div data-results></div>`;

  setLoading(true, 'Đang tải tổng lương…');
  try {
    await loadProjects();
    _weeks = await getTimesheetWeeks({ year: getSelectedYear() });
  } finally {
    setLoading(false);
  }

  fillWeeks();
  q('[data-fweek]').addEventListener('change', render);
  q('[data-search]').addEventListener('input', render);
  render();
}

// fillWeeks() — Đổ dropdown tuần (Tất cả + từng tuần khác nhau, mới nhất trước).
function fillWeeks() {
  const seen = new Map();
  for (const w of _weeks) {
    if (w.fromDate && !seen.has(w.fromDate)) seen.set(w.fromDate, weekLabel(w.fromDate));
  }
  const items = [...seen.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  q('[data-fweek]').innerHTML = `<option value="">Tất cả tuần</option>` +
    items.map(([f, l]) => `<option value="${f}">${esc(l)}</option>`).join('');
}

// ----------------------------------------------------------------------------
//  aggregate(weekFilter) — Gom theo TÊN công nhân (không dấu). weekFilter rỗng =
//  mọi tuần; ngược lại chỉ tuần đó. Trả mảng sắp theo tên (A→Z tiếng Việt).
// ----------------------------------------------------------------------------
function aggregate(weekFilter) {
  const map = new Map();
  for (const w of _weeks) {
    if (weekFilter && w.fromDate !== weekFilter) continue;
    for (const wk of (w.workers || [])) {
      const nm = String(wk.name || '').trim();
      if (!nm) continue;
      const key = normalizeVietnamese(nm);
      let a = map.get(key);
      if (!a) {
        a = { name: nm, days: [0, 0, 0, 0, 0, 0, 0], td: 0, pay: 0, allow: 0,
          ded: 0, take: 0, retail: 0, loan: 0, debt: 0, projs: new Set() };
        map.set(key, a);
      }
      const d = Array.isArray(wk.days) ? wk.days : [];
      for (let i = 0; i < 7; i++) a.days[i] += num(d[i]);
      a.td += totalDays(wk);
      a.pay += laborPay(wk);
      a.allow += num(wk.allowance);
      a.ded += num(wk.deduction);
      a.take += takeHome(wk);
      a.retail += num(wk.retailInvoice);
      a.loan += num(wk.loanAmount);
      // Nợ cũ là SNAPSHOT trước tuần — chỉ lấy 1 lần/người (đơn-tuần các bản ghi cùng số).
      if (!a._debtSeen) { a.debt = num(wk.debtBefore); a._debtSeen = true; }
      if (w.projectId) a.projs.add(w.projectId);
    }
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name, 'vi'));
}

// projBadge(set) — Hiển thị CT tham gia: tên CT đầu + badge "+N" nếu nhiều CT.
function projBadge(set) {
  const ids = [...set];
  if (!ids.length) return '—';
  const first = esc(getProjectName(ids[0]));
  return ids.length > 1
    ? `${first} <span class="badge bg-secondary-subtle text-secondary-emphasis">+${ids.length - 1}</span>`
    : first;
}

// ----------------------------------------------------------------------------
//  render() — Vẽ bảng (desktop) + card (mobile) theo bộ lọc; đơn-tuần thì thêm
//  cột Trừ Nợ/Thực Lãnh + checkbox chọn → tổng Thực Lãnh đang chọn.
// ----------------------------------------------------------------------------
function render() {
  const box = q('[data-results]');
  const wk = q('[data-fweek]').value;
  const kw = normalizeVietnamese(q('[data-search]').value.trim());
  const single = !!wk;

  let list = aggregate(wk);
  if (kw) list = list.filter((a) => normalizeVietnamese(a.name).includes(kw));

  _list = list; _single = single; _weekText = single ? weekLabel(wk) : '';

  if (!list.length) {
    box.innerHTML = '<p class="text-muted small mb-0">Không có dữ liệu lương khớp điều kiện.</p>';
    return;
  }

  const avg = (a) => (a.td ? a.pay / a.td : 0);
  const sumPay = list.reduce((s, a) => s + a.pay + a.allow, 0);

  const dayHead = DAY_NAMES.map((n) => `<th class="text-center">${n}</th>`).join('');
  const extraHead = single ? '<th class="text-end">Trừ Nợ</th><th class="text-end">Thực Lãnh</th>' : '';
  const chkHead = single ? '<th style="width:32px"></th>' : '';

  const rowsHtml = list.map((a, i) => {
    const dcells = a.days.map((v) => `<td class="text-center">${day(v)}</td>`).join('');
    const extra = single
      ? `<td class="text-end">${formatMoney(a.ded)}</td>
         <td class="text-end fw-semibold ${a.take < 0 ? 'text-danger' : ''}">${formatMoney(a.take)}</td>`
      : '';
    const chk = single
      ? `<td class="text-center"><input type="checkbox" class="form-check-input" data-pick data-idx="${i}"></td>`
      : '';
    return `<tr>
      ${chk}
      <td>${i + 1}</td>
      <td class="text-nowrap fw-semibold">${esc(a.name)}</td>
      ${dcells}
      <td class="text-center">${formatNumber(a.td)}</td>
      <td class="text-end">${formatMoney(a.pay + a.allow)}</td>
      <td class="text-end">${formatMoney(avg(a))}</td>
      <td class="text-nowrap">${projBadge(a.projs)}</td>
      ${extra}
    </tr>`;
  }).join('');

  const cardsHtml = list.map((a, idx) => {
    const dline = DAY_NAMES.map((n, i) => `${n}:${day(a.days[i]) || '·'}`).join(' ');
    const extra = single
      ? `<div class="d-flex justify-content-between"><span class="text-muted">Trừ nợ</span><span>${formatMoney(a.ded)}</span></div>
         <div class="d-flex justify-content-between"><span class="text-muted">Thực lãnh</span><span class="fw-semibold ${a.take < 0 ? 'text-danger' : ''}">${formatMoney(a.take)}</span></div>`
      : '';
    const chk = single
      ? `<input type="checkbox" class="form-check-input" data-pick data-idx="${idx}">`
      : '';
    return `<div class="border rounded p-2 mb-2">
      <div class="d-flex align-items-center gap-2 mb-1">
        ${chk}<span class="fw-semibold">${esc(a.name)}</span>
        <span class="ms-auto small text-muted">${projBadge(a.projs)}</span>
      </div>
      <div class="small text-muted mb-1">${dline}</div>
      <div class="d-flex justify-content-between"><span class="text-muted">TC</span><span>${formatNumber(a.td)}</span></div>
      <div class="d-flex justify-content-between"><span class="text-muted">TC Lương</span><span>${formatMoney(a.pay + a.allow)}</span></div>
      <div class="d-flex justify-content-between"><span class="text-muted">TB/ngày</span><span>${formatMoney(avg(a))}</span></div>
      ${extra}
    </div>`;
  }).join('');

  box.innerHTML = `
    <div class="d-flex flex-wrap align-items-center mb-2 gap-2">
      <span class="badge bg-secondary-subtle text-secondary-emphasis">${list.length} công nhân</span>
      <button type="button" class="btn btn-sm btn-outline-secondary" data-csv>⬇ Tải CSV</button>
      ${single ? '<button type="button" class="btn btn-sm btn-outline-success" data-slip disabled>🧾 Xuất phiếu lương</button>' : ''}
      <span class="ms-auto fw-semibold">Tổng TC Lương: ${formatMoney(sumPay)}</span>
      ${single ? '<span class="w-100 small text-muted" data-selsum>Đã chọn: 0 người — 0</span>' : ''}
    </div>
    <div class="table-responsive d-none d-lg-block">
      <table class="table table-sm table-hover align-middle mb-0">
        <thead class="table-light"><tr>
          ${chkHead}<th>#</th><th>Tên Công Nhân</th>${dayHead}
          <th class="text-center">TC</th><th class="text-end">TC Lương</th>
          <th class="text-end">TB/ngày</th><th>Công trình</th>${extraHead}
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="d-lg-none">${cardsHtml}</div>`;

  box.querySelector('[data-csv]').addEventListener('click', () =>
    exportTltCsv({ list: _list.map(withProjNames), single: _single, dayNames: DAY_NAMES, weekText: _weekText }));

  if (single) {
    box.querySelectorAll('[data-pick]').forEach((c) => c.addEventListener('change', updateSelectedSum));
    box.querySelector('[data-slip]').addEventListener('click', handleSlip);
  }
}

// withProjNames(a) — Gắn chuỗi tên CT (cho cột "Công trình" của CSV).
function withProjNames(a) {
  return { ...a, projNames: [...a.projs].map(getProjectName).join(', ') };
}

// pickedRows() — Các dòng đang tick (dedup theo data-idx vì bảng & card cùng list).
function pickedRows() {
  const idx = new Set([..._host.querySelectorAll('[data-pick]:checked')].map((c) => Number(c.dataset.idx)));
  return [...idx].sort((x, y) => x - y).map((i) => _list[i]).filter(Boolean);
}

// handleSlip() — Gom các công nhân đang tick → xuất phiếu lương PNG (doc 04 §8).
function handleSlip() {
  const rows = pickedRows();
  if (!rows.length) return;
  const projIds = new Set();
  rows.forEach((a) => a.projs.forEach((p) => projIds.add(p)));
  const projNames = [...projIds].map(getProjectName).join(', ');
  exportSalarySlip({
    periodText: _weekText,
    projNames,
    fileTag: projIds.size === 1 ? getProjectName([...projIds][0]) : 'NhieuCT',
    workers: rows.map((a) => ({
      name: a.name, td: a.td, avg: a.td ? a.pay / a.td : 0, allow: a.allow,
      payTotal: a.pay + a.allow, retail: a.retail, loan: a.loan, ded: a.ded,
      debtNow: a.debt + a.loan - a.ded, take: a.take,
    })),
  });
}

// updateSelectedSum() — Cộng Thực Lãnh các dòng đang tick. Bảng & card cùng dùng
// data-idx → dedup theo idx để không nhân đôi (mỗi lúc chỉ 1 layout hiển thị).
function updateSelectedSum() {
  const rows = pickedRows();
  const sum = rows.reduce((s, a) => s + num(a.take), 0);
  const el = _host.querySelector('[data-selsum]');
  if (el) el.textContent = `Đã chọn: ${rows.length} người — ${formatMoney(sum)}`;
  const slip = _host.querySelector('[data-slip]');
  if (slip) slip.disabled = !rows.length;
}
