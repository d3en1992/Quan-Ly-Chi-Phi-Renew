// ============================================================================
//  modules/doanhthu/doanhthu.stats.js  —  TẦNG GIAO DIỆN (Layer 6)
// ----------------------------------------------------------------------------
//  @module doanhthu.stats
//
//  Sub-tab "KHAI BÁO / THỐNG KÊ" của tab Doanh Thu (doc 08 §3) — màn TỔNG HỢP:
//    • 3 thẻ KPI derived: Tổng giá trị HĐ · Tổng đã thu · Còn phải thu (calcKpi).
//    • 3 bảng phân trang riêng: HĐ Chính · Thu Tiền · HĐ Thầu Phụ — mỗi bảng có
//      nút [＋ thêm] mở modal tương ứng (openContractModal/openReceiptModal/
//      openSubcontractModal — đây là LỐI VÀO khai báo HĐ chính & thầu phụ) + sửa/xóa.
//    • Bộ lọc DÙNG CHUNG: dropdown Công trình + 🔍 tìm không dấu (lọc client).
//    • Lọc theo NĂM đang chọn (năm 0 = mọi năm). Cột CT + Chủ đầu tư đọc REALTIME.
//
//  Mỗi bảng được mô tả bằng 1 "section config" (cols + load + add/edit/del) rồi
//  cùng đi qua 1 bộ máy render chung — tránh lặp code cho 3 bảng.
//
//  EXPORT: renderStats(host).
// ============================================================================

import { toast, confirm2 } from '../../utils/ui.js';
import { formatMoney } from '../../utils/fmt.js';
import { downloadCsv } from '../../utils/csv.js';
import { normalizeKey } from '../../utils/cat.js';
import { getSelectedYear } from '../../topbar.js';
import { loadProjects, getProjectName, getProjectById } from '../projects/projects.data.js';
import {
  getAllContracts, getReceipts, getSubcontracts, contractTotal, calcKpi,
  deleteContract, deleteReceipt, deleteSubcontract, PAYMENT_TYPES,
} from './doanhthu.data.js';
import { openContractModal } from './doanhthu.contract.js';
import { openReceiptModal } from './doanhthu.receipt.js';
import { openSubcontractModal } from './doanhthu.subcontract.js';

const PAGE_SIZE = 10;
const num = (x) => Number(x) || 0;

// escapeHtml(s) — Chống XSS khi đổ chuỗi người dùng vào ô.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// inYr(date, year) — Bản ghi thuộc năm lọc? (year=0 → mọi năm).
const inYr = (d, y) => !y || String(d || '').startsWith(String(y));
// investorOf(pid) — Chủ Đầu Tư realtime của 1 CT (— nếu không có).
const investorOf = (pid) => getProjectById(pid)?.investor || '—';

// TRẠNG THÁI MÀN — chỉ sống trong lần render hiện tại.
let _host = null;

