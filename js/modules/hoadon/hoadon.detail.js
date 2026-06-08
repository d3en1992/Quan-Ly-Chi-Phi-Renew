// ============================================================================
//  modules/hoadon/hoadon.detail.js  —  TẦNG GIAO DIỆN (Layer 6): Hóa đơn CHI TIẾT
// ----------------------------------------------------------------------------
//  @module hoadon.detail
//
//  Form "Hóa đơn chi tiết" (doc 02 §1,§4): 1 HÓA ĐƠN có nhiều MẶT HÀNG vật tư.
//    - HEADER chung: Ngày(*), Loại CP(*), Công trình(*), NCC, Người TH.
//    - BẢNG mặt hàng (sheet-grid): Tên hàng(*), ĐVT, SL, Đơn giá, Chiết khấu.
//    - TÍNH TIỀN 2 cấp dùng chung applyDiscount:
//        lineTotal = applyDiscount(SL × Đơn giá, chiết khấu dòng)
//        amount    = applyDiscount(Σ lineTotal, chiết khấu TỔNG)   ← lưu xuống DB.
//    - Nội dung tự sinh từ tên hàng (buildNoteFromItems), người dùng có thể sửa.
//
//  Là 1 trong 2 sub-tab của 'hoadon' (shell ở hoadon.ui.js gọi renderDetail).
//  Hóa đơn lưu kèm source:'detail' + items[] + totalDiscount (để mở lại đúng form).
// ============================================================================

import { createSheetGrid } from '../../utils/sheet-grid.js';
import { toast, setLoading, confirm2 } from '../../utils/ui.js';
import { formatMoney } from '../../utils/fmt.js';
import { loadCategories, listNames } from '../../utils/cat.js';
import { loadProjects, getProjectOptions, getProjectName } from '../projects/projects.data.js';
import {
  getInvoices, saveInvoice, deleteInvoice, applyDiscount, buildNoteFromItems,
} from './hoadon.data.js';

// ----------------------------------------------------------------------------
//  TRẠNG THÁI MODULE — chỉ sống trong lần render hiện tại của sub-tab.
//   _editId: null = TẠO MỚI · có id = đang SỬA 1 hóa đơn chi tiết.
//   _noteEdited: true khi người dùng tự gõ Nội dung → ngừng auto-ghép từ tên hàng.
// ----------------------------------------------------------------------------
let _host = null;
let _grid = null;
let _cats = null;
let _editId = null;
let _editProjectId = null;
let _noteEdited = false;

// todayStr() — Ngày hôm nay dạng YYYY-MM-DD cho ô Ngày mặc định.
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Lấy nhanh các ô trong layout.
const dateInput = () => _host.querySelector('[data-date]');
const catInput = () => _host.querySelector('[data-cat]');
const projectSel = () => _host.querySelector('[data-project]');
const supplierInput = () => _host.querySelector('[data-supplier]');
const performerInput = () => _host.querySelector('[data-performer]');
const totalDiscInput = () => _host.querySelector('[data-totaldisc]');
const noteInput = () => _host.querySelector('[data-note]');
const saveBtn = () => _host.querySelector('[data-save]');
const gridBox = () => _host.querySelector('[data-grid]');
const todayBox = () => _host.querySelector('[data-today]');
const subtotalEl = () => _host.querySelector('[data-subtotal]');
const amountEl = () => _host.querySelector('[data-amount]');
const countEl = () => _host.querySelector('[data-count]');

// escapeHtml(s) — chống vỡ HTML khi đổ chuỗi người dùng vào bảng/option.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ----------------------------------------------------------------------------
//  buildItemColumns() — Cấu hình cột bảng mặt hàng (doc 02 §1). Cột "Thành tiền"
//  KHÔNG nằm trong lưới (tính suy ra) — hiển thị live ở khung tổng kết bên dưới.
// ----------------------------------------------------------------------------
function buildItemColumns() {
  return [
    { field: 'name', label: 'Tên hàng', type: 'text', required: true, width: 200, suggestFromAbove: true },
    { field: 'unit', label: 'ĐVT', type: 'text', width: 90, copyFromAbove: true },
    { field: 'qty', label: 'SL', type: 'number', width: 90 },
    { field: 'price', label: 'Đơn giá', type: 'money', width: 120 },
    { field: 'discount', label: 'Chiết khấu', type: 'discount', width: 100 },
  ];
}

