// ============================================================================
//  modules/doanhthu/doanhthu.contract.js  —  TẦNG GIAO DIỆN (Layer 6)
// ----------------------------------------------------------------------------
//  @module doanhthu.contract
//
//  Modal KHAI BÁO HỢP ĐỒNG CHÍNH của tab Doanh Thu (doc 08 §2.A). 1 CÔNG TRÌNH =
//  1 HỢP ĐỒNG nên modal vừa là "Thêm" vừa là "Sửa": lưu = ghi đè theo `projectId`
//  (Create↔Edit chung khóa). Đặc điểm:
//    • Chọn Công Trình (dropdown projectId, ẩn CÔNG TY + CT đã quyết toán) → ô
//      Chủ Đầu Tư TỰ ĐIỀN realtime từ project.investor, READ-ONLY (1 nguồn sự thật).
//    • Tách 3 ô tiền: Giá trị HĐ chính · HĐ phụ/bổ sung · Phát sinh → để báo cáo
//      bóc tách doanh thu. Ô "Tổng giá trị HĐ" = Σ 3 ô, cập nhật realtime, khóa.
//    • Đổi CT → nạp lại HĐ sẵn có của CT đó (nếu đã khai báo) để sửa, không tạo trùng.
//
//  Modal HĐ thầu phụ (phức tạp hơn, có bảng khối lượng) tách riêng → P25
//  (`doanhthu.subcontract.js`). File này CHỈ lo HĐ chính (≤1 trách nhiệm).
//
//  EXPORT: openContractModal(projectId?, onSaved?) — danh sách/KPI gọi để mở.
// ============================================================================

import { toast, setLoading } from '../../utils/ui.js';
import { formatMoney, parseMoney } from '../../utils/fmt.js';
import { loadCategories, listNames } from '../../utils/cat.js';
import { attachAutocomplete } from '../../utils/autocomplete.js';
import { loadProjects, getProjectById, getProjectOptions, COMPANY } from '../projects/projects.data.js';
import { getContract, saveContract, contractTotal } from './doanhthu.data.js';

// escapeHtml(s) — Chống vỡ thuộc tính value="" khi đổ chuỗi người dùng nhập vào ô.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// todayStr() — Ngày hôm nay dạng YYYY-MM-DD cho ô Ngày ký mặc định.
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// investorOf(projectId) — Chủ Đầu Tư realtime của 1 CT (chưa chọn/không có → '').
function investorOf(projectId) {
  const p = projectId ? getProjectById(projectId) : null;
  return p ? (p.investor || '') : '';
}

// projectOpts(includeId) — CT cho dropdown: ẩn CÔNG TY (không có CĐT) + CT đã đóng,
// nhưng giữ lại includeId để mở sửa HĐ của CT đã quyết toán không bị mất lựa chọn.
function projectOpts(includeId) {
  return getProjectOptions({ excludeLocked: true, includeId })
    .filter((o) => o.id !== COMPANY.id);
}

