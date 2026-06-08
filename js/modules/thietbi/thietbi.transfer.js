// ============================================================================
//  modules/thietbi/thietbi.transfer.js  —  TẦNG GIAO DIỆN (Layer 6): Luân chuyển
// ----------------------------------------------------------------------------
//  @module thietbi.transfer
//
//  Popup LUÂN CHUYỂN thiết bị (doc 06 §4) — phần cốt lõi của tab. Chuyển X cái từ
//  1 dòng tồn kho NGUỒN sang vị trí ĐÍCH:
//    SL nguồn mới = SL nguồn cũ − X   (phần còn lại giữ tại nguồn, tình trạng gốc)
//    SL đích mới  = SL đích cũ + X    (cộng dồn nếu đích đã có cùng tên+tình trạng)
//
//  Ràng buộc client-side: 1 ≤ X ≤ SL hiện tại (ô max); dropdown đích TỰ LOẠI vị trí
//  nguồn (tránh "A chuyển cho A"). Cho đổi tình trạng + ghi chú cho lô chuyển đi.
//
//  EXPORT openTransferModal(rec, onDone) — rec là dòng tồn kho nguồn (có id,
//  projectId, name, quantity, condition). onDone() chạy sau khi chuyển xong.
// ============================================================================

import { toast, setLoading } from '../../utils/ui.js';
import { loadProjects, getProjectOptions, getProjectName, COMPANY } from '../projects/projects.data.js';
import { CONDITIONS, CONDITION_KEYS, WAREHOUSE_ID, transferEquipment } from './thietbi.data.js';

let _host = null;            // overlay đang mở (null = không có modal)

// escapeHtml(s) — chống vỡ HTML khi đổ chuỗi người dùng vào modal.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// locName(projectId) — Tên hiển thị vị trí (Kho Tổng cho COMPANY, còn lại tên CT).
const locName = (projectId) =>
  (projectId === WAREHOUSE_ID ? 'Kho Tổng' : getProjectName(projectId));

// destOptions(srcProjectId) — Vị trí đích: Kho Tổng + CT chưa quyết toán, LOẠI bỏ
// chính vị trí nguồn. COMPANY relabel thành "Kho Tổng".
function destOptions(srcProjectId) {
  return getProjectOptions({ excludeLocked: true })
    .map((o) => (o.id === COMPANY.id ? { id: WAREHOUSE_ID, name: '🏭 Kho Tổng' } : o))
    .filter((o) => o.id !== srcProjectId);
}

// ----------------------------------------------------------------------------
//  openTransferModal(rec, onDone) — Mở popup luân chuyển cho dòng tồn kho `rec`.
// ----------------------------------------------------------------------------
export async function openTransferModal(rec, onDone = () => {}) {
  if (!rec || !rec.id) { toast('Không tìm thấy dòng thiết bị.', 'warning'); return; }

  setLoading(true, 'Đang tải…');
  try {
    await loadProjects();
  } finally {
    setLoading(false);
  }

  const have = Math.max(0, Math.floor(Number(rec.quantity) || 0));
  const opts = destOptions(rec.projectId);

  const nen = document.createElement('div');
  nen.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex align-items-start justify-content-center p-3 overflow-auto';
  nen.style.cssText = 'background:rgba(0,0,0,.5);z-index:1100;';
  nen.innerHTML = `
    <div class="card shadow my-3" style="max-width:460px;width:100%;">
      <div class="card-body">
        <h2 class="h6 mb-3">↔ Luân chuyển thiết bị</h2>
        <dl class="row small mb-3">
          <dt class="col-4 text-muted">Thiết bị</dt><dd class="col-8 fw-semibold">${escapeHtml(rec.name)}</dd>
          <dt class="col-4 text-muted">Từ vị trí</dt><dd class="col-8">${escapeHtml(locName(rec.projectId))}</dd>
          <dt class="col-4 text-muted">Hiện có</dt><dd class="col-8">${have} cái (${CONDITIONS[rec.condition]?.label || rec.condition})</dd>
        </dl>
        <div class="row g-2 mb-2">
          <div class="col-12">
            <label class="form-label small mb-1 fw-semibold">Chuyển đến <span class="text-danger">*</span></label>
            <select class="form-select form-select-sm" data-i="to">
              <option value="">— Chọn vị trí đích —</option>
              ${opts.map((o) => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
            </select>
          </div>
          <div class="col-6">
            <label class="form-label small mb-1 fw-semibold">Số lượng <span class="text-danger">*</span></label>
            <input type="number" class="form-control form-control-sm text-end" data-i="qty"
                   min="1" max="${have}" step="1" value="${have}">
          </div>
          <div class="col-6">
            <label class="form-label small mb-1">Tình trạng khi đến</label>
            <select class="form-select form-select-sm" data-i="condition">
              ${CONDITION_KEYS.map((k) =>
                `<option value="${k}"${rec.condition === k ? ' selected' : ''}>${CONDITIONS[k].label}</option>`).join('')}
            </select>
          </div>
          <div class="col-12">
            <label class="form-label small mb-1">Ghi chú</label>
            <input class="form-control form-control-sm" data-i="note" value="">
          </div>
        </div>
        <div class="d-flex justify-content-end gap-2 mt-2">
          <button class="btn btn-sm btn-secondary" data-x>Hủy</button>
          <button class="btn btn-sm btn-primary" data-save>↔ Chuyển</button>
        </div>
      </div>
    </div>`;

  _host = nen;
  const close = () => { nen.remove(); _host = null; };
  nen.querySelector('[data-x]').onclick = close;
  nen.onclick = (e) => { if (e.target === nen) close(); };
  nen.querySelector('[data-save]').onclick = () => handleSave(rec, have, onDone, close);

  document.body.appendChild(nen);
  nen.querySelector('[data-i="to"]').focus();
}

// ----------------------------------------------------------------------------
//  handleSave(rec, have, onDone, close) — Validate ràng buộc → transferEquipment.
// ----------------------------------------------------------------------------
async function handleSave(rec, have, onDone, close) {
  const val = (k) => _host.querySelector(`[data-i="${k}"]`).value;
  const toProjectId = val('to');
  const qty = Math.floor(Number(val('qty')) || 0);

  if (!toProjectId) { toast('Vui lòng chọn vị trí đích.', 'warning'); return; }
  if (qty < 1 || qty > have) { toast(`Số lượng chuyển phải từ 1 đến ${have}.`, 'warning'); return; }

  setLoading(true, 'Đang chuyển…');
  try {
    await transferEquipment(rec.id, {
      toProjectId, qty, condition: val('condition'), note: val('note').trim(),
    });
    toast(`Đã chuyển ${qty} cái sang ${locName(toProjectId)}.`, 'success');
    close();
    await onDone();
  } catch (e) {
    toast(e.message || 'Luân chuyển thất bại.', 'danger');
  } finally {
    setLoading(false);
  }
}
