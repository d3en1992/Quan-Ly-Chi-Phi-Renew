// ============================================================================
//  modules/tienung/tienung.form.js  —  TẦNG GIAO DIỆN (Layer 6): Bảng NHẬP tiền ứng
// ----------------------------------------------------------------------------
//  @module tienung.form
//
//  Khu nhập liệu của tab Tiền Ứng (doc 05 §2): bảng nhập NHIỀU dòng cùng lúc, tất
//  cả dùng CHUNG 1 ô Ngày ở trên. Mỗi dòng = 1 khoản ứng. Cột:
//    Loại (Thầu phụ/NCC) · Đối tác (autocomplete đổi theo Loại) · Công trình
//    (dropdown) · Số tiền · Nội dung · ✕.
//
//  Dùng mini-grid TỰ DỰNG (không dùng utils/sheet-grid.js) vì cần cột Loại là
//  <select> đổi nguồn gợi ý đối tác theo từng dòng — điều sheet-grid không có.
//
//  LUỒNG:
//    - 💾 Lưu tất cả: đọc bảng → bỏ dòng trống → validate (khớp danh mục + CT) →
//      saveAdvances (mỗi dòng 1 bản ghi).
//    - editAdvance(rec): nạp 1 dòng để SỬA → 💾 Cập nhật (updateAdvance theo id).
//
//  Đăng ký router do vỏ tienung.ui.js lo (sub-tab Nhập / Lịch sử). File này chỉ
//  EXPORT renderEntry + editAdvance + resetEntryForm cho vỏ gọi.
// ============================================================================

import { toast, setLoading, confirm2 } from '../../utils/ui.js';
import { formatMoney, parseMoney } from '../../utils/fmt.js';
import { loadCategories, listNames, findByKey } from '../../utils/cat.js';
import { attachAutocomplete } from '../../utils/autocomplete.js';
import { loadProjects, getProjectOptions, getProjectName, COMPANY } from '../projects/projects.data.js';
import { ADVANCE_TYPES, ADVANCE_TYPE_KEYS, saveAdvances, updateAdvance } from './tienung.data.js';

const MIN_ROWS = 4;        // số dòng trống mặc định khi reset bảng

// ----------------------------------------------------------------------------
//  TRẠNG THÁI MODULE — chỉ sống trong lần render hiện tại của tab.
//   _editId: null = TẠO MỚI (nhiều dòng) · có id = đang SỬA 1 khoản (1 dòng).
//   _rows  : mô hình dữ liệu bảng — mảng { type, partner, projectId, amount, note }.
// ----------------------------------------------------------------------------
let _host = null;
let _cats = null;
let _rows = [];
let _editId = null;
let _editProjectId = null;
let _acDetachers = [];

// todayStr() — Ngày hôm nay dạng YYYY-MM-DD cho ô Ngày mặc định.
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Lấy nhanh các phần tử trong layout.
const dateInput = () => _host.querySelector('[data-date]');
const saveBtn   = () => _host.querySelector('[data-save]');
const tbodyEl   = () => _host.querySelector('[data-rows]');
const toolsEl   = () => _host.querySelector('[data-tools]');

// escapeHtml(s) — chống vỡ thuộc tính value="" khi đổ chuỗi người dùng vào ô.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// blankRow() — 1 dòng trống (mặc định loại Thầu phụ).
function blankRow() {
  return { type: 'subcontractor', partner: '', projectId: '', amount: '', note: '' };
}

// projectOpts() — Danh sách CT cho dropdown (ẩn COMPANY + CT đã quyết toán; giữ
// lại CT của bản đang sửa qua includeId để không mất giá trị).
function projectOpts() {
  return getProjectOptions({ excludeLocked: true, includeId: _editProjectId })
    .filter((o) => o.id !== COMPANY.id);
}

