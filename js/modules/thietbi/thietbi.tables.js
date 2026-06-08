// ============================================================================
//  modules/thietbi/thietbi.tables.js  —  TẦNG GIAO DIỆN (Layer 6): 3 bảng thiết bị
// ----------------------------------------------------------------------------
//  @module thietbi.tables
//
//  3 bảng hiển thị của tab Thiết Bị (doc 06 §3), tất cả lọc theo năm đang chọn:
//    A. Thiết Bị Tại Công Trình — projectId ≠ Kho Tổng. Lọc CT/tình trạng/🔍 tìm.
//       Đổi tình trạng INLINE (cập nhật ngay, không reload). Nút [↔ Luân chuyển].
//       KHÔNG có nút Xóa (TB tại CT chỉ rời đi bằng luân chuyển). Xuất CSV.
//    B. Kho Tổng Thiết Bị — projectId = Kho Tổng. Thêm cột Cập Nhật + nút [🗑 Xóa].
//    C. Thống Kê Theo Công Trình — mỗi CT: tổng số lượng + số loại (sumEquipmentByProject).
//
//  EXPORT renderTables(host, { onChanged }) — vỏ thietbi.ui.js gọi; onChanged()
//  vẽ lại toàn bộ 3 bảng sau khi xóa/luân chuyển.
// ============================================================================

import { getSelectedYear } from '../../topbar.js';
import { toast, confirm2, setLoading } from '../../utils/ui.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';
import { loadProjects, getProjectName } from '../projects/projects.data.js';
import {
  CONDITIONS, CONDITION_KEYS, WAREHOUSE_ID,
  getEquipment, sumEquipmentByProject, updateCondition, deleteEquipment,
} from './thietbi.data.js';
import { openTransferModal } from './thietbi.transfer.js';

// ----------------------------------------------------------------------------
//  TRẠNG THÁI MODULE — sống trong lần render hiện tại của 3 bảng.
// ----------------------------------------------------------------------------
let _host = null;
let _onChanged = null;
let _projRows = [];          // tồn kho tại công trình (đã lọc năm)
let _whRows = [];            // tồn kho tại Kho Tổng (đã lọc năm)
let _stats = [];             // [{ projectId, totalQty, typeCount }]

// escapeHtml(s) — chống vỡ HTML khi đổ chuỗi vào bảng/option.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// condSelect(rec) — Dropdown đổi tình trạng inline (data-cond mang id bản ghi).
function condSelect(rec) {
  return `<select class="form-select form-select-sm" data-cond="${rec.id}" style="min-width:130px">
    ${CONDITION_KEYS.map((k) =>
      `<option value="${k}"${rec.condition === k ? ' selected' : ''}>${CONDITIONS[k].label}</option>`).join('')}
  </select>`;
}

const recById = (id) => [..._projRows, ..._whRows].find((r) => r.id === id) || null;

// ----------------------------------------------------------------------------
//  renderTables(host, { onChanged }) — Nạp dữ liệu năm + vẽ 3 bảng.
// ----------------------------------------------------------------------------
export async function renderTables(host, { onChanged } = {}) {
  _host = host;
  _onChanged = typeof onChanged === 'function' ? onChanged : null;

  host.innerHTML = `
    <div data-table="project" class="mt-3"></div>
    <div data-table="warehouse" class="mt-3"></div>
    <div data-table="stats" class="mt-3"></div>`;

  setLoading(true, 'Đang tải thiết bị…');
  try {
    await loadProjects();
    const all = await getEquipment({ year: getSelectedYear() });
    _projRows = all.filter((r) => r.projectId !== WAREHOUSE_ID);
    _whRows = all.filter((r) => r.projectId === WAREHOUSE_ID);
    _stats = await sumEquipmentByProject();
  } finally {
    setLoading(false);
  }

  renderProjectTable();
  renderWarehouseTable();
  renderStatsTable();
}

