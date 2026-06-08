// ============================================================================
//  modules/thietbi/thietbi.entry.js  —  TẦNG GIAO DIỆN (Layer 6): Khu NHẬP thiết bị
// ----------------------------------------------------------------------------
//  @module thietbi.entry
//
//  Khu nhập liệu của tab Thiết Bị (doc 06 §2): chọn 1 VỊ TRÍ (Kho Tổng / công
//  trình) ở đầu form, rồi nhập NHIỀU dòng cùng lúc vào vị trí đó. Mỗi dòng:
//    Tên TB (dropdown từ categories.equipment — không nhập tự do) · Số lượng ·
//    Tình trạng (dropdown 3 mã) · Ghi chú · ✕.
//
//  [+1]/[+5] thêm dòng · [🗑 Xóa bảng] reset · [💾 Lưu] cộng dồn theo khóa
//  (projectId+name+condition) qua saveEquipment. Tên TB rỗng → bỏ qua dòng.
//
//  EXPORT renderEntry(host, { onSaved }) cho vỏ thietbi.ui.js gọi; onSaved chạy
//  sau khi lưu để vỏ vẽ lại 3 bảng.
// ============================================================================

import { toast, setLoading } from '../../utils/ui.js';
import { loadCategories, listNames } from '../../utils/cat.js';
import { loadProjects, getProjectOptions, COMPANY } from '../projects/projects.data.js';
import { CONDITIONS, CONDITION_KEYS, WAREHOUSE_ID, saveEquipment } from './thietbi.data.js';

const MIN_ROWS = 5;          // số dòng trống mặc định khi reset bảng

// ----------------------------------------------------------------------------
//  TRẠNG THÁI MODULE — chỉ sống trong lần render hiện tại của khu nhập.
//   _rows: mô hình bảng — mảng { name, quantity, condition, note }.
//   _equipNames: danh sách tên TB hợp lệ (categories.equipment) cho dropdown.
// ----------------------------------------------------------------------------
let _host = null;
let _onSaved = null;
let _rows = [];
let _equipNames = [];

// escapeHtml(s) — chống vỡ thuộc tính value="" khi đổ chuỗi vào ô.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Lấy nhanh phần tử trong layout.
const locEl   = () => _host.querySelector('[data-loc]');
const tbodyEl = () => _host.querySelector('[data-rows]');
const toolsEl = () => _host.querySelector('[data-tools]');

// blankRow() — 1 dòng trống (mặc định tình trạng 'active').
function blankRow() {
  return { name: '', quantity: '', condition: 'active', note: '' };
}

// locOptions() — Vị trí cho dropdown: Kho Tổng (COMPANY relabel) + CT chưa quyết
// toán. getProjectOptions ghim COMPANY đầu danh sách → ta đổi nhãn thành "Kho Tổng".
function locOptions() {
  return getProjectOptions({ excludeLocked: true }).map((o) =>
    (o.id === COMPANY.id ? { id: WAREHOUSE_ID, name: '🏭 Kho Tổng' } : o));
}