// ----------------------------------------------------------------------------
//  renderEntry(host) — Vẽ toàn bộ khu nhập tiền ứng vào ô nội dung tab.
// ----------------------------------------------------------------------------
export async function renderEntry(host) {
  _host = host;
  _editId = null;
  _editProjectId = null;
  _rows = Array.from({ length: MIN_ROWS }, blankRow);

  host.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
          <div>
            <label class="form-label small mb-1 fw-semibold">📅 Ngày ứng</label>
            <input type="date" class="form-control form-control-sm" data-date style="max-width:170px" value="${todayStr()}">
          </div>
          <div class="ms-auto d-flex gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary d-none" data-cancel>Hủy sửa</button>
            <button type="button" class="btn btn-sm btn-primary" data-save>💾 Lưu tất cả</button>
          </div>
        </div>
        <div class="table-responsive border rounded">
          <table class="table table-sm table-bordered align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th style="width:42px" class="text-center">#</th>
                <th style="width:130px">Loại</th>
                <th style="width:200px">Đối tác <span class="text-danger">*</span></th>
                <th style="width:190px">Công trình <span class="text-danger">*</span></th>
                <th style="width:140px" class="text-end">Số tiền</th>
                <th style="min-width:180px">Nội dung</th>
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
            <button type="button" class="btn btn-outline-primary" data-add="10">+10</button>
          </div>
          <button type="button" class="btn btn-sm btn-outline-danger" data-clear>🗑 Xóa bảng</button>
          <span class="badge bg-secondary-subtle text-secondary-emphasis ms-auto" data-sum></span>
        </div>
      </div>
    </div>`;

  setLoading(true, 'Đang tải danh mục…');
  try {
    [_cats] = await Promise.all([loadCategories(), loadProjects()]);
  } finally {
    setLoading(false);
  }

  bindEvents();
  rebuild();
}

// bindEvents() — Gắn sự kiện cho toolbar + nút Lưu/Hủy (1 lần mỗi render).
function bindEvents() {
  saveBtn().addEventListener('click', handleSave);
  _host.querySelector('[data-cancel]').addEventListener('click', resetEntryForm);
  toolsEl().addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) { for (let i = 0; i < +add.dataset.add; i++) _rows.push(blankRow()); rebuild(); return; }
    if (e.target.closest('[data-clear]')) {
      _rows = Array.from({ length: MIN_ROWS }, blankRow);
      rebuild();
    }
  });

  // Ủy quyền sự kiện trên thân bảng (chạy cho cả dòng mới thêm).
  const tb = tbodyEl();
  tb.addEventListener('input', onCellInput);     // gõ ô / chọn select
  tb.addEventListener('change', onCellInput);    // <select> đổi
  tb.addEventListener('focusout', onCellBlur);   // rời ô tiền → đẹp hóa số
  tb.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) deleteRow(+del.dataset.del);
  });
}

// onCellInput(e) — Đồng bộ model khi gõ/đổi 1 ô (trừ Đối tác do autocomplete lo).
function onCellInput(e) {
  const el = e.target.closest('[data-f]');
  if (!el) return;
  const r = +el.dataset.r;
  const f = el.dataset.f;
  if (!_rows[r]) return;
  _rows[r][f] = el.value;
  if (f === 'partner') el.classList.remove('is-invalid'); // gõ lại → bỏ cờ lỗi
  if (f === 'type') {                                      // đổi Loại → đổi placeholder ô đối tác
    const p = tbodyEl().querySelector(`input[data-f="partner"][data-r="${r}"]`);
    if (p) p.placeholder = ADVANCE_TYPES[_rows[r].type].label + '…';
  }
  updateSum();
}

// onCellBlur(e) — Rời ô Số tiền → định dạng chấm hàng nghìn.
function onCellBlur(e) {
  const el = e.target.closest('[data-f="amount"]');
  if (!el) return;
  const r = +el.dataset.r;
  el.value = el.value.trim() === '' ? '' : formatMoney(parseMoney(el.value));
  if (_rows[r]) _rows[r].amount = el.value;
}

// ----------------------------------------------------------------------------
//  rebuild() — Vẽ lại toàn bộ thân bảng theo `_rows` + gắn lại autocomplete đối tác.
// ----------------------------------------------------------------------------
function rebuild() {
  // Gỡ autocomplete cũ tránh rò rỉ sự kiện.
  _acDetachers.forEach((fn) => fn());
  _acDetachers = [];

  const opts = projectOpts();
  tbodyEl().innerHTML = _rows.map((row, r) => `
    <tr>
      <td class="text-center text-muted small">${r + 1}</td>
      <td>
        <select class="form-select form-select-sm border-0" data-f="type" data-r="${r}">
          ${ADVANCE_TYPE_KEYS.map((k) =>
            `<option value="${k}"${row.type === k ? ' selected' : ''}>${ADVANCE_TYPES[k].label}</option>`).join('')}
        </select>
      </td>
      <td>
        <input class="form-control form-control-sm border-0" data-f="partner" data-r="${r}"
               autocomplete="off" placeholder="${ADVANCE_TYPES[row.type].label}…"
               value="${escapeHtml(row.partner)}">
      </td>
      <td>
        <select class="form-select form-select-sm border-0" data-f="projectId" data-r="${r}">
          <option value="">— Chọn CT —</option>
          ${opts.map((o) =>
            `<option value="${o.id}"${row.projectId === o.id ? ' selected' : ''}>${escapeHtml(o.name)}</option>`).join('')}
        </select>
      </td>
      <td><input class="form-control form-control-sm border-0 text-end" data-f="amount" data-r="${r}"
                 inputmode="decimal" value="${escapeHtml(row.amount)}"></td>
      <td><input class="form-control form-control-sm border-0" data-f="note" data-r="${r}"
                 value="${escapeHtml(row.note)}"></td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-link text-danger p-0" data-del="${r}" title="Xóa dòng">✕</button>
      </td>
    </tr>`).join('');

  // Gắn autocomplete cho ô Đối tác — nguồn gợi ý đọc LIVE theo Loại của dòng đó.
  _rows.forEach((row, r) => {
    const inp = tbodyEl().querySelector(`input[data-f="partner"][data-r="${r}"]`);
    if (!inp) return;
    const getItems = () => listNames(_cats, ADVANCE_TYPES[_rows[r].type].catGroup);
    const detach = attachAutocomplete(inp, getItems, {
      onSelect: (val) => { _rows[r].partner = val; inp.classList.remove('is-invalid'); },
    });
    _acDetachers.push(detach);
  });

  updateSum();
}

// deleteRow(r) — Xóa 1 dòng (luôn giữ tối thiểu MIN_ROWS dòng trống).
function deleteRow(r) {
  _rows.splice(r, 1);
  if (_rows.length < (_editId ? 1 : MIN_ROWS)) _rows.push(blankRow());
  rebuild();
}

// hasData(row) — Dòng "có dữ liệu" = có đối tác HOẶC số tiền > 0 (doc 05 §2).
function hasData(row) {
  return String(row.partner).trim() !== '' || parseMoney(row.amount) > 0;
}

// updateSum() — Cập nhật badge "N dòng · Tổng X" theo các dòng có dữ liệu.
function updateSum() {
  const filled = _rows.filter(hasData);
  const total = filled.reduce((s, r) => s + parseMoney(r.amount), 0);
  const el = _host.querySelector('[data-sum]');
  if (el) el.textContent = `${filled.length} dòng · Tổng ${formatMoney(total)}`;
}

// ----------------------------------------------------------------------------
//  handleSave() — Đọc bảng → validate khớp danh mục đối tác → lưu (tạo/cập nhật).
// ----------------------------------------------------------------------------
async function handleSave() {
  const date = dateInput().value;
  if (!date) { toast('Vui lòng chọn Ngày ứng.', 'warning'); return; }

  const filled = _rows.filter(hasData);
  if (!filled.length) { toast('Chưa có dòng nào có dữ liệu.', 'warning'); return; }

  // Validate UI: dòng có tiền nhưng thiếu/không khớp đối tác → tô đỏ, chặn.
  let bad = false;
  for (let r = 0; r < _rows.length; r++) {
    const row = _rows[r];
    if (!hasData(row)) continue;
    const inp = tbodyEl().querySelector(`input[data-f="partner"][data-r="${r}"]`);
    const matched = findByKey(_cats, ADVANCE_TYPES[row.type].catGroup, row.partner);
    if (!String(row.partner).trim() || !matched) {
      if (inp) inp.classList.add('is-invalid');
      bad = true;
    } else {
      row.partner = matched.name;      // chuẩn hóa về tên trong danh mục
      if (inp) { inp.value = matched.name; inp.classList.remove('is-invalid'); }
    }
    if (!row.projectId) bad = true;
  }
  if (bad) {
    toast('Có dòng thiếu Công trình hoặc Đối tác không khớp danh mục.', 'warning');
    return;
  }

  setLoading(true, 'Đang lưu…');
  try {
    if (_editId) {
      const row = filled[0];
      await updateAdvance(_editId, { date, ...row });
      toast('Đã cập nhật khoản ứng.', 'success');
      resetEntryForm();
    } else {
      const { ok, errors } = await saveAdvances(filled.map((r) => ({ date, ...r })));
      if (ok) toast(`Đã lưu ${ok} khoản ứng.`, 'success');
      if (errors.length) toast(errors[0], 'danger');
      if (ok) { _rows = Array.from({ length: MIN_ROWS }, blankRow); rebuild(); }
    }
    document.dispatchEvent(new CustomEvent('tienung:changed'));
  } catch (e) {
    toast(e.message, 'danger');
  } finally {
    setLoading(false);
  }
}

// ----------------------------------------------------------------------------
//  editAdvance(rec) — Nạp 1 khoản ứng lên bảng (1 dòng) để SỬA (doc 05 §2).
//   Đổi ô Ngày, nút "Lưu tất cả" → "Cập nhật", khóa nút thêm dòng, hiện "Hủy sửa".
//   Nhận cả bản ghi (object) hoặc id — P22 (bảng lịch sử) sẽ gọi hàm này.
// ----------------------------------------------------------------------------
export function editAdvance(rec) {
  if (!_host || !rec) return;
  _editId = rec.id;
  _editProjectId = rec.projectId;
  dateInput().value = rec.date || todayStr();
  _rows = [{
    type: rec.type === 'supplier' ? 'supplier' : 'subcontractor',
    partner: rec.partner || '',
    projectId: rec.projectId || '',
    amount: rec.amount ? formatMoney(rec.amount) : '',
    note: rec.note || '',
  }];
  rebuild();

  saveBtn().textContent = '💾 Cập nhật';
  _host.querySelector('[data-cancel]').classList.remove('d-none');
  toolsEl().querySelectorAll('[data-add],[data-clear]').forEach((b) => { b.disabled = true; });
  _host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// resetEntryForm() — Thoát chế độ sửa: làm sạch bảng, trả nút về "Lưu tất cả".
export function resetEntryForm() {
  _editId = null;
  _editProjectId = null;
  _rows = Array.from({ length: MIN_ROWS }, blankRow);
  if (!_host) return;
  dateInput().value = todayStr();
  saveBtn().textContent = '💾 Lưu tất cả';
  _host.querySelector('[data-cancel]').classList.add('d-none');
  toolsEl().querySelectorAll('[data-add],[data-clear]').forEach((b) => { b.disabled = false; });
  rebuild();
}

// getProjectName re-export tiện cho bảng lịch sử (dùng chung module này).
export { getProjectName };

// Đăng ký router do vỏ tienung.ui.js lo (sub-tab Nhập / Lịch sử).
