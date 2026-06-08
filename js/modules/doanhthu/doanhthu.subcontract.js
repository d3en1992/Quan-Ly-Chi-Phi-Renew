// ============================================================================
//  modules/doanhthu/doanhthu.subcontract.js  —  TẦNG GIAO DIỆN (Layer 6)
// ----------------------------------------------------------------------------
//  @module doanhthu.subcontract
//
//  Modal KHAI BÁO HỢP ĐỒNG THẦU PHỤ của tab Doanh Thu (doc 08 §2.C) — modal phức
//  tạp nhất tab vì có BẢNG KHỐI LƯỢNG động. N hợp đồng thầu phụ / công trình nên
//  đây là modal Thêm/Sửa 1 bản ghi trong danh sách (khác HĐ chính 1 CT = 1 HĐ).
//    • Bảng items[] động: [+ Thêm dòng] / [✕], mỗi dòng Thành tiền = SL × đơn giá.
//    • "Tổng chi tiết" = Σ thành tiền, cập nhật realtime khi gõ.
//    • ĐỐI SOÁT: có dòng chi tiết (có tên) → ô "Giá trị HĐ thầu phụ" KHÓA = đúng
//      tổng chi tiết (chống lệch); không có dòng nào → nhập tay.
//    • Thầu phụ phải khớp danh mục 'subcontractor'; cần Công trình + Ngày; CT đã
//      quyết toán bị chặn (tầng data assertProjectUsable).
//
//  EXPORT: openSubcontractModal(record?, onSaved?) + addSubcontractItem /
//  removeSubcontractItem / recalcSubcontractTotal (thao tác trên modal đang mở).
// ============================================================================

import { toast, setLoading } from '../../utils/ui.js';
import { formatMoney, parseMoney } from '../../utils/fmt.js';
import { loadCategories, listNames, findByKey } from '../../utils/cat.js';
import { attachAutocomplete } from '../../utils/autocomplete.js';
import { loadProjects, getProjectOptions, COMPANY } from '../projects/projects.data.js';
import { saveSubcontract, updateSubcontract } from './doanhthu.data.js';

// num(x) — Ép về số an toàn (giữ thập phân), chuỗi rỗng/sai → 0.
const num = (x) => Number(x) || 0;

// ----------------------------------------------------------------------------
//  TRẠNG THÁI MODULE — chỉ sống trong lần mở modal hiện tại.
//   _host : phần tử overlay đang mở (null = không có modal).
//   _items: mô hình bảng khối lượng — mảng { name, unit, quantity, unitPrice }.
//   _cats : document danh mục (cho autocomplete thầu phụ + validate khớp).
//   _detach: hàm gỡ autocomplete ô đối tác.
// ----------------------------------------------------------------------------
let _host = null;
let _items = [];
let _cats = null;
let _detach = null;

// escapeHtml(s) — Chống vỡ thuộc tính value="" khi đổ chuỗi người dùng vào ô.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// todayStr() — Ngày hôm nay dạng YYYY-MM-DD cho ô Ngày mặc định.
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// blankItem() — 1 dòng khối lượng trống.
function blankItem() {
  return { name: '', unit: '', quantity: '', unitPrice: '' };
}

// lineTotal(it) — Thành tiền 1 dòng = SL × đơn giá.
const lineTotal = (it) => num(it.quantity) * parseMoney(it.unitPrice);

// itemsTotal() — Tổng chi tiết = Σ thành tiền các dòng CÓ TÊN.
const itemsTotal = () => _items.reduce((s, it) => (it.name.trim() ? s + lineTotal(it) : s), 0);

// hasNamedItems() — Có ít nhất 1 dòng chi tiết (có tên)? → quyết định khóa ô tổng.
const hasNamedItems = () => _items.some((it) => it.name.trim());

// Lấy nhanh phần tử trong modal.
const itemsBody  = () => _host.querySelector('[data-items]');
const valueInput = () => _host.querySelector('[data-i="value"]');

// projectOpts(includeId) — CT cho dropdown: ẩn CÔNG TY + CT đã quyết toán; giữ
// includeId để sửa bản ghi của CT đã quyết toán không mất lựa chọn.
function projectOpts(includeId) {
  return getProjectOptions({ excludeLocked: true, includeId })
    .filter((o) => o.id !== COMPANY.id);
}