// ----------------------------------------------------------------------------
//  A. BẢNG THIẾT BỊ TẠI CÔNG TRÌNH
// ----------------------------------------------------------------------------
function renderProjectTable() {
  const box = _host.querySelector('[data-table="project"]');
  const projIds = [...new Set(_projRows.map((r) => r.projectId))];

  box.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
          <h6 class="fw-semibold mb-0 me-auto">🏗️ Thiết bị tại công trình</h6>
          <button type="button" class="btn btn-sm btn-outline-success" data-csv>⬇ Xuất CSV</button>
        </div>
        <div class="row g-2 align-items-end mb-2">
          <div class="col-12 col-md-5">
            <label class="form-label small mb-1">🔍 Tìm kiếm</label>
            <input class="form-control form-control-sm" data-search placeholder="Tên thiết bị, ghi chú…">
          </div>
          <div class="col-6 col-md-4">
            <label class="form-label small mb-1">Công trình</label>
            <select class="form-select form-select-sm" data-fproject>
              <option value="">Tất cả công trình</option>
              ${projIds.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(getProjectName(id))}</option>`).join('')}
            </select>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1">Tình trạng</label>
            <select class="form-select form-select-sm" data-fcond>
              <option value="">Tất cả tình trạng</option>
              ${CONDITION_KEYS.map((k) => `<option value="${k}">${CONDITIONS[k].label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div data-results></div>
      </div>
    </div>`;

  ['[data-search]', '[data-fproject]', '[data-fcond]'].forEach((sel) =>
    box.querySelector(sel).addEventListener('input', fillProjectResults));
  box.querySelector('[data-csv]').addEventListener('click', handleCsv);
  fillProjectResults();
}

// filteredProjectRows() — Áp bộ lọc người dùng lên bảng A.
function filteredProjectRows() {
  const box = _host.querySelector('[data-table="project"]');
  const kw = normalizeVietnamese(box.querySelector('[data-search]').value.trim());
  const pid = box.querySelector('[data-fproject]').value;
  const cond = box.querySelector('[data-fcond]').value;

  return _projRows.filter((r) => {
    if (pid && r.projectId !== pid) return false;
    if (cond && r.condition !== cond) return false;
    if (kw) {
      const hay = normalizeVietnamese(`${r.name || ''} ${r.note || ''} ${getProjectName(r.projectId) || ''}`);
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

// fillProjectResults() — Vẽ phần thân bảng A theo bộ lọc.
function fillProjectResults() {
  const box = _host.querySelector('[data-table="project"]');
  const out = box.querySelector('[data-results]');
  const list = filteredProjectRows();
  const totalQty = list.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  if (!list.length) {
    out.innerHTML = '<p class="text-muted small mb-0">Không có thiết bị nào tại công trình khớp điều kiện.</p>';
    return;
  }

  out.innerHTML = `
    <div class="d-flex mb-2">
      <span class="badge bg-secondary-subtle text-secondary-emphasis">${list.length} dòng · ${totalQty} cái</span>
    </div>
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle mb-0">
        <thead class="table-light">
          <tr>
            <th>Công trình</th><th>Tên thiết bị</th>
            <th class="text-end">Số lượng</th><th>Tình trạng</th><th>Ghi chú</th>
            <th style="width:120px"></th>
          </tr>
        </thead>
        <tbody>
          ${list.map((r) => `
            <tr>
              <td>${escapeHtml(getProjectName(r.projectId))}</td>
              <td class="fw-semibold">${escapeHtml(r.name)}</td>
              <td class="text-end">${Number(r.quantity) || 0}</td>
              <td>${condSelect(r)}</td>
              <td>${escapeHtml(r.note)}</td>
              <td class="text-nowrap">
                <button class="btn btn-sm btn-outline-primary" data-transfer="${r.id}">↔ Luân chuyển</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  bindRowActions(out);
}

// ----------------------------------------------------------------------------
//  B. BẢNG KHO TỔNG THIẾT BỊ
// ----------------------------------------------------------------------------
function renderWarehouseTable() {
  const box = _host.querySelector('[data-table="warehouse"]');
  const totalQty = _whRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  box.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <h6 class="fw-semibold mb-2">🏭 Kho Tổng thiết bị
          <span class="badge bg-secondary-subtle text-secondary-emphasis ms-1">${_whRows.length} dòng · ${totalQty} cái</span>
        </h6>
        ${!_whRows.length ? '<p class="text-muted small mb-0">Kho Tổng chưa có thiết bị nào.</p>' : `
        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Tên thiết bị</th><th class="text-end">Số lượng</th><th>Tình trạng</th>
                <th>Ghi chú</th><th>Cập nhật</th><th style="width:170px"></th>
              </tr>
            </thead>
            <tbody>
              ${_whRows.map((r) => `
                <tr>
                  <td class="fw-semibold">${escapeHtml(r.name)}</td>
                  <td class="text-end">${Number(r.quantity) || 0}</td>
                  <td>${condSelect(r)}</td>
                  <td>${escapeHtml(r.note)}</td>
                  <td class="text-nowrap small text-muted">${escapeHtml(r.date)}</td>
                  <td class="text-nowrap">
                    <button class="btn btn-sm btn-outline-primary me-1" data-transfer="${r.id}">↔</button>
                    <button class="btn btn-sm btn-outline-danger" data-del="${r.id}">🗑 Xóa</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
    </div>`;

  bindRowActions(box);
}

// ----------------------------------------------------------------------------
//  C. BẢNG THỐNG KÊ THEO CÔNG TRÌNH
// ----------------------------------------------------------------------------
function renderStatsTable() {
  const box = _host.querySelector('[data-table="stats"]');
  const rows = _stats.slice().sort((a, b) =>
    getProjectName(a.projectId).localeCompare(getProjectName(b.projectId), 'vi'));
  const grandQty = rows.reduce((s, r) => s + r.totalQty, 0);

  box.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <h6 class="fw-semibold mb-2">📊 Thống kê thiết bị theo công trình</h6>
        ${!rows.length ? '<p class="text-muted small mb-0">Chưa có thiết bị tại công trình nào.</p>' : `
        <div class="table-responsive">
          <table class="table table-sm table-striped align-middle mb-0">
            <thead class="table-light">
              <tr><th>Công trình</th><th class="text-end">Tổng số lượng</th><th class="text-end">Số loại</th></tr>
            </thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td>${escapeHtml(getProjectName(r.projectId))}</td>
                  <td class="text-end">${r.totalQty}</td>
                  <td class="text-end">${r.typeCount}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr class="table-light fw-semibold">
                <td class="text-end">Tổng cộng</td><td class="text-end">${grandQty}</td><td></td>
              </tr>
            </tfoot>
          </table>
        </div>`}
      </div>
    </div>`;
}

// ----------------------------------------------------------------------------
//  bindRowActions(scope) — Gắn sự kiện cho các nút/select trong 1 vùng bảng:
//   đổi tình trạng inline · ↔ luân chuyển · 🗑 xóa (chỉ Kho Tổng).
// ----------------------------------------------------------------------------
function bindRowActions(scope) {
  scope.querySelectorAll('[data-cond]').forEach((sel) =>
    sel.addEventListener('change', () => handleCondition(sel.dataset.cond, sel.value)));
  scope.querySelectorAll('[data-transfer]').forEach((b) =>
    b.addEventListener('click', () => handleTransfer(b.dataset.transfer)));
  scope.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => handleDelete(b.dataset.del)));
}

// handleCondition(id, cond) — Đổi tình trạng ngay (không reload, giữ vị trí cuộn).
async function handleCondition(id, cond) {
  try {
    await updateCondition(id, cond);
    const rec = recById(id);
    if (rec) rec.condition = cond;          // đồng bộ RAM (khỏi reload)
    toast('Đã cập nhật tình trạng.', 'success');
  } catch (e) {
    toast(e.message, 'danger');
  }
}

// handleTransfer(id) — Mở popup luân chuyển; chuyển xong → vẽ lại 3 bảng.
function handleTransfer(id) {
  const rec = recById(id);
  if (!rec) { toast('Không tìm thấy dòng thiết bị.', 'warning'); return; }
  openTransferModal(rec, () => (_onChanged ? _onChanged() : null));
}

// handleDelete(id) — Xác nhận → xóa mềm (chỉ Kho Tổng) → vẽ lại 3 bảng.
async function handleDelete(id) {
  if (!(await confirm2('Xóa thiết bị này khỏi Kho Tổng?'))) return;
  try {
    await deleteEquipment(id);
    toast('Đã xóa thiết bị.', 'success');
    if (_onChanged) await _onChanged();
  } catch (e) {
    toast(e.message, 'danger');
  }
}

// ----------------------------------------------------------------------------
//  handleCsv() — Xuất bảng Thiết Bị Tại Công Trình theo tập đang lọc (doc 06 §5).
//  UTF-8 BOM + CRLF. Cột: Công Trình · Tên · Số Lượng · Tình Trạng · Ghi Chú · Cập Nhật.
// ----------------------------------------------------------------------------
function handleCsv() {
  const list = filteredProjectRows();
  if (!list.length) { toast('Không có dữ liệu để xuất.', 'warning'); return; }

  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Công Trình', 'Tên', 'Số Lượng', 'Tình Trạng', 'Ghi Chú', 'Cập Nhật'];
  const body = list.map((r) => [
    getProjectName(r.projectId), r.name, Number(r.quantity) || 0,
    CONDITIONS[r.condition]?.label || r.condition, r.note || '', r.date || '',
  ]);
  const csv = [head, ...body].map((row) => row.map(cell).join(',')).join('\r\n');

  const d = new Date();
  const tag = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(2)}`;
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ThietBi_CongTrinh_${tag}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('⬇️ Đã xuất CSV thiết bị.', 'success');
}
