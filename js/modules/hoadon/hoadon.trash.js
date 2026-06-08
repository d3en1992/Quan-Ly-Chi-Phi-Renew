// ============================================================================
//  modules/hoadon/hoadon.trash.js  —  TẦNG GIAO DIỆN (Layer 6): THÙNG RÁC hóa đơn
// ----------------------------------------------------------------------------
//  @module hoadon.trash
//
//  Sub-tab "🗑 Thùng rác" của tab Hóa đơn: liệt kê các hóa đơn ĐÃ XÓA MỀM
//  (deletedAt != null) và cho KHÔI PHỤC lại (bỏ cờ deletedAt → quay về Danh sách).
//
//  Quy ước an toàn: KHÔNG xóa vĩnh viễn ở đây — xóa mềm giữ bản ghi để đồng bộ
//  (LWW) và khôi phục được. Thùng rác xem MỌI năm (không lọc năm).
// ============================================================================

import { toast, setLoading } from '../../utils/ui.js';
import { formatMoney } from '../../utils/fmt.js';
import { loadProjects, getProjectName } from '../projects/projects.data.js';
import { getTrashedInvoices, restoreInvoice } from './hoadon.data.js';

let _host = null;

// escapeHtml(s) — chống vỡ HTML khi đổ chuỗi người dùng vào bảng.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// fmtWhen(ts) — Đổi mốc thời gian (ms) thành chuỗi ngày-giờ ngắn gọn cho cột "Đã xóa".
function fmtWhen(ts) {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ----------------------------------------------------------------------------
//  renderTrash(host) — Vẽ danh sách hóa đơn đã xóa mềm + nút khôi phục từng dòng.
// ----------------------------------------------------------------------------
export async function renderTrash(host) {
  _host = host;
  host.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <div class="d-flex align-items-center mb-2">
          <h2 class="h6 mb-0">🗑 Thùng rác hóa đơn</h2>
          <button type="button" class="btn btn-sm btn-link ms-2 p-0" data-refresh>↻ Làm mới</button>
        </div>
        <p class="text-muted small mb-3">Hóa đơn đã xóa được giữ tại đây để có thể khôi phục.</p>
        <div data-trash></div>
      </div>
    </div>`;

  host.querySelector('[data-refresh]').addEventListener('click', renderBody);

  setLoading(true, 'Đang tải thùng rác…');
  try {
    await loadProjects();
  } finally {
    setLoading(false);
  }
  await renderBody();
}

// renderBody() — Tải lại + vẽ bảng các hóa đơn trong thùng rác.
async function renderBody() {
  const box = _host.querySelector('[data-trash]');
  const list = await getTrashedInvoices();

  if (!list.length) {
    box.innerHTML = '<p class="text-muted small mb-0">Thùng rác trống.</p>';
    return;
  }

  box.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle mb-0">
        <thead class="table-light">
          <tr>
            <th>Ngày HĐ</th><th>Loại CP</th><th>Công trình</th><th>Nội dung</th>
            <th class="text-end">Số tiền</th><th>Đã xóa lúc</th><th style="width:110px"></th>
          </tr>
        </thead>
        <tbody>
          ${list.map((r) => `
            <tr>
              <td class="text-nowrap">${escapeHtml(r.date)}</td>
              <td>${escapeHtml(r.category)}</td>
              <td>${escapeHtml(getProjectName(r.projectId) || '—')}</td>
              <td>${escapeHtml(r.note)}</td>
              <td class="text-end text-nowrap">${formatMoney(r.amount)}</td>
              <td class="text-nowrap small text-muted">${fmtWhen(r.deletedAt)}</td>
              <td class="text-nowrap">
                <button class="btn btn-sm btn-outline-success py-0" data-restore="${r.id}" title="Khôi phục">↩ Khôi phục</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  box.querySelectorAll('[data-restore]').forEach((b) =>
    b.addEventListener('click', () => handleRestore(b.dataset.restore)));
}

// handleRestore(id) — Khôi phục 1 hóa đơn (an toàn, không hỏi xác nhận) rồi vẽ lại.
async function handleRestore(id) {
  const ok = await restoreInvoice(id);
  toast(ok ? 'Đã khôi phục hóa đơn.' : 'Không tìm thấy hóa đơn.', ok ? 'success' : 'warning');
  await renderBody();
}