// ----------------------------------------------------------------------------
//  renderEntry(host, { onSaved }) — Vẽ khu nhập thiết bị vào ô nội dung.
// ----------------------------------------------------------------------------
export async function renderEntry(host, { onSaved } = {}) {
  _host = host;
  _onSaved = typeof onSaved === 'function' ? onSaved : null;
  _rows = Array.from({ length: MIN_ROWS }, blankRow);

  host.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <h6 class="fw-semibold mb-3">🔧 Nhập thiết bị vào kho</h6>
        <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
          <div>
            <label class="form-label small mb-1 fw-semibold">📍 Vị trí <span class="text-danger">*</span></label>
            <select class="form-select form-select-sm" data-loc style="min-width:220px">
              <option value="">— Chọn vị trí —</option>
            </select>
          </div>
          <div class="ms-auto">
            <button type="button" class="btn btn-sm btn-primary" data-save>💾 Lưu</button>
          </div>
        </div>
        <div class="table-responsive border rounded">
          <table class="table table-sm table-bordered align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th style="width:42px" class="text-center">#</th>
                <th style="min-width:200px">Tên thiết bị <span class="text-danger">*</span></th>
                <th style="width:110px" class="text-end">Số lượng</th>
                <th style="width:150px">Tình trạng</th>
                <th style="min-width:180px">Ghi chú</th>
                <th style="width:40px"></th>
              </tr>
            </thead>
            <tbody data-rows></tbody>
          </table>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2 mt-2" data-tools>
          <div class="btn-group btn-group-sm" role="group">
            <button type="button" class="btn btn-outline-primary" data-add="1">+1</button>
            <button type="button" class="btn btn-outline-primary" data-add="5">+5</button>
          </div>
          <button type="button" class="btn btn-sm btn-outline-danger" data-clear>🗑 Xóa bảng</button>
          <span class="badge bg-secondary-subtle text-secondary-emphasis ms-auto" data-sum></span>
        </div>
      </div>
    </div>`;

  setLoading(true, 'Đang tải danh mục…');
  try {
    const [cats] = await Promise.all([loadCategories(), loadProjects()]);
    _equipNames = listNames(cats, 'equipment');
  } finally {
    setLoading(false);
  }

  // Đổ dropdown vị trí (sau khi loadProjects xong).
  locEl().innerHTML = `<option value="">— Chọn vị trí —</option>` +
    locOptions().map((o) => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');

  if (!_equipNames.length) {
    toast('Chưa có thiết bị nào trong Danh mục — hãy thêm ở tab 📁 Danh mục.', 'warning');
  }

  bindEvents();
  rebuild();
}

// bindEvents() — Gắn sự kiện toolbar + nút Lưu + ủy quyền thân bảng (1 lần/render).
function bindEvents() {
  _host.querySelector('[data-save]').addEventListener('click', handleSave);
  toolsEl().addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) { for (let i = 0; i < +add.dataset.add; i++) _rows.push(blankRow()); rebuild(); return; }
    if (e.target.closest('[data-clear]')) {
      _rows = Array.from({ length: MIN_ROWS }, blankRow);
      rebuild();
    }
  });

  const tb = tbodyEl();
  tb.addEventListener('input', onCellInput);
  tb.addEventListener('change', onCellInput);
  tb.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) deleteRow(+del.dataset.del);
  });
}

// onCellInput(e) — Đồng bộ model khi gõ/đổi 1 ô.
function onCellInput(e) {
  const el = e.target.closest('[data-f]');
  if (!el) return;
  const r = +el.dataset.r;
  if (!_rows[r]) return;
  _rows[r][el.dataset.f] = el.value;
  if (el.dataset.f === 'quantity' || el.dataset.f === 'name') updateSum();
}

// ----------------------------------------------------------------------------
//  rebuild() — Vẽ lại toàn bộ thân bảng theo `_rows`.
// ----------------------------------------------------------------------------
function rebuild() {
  const nameOpts = (sel) => `<option value="">— Chọn —</option>` +
    _equipNames.map((n) =>
      `<option value="${escapeHtml(n)}"${sel === n ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('');
  const condOpts = (sel) => CONDITION_KEYS.map((k) =>
    `<option value="${k}"${sel === k ? ' selected' : ''}>${CONDITIONS[k].label}</option>`).join('');

  tbodyEl().innerHTML = _rows.map((row, r) => `
    <tr>
      <td class="text-center text-muted small">${r + 1}</td>
      <td>
        <select class="form-select form-select-sm border-0" data-f="name" data-r="${r}">${nameOpts(row.name)}</select>
      </td>
      <td><input class="form-control form-control-sm border-0 text-end" data-f="quantity" data-r="${r}"
                 inputmode="numeric" value="${escapeHtml(row.quantity)}"></td>
      <td>
        <select class="form-select form-select-sm border-0" data-f="condition" data-r="${r}">${condOpts(row.condition)}</select>
      </td>
      <td><input class="form-control form-control-sm border-0" data-f="note" data-r="${r}"
                 value="${escapeHtml(row.note)}"></td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-link text-danger p-0" data-del="${r}" title="Xóa dòng">✕</button>
      </td>
    </tr>`).join('');

  updateSum();
}

// deleteRow(r) — Xóa 1 dòng (luôn giữ tối thiểu MIN_ROWS dòng trống).
function deleteRow(r) {
  _rows.splice(r, 1);
  if (_rows.length < MIN_ROWS) _rows.push(blankRow());
  rebuild();
}

// hasData(row) — Dòng "có dữ liệu" = đã chọn tên thiết bị.
const hasData = (row) => String(row.name).trim() !== '';

// updateSum() — Cập nhật badge "N dòng · Tổng X cái".
function updateSum() {
  const filled = _rows.filter(hasData);
  const totalQty = filled.reduce((s, r) => s + (Math.max(0, Math.floor(Number(r.quantity) || 0))), 0);
  const el = _host.querySelector('[data-sum]');
  if (el) el.textContent = `${filled.length} dòng · ${totalQty} cái`;
}

// ----------------------------------------------------------------------------
//  handleSave() — Validate vị trí + dòng → saveEquipment (cộng dồn) → onSaved.
// ----------------------------------------------------------------------------
async function handleSave() {
  const location = locEl().value;
  if (!location) { toast('Vui lòng chọn Vị trí.', 'warning'); return; }

  const filled = _rows.filter(hasData);
  if (!filled.length) { toast('Chưa chọn thiết bị nào để lưu.', 'warning'); return; }
  if (filled.some((r) => (Math.floor(Number(r.quantity) || 0)) <= 0)) {
    toast('Mỗi dòng đã chọn tên cần Số lượng > 0.', 'warning'); return;
  }

  setLoading(true, 'Đang lưu…');
  try {
    const { ok, errors } = await saveEquipment(location, filled);
    if (ok) toast(`Đã lưu ${ok} dòng thiết bị.`, 'success');
    if (errors.length) toast(errors[0], 'danger');
    if (ok) {
      _rows = Array.from({ length: MIN_ROWS }, blankRow);
      rebuild();
      if (_onSaved) await _onSaved();
    }
  } catch (e) {
    toast(e.message, 'danger');
  } finally {
    setLoading(false);
  }
}
