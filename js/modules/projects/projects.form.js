// ============================================================================
//  modules/projects/projects.form.js  —  TẦNG GIAO DIỆN (Layer 6): Form Công Trình
// ----------------------------------------------------------------------------
//  @module projects.form
//
//  Modal THÊM / SỬA một công trình (tách khỏi projects.list.js cho gọn, đúng
//  nguyên tắc "mỗi file một việc"). Chỉ lo dựng form + validate phía UI rồi gọi
//  tầng dữ liệu (createProject/updateProject). Lưu xong báo về cho danh sách qua
//  callback onSaved (thường là hàm reload() của projects.list.js).
//
//  Tên/chủ đầu tư/ghi chú là dữ liệu người dùng nhập → LUÔN escape HTML.
// ============================================================================

import { toast, setLoading } from '../../utils/ui.js';
import {
  createProject, updateProject,
  PROJECT_STATUS, PROJECT_STATUS_KEYS, PROJECT_TYPES, PROJECT_TYPE_LABELS,
} from './projects.data.js';

// escapeHtml(s) — Chống XSS: đổi ký tự nhạy cảm thành thực thể HTML.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ----------------------------------------------------------------------------
//  openProjectForm(project, opts, onSaved) — Mở modal Thêm (project=null) hoặc Sửa.
//    opts.focusStatus: đặt sẵn trạng thái (dùng khi bấm Hoàn thành/Quyết toán mà
//                      CT còn thiếu ngày → mở form để nhập ngày).
//    onSaved: hàm gọi lại sau khi lưu thành công (vẽ lại danh sách).
// ----------------------------------------------------------------------------
export function openProjectForm(project, opts = {}, onSaved = () => {}) {
  const p = project || {};
  const isEdit = !!project;
  const status0 = opts.focusStatus || p.status || 'active';

  const nen = document.createElement('div');
  nen.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex align-items-start justify-content-center p-3 overflow-auto';
  nen.style.cssText = 'background:rgba(0,0,0,.5);z-index:1100;';
  nen.innerHTML = `
    <div class="card shadow my-3" style="max-width:480px;width:100%;">
      <div class="card-body">
        <h2 class="h6 mb-3">${isEdit ? '✏️ Sửa công trình' : '+ Thêm công trình'}</h2>
        <div class="mb-2">
          <label class="form-label small mb-1">Tên công trình *</label>
          <input class="form-control" data-i="name" value="${escapeHtml(p.name || '')}" placeholder="VD: Nhà anh A">
        </div>
        <div class="row g-2 mb-2">
          <div class="col-6">
            <label class="form-label small mb-1">Loại hình</label>
            <select class="form-select" data-i="type">
              ${PROJECT_TYPES.map((t) => `<option value="${t}" ${(p.type || 'CT') === t ? 'selected' : ''}>${PROJECT_TYPE_LABELS[t]}</option>`).join('')}
            </select>
          </div>
          <div class="col-6">
            <label class="form-label small mb-1">Trạng thái</label>
            <select class="form-select" data-i="status">
              ${PROJECT_STATUS_KEYS.map((k) => `<option value="${k}" ${status0 === k ? 'selected' : ''}>${PROJECT_STATUS[k]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="mb-2">
          <label class="form-label small mb-1">Chủ đầu tư</label>
          <input class="form-control" data-i="investor" value="${escapeHtml(p.investor || '')}">
        </div>
        <div class="row g-2 mb-2">
          <div class="col-6 col-md-4">
            <label class="form-label small mb-1">Ngày bắt đầu</label>
            <input type="date" class="form-control" data-i="startDate" value="${p.startDate || ''}">
          </div>
          <div class="col-6 col-md-4">
            <label class="form-label small mb-1">Ngày hoàn thành</label>
            <input type="date" class="form-control" data-i="endDate" value="${p.endDate || ''}">
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label small mb-1">Ngày quyết toán</label>
            <input type="date" class="form-control" data-i="closedDate" value="${p.closedDate || ''}">
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label small mb-1">Ghi chú / địa chỉ</label>
          <textarea class="form-control" rows="2" data-i="note">${escapeHtml(p.note || '')}</textarea>
        </div>
        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-secondary" data-x>Hủy</button>
          <button class="btn btn-primary" data-save>${isEdit ? 'Lưu' : 'Tạo'}</button>
        </div>
      </div>
    </div>`;

  const close = () => nen.remove();
  nen.querySelector('[data-x]').onclick = close;
  nen.onclick = (e) => { if (e.target === nen) close(); };

  const val = (k) => nen.querySelector(`[data-i="${k}"]`).value.trim();

  nen.querySelector('[data-save]').onclick = async () => {
    const data = {
      name: val('name'), type: val('type'), status: val('status'),
      startDate: val('startDate'), endDate: val('endDate') || null,
      closedDate: val('closedDate') || null,
      investor: val('investor'), note: val('note'),
    };

    // Validate phía UI (báo sớm; tầng data cũng chặn lần nữa cho chắc).
    const loi = validateForm(data);
    if (loi) { toast(loi, 'warning'); return; }

    setLoading(true);
    try {
      if (isEdit) await updateProject(project.id, data);
      else await createProject(data);
      toast(isEdit ? 'Đã lưu thay đổi.' : 'Đã tạo công trình.', 'success');
      close();
      await onSaved();
    } catch (e) {
      toast(e.message || 'Lưu thất bại.', 'error');
    } finally {
      setLoading(false);
    }
  };

  document.body.appendChild(nen);
  nen.querySelector('[data-i="name"]').focus();
}

// validateForm(data) — Kiểm tra ràng buộc ngày trước khi gửi. Trả câu lỗi hoặc null.
function validateForm(data) {
  if (!data.name) return 'Tên công trình không được để trống.';
  if (data.endDate && data.startDate && data.endDate < data.startDate) {
    return 'Ngày hoàn thành phải sau ngày bắt đầu.';
  }
  if (data.closedDate && data.startDate && data.closedDate < data.startDate) {
    return 'Ngày quyết toán phải sau ngày bắt đầu.';
  }
  if (data.status === 'completed' && !data.endDate) {
    return 'Trạng thái "Đã hoàn thành" cần nhập Ngày hoàn thành.';
  }
  if (data.status === 'closed' && !data.closedDate) {
    return 'Trạng thái "Đã quyết toán" cần nhập Ngày quyết toán.';
  }
  return null;
}
