// ============================================================================
//  modules/hoadon/hoadon.quick.js  —  TẦNG GIAO DIỆN (Layer 6): Nhập NHANH hóa đơn
// ----------------------------------------------------------------------------
//  @module hoadon.quick
//
//  Form "Nhập nhanh" (doc 02 §1): mỗi DÒNG = 1 hóa đơn tổng quát, nhập hàng loạt
//  kiểu Google Sheets bằng utils/sheet-grid.js. Tất cả dòng dùng CHUNG 1 ô Ngày ở
//  trên (mỗi hóa đơn = ngày đó). Cột: Loại CP(*), Công trình(*), Số tiền, Nội dung,
//  Người TH, NCC. Dưới bảng là "Hóa đơn nhập trong ngày" (doc 02 §6).
//
//  LUỒNG:
//    - Lưu tất cả: đọc lưới → validate → DÒ TRÙNG (doc 02 §5) → lưu từng dòng.
//    - Sửa 1 hóa đơn (openQuickEdit): nạp về lưới 1 dòng, đổi nút thành "Cập nhật".
//
//  Là 1 trong 2 sub-tab của 'hoadon' (shell ở hoadon.ui.js gọi renderQuick).
// ============================================================================

import { createSheetGrid } from '../../utils/sheet-grid.js';
import { toast, setLoading, confirm2 } from '../../utils/ui.js';
import { formatMoney } from '../../utils/fmt.js';
import { loadCategories, listNames } from '../../utils/cat.js';
import { loadProjects, getProjectOptions, getProjectName } from '../projects/projects.data.js';
import { getInvoices, saveInvoice, deleteInvoice, findDuplicates } from './hoadon.data.js';

// ----------------------------------------------------------------------------
//  TRẠNG THÁI MODULE — chỉ sống trong lần render hiện tại của tab.
//   _editId: null = chế độ TẠO MỚI (nhiều dòng) · có id = đang SỬA 1 hóa đơn.
// ----------------------------------------------------------------------------
let _host = null;
let _grid = null;
let _cats = null;     // document danh mục (cache cho nguồn gợi ý đồng bộ)
let _editId = null;

// todayStr() — Ngày hôm nay dạng YYYY-MM-DD cho ô Ngày mặc định.
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// dateInput() / saveBtn() / gridBox() / todayBox() — lấy nhanh các ô trong layout.
const dateInput = () => _host.querySelector('[data-date]');
const saveBtn = () => _host.querySelector('[data-save]');
const gridBox = () => _host.querySelector('[data-grid]');
const todayBox = () => _host.querySelector('[data-today]');

// escapeHtml(s) — chống vỡ HTML khi đổ chuỗi người dùng vào bảng trong ngày.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ----------------------------------------------------------------------------
//  COLUMNS — cấu hình cột lưới Nhập nhanh (doc 02 §3). Nguồn gợi ý lấy từ danh mục
//  đã cache (_cats) + công trình (ẩn CT đã quyết toán khi nhập mới).
// ----------------------------------------------------------------------------
function buildColumns() {
  return [
    { field: 'category', label: 'Loại CP', type: 'autocomplete', required: true, copyFromAbove: true,
      source: () => listNames(_cats, 'costType') },
    { field: 'projectId', label: 'Công trình', type: 'project', required: true, copyFromAbove: true, width: 170,
      source: () => getProjectOptions({ excludeLocked: true, includeId: _editId ? _editProjectId : null }) },
    { field: 'amount', label: 'Số tiền', type: 'money' },
    { field: 'note', label: 'Nội dung', type: 'text', width: 200, suggestFromAbove: true },
    { field: 'performer', label: 'Người TH', type: 'autocomplete', copyFromAbove: true,
      source: () => listNames(_cats, 'performer') },
    { field: 'supplier', label: 'NCC', type: 'autocomplete', copyFromAbove: true, width: 160,
      source: () => listNames(_cats, 'supplier') },
  ];
}

// Khi sửa: giữ lại projectId của hóa đơn để dropdown không loại CT đã quyết toán.
let _editProjectId = null;