// ----------------------------------------------------------------------------
//  renderDetail(host) — Vẽ toàn bộ giao diện Hóa đơn chi tiết vào ô nội dung.
// ----------------------------------------------------------------------------
export async function renderDetail(host) {
  _host = host;
  _editId = null;
  _editProjectId = null;
  _noteEdited = false;

  host.innerHTML = `
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-body">
        <div class="row g-2 mb-3">
          <div class="col-6 col-md-2">
            <label class="form-label small mb-1 fw-semibold">📅 Ngày <span class="text-danger">*</span></label>
            <input type="date" class="form-control form-control-sm" data-date value="${todayStr()}">
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1 fw-semibold">Loại CP <span class="text-danger">*</span></label>
            <input class="form-control form-control-sm" data-cat list="dt-cats" placeholder="Vật tư…">
            <datalist id="dt-cats"></datalist>
          </div>
          <div class="col-12 col-md-3">
            <label class="form-label small mb-1 fw-semibold">Công trình <span class="text-danger">*</span></label>
            <select class="form-select form-select-sm" data-project></select>
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small mb-1 fw-semibold">NCC</label>
            <input class="form-control form-control-sm" data-supplier list="dt-sups">
            <datalist id="dt-sups"></datalist>
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small mb-1 fw-semibold">Người TH</label>
            <input class="form-control form-control-sm" data-performer list="dt-perfs">
            <datalist id="dt-perfs"></datalist>
          </div>
        </div>

        <div data-grid></div>

        <div class="row g-3 align-items-end mt-1">
          <div class="col-12 col-md-6">
            <label class="form-label small mb-1 fw-semibold">📝 Nội dung (tự ghép từ tên hàng — có thể sửa)</label>
            <input class="form-control form-control-sm" data-note>
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small mb-1 fw-semibold">Chiết khấu tổng</label>
            <input class="form-control form-control-sm" data-totaldisc placeholder="5% hoặc 50000">
          </div>
          <div class="col-6 col-md-4 text-md-end">
            <div class="small text-muted">
              <span data-count>0</span> mặt hàng · Tạm tính: <b data-subtotal>0</b>
            </div>
            <div class="fs-5 fw-bold text-primary">Thành tiền: <span data-amount>0</span></div>
          </div>
        </div>

        <div class="d-flex gap-2 mt-3">
          <button type="button" class="btn btn-sm btn-outline-secondary d-none ms-auto" data-cancel>Hủy sửa</button>
          <button type="button" class="btn btn-sm btn-primary ${''}" data-save>💾 Lưu hóa đơn</button>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <div class="d-flex align-items-center mb-2">
          <h2 class="h6 mb-0">📋 Hóa đơn chi tiết nhập trong ngày</h2>
          <button type="button" class="btn btn-sm btn-link ms-2 p-0" data-refresh>↻ Làm mới</button>
        </div>
        <div data-today></div>
      </div>
    </div>`;

  // Nút Lưu nằm bên phải khi không có nút Hủy → bù lại lề (Hủy đang d-none + ms-auto).
  saveBtn().classList.add('ms-auto');

  setLoading(true, 'Đang tải danh mục…');
  try {
    [_cats] = await Promise.all([loadCategories(), loadProjects()]);
  } finally {
    setLoading(false);
  }

  fillDatalists();
  fillProjectOptions(null);
  mountGrid();

  dateInput().addEventListener('change', renderToday);
  totalDiscInput().addEventListener('input', recompute);
  noteInput().addEventListener('input', () => { _noteEdited = true; });
  saveBtn().addEventListener('click', handleSave);
  _host.querySelector('[data-cancel]').addEventListener('click', exitEditMode);
  _host.querySelector('[data-refresh]').addEventListener('click', renderToday);

  await renderToday();
}

