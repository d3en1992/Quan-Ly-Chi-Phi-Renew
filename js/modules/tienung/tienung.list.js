// ============================================================================
//  modules/tienung/tienung.list.js  —  TẦNG GIAO DIỆN (Layer 6): 2 bảng lịch sử
// ----------------------------------------------------------------------------
//  @module tienung.list
//
//  Sub-tab "📜 Lịch sử" của tab Tiền Ứng (doc 05 §3,§4): Thầu Phụ và Nhà Cung Cấp
//  hiện ở 2 BẢNG RIÊNG, mỗi bảng có bộ lọc + phân trang + tổng tiền + xuất ĐỘC LẬP.
//
//  Mỗi bảng: 🔍 tìm không dấu (ngày+đối tác+tên CT+nội dung) · lọc đối tác · lọc
//  công trình · lọc tháng (YYYY-MM). Cột: ☑ · Ngày · Đối tác · Công Trình (realtime
//  qua getProjectName) · Nội Dung · Số Tiền · ✏️ ✕. Chân bảng: số bản ghi + tổng.
//
//  Chỉ ĐỌC + xóa mềm + xuất. Sửa: bấm ✏️ → callback onEdit(rec) của shell mở form
//  nhập (editAdvance). Lọc theo năm đang chọn (year=0 → mọi năm).
// ============================================================================

import { getSelectedYear } from '../../topbar.js';
import { toast, confirm2, setLoading } from '../../utils/ui.js';
import { formatMoney } from '../../utils/fmt.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';
import { loadProjects, getProjectName } from '../projects/projects.data.js';
import { getAdvances, deleteAdvance, ADVANCE_TYPES, ADVANCE_TYPE_KEYS } from './tienung.data.js';
import { exportAdvancesCsv, exportAdvanceSlip } from './tienung.report.js';

const PAGE_SIZE = 15;            // số dòng mỗi trang (mỗi bảng độc lập)
const ICON = { subcontractor: '🧰', supplier: '🏭' };

// ----------------------------------------------------------------------------
//  TRẠNG THÁI MODULE — sống trong lần render hiện tại của sub-tab.
//   _all: mọi khoản ứng còn dùng trong năm (cả 2 loại). _st[type]: trang + chọn dòng.
// ----------------------------------------------------------------------------
let _host = null;
let _onEdit = null;
let _all = [];
const _st = {
  subcontractor: { page: 1, picks: new Set() },
  supplier:      { page: 1, picks: new Set() },
};

// Lấy nhanh phần tử trong 1 panel theo loại.
const panelEl = (type) => _host.querySelector(`[data-panel="${type}"]`);
const qp = (type, sel) => panelEl(type).querySelector(sel);

// escapeHtml(s) — chống vỡ HTML khi đổ chuỗi người dùng vào bảng/option.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ----------------------------------------------------------------------------
//  renderList(host, opts) — Vẽ 2 panel (Thầu phụ + Nhà cung cấp). opts.onEdit(rec).
// ----------------------------------------------------------------------------
export async function renderList(host, opts = {}) {
  _host = host;
  _onEdit = typeof opts.onEdit === 'function' ? opts.onEdit : null;
  ADVANCE_TYPE_KEYS.forEach((t) => { _st[t].page = 1; _st[t].picks.clear(); });

  host.innerHTML = ADVANCE_TYPE_KEYS.map(panelSkeleton).join('');

  setLoading(true, 'Đang tải tiền ứng…');
  try {
    await loadProjects();
    _all = await getAdvances({ year: getSelectedYear() });   // cả 2 loại, đã sắp xếp
  } finally {
    setLoading(false);
  }

  ADVANCE_TYPE_KEYS.forEach((type) => {
    fillFilters(type);
    bindPanel(type);
    renderTable(type);
  });
}

// panelSkeleton(type) — Khung 1 bảng: tiêu đề + bộ lọc + nút xuất + ô kết quả.
function panelSkeleton(type) {
  const label = ADVANCE_TYPES[type].label;
  return `
    <div class="card border-0 shadow-sm mb-3" data-panel="${type}">
      <div class="card-body">
        <h6 class="fw-semibold mb-2">${ICON[type]} ${label}</h6>
        <div class="row g-2 align-items-end mb-2">
          <div class="col-12 col-md-4">
            <label class="form-label small mb-1">🔍 Tìm kiếm</label>
            <input class="form-control form-control-sm" data-search placeholder="Ngày, đối tác, CT, nội dung…">
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1">Đối tác</label>
            <select class="form-select form-select-sm" data-fpartner></select>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1">Công trình</label>
            <select class="form-select form-select-sm" data-fproject></select>
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small mb-1">Tháng</label>
            <select class="form-select form-select-sm" data-fmonth></select>
          </div>
        </div>
        <div class="d-flex flex-wrap gap-2 mb-2">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-reset>↺ Xóa lọc</button>
          <button type="button" class="btn btn-sm btn-outline-success" data-csv>⬇ CSV ${label}</button>
          <button type="button" class="btn btn-sm btn-outline-primary" data-slip disabled>📸 Xuất phiếu ứng</button>
        </div>
        <div data-results></div>
      </div>
    </div>`;
}