// ----------------------------------------------------------------------------
//  renderQuick(host) — Vẽ toàn bộ giao diện Nhập nhanh vào ô nội dung tab.
//  Tải song song danh mục + công trình rồi dựng lưới và bảng trong ngày.
// ----------------------------------------------------------------------------
export async function renderQuick(host) {
  _host = host;
  _editId = null;
  _editProjectId = null;

  host.innerHTML = `
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-body">
        <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
          <div>
            <label class="form-label small mb-1 fw-semibold">📅 Ngày hóa đơn</label>
            <input type="date" class="form-control form-control-sm" data-date style="max-width:170px" value="${todayStr()}">
          </div>
          <div class="ms-auto d-flex gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary d-none" data-cancel>Hủy sửa</button>
            <button type="button" class="btn btn-sm btn-primary" data-save>💾 Lưu tất cả</button>
          </div>
        </div>
        <div data-grid></div>
      </div>
    </div>
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <div class="d-flex align-items-center mb-2">
          <h2 class="h6 mb-0">🧾 Hóa đơn nhập trong ngày</h2>
          <button type="button" class="btn btn-sm btn-link ms-2 p-0" data-refresh>↻ Làm mới</button>
        </div>
        <div data-today></div>
      </div>
    </div>`;

  setLoading(true, 'Đang tải danh mục…');
  try {
    [_cats] = await Promise.all([loadCategories(), loadProjects()]);
  } finally {
    setLoading(false);
  }

  mountGrid();

  // Sự kiện: đổi ngày → vẽ lại bảng trong ngày; Lưu / Hủy sửa / Làm mới.
  dateInput().addEventListener('change', renderToday);
  saveBtn().addEventListener('click', handleSaveAll);
  _host.querySelector('[data-cancel]').addEventListener('click', exitEditMode);
  _host.querySelector('[data-refresh]').addEventListener('click', renderToday);

  await renderToday();
}

// mountGrid(data) — Dựng (hoặc dựng lại) lưới với dữ liệu tùy chọn.
function mountGrid(data = null) {
  if (_grid) _grid.destroy();
  gridBox().innerHTML = '';
  _grid = createSheetGrid(gridBox(), {
    columns: buildColumns(),
    rows: 5,
    data,
  });
}

// ----------------------------------------------------------------------------
//  handleSaveAll() — Đọc lưới → bỏ dòng thiếu Loại CP/Công trình → DÒ TRÙNG → lưu.
//  Chế độ sửa: chỉ có 1 dòng, gắn _editId để cập nhật đúng record (không dò trùng).
// ----------------------------------------------------------------------------
async function handleSaveAll() {
  const date = dateInput().value;
  if (!date) { toast('Vui lòng chọn Ngày hóa đơn.', 'warning'); return; }

  const rows = _grid.getData();                 // đã parse + áp copyFromAbove
  const valid = rows.filter((r) => r.category && r.projectId);
  if (!valid.length) {
    toast('Chưa có dòng nào đủ Loại CP + Công trình.', 'warning');
    return;
  }

  // DÒ TRÙNG (chỉ khi TẠO MỚI — doc 02 §5). Gom mọi cặp nghi trùng để cảnh báo 1 lần.
  if (!_editId) {
    const existing = await getInvoices({ year: 0 });
    const warnings = [];
    for (const r of valid) {
      const dups = findDuplicates({ ...r, date }, existing);
      for (const d of dups) warnings.push({ row: r, dup: d });
    }
    if (warnings.length && !(await confirmDuplicates(warnings))) return;
  }

  setLoading(true, 'Đang lưu…');
  let ok = 0;
  const errors = [];
  try {
    for (const r of valid) {
      try {
        await saveInvoice({
          id: _editId || undefined,
          date,
          projectId: r.projectId,
          category: r.category,
          amount: r.amount,
          note: r.note,
          performer: r.performer,
          supplier: r.supplier,
          source: 'quick',
        });
        ok++;
      } catch (e) {
        errors.push(e.message);
      }
    }
  } finally {
    setLoading(false);
  }

  if (ok) toast(_editId ? 'Đã cập nhật hóa đơn.' : `Đã lưu ${ok} hóa đơn.`, 'success');
  if (errors.length) toast(errors[0], 'danger');

  if (_editId) exitEditMode();
  else mountGrid();          // lưu xong → làm sạch lưới cho lượt nhập mới
  await renderToday();
}

