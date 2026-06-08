// ============================================================================
//  modules/doanhthu/doanhthu.receipt.js  —  TẦNG GIAO DIỆN (Layer 6)
// ----------------------------------------------------------------------------
//  @module doanhthu.receipt
//
//  Modal GHI NHẬN THU TIỀN của tab Doanh Thu (doc 08 §2.B) — modal DÙNG NHIỀU NHẤT
//  vì mỗi công trình thu nhiều đợt. Đặc điểm:
//    • Chọn Công Trình → THANH TIẾN ĐỘ realtime: Tổng HĐ · Đã thu · Còn lại
//      (Tổng HĐ = contractTotal HĐ chính của CT; Đã thu = Σ receipts CT; Còn = hiệu).
//    • Loại khoản thu dropdown 3 mã PAYMENT_TYPES (Tạm ứng/Giai đoạn/Quyết toán) để
//      sau vẽ biểu đồ tỷ trọng.
//    • Người TH (autocomplete danh mục 'performer') — truy vết ai nhận khoản tiền.
//    • Lưu → đóng modal, gọi onSaved để KPI + bảng lịch sử nhảy số ngay (không F5).
//
//  N đợt thu / CT nên đây là modal Thêm/Sửa 1 bản ghi danh sách (khác HĐ chính).
//  Lịch sử thu (bảng + lọc + xóa) tách sang `doanhthu.receiptlist.js` (≤1 việc).
//
//  EXPORT: openReceiptModal(record?, onSaved?).
// ============================================================================

import { toast, setLoading } from '../../utils/ui.js';
import { formatMoney, parseMoney } from '../../utils/fmt.js';
import { loadCategories, listNames } from '../../utils/cat.js';
import { attachAutocomplete } from '../../utils/autocomplete.js';
import { loadProjects, getProjectById, getProjectOptions, COMPANY } from '../projects/projects.data.js';
import {
  PAYMENT_TYPES, PAYMENT_TYPE_KEYS,
  saveReceipt, updateReceipt, getContract, contractTotal, sumReceiptsByProject,
} from './doanhthu.data.js';

// escapeHtml(s) — Chống vỡ thuộc tính value="" khi đổ chuỗi người dùng vào ô.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// todayStr() — Ngày hôm nay dạng YYYY-MM-DD cho ô Ngày thu mặc định.
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// projectOpts(includeId) — CT cho dropdown: ẩn CÔNG TY + CT đã quyết toán; giữ
// includeId để sửa đợt thu của CT đã quyết toán không mất lựa chọn.
function projectOpts(includeId) {
  return getProjectOptions({ excludeLocked: true, includeId })
    .filter((o) => o.id !== COMPANY.id);
}