// ----------------------------------------------------------------------------
//  openSubcontractModal(record, onSaved) — Mở modal Thêm (record=null) hoặc Sửa.
//    record: bản ghi HĐ thầu phụ có id = SỬA; { projectId } (không id) = đặt sẵn CT
//            khi thêm từ màn đã lọc theo công trình; null = thêm trống.
//    onSaved: gọi lại sau khi lưu thành công (vẽ lại danh sách + KPI).
// ----------------------------------------------------------------------------
export async function openSubcontractModal(record = null, onSaved = () => {}) {
  setLoading(true, 'Đang tải…');
  try {
    [_cats] = await Promise.all([loadCategories(), loadProjects()]);
  } finally {
    setLoading(false);
  }

  const r = record || {};
  const isEdit = !!r.id;
  _items = Array.isArray(r.items) && r.items.length
    ? r.items.map((it) => ({
        name: it.name || '', unit: it.unit || '',
        quantity: it.quantity ?? '', unitPrice: it.unitPrice ? formatMoney(it.unitPrice) : '',
      }))
    : [blankItem()];

  const opts = projectOpts(r.projectId);
  const nen = document.createElement('div');
  nen.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex align-items-start justify-content-center p-3 overflow-auto';
  nen.style.cssText = 'background:rgba(0,0,0,.5);z-index:1100;';
  nen.innerHTML = `
    <div class="card shadow my-3" style="max-width:640px;width:100%;">
      <div class="card-body">
        <h2 class="h6 mb-3">🧰 ${isEdit ? 'Sửa' : 'Khai báo'} Hợp đồng thầu phụ</h2>
        <div class="row g-2 mb-2">
          <div class="col-12 col-sm-7">
            <label class="form-label small mb-1 fw-semibold">Công trình <span class="text-danger">*</span></label>
            <select class="form-select form-select-sm" data-i="projectId">
              <option value="">— Chọn công trình —</option>
              ${opts.map((o) =>
                `<option value="${o.id}"${r.projectId === o.id ? ' selected' : ''}>${escapeHtml(o.name)}</option>`).join('')}
            </select>
          </div>
          <div class="col-12 col-sm-5">
            <label class="form-label small mb-1 fw-semibold">Ngày HĐ <span class="text-danger">*</span></label>
            <input type="date" class="form-control form-control-sm" data-i="date" value="${r.date || todayStr()}">
          </div>
        </div>
        <div class="mb-2">
          <label class="form-label small mb-1 fw-semibold">Thầu phụ <span class="text-danger">*</span></label>
          <input class="form-control form-control-sm" data-i="partner" autocomplete="off"
                 placeholder="Khớp danh mục Thầu phụ…" value="${escapeHtml(r.partner || '')}">
        </div>
        <label class="form-label small mb-1 fw-semibold">Bảng khối lượng (tùy chọn)</label>
        <div class="table-responsive border rounded mb-2">
          <table class="table table-sm table-bordered align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th style="width:38px" class="text-center">#</th>
                <th style="min-width:150px">Hạng mục</th>
                <th style="width:80px">ĐVT</th>
                <th style="width:80px" class="text-end">SL</th>
                <th style="width:120px" class="text-end">Đơn giá</th>
                <th style="width:130px" class="text-end">Thành tiền</th>
                <th style="width:36px"></th>
              </tr>
            </thead>
            <tbody data-items></tbody>
            <tfoot>
              <tr class="table-light">
                <td colspan="5" class="text-end fw-semibold">Tổng chi tiết</td>
                <td class="text-end fw-bold" data-detail-total>0</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" class="btn btn-sm btn-outline-primary mb-2" data-add-item>+ Thêm dòng</button>
        <div class="row g-2 mb-2 align-items-end">
          <div class="col-12 col-sm-6">
            <label class="form-label small mb-1">Giá trị HĐ thầu phụ <span class="text-danger">*</span></label>
            <input class="form-control form-control-sm text-end" data-i="value" inputmode="decimal"
                   value="${r.value ? formatMoney(r.value) : ''}">
            <div class="form-text" data-value-hint></div>
          </div>
          <div class="col-12 col-sm-6">
            <label class="form-label small mb-1">Ghi chú</label>
            <input class="form-control form-control-sm" data-i="note" value="${escapeHtml(r.note || '')}">
          </div>
        </div>
        <div class="d-flex justify-content-end gap-2 mt-2">
          <button class="btn btn-sm btn-secondary" data-x>Hủy</button>
          <button class="btn btn-sm btn-primary" data-save>${isEdit ? 'Cập nhật' : 'Lưu hợp đồng'}</button>
        </div>
      </div>
    </div>`;

  _host = nen;
  const close = () => {
    if (_detach) { _detach(); _detach = null; }
    nen.remove();
    _host = null; _items = []; _cats = null;
  };
  nen.querySelector('[data-x]').onclick = close;
  nen.onclick = (e) => { if (e.target === nen) close(); };

  // Autocomplete ô Thầu phụ (gợi ý + sẽ validate khớp danh mục khi lưu).
  const partnerInp = nen.querySelector('[data-i="partner"]');
  _detach = attachAutocomplete(partnerInp, () => listNames(_cats, 'subcontractor'), {
    onSelect: () => partnerInp.classList.remove('is-invalid'),
  });
  partnerInp.addEventListener('input', () => partnerInp.classList.remove('is-invalid'));

  // Nút "+ Thêm dòng".
  nen.querySelector('[data-add-item]').onclick = () => addSubcontractItem();

  // Ủy quyền sự kiện trên thân bảng (chạy cho cả dòng thêm sau).
  const tb = itemsBody();
  tb.addEventListener('input', onItemInput);
  tb.addEventListener('focusout', onItemBlur);
  tb.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) removeSubcontractItem(+del.dataset.del);
  });

  // Gõ tay ô Giá trị (chỉ khi không bị khóa) → định dạng chấm khi rời ô.
  valueInput().addEventListener('focusout', () => {
    if (valueInput().readOnly) return;
    const v = valueInput().value.trim();
    valueInput().value = v === '' ? '' : formatMoney(parseMoney(v));
  });

  nen.querySelector('[data-save]').onclick = () => handleSave(record, onSaved, close);

  document.body.appendChild(nen);
  rebuildItems();
  nen.querySelector('[data-i="projectId"]').focus();
}