// confirmDuplicates(warnings) — Modal liệt kê các cặp nghi trùng, hỏi "Vẫn lưu?".
function confirmDuplicates(warnings) {
  const items = warnings.map(({ row, dup }) => {
    const lbl = dup.label === 'exact' ? 'Trùng hoàn toàn' : `Giống ${dup.percent}%`;
    return `<li class="small mb-1">«${escapeHtml(row.note || '(trống)')}» —
      <span class="badge bg-${dup.label === 'exact' ? 'danger' : 'warning'}">${lbl}</span>
      với hóa đơn cũ «${escapeHtml(dup.invoice.note || '(trống)')}»</li>`;
  }).join('');
  const msg = `⚠️ Phát hiện <b>${warnings.length}</b> hóa đơn có thể bị trùng:
    <ul class="mt-2 mb-0 ps-3">${items}</ul>`;
  return confirm2(msg, { okText: 'Vẫn lưu tất cả', cancelText: 'Xem lại', danger: true });
}

// ----------------------------------------------------------------------------
//  renderToday() — Bảng hóa đơn có date === ô Ngày đang chọn (doc 02 §6).
// ----------------------------------------------------------------------------
async function renderToday() {
  const date = dateInput().value;
  const box = todayBox();
  if (!date) { box.innerHTML = '<p class="text-muted small mb-0">Chưa chọn ngày.</p>'; return; }

  const list = await getInvoices({ date });
  if (!list.length) {
    box.innerHTML = '<p class="text-muted small mb-0">Chưa có hóa đơn nào trong ngày này.</p>';
    return;
  }

  const total = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  box.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle mb-1">
        <thead class="table-light">
          <tr>
            <th>Loại CP</th><th>Công trình</th><th class="text-end">Số tiền</th>
            <th>Nội dung</th><th>NCC</th><th style="width:84px"></th>
          </tr>
        </thead>
        <tbody>
          ${list.map((r) => `
            <tr>
              <td>${escapeHtml(r.category)}</td>
              <td>${escapeHtml(getProjectName(r.projectId) || '—')}</td>
              <td class="text-end">${formatMoney(r.amount)}</td>
              <td>${escapeHtml(r.note)}</td>
              <td>${escapeHtml(r.supplier)}</td>
              <td class="text-nowrap">
                <button class="btn btn-sm btn-link p-0 me-2" data-edit="${r.id}" title="Sửa">✏️</button>
                <button class="btn btn-sm btn-link text-danger p-0" data-del="${r.id}" title="Xóa">🗑</button>
              </td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr class="fw-semibold">
            <td colspan="2">Tổng (${list.length} HĐ)</td>
            <td class="text-end">${formatMoney(total)}</td>
            <td colspan="3"></td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  box.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openQuickEdit(b.dataset.edit)));
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
//  openQuickEdit(id) — Nạp 1 hóa đơn lên lưới (1 dòng) để SỬA (doc 02 §8).
//  Đổi ô Ngày theo hóa đơn, nút "Lưu tất cả" → "Cập nhật", hiện nút "Hủy sửa".
// ----------------------------------------------------------------------------
export async function openQuickEdit(id) {
  if (!_host) return;
  const list = await getInvoices({ year: 0 });
  const inv = list.find((r) => r.id === id);
  if (!inv) { toast('Không tìm thấy hóa đơn.', 'warning'); return; }

  _editId = inv.id;
  _editProjectId = inv.projectId;
  dateInput().value = inv.date;

  // Nạp lưới 1 dòng. Cột 'project' cần TÊN để hiển thị; getData() sẽ đổi lại ra id.
  mountGrid([{
    category: inv.category,
    projectId: getProjectName(inv.projectId),
    amount: inv.amount,
    note: inv.note,
    performer: inv.performer,
    supplier: inv.supplier,
  }]);

  saveBtn().textContent = '💾 Cập nhật';
  _host.querySelector('[data-cancel]').classList.remove('d-none');
  _host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// exitEditMode() — Thoát chế độ sửa: làm sạch lưới, trả nút về "Lưu tất cả".
function exitEditMode() {
  _editId = null;
  _editProjectId = null;
  saveBtn().textContent = '💾 Lưu tất cả';
  _host.querySelector('[data-cancel]').classList.add('d-none');
  dateInput().value = todayStr();
  mountGrid();
}