// ----------------------------------------------------------------------------
//  openReceiptModal(record, onSaved) — Mở modal Thêm (record=null) hoặc Sửa.
//    record: bản ghi đợt thu có id = SỬA; { projectId } (không id) = đặt sẵn CT khi
//            Thêm từ màn đã lọc theo công trình; null = thêm trống.
//    onSaved: gọi lại sau khi lưu thành công (vẽ lại KPI + lịch sử thu).
// ----------------------------------------------------------------------------
export async function openReceiptModal(record = null, onSaved = () => {}) {
  setLoading(true, 'Đang tải…');
  let cats;
  try {
    [cats] = await Promise.all([loadCategories(), loadProjects()]);
  } finally {
    setLoading(false);
  }

  const r = record || {};
  const isEdit = !!r.id;
  const opts = projectOpts(r.projectId);

  const nen = document.createElement('div');
  nen.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex align-items-start justify-content-center p-3 overflow-auto';
  nen.style.cssText = 'background:rgba(0,0,0,.5);z-index:1100;';
  nen.innerHTML = `
    <div class="card shadow my-3" style="max-width:520px;width:100%;">
      <div class="card-body">
        <h2 class="h6 mb-3">💵 ${isEdit ? 'Sửa đợt thu tiền' : 'Ghi nhận thu tiền'}</h2>
        <div class="mb-2">
          <label class="form-label small mb-1 fw-semibold">Công trình <span class="text-danger">*</span></label>
          <select class="form-select form-select-sm" data-i="projectId">
            <option value="">— Chọn công trình —</option>
            ${opts.map((o) =>
              `<option value="${o.id}"${r.projectId === o.id ? ' selected' : ''}>${escapeHtml(o.name)}</option>`).join('')}
          </select>
        </div>
        <div class="d-flex flex-wrap gap-2 mb-2" data-progress>
          <div class="text-muted small">Chọn công trình để xem tiến độ thu.</div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-12 col-sm-6">
            <label class="form-label small mb-1 fw-semibold">Số tiền thu <span class="text-danger">*</span></label>
            <input class="form-control form-control-sm text-end" data-i="amount" inputmode="decimal"
                   value="${r.amount ? formatMoney(r.amount) : ''}">
          </div>
          <div class="col-12 col-sm-6">
            <label class="form-label small mb-1">Loại khoản thu</label>
            <select class="form-select form-select-sm" data-i="paymentType">
              ${PAYMENT_TYPE_KEYS.map((k) =>
                `<option value="${k}"${(r.paymentType || 'phase') === k ? ' selected' : ''}>${PAYMENT_TYPES[k].label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-12 col-sm-7">
            <label class="form-label small mb-1">Người thực hiện</label>
            <input class="form-control form-control-sm" data-i="performer" autocomplete="off"
                   value="${escapeHtml(r.performer || '')}">
          </div>
          <div class="col-12 col-sm-5">
            <label class="form-label small mb-1">Ngày thu <span class="text-danger">*</span></label>
            <input type="date" class="form-control form-control-sm" data-i="date" value="${r.date || todayStr()}">
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label small mb-1">Nội dung / ghi chú</label>
          <input class="form-control form-control-sm" data-i="note" value="${escapeHtml(r.note || '')}">
        </div>
        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-sm btn-secondary" data-x>Hủy</button>
          <button class="btn btn-sm btn-primary" data-save>${isEdit ? 'Cập nhật' : 'Lưu khoản thu'}</button>
        </div>
      </div>
    </div>`;

  const detach = attachAutocomplete(nen.querySelector('[data-i="performer"]'), () => listNames(cats, 'performer'));
  const close = () => { detach(); nen.remove(); };
  nen.querySelector('[data-x]').onclick = close;
  nen.onclick = (e) => { if (e.target === nen) close(); };

  const el = (k) => nen.querySelector(`[data-i="${k}"]`);
  const progressEl = nen.querySelector('[data-progress]');

  // updateProgress(pid) — Vẽ 3 thẻ tiến độ thu của CT đang chọn (realtime đọc DB).
  const updateProgress = async (pid) => {
    if (!pid) {
      progressEl.innerHTML = '<div class="text-muted small">Chọn công trình để xem tiến độ thu.</div>';
      return;
    }
    const tong = contractTotal(await getContract(pid));
    const daThu = await sumReceiptsByProject(pid);
    const conLai = tong - daThu;
    const cdt = getProjectById(pid)?.investor || '—';
    const card = (label, value, cls) =>
      `<div class="flex-fill border rounded px-2 py-1 ${cls}">
         <div class="small text-muted">${label}</div>
         <div class="fw-semibold">${formatMoney(value)}</div>
       </div>`;
    progressEl.innerHTML = `
      <div class="w-100 small text-muted mb-1">Chủ đầu tư: <span class="fw-semibold">${escapeHtml(cdt)}</span></div>
      ${card('Tổng HĐ', tong, 'bg-primary-subtle')}
      ${card('Đã thu', daThu, 'bg-success-subtle')}
      ${card('Còn lại', conLai, conLai > 0 ? 'bg-warning-subtle' : 'bg-body-secondary')}`;
  };

  el('projectId').addEventListener('change', (e) => updateProgress(e.target.value));

  el('amount').addEventListener('focusout', () => {
    const v = el('amount').value.trim();
    el('amount').value = v === '' ? '' : formatMoney(parseMoney(v));
  });

  nen.querySelector('[data-save]').onclick = async () => {
    const projectId = el('projectId').value;
    if (!projectId) { toast('Vui lòng chọn Công trình.', 'warning'); return; }
    const data = {
      projectId,
      amount:      parseMoney(el('amount').value),
      paymentType: el('paymentType').value,
      performer:   el('performer').value.trim(),
      note:        el('note').value.trim(),
      date:        el('date').value,
    };
    if (!data.date) { toast('Vui lòng chọn Ngày thu.', 'warning'); return; }
    if (data.amount <= 0) { toast('Số tiền thu phải lớn hơn 0.', 'warning'); return; }

    setLoading(true, 'Đang lưu…');
    try {
      if (isEdit) await updateReceipt(record.id, data);
      else await saveReceipt(data);
      toast(isEdit ? 'Đã cập nhật đợt thu.' : 'Đã ghi nhận khoản thu.', 'success');
      close();
      await onSaved();
    } catch (err) {
      toast(err.message || 'Lưu thất bại.', 'error');
    } finally {
      setLoading(false);
    }
  };

  document.body.appendChild(nen);
  if (r.projectId) updateProgress(r.projectId);
  el('projectId').focus();
}