// onItemInput(e) — Đồng bộ model khi gõ 1 ô khối lượng + cập nhật tổng/khóa.
function onItemInput(e) {
  const el = e.target.closest('[data-f]');
  if (!el) return;
  const r = +el.dataset.r;
  if (!_items[r]) return;
  _items[r][el.dataset.f] = el.value;
  recalcSubcontractTotal();
}

// onItemBlur(e) — Rời ô Đơn giá → định dạng chấm hàng nghìn.
function onItemBlur(e) {
  const el = e.target.closest('[data-f="unitPrice"]');
  if (!el) return;
  const r = +el.dataset.r;
  el.value = el.value.trim() === '' ? '' : formatMoney(parseMoney(el.value));
  if (_items[r]) _items[r].unitPrice = el.value;
}

// ----------------------------------------------------------------------------
//  rebuildItems() — Vẽ lại toàn bộ thân bảng theo `_items` rồi cập nhật tổng.
// ----------------------------------------------------------------------------
function rebuildItems() {
  if (!_host) return;
  itemsBody().innerHTML = _items.map((it, r) => `
    <tr>
      <td class="text-center text-muted small">${r + 1}</td>
      <td><input class="form-control form-control-sm border-0" data-f="name" data-r="${r}"
                 value="${escapeHtml(it.name)}"></td>
      <td><input class="form-control form-control-sm border-0" data-f="unit" data-r="${r}"
                 value="${escapeHtml(it.unit)}"></td>
      <td><input class="form-control form-control-sm border-0 text-end" data-f="quantity" data-r="${r}"
                 inputmode="decimal" value="${escapeHtml(it.quantity)}"></td>
      <td><input class="form-control form-control-sm border-0 text-end" data-f="unitPrice" data-r="${r}"
                 inputmode="decimal" value="${escapeHtml(it.unitPrice)}"></td>
      <td class="text-end" data-line="${r}">${formatMoney(lineTotal(it))}</td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-link text-danger p-0" data-del="${r}" title="Xóa dòng">✕</button>
      </td>
    </tr>`).join('');
  recalcSubcontractTotal();
}