// ----------------------------------------------------------------------------
//  SECTIONS — mô tả 3 bảng. Mỗi section: load (đọc + lọc năm) · amount (tiền 1 dòng)
//  · cols (cột hiển thị) · search (chuỗi tìm không dấu) · add/edit/del (thao tác).
//  _all/_page là trạng thái runtime gắn vào từng section khi render.
// ----------------------------------------------------------------------------
const SECTIONS = [
  {
    key: 'hd', title: '📄 Hợp đồng chính', addLabel: '＋ HĐ chính',
    load: async (year) => (await getAllContracts())
      .filter((c) => inYr(c.date, year))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    amount: (c) => contractTotal(c),
    cols: [
      { th: 'Ngày ký', cell: (c) => escapeHtml(c.date) },
      { th: 'Công trình', cell: (c) => escapeHtml(getProjectName(c.projectId)) },
      { th: 'Chủ đầu tư', cell: (c) => escapeHtml(investorOf(c.projectId)) },
      { th: 'Tổng HĐ', end: true, cell: (c) => formatMoney(contractTotal(c)) },
    ],
    search: (c) => `${getProjectName(c.projectId)} ${investorOf(c.projectId)} ${c.note || ''}`,
    csvName: 'HopDongChinh',
    csvHead: ['Ngày ký', 'Công trình', 'Chủ đầu tư', 'Tổng HĐ'],
    csvRow: (c) => [c.date || '', getProjectName(c.projectId), investorOf(c.projectId), contractTotal(c)],
    add: () => openContractModal(null, refreshAll),
    edit: (c) => openContractModal(c.projectId, refreshAll),
    del: (c) => deleteContract(c.projectId),
  },
  {
    key: 'thu', title: '💰 Thu tiền', addLabel: '＋ Thu tiền',
    load: (year) => getReceipts({ year }),
    amount: (r) => num(r.amount),
    cols: [
      { th: 'Ngày', cell: (r) => escapeHtml(r.date) },
      { th: 'Công trình', cell: (r) => escapeHtml(getProjectName(r.projectId)) },
      { th: 'Loại', cell: (r) => (PAYMENT_TYPES[r.paymentType] || {}).label || r.paymentType || '' },
      { th: 'Số tiền', end: true, cell: (r) => formatMoney(r.amount) },
      { th: 'Người TH', cell: (r) => escapeHtml(r.performer) },
    ],
    search: (r) => `${getProjectName(r.projectId)} ${r.performer || ''} ${r.note || ''}`,
    csvName: 'ThuTien',
    csvHead: ['Ngày', 'Công trình', 'Loại', 'Số tiền', 'Người TH'],
    csvRow: (r) => [r.date || '', getProjectName(r.projectId),
      (PAYMENT_TYPES[r.paymentType] || {}).label || r.paymentType || '', num(r.amount), r.performer || ''],
    add: () => openReceiptModal(null, refreshAll),
    edit: (r) => openReceiptModal(r, refreshAll),
    del: (r) => deleteReceipt(r.id),
  },
  {
    key: 'tp', title: '🤝 Hợp đồng thầu phụ', addLabel: '＋ Thầu phụ',
    load: (year) => getSubcontracts({ year }),
    amount: (r) => num(r.value),
    cols: [
      { th: 'Ngày', cell: (r) => escapeHtml(r.date) },
      { th: 'Công trình', cell: (r) => escapeHtml(getProjectName(r.projectId)) },
      { th: 'Thầu phụ', cell: (r) => escapeHtml(r.partner) },
      { th: 'Giá trị', end: true, cell: (r) => formatMoney(r.value) },
    ],
    search: (r) => `${getProjectName(r.projectId)} ${r.partner || ''} ${r.note || ''}`,
    csvName: 'ThauPhu',
    csvHead: ['Ngày', 'Công trình', 'Thầu phụ', 'Giá trị'],
    csvRow: (r) => [r.date || '', getProjectName(r.projectId), r.partner || '', num(r.value)],
    add: () => openSubcontractModal(null, refreshAll),
    edit: (r) => openSubcontractModal(r, refreshAll),
    del: (r) => deleteSubcontract(r.id),
  },
];