// fillDatalists() — Đổ gợi ý Loại CP / NCC / Người TH từ danh mục đã cache.
function fillDatalists() {
  const opt = (names) => names.map((n) => `<option value="${escapeHtml(n)}">`).join('');
  _host.querySelector('#dt-cats').innerHTML = opt(listNames(_cats, 'costType'));
  _host.querySelector('#dt-sups').innerHTML = opt(listNames(_cats, 'supplier'));
  _host.querySelector('#dt-perfs').innerHTML = opt(listNames(_cats, 'performer'));
}

// fillProjectOptions(selectedId) — Đổ danh sách công trình (ẩn CT đã quyết toán;
// khi SỬA thì vẫn giữ CT của hóa đơn qua includeId). Chọn sẵn selectedId nếu có.
function fillProjectOptions(selectedId) {
  const opts = getProjectOptions({ excludeLocked: true, includeId: selectedId || null });
  projectSel().innerHTML = `<option value="">— Chọn công trình —</option>` +
    opts.map((o) => `<option value="${escapeHtml(o.id)}"${o.id === selectedId ? ' selected' : ''}>${escapeHtml(o.name)}</option>`).join('');
}

// mountGrid(data) — Dựng (hoặc dựng lại) lưới mặt hàng; mỗi thay đổi → recompute().
function mountGrid(data = null) {
  if (_grid) _grid.destroy();
  gridBox().innerHTML = '';
  _grid = createSheetGrid(gridBox(), {
    columns: buildItemColumns(),
    rows: 5,
    onChange: recompute,
    data,
  });
  recompute();
}

// ----------------------------------------------------------------------------
//  collectItems() — Đọc lưới → các mặt hàng có Tên, kèm lineTotal đã chiết khấu.
// ----------------------------------------------------------------------------
function collectItems() {
  const out = [];
  for (const r of _grid.getData()) {
    const name = String(r.name || '').trim();
    if (!name) continue;                         // dòng chưa có tên hàng → bỏ
    const qty = Number(r.qty) || 0;
    const price = Number(r.price) || 0;
    const discount = String(r.discount || '').trim();
    const lineTotal = applyDiscount(qty * price, discount);
    out.push({ name, unit: String(r.unit || '').trim(), qty, price, discount, lineTotal });
  }
  return out;
}

// recompute() — Cập nhật live: số mặt hàng, tạm tính, thành tiền, nội dung tự ghép.
function recompute() {
  const items = collectItems();
  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
  const amount = applyDiscount(subtotal, totalDiscInput().value);

  countEl().textContent = items.length;
  subtotalEl().textContent = formatMoney(subtotal);
  amountEl().textContent = formatMoney(amount);
  if (!_noteEdited) noteInput().value = buildNoteFromItems(items);
}

// ----------------------------------------------------------------------------
//  handleSave() — Validate header + mặt hàng → tính amount 2 cấp → lưu (source detail).
// ----------------------------------------------------------------------------
async function handleSave() {
  const date = dateInput().value;
  const category = catInput().value.trim();
  const projectId = projectSel().value;
  const items = collectItems();

  if (!date) { toast('Vui lòng chọn Ngày hóa đơn.', 'warning'); return; }
  if (!category) { toast('Vui lòng nhập Loại chi phí.', 'warning'); return; }
  if (!projectId) { toast('Vui lòng chọn Công trình.', 'warning'); return; }
  if (!items.length) { toast('Chưa có mặt hàng nào (cần ít nhất Tên hàng).', 'warning'); return; }

  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
  const totalDiscount = totalDiscInput().value.trim();
  const amount = applyDiscount(subtotal, totalDiscount);
  const note = noteInput().value.trim() || buildNoteFromItems(items);

  setLoading(true, 'Đang lưu…');
  try {
    await saveInvoice({
      id: _editId || undefined,
      date, projectId, category, amount, note,
      performer: performerInput().value.trim(),
      supplier: supplierInput().value.trim(),
      source: 'detail',
      items,
      totalDiscount,
    });
    toast(_editId ? 'Đã cập nhật hóa đơn.' : 'Đã lưu hóa đơn chi tiết.', 'success');
  } catch (e) {
    toast(e.message, 'danger');
    return;
  } finally {
    setLoading(false);
  }

  if (_editId) exitEditMode();
  else resetForm();
  await renderToday();
}