// ----------------------------------------------------------------------------
//  recalcSubcontractTotal() — Cập nhật Thành tiền từng dòng + Tổng chi tiết, và
//  ĐỐI SOÁT: có dòng có tên → khóa ô Giá trị = tổng chi tiết; không → mở nhập tay.
// ----------------------------------------------------------------------------
export function recalcSubcontractTotal() {
  if (!_host) return;
  _items.forEach((it, r) => {
    const cell = itemsBody().querySelector(`[data-line="${r}"]`);
    if (cell) cell.textContent = formatMoney(lineTotal(it));
  });

  const total = itemsTotal();
  const totalEl = _host.querySelector('[data-detail-total]');
  if (totalEl) totalEl.textContent = formatMoney(total);

  const vEl = valueInput();
  const hint = _host.querySelector('[data-value-hint]');
  if (hasNamedItems()) {
    vEl.value = formatMoney(total);
    vEl.readOnly = true;
    vEl.classList.add('bg-body-secondary');
    if (hint) hint.textContent = '🔒 Khóa theo tổng chi tiết.';
  } else {
    vEl.readOnly = false;
    vEl.classList.remove('bg-body-secondary');
    if (hint) hint.textContent = 'Nhập tay khi không có bảng khối lượng.';
  }
}

// addSubcontractItem() — Thêm 1 dòng khối lượng trống vào cuối bảng.
export function addSubcontractItem() {
  if (!_host) return;
  _items.push(blankItem());
  rebuildItems();
}

// removeSubcontractItem(idx) — Xóa 1 dòng (giữ tối thiểu 1 dòng trống).
export function removeSubcontractItem(idx) {
  if (!_host) return;
  _items.splice(idx, 1);
  if (!_items.length) _items.push(blankItem());
  rebuildItems();
}

// ----------------------------------------------------------------------------
//  handleSave(record, onSaved, close) — Validate UI (khớp danh mục thầu phụ) → lưu.
// ----------------------------------------------------------------------------
async function handleSave(record, onSaved, close) {
  const val = (k) => _host.querySelector(`[data-i="${k}"]`).value.trim();
  const projectId = val('projectId');
  const date = val('date');
  const partnerInp = _host.querySelector('[data-i="partner"]');

  if (!projectId) { toast('Vui lòng chọn Công trình.', 'warning'); return; }
  if (!date) { toast('Vui lòng chọn Ngày hợp đồng.', 'warning'); return; }

  // Thầu phụ phải khớp danh mục — chuẩn hóa về đúng tên trong danh mục.
  const matched = findByKey(_cats, 'subcontractor', partnerInp.value.trim());
  if (!partnerInp.value.trim() || !matched) {
    partnerInp.classList.add('is-invalid');
    toast('Thầu phụ phải khớp danh mục (Tab Danh mục).', 'warning');
    return;
  }
  partnerInp.value = matched.name;

  const items = _items.filter((it) => it.name.trim());
  // Không có bảng khối lượng → Giá trị nhập tay phải > 0.
  if (!items.length && parseMoney(val('value')) <= 0) {
    toast('Nhập Giá trị HĐ thầu phụ hoặc thêm bảng khối lượng.', 'warning');
    return;
  }

  const data = {
    projectId, date, partner: matched.name,
    value: parseMoney(val('value')),   // tầng data tự ghi đè = Σ items khi có items
    items,
    note: val('note'),
  };

  setLoading(true, 'Đang lưu…');
  try {
    if (record && record.id) await updateSubcontract(record.id, data);
    else await saveSubcontract(data);
    toast(record && record.id ? 'Đã cập nhật hợp đồng thầu phụ.' : 'Đã lưu hợp đồng thầu phụ.', 'success');
    close();
    await onSaved();
  } catch (err) {
    toast(err.message || 'Lưu thất bại.', 'error');
  } finally {
    setLoading(false);
  }
}