// rowsOf(type) — Các khoản ứng của 1 loại (chưa áp bộ lọc người dùng).
const rowsOf = (type) => _all.filter((r) => r.type === type);

// fillFilters(type) — Đổ option Đối tác / Công trình / Tháng có phát sinh trong năm.
function fillFilters(type) {
  const list = rowsOf(type);
  const partners = [...new Set(list.map((r) => r.partner).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'vi'));
  const projIds = [...new Set(list.map((r) => r.projectId).filter(Boolean))];
  const months = [...new Set(list.map((r) => String(r.date || '').slice(0, 7)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));

  qp(type, '[data-fpartner]').innerHTML = `<option value="">Tất cả đối tác</option>` +
    partners.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  qp(type, '[data-fproject]').innerHTML = `<option value="">Tất cả công trình</option>` +
    projIds.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(getProjectName(id) || '—')}</option>`).join('');
  qp(type, '[data-fmonth]').innerHTML = `<option value="">Tất cả tháng</option>` +
    months.map((m) => `<option value="${m}">${m}</option>`).join('');
}

// bindPanel(type) — Gắn sự kiện lọc + xuất cho 1 panel (1 lần mỗi render).
function bindPanel(type) {
  ['[data-search]', '[data-fpartner]', '[data-fproject]', '[data-fmonth]'].forEach((sel) =>
    qp(type, sel).addEventListener('input', () => { _st[type].page = 1; renderTable(type); }));
  qp(type, '[data-reset]').addEventListener('click', () => {
    ['[data-search]', '[data-fpartner]', '[data-fproject]', '[data-fmonth]'].forEach((s) => { qp(type, s).value = ''; });
    _st[type].page = 1; renderTable(type);
  });
  qp(type, '[data-csv]').addEventListener('click', () => handleCsv(type));
  qp(type, '[data-slip]').addEventListener('click', () => handleSlip(type));
}

// ----------------------------------------------------------------------------
//  filteredList(type) — Áp bộ lọc của panel lên các khoản ứng cùng loại.
// ----------------------------------------------------------------------------
function filteredList(type) {
  const kw = normalizeVietnamese(qp(type, '[data-search]').value.trim());
  const partner = qp(type, '[data-fpartner]').value;
  const pid = qp(type, '[data-fproject]').value;
  const month = qp(type, '[data-fmonth]').value;

  return rowsOf(type).filter((r) => {
    if (partner && r.partner !== partner) return false;
    if (pid && r.projectId !== pid) return false;
    if (month && !String(r.date || '').startsWith(month)) return false;
    if (kw) {
      const hay = normalizeVietnamese(
        `${r.date || ''} ${r.partner || ''} ${getProjectName(r.projectId) || ''} ${r.note || ''}`);
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

// ----------------------------------------------------------------------------
//  renderTable(type) — Vẽ bảng kết quả đã lọc + phân trang + tổng + nút dòng.
// ----------------------------------------------------------------------------
function renderTable(type) {
  const box = qp(type, '[data-results]');
  const list = filteredList(type);
  const total = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  syncSlipBtn(type);

  if (!list.length) {
    box.innerHTML = '<p class="text-muted small mb-0">Không có khoản ứng nào khớp điều kiện lọc.</p>';
    return;
  }

  const st = _st[type];
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (st.page > pages) st.page = pages;
  const start = (st.page - 1) * PAGE_SIZE;
  const rows = list.slice(start, start + PAGE_SIZE);
  const allPicked = rows.every((r) => st.picks.has(r.id));

  box.innerHTML = `
    <div class="d-flex flex-wrap align-items-center mb-2 gap-2">
      <span class="badge bg-secondary-subtle text-secondary-emphasis">${list.length} khoản</span>
      <span class="ms-auto fw-semibold">Tổng: ${formatMoney(total)}</span>
    </div>
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle mb-2">
        <thead class="table-light">
          <tr>
            <th style="width:34px" class="text-center"><input type="checkbox" data-pickall ${allPicked ? 'checked' : ''}></th>
            <th class="text-nowrap">Ngày</th>
            <th class="text-nowrap" style="position:sticky;left:0;background:inherit">Đối tác</th>
            <th>Công trình</th><th>Nội dung</th>
            <th class="text-end text-nowrap">Số tiền</th><th style="width:74px"></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td class="text-center"><input type="checkbox" data-pick="${r.id}" ${st.picks.has(r.id) ? 'checked' : ''}></td>
              <td class="text-nowrap">${escapeHtml(r.date)}</td>
              <td class="text-nowrap" style="position:sticky;left:0;background:inherit">${escapeHtml(r.partner)}</td>
              <td>${escapeHtml(getProjectName(r.projectId) || '—')}</td>
              <td>${escapeHtml(r.note)}</td>
              <td class="text-end text-nowrap">${formatMoney(r.amount)}</td>
              <td class="text-nowrap">
                <button class="btn btn-sm btn-link p-0 me-2" data-edit="${r.id}" title="Sửa">✏️</button>
                <button class="btn btn-sm btn-link text-danger p-0" data-del="${r.id}" title="Xóa">✕</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="d-flex align-items-center justify-content-between">
      <button type="button" class="btn btn-sm btn-outline-secondary" data-prev ${st.page <= 1 ? 'disabled' : ''}>‹ Trước</button>
      <span class="small text-muted">Trang ${st.page}/${pages}</span>
      <button type="button" class="btn btn-sm btn-outline-secondary" data-next ${st.page >= pages ? 'disabled' : ''}>Sau ›</button>
    </div>`;

  box.querySelector('[data-prev]').addEventListener('click', () => { if (st.page > 1) { st.page--; renderTable(type); } });
  box.querySelector('[data-next]').addEventListener('click', () => { if (st.page < pages) { st.page++; renderTable(type); } });
  box.querySelector('[data-pickall]').addEventListener('change', (e) => {
    rows.forEach((r) => (e.target.checked ? st.picks.add(r.id) : st.picks.delete(r.id)));
    renderTable(type);
  });
  box.querySelectorAll('[data-pick]').forEach((c) => c.addEventListener('change', () => {
    c.checked ? st.picks.add(c.dataset.pick) : st.picks.delete(c.dataset.pick);
    syncSlipBtn(type);
  }));
  box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => handleEdit(b.dataset.edit)));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => handleDelete(type, b.dataset.del)));
}

// syncSlipBtn(type) — Bật nút "Xuất phiếu ứng" khi có ít nhất 1 dòng được tick.
function syncSlipBtn(type) {
  const btn = qp(type, '[data-slip]');
  const n = _st[type].picks.size;
  btn.disabled = n === 0;
  btn.textContent = n ? `📸 Xuất phiếu ứng (${n})` : '📸 Xuất phiếu ứng';
}

// handleEdit(id) — Nhờ shell mở form nhập + nạp khoản ứng để sửa.
function handleEdit(id) {
  const rec = _all.find((r) => r.id === id);
  if (!rec) { toast('Không tìm thấy khoản ứng.', 'warning'); return; }
  if (_onEdit) _onEdit(rec);
  else toast('Không mở được form sửa.', 'warning');
}

// handleDelete(type, id) — Xác nhận → xóa mềm → bỏ khỏi RAM + vẽ lại bảng.
async function handleDelete(type, id) {
  if (!(await confirm2('Xóa khoản ứng này?'))) return;
  await deleteAdvance(id);
  _all = _all.filter((r) => r.id !== id);
  _st[type].picks.delete(id);
  document.dispatchEvent(new CustomEvent('tienung:changed'));
  toast('Đã xóa khoản ứng.', 'success');
  fillFilters(type);
  renderTable(type);
}

// handleCsv(type) — Xuất CSV đúng tập đang lọc của bảng này.
function handleCsv(type) {
  const rows = filteredList(type).map((r) => ({
    date: r.date, partner: r.partner, projectName: getProjectName(r.projectId) || '',
    note: r.note, amount: r.amount,
  }));
  exportAdvancesCsv({ typeLabel: ADVANCE_TYPES[type].label, rows, fileTag: ADVANCE_TYPES[type].label });
}

// handleSlip(type) — Gom các dòng đã tick theo đối tác → xuất phiếu ứng PNG.
function handleSlip(type) {
  const picks = _st[type].picks;
  const chosen = rowsOf(type).filter((r) => picks.has(r.id));
  if (!chosen.length) { toast('Chưa chọn khoản ứng nào.', 'warning'); return; }

  const byPartner = new Map();
  for (const r of chosen) {
    if (!byPartner.has(r.partner)) byPartner.set(r.partner, { partner: r.partner, items: [], total: 0 });
    const g = byPartner.get(r.partner);
    g.items.push({ date: r.date, projectName: getProjectName(r.projectId) || '—', note: r.note, amount: r.amount });
    g.total += Number(r.amount) || 0;
  }
  const year = getSelectedYear();
  exportAdvanceSlip({
    groups: [...byPartner.values()],
    periodText: `${ADVANCE_TYPES[type].label} · ${year ? 'Năm ' + year : 'Tất cả năm'}`,
    fileTag: byPartner.size === 1 ? chosen[0].partner : ADVANCE_TYPES[type].label,
  });
}