// ----------------------------------------------------------------------------
//  openContractModal(projectId, onSaved) — Mở modal khai báo/sửa HĐ chính.
//    projectId: null = Thêm (tự chọn CT) · có giá trị = mở thẳng HĐ của CT đó.
//    onSaved:   gọi lại sau khi lưu thành công (vẽ lại danh sách + KPI).
// ----------------------------------------------------------------------------
export async function openContractModal(projectId = null, onSaved = () => {}) {
  setLoading(true, 'Đang tải…');
  let cats;
  let existing;
  try {
    [cats] = await Promise.all([loadCategories(), loadProjects()]);
    existing = projectId ? await getContract(projectId) : null;
  } finally {
    setLoading(false);
  }

  const c = existing || {};
  const opts = projectOpts(projectId);

  const nen = document.createElement('div');
  nen.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex align-items-start justify-content-center p-3 overflow-auto';
  nen.style.cssText = 'background:rgba(0,0,0,.5);z-index:1100;';
  nen.innerHTML = `
    <div class="card shadow my-3" style="max-width:520px;width:100%;">
      <div class="card-body">
        <h2 class="h6 mb-3">📄 Khai báo Hợp đồng chính</h2>
        <div class="mb-2">
          <label class="form-label small mb-1 fw-semibold">Công trình <span class="text-danger">*</span></label>
          <select class="form-select form-select-sm" data-i="projectId">
            <option value="">— Chọn công trình —</option>
            ${opts.map((o) =>
              `<option value="${o.id}"${projectId === o.id ? ' selected' : ''}>${escapeHtml(o.name)}</option>`).join('')}
          </select>
        </div>
        <div class="mb-2">
          <label class="form-label small mb-1">Chủ đầu tư</label>
          <input class="form-control form-control-sm bg-body-secondary" data-i="investor" readonly
                 placeholder="(tự điền theo công trình)" value="${escapeHtml(investorOf(projectId))}">
        </div>
        <div class="row g-2 mb-2">
          <div class="col-12 col-sm-4">
            <label class="form-label small mb-1">Giá trị HĐ chính</label>
            <input class="form-control form-control-sm text-end" data-i="value" inputmode="decimal"
                   value="${c.value ? formatMoney(c.value) : ''}">
          </div>
          <div class="col-6 col-sm-4">
            <label class="form-label small mb-1">HĐ phụ / bổ sung</label>
            <input class="form-control form-control-sm text-end" data-i="addonValue" inputmode="decimal"
                   value="${c.addonValue ? formatMoney(c.addonValue) : ''}">
          </div>
          <div class="col-6 col-sm-4">
            <label class="form-label small mb-1">Phát sinh</label>
            <input class="form-control form-control-sm text-end" data-i="extraValue" inputmode="decimal"
                   value="${c.extraValue ? formatMoney(c.extraValue) : ''}">
          </div>
        </div>
        <div class="d-flex align-items-center justify-content-between bg-primary-subtle text-primary-emphasis rounded px-2 py-1 mb-2">
          <span class="small fw-semibold">Tổng giá trị HĐ</span>
          <span class="fw-bold" data-total>0</span>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-12 col-sm-7">
            <label class="form-label small mb-1">Người phụ trách</label>
            <input class="form-control form-control-sm" data-i="performer" autocomplete="off"
                   value="${escapeHtml(c.performer || '')}">
          </div>
          <div class="col-12 col-sm-5">
            <label class="form-label small mb-1">Ngày ký <span class="text-danger">*</span></label>
            <input type="date" class="form-control form-control-sm" data-i="date" value="${c.date || todayStr()}">
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label small mb-1">Nội dung / ghi chú</label>
          <textarea class="form-control form-control-sm" rows="2" data-i="note">${escapeHtml(c.note || '')}</textarea>
        </div>
        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-sm btn-secondary" data-x>Hủy</button>
          <button class="btn btn-sm btn-primary" data-save>Lưu hợp đồng</button>
        </div>
      </div>
    </div>`;

  const close = () => { detachAc(); nen.remove(); };
  nen.querySelector('[data-x]').onclick = close;
  nen.onclick = (e) => { if (e.target === nen) close(); };

  const el = (k) => nen.querySelector(`[data-i="${k}"]`);
  const totalEl = nen.querySelector('[data-total]');

  // recalcTotal() — Cập nhật ô "Tổng giá trị HĐ" = Σ 3 ô tiền (realtime khi gõ).
  const recalcTotal = () => {
    totalEl.textContent = formatMoney(
      parseMoney(el('value').value) + parseMoney(el('addonValue').value) + parseMoney(el('extraValue').value));
  };

  // Autocomplete cho ô Người phụ trách (gợi ý từ danh mục 'performer', không bắt buộc khớp).
  const detachAc = attachAutocomplete(el('performer'), () => listNames(cats, 'performer'));

  // Đổi CT → đổ Chủ Đầu Tư realtime + nạp HĐ sẵn có của CT đó (nếu có) để sửa.
  el('projectId').addEventListener('change', async (e) => {
    const pid = e.target.value;
    el('investor').value = investorOf(pid);
    if (!pid) return;
    const rec = await getContract(pid);
    el('value').value      = rec && rec.value ? formatMoney(rec.value) : '';
    el('addonValue').value = rec && rec.addonValue ? formatMoney(rec.addonValue) : '';
    el('extraValue').value = rec && rec.extraValue ? formatMoney(rec.extraValue) : '';
    el('performer').value  = rec ? (rec.performer || '') : '';
    el('note').value       = rec ? (rec.note || '') : '';
    el('date').value       = rec && rec.date ? rec.date : todayStr();
    recalcTotal();
  });

  // Gõ ô tiền → tính lại tổng; rời ô → định dạng chấm hàng nghìn.
  ['value', 'addonValue', 'extraValue'].forEach((k) => {
    el(k).addEventListener('input', recalcTotal);
    el(k).addEventListener('focusout', () => {
      const v = el(k).value.trim();
      el(k).value = v === '' ? '' : formatMoney(parseMoney(v));
      recalcTotal();
    });
  });

  nen.querySelector('[data-save]').onclick = async () => {
    const pid = el('projectId').value;
    if (!pid) { toast('Vui lòng chọn Công trình.', 'warning'); return; }
    const data = {
      value:      parseMoney(el('value').value),
      addonValue: parseMoney(el('addonValue').value),
      extraValue: parseMoney(el('extraValue').value),
      performer:  el('performer').value.trim(),
      note:       el('note').value.trim(),
      date:       el('date').value,
    };
    if (!data.date) { toast('Vui lòng chọn Ngày ký hợp đồng.', 'warning'); return; }
    if (contractTotal(data) <= 0) { toast('Tổng giá trị hợp đồng phải lớn hơn 0.', 'warning'); return; }

    setLoading(true, 'Đang lưu…');
    try {
      await saveContract(pid, data);           // tầng data tự ghi đè/khôi phục theo projectId
      toast('Đã lưu hợp đồng chính.', 'success');
      close();
      await onSaved();
    } catch (err) {
      toast(err.message || 'Lưu thất bại.', 'error');
    } finally {
      setLoading(false);
    }
  };

  document.body.appendChild(nen);
  recalcTotal();
  el('projectId').focus();
}