// resetForm() — Làm sạch form cho lượt nhập mới (giữ Ngày để nhập tiếp trong ngày).
function resetForm() {
  catInput().value = '';
  projectSel().value = '';
  supplierInput().value = '';
  performerInput().value = '';
  totalDiscInput().value = '';
  noteInput().value = '';
  _noteEdited = false;
  mountGrid();
}

// ----------------------------------------------------------------------------
//  renderToday() — Bảng hóa đơn CHI TIẾT có date === ô Ngày đang chọn (doc 02 §6).
// ----------------------------------------------------------------------------
async function renderToday() {
  const date = dateInput().value;
  const box = todayBox();
  if (!date) { box.innerHTML = '<p class="text-muted small mb-0">Chưa chọn ngày.</p>'; return; }

  const list = (await getInvoices({ date })).filter((r) => r.source === 'detail');
  if (!list.length) {
    box.innerHTML = '<p class="text-muted small mb-0">Chưa có hóa đơn chi tiết nào trong ngày này.</p>';
    return;
  }

  const total = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  box.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle mb-1">
        <thead class="table-light">
          <tr>
            <th>Loại CP</th><th>Công trình</th><th>Nội dung</th>
            <th class="text-end">Số mặt hàng</th><th class="text-end">Thành tiền</th><th style="width:84px"></th>
          </tr>
        </thead>
        <tbody>
          ${list.map((r) => `
            <tr>
              <td>${escapeHtml(r.category)}</td>
              <td>${escapeHtml(getProjectName(r.projectId) || '—')}</td>
              <td>${escapeHtml(r.note)}</td>
              <td class="text-end">${(r.items || []).length}</td>
              <td class="text-end">${formatMoney(r.amount)}</td>
              <td class="text-nowrap">
                <button class="btn btn-sm btn-link p-0 me-2" data-edit="${r.id}" title="Sửa">✏️</button>
                <button class="btn btn-sm btn-link text-danger p-0" data-del="${r.id}" title="Xóa">🗑</button>
              </td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr class="fw-semibold">
            <td colspan="4">Tổng (${list.length} HĐ)</td>
            <td class="text-end">${formatMoney(total)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  box.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openDetailEdit(b.dataset.edit)));
  box.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => handleDelete(b.dataset.del)));
}

// handleDelete(id) — Xác nhận rồi xóa mềm 1 hóa đơn, làm mới bảng trong ngày.
async function handleDelete(id) {
  if (!(await confirm2('Xóa hóa đơn này? (có thể khôi phục trong Thùng rác)'))) return;
  await deleteInvoice(id);
  toast('Đã xóa hóa đơn.', 'success');
  if (_editId === id) exitEditMode();
  await renderToday();
}

// ----------------------------------------------------------------------------
//  openDetailEdit(id) — Nạp 1 hóa đơn chi tiết lên form để SỬA (doc 02 §8).
// ----------------------------------------------------------------------------
export async function openDetailEdit(id) {
  if (!_host) return;
  const inv = (await getInvoices({ year: 0 })).find((r) => r.id === id);
  if (!inv) { toast('Không tìm thấy hóa đơn.', 'warning'); return; }

  _editId = inv.id;
  _editProjectId = inv.projectId;
  _noteEdited = true;                            // giữ nguyên Nội dung đã lưu

  dateInput().value = inv.date;
  catInput().value = inv.category || '';
  supplierInput().value = inv.supplier || '';
  performerInput().value = inv.performer || '';
  totalDiscInput().value = inv.totalDiscount || '';
  noteInput().value = inv.note || '';
  fillProjectOptions(inv.projectId);

  mountGrid((inv.items || []).map((it) => ({
    name: it.name, unit: it.unit, qty: it.qty, price: it.price, discount: it.discount,
  })));

  saveBtn().textContent = '💾 Cập nhật';
  _host.querySelector('[data-cancel]').classList.remove('d-none');
  _host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// exitEditMode() — Thoát chế độ sửa: làm sạch form, trả nút về "Lưu hóa đơn".
function exitEditMode() {
  _editId = null;
  _editProjectId = null;
  saveBtn().textContent = '💾 Lưu hóa đơn';
  _host.querySelector('[data-cancel]').classList.add('d-none');
  dateInput().value = todayStr();
  resetForm();
}