// ----------------------------------------------------------------------------
//  renderStats(host) — Vẽ KPI + bộ lọc + 3 bảng.
// ----------------------------------------------------------------------------
export async function renderStats(host) {
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
            <input class="form-control form-control-sm" data-f-search placeholder="Công trình / Đối tác / Nội dung">
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-reset>↺ Xóa lọc</button>
        </div>
        ${SECTIONS.map(sectionHtml).join('')}
      </div>
    </div>`;

  await reloadAll();
  fillProjectFilter();
  bindEvents();
}

// sectionHtml(sec) — Khung 1 bảng (tiêu đề + nút thêm + bảng + chân tổng + phân trang).
function sectionHtml(sec) {
  const head = sec.cols.map((c) => `<th class="${c.end ? 'text-end' : ''}">${c.th}</th>`).join('');
  return `
    <div class="mb-4" data-sec="${sec.key}">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="fw-bold mb-0">${sec.title}</h6>
        <div class="d-flex gap-1">
          <button type="button" class="btn btn-sm btn-outline-success" data-csv="${sec.key}" title="Xuất CSV bảng này">⬇ CSV</button>
          <button type="button" class="btn btn-sm btn-primary" data-add="${sec.key}">${sec.addLabel}</button>
        </div>
      </div>
      <div class="table-responsive border rounded">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light"><tr>${head}<th style="width:80px" class="text-end">Thao tác</th></tr></thead>
          <tbody data-rows="${sec.key}"></tbody>
        </table>
      </div>
      <div class="d-flex justify-content-between align-items-center mt-1">
        <span class="badge bg-secondary-subtle text-secondary-emphasis" data-sum="${sec.key}"></span>
        <div class="btn-group btn-group-sm" data-pager="${sec.key}"></div>
      </div>
    </div>`;
}

// reloadAll() — Nạp lại dữ liệu 3 bảng theo năm đang chọn, reset trang về 0, vẽ lại.
async function reloadAll() {
  await loadProjects();
  const year = getSelectedYear();
  for (const sec of SECTIONS) { sec._all = await sec.load(year); sec._page = 0; }
  await renderKpi();
  for (const sec of SECTIONS) renderSection(sec);
}

// refreshAll() — Sau khi modal lưu xong: nạp lại + làm mới dropdown lọc.
async function refreshAll() {
  await reloadAll();
  fillProjectFilter();
}

// fillProjectFilter() — Đổ CT có phát sinh (gộp 3 bảng) vào dropdown, giữ lựa chọn cũ.
function fillProjectFilter() {
  const sel = _host.querySelector('[data-f-project]');
  const cur = sel.value;
  const seen = new Map();
  for (const sec of SECTIONS) for (const r of sec._all || []) {
    if (!seen.has(r.projectId)) seen.set(r.projectId, getProjectName(r.projectId));
  }
  const opts = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  sel.innerHTML = '<option value="">— Tất cả —</option>'
    + opts.map(([pid, name]) => `<option value="${pid}">${escapeHtml(name)}</option>`).join('');
  sel.value = cur;   // giữ CT đang lọc nếu vẫn còn
}

// filteredRows(sec) — Áp bộ lọc CT + tìm không dấu lên dữ liệu 1 bảng.
function filteredRows(sec) {
  const pid = _host.querySelector('[data-f-project]').value;
  const kw = normalizeKey(_host.querySelector('[data-f-search]').value.trim());
  return (sec._all || []).filter((r) => {
    if (pid && r.projectId !== pid) return false;
    if (!kw) return true;
    return normalizeKey(sec.search(r)).includes(kw);
  });
}

// renderKpi() — 3 thẻ KPI theo CT đang lọc (search KHÔNG đổi KPI — đúng calcKpi).
async function renderKpi() {
  const pid = _host.querySelector('[data-f-project]').value || undefined;
  const k = await calcKpi({ year: getSelectedYear(), projectId: pid });
  _host.querySelector('[data-kpi]').innerHTML =
    kpiCard('Tổng giá trị HĐ', k.tongHD, 'bg-primary-subtle')
    + kpiCard('Tổng đã thu', k.daThu, 'bg-success-subtle')
    + kpiCard('Còn phải thu', k.conPhaiThu, k.conPhaiThu > 0 ? 'bg-warning-subtle' : 'bg-body-secondary');
}

// kpiCard(label, value, cls) — 1 thẻ KPI.
function kpiCard(label, value, cls) {
  return `<div class="col-12 col-sm-4"><div class="border rounded p-2 h-100 ${cls}">
    <div class="small text-muted">${label}</div>
    <div class="fs-5 fw-bold">${formatMoney(value)}</div></div></div>`;
}

// ----------------------------------------------------------------------------
//  renderSection(sec) — Vẽ 1 bảng theo tập đang lọc + trang hiện tại + chân + pager.
// ----------------------------------------------------------------------------
function renderSection(sec) {
  const list = filteredRows(sec);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (sec._page >= pages) sec._page = pages - 1;
  const view = list.slice(sec._page * PAGE_SIZE, sec._page * PAGE_SIZE + PAGE_SIZE);
  sec._view = view;   // để thao tác sửa/xóa ánh xạ theo data-idx

  const ncol = sec.cols.length + 1;
  _host.querySelector(`[data-rows="${sec.key}"]`).innerHTML = view.length ? view.map((r, i) => `
    <tr>
      ${sec.cols.map((c) => `<td class="${c.end ? 'text-end' : ''}">${c.cell(r)}</td>`).join('')}
      <td class="text-end text-nowrap">
        <button type="button" class="btn btn-sm btn-link p-0 me-2" data-edit="${sec.key}" data-idx="${i}" title="Sửa">✏️</button>
        <button type="button" class="btn btn-sm btn-link p-0 text-danger" data-del="${sec.key}" data-idx="${i}" title="Xóa">✕</button>
      </td>
    </tr>`).join('')
    : `<tr><td colspan="${ncol}" class="text-center text-muted py-3">Chưa có dữ liệu.</td></tr>`;

  const total = list.reduce((s, r) => s + sec.amount(r), 0);
  _host.querySelector(`[data-sum="${sec.key}"]`).textContent =
    `${list.length} dòng · Tổng ${formatMoney(total)}`;

  const pager = _host.querySelector(`[data-pager="${sec.key}"]`);
  pager.innerHTML = pages <= 1 ? '' : `
    <button type="button" class="btn btn-outline-secondary" data-prev="${sec.key}" ${sec._page === 0 ? 'disabled' : ''}>‹</button>
    <span class="btn btn-outline-secondary disabled">${sec._page + 1}/${pages}</span>
    <button type="button" class="btn btn-outline-secondary" data-next="${sec.key}" ${sec._page >= pages - 1 ? 'disabled' : ''}>›</button>`;
}

// secByKey(k) — Tìm section theo khóa.
const secByKey = (k) => SECTIONS.find((s) => s.key === k);

// bindEvents() — Bộ lọc + ủy quyền sự kiện cho nút thêm/sửa/xóa/phân trang.
function bindEvents() {
  const onFilter = () => { for (const sec of SECTIONS) { sec._page = 0; renderSection(sec); } renderKpi(); };
  _host.querySelector('[data-f-project]').addEventListener('input', onFilter);
  _host.querySelector('[data-f-search]').addEventListener('input', onFilter);
  _host.querySelector('[data-reset]').addEventListener('click', () => {
    _host.querySelector('[data-f-project]').value = '';
    _host.querySelector('[data-f-search]').value = '';
    onFilter();
  });

  _host.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.csv) { exportSection(secByKey(t.dataset.csv)); return; }
    if (t.dataset.add) { secByKey(t.dataset.add).add(); return; }
    if (t.dataset.prev) { const s = secByKey(t.dataset.prev); s._page--; renderSection(s); return; }
    if (t.dataset.next) { const s = secByKey(t.dataset.next); s._page++; renderSection(s); return; }
    if (t.dataset.edit) { secByKey(t.dataset.edit).edit(secByKey(t.dataset.edit)._view[+t.dataset.idx]); return; }
    if (t.dataset.del) { await handleDelete(secByKey(t.dataset.del), +t.dataset.idx); }
  });
}

// stamp2() — ddmmyy cho tên file CSV.
function stamp2() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0')
    + String(d.getMonth() + 1).padStart(2, '0')
    + String(d.getFullYear()).slice(2);
}

// exportSection(sec) — Xuất CSV BẢNG đang lọc (tôn trọng lọc CT + tìm) + dòng TỔNG.
function exportSection(sec) {
  const list = filteredRows(sec);
  if (!list.length) { toast('Không có dữ liệu để xuất.', 'warning'); return; }
  const rows = [['#', ...sec.csvHead]];
  list.forEach((r, i) => rows.push([i + 1, ...sec.csvRow(r)]));
  // Dòng TỔNG: cột tiền (ô cuối) là tổng amount; các cột chữ để trống.
  const total = list.reduce((s, r) => s + sec.amount(r), 0);
  const totalRow = new Array(sec.csvHead.length + 1).fill('');
  totalRow[1] = 'TỔNG';
  totalRow[totalRow.length - 1] = total;
  rows.push(totalRow);

  const year = getSelectedYear() || 'tatca';
  downloadCsv(`${sec.csvName}_${year}_${stamp2()}`, rows);
  toast('⬇️ Đã xuất CSV bảng này.', 'success');
}

// handleDelete(sec, idx) — Xác nhận rồi xóa mềm 1 dòng, nạp lại.
async function handleDelete(sec, idx) {
  const row = sec._view[idx];
  if (!row) return;
  if (!(await confirm2('Xóa dòng này?'))) return;
  try {
    await sec.del(row);
    toast('🗑️ Đã xóa.', 'success');
    await refreshAll();
  } catch (err) {
    toast(err.message || 'Xóa thất bại.', 'danger');
  }
}
