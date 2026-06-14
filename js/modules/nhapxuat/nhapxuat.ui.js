// ============================================================================
//  modules/nhapxuat/nhapxuat.ui.js  —  TẦNG GIAO DIỆN (Layer 6): Tab 💾 Sao lưu
// ----------------------------------------------------------------------------
//  @module nhapxuat.ui
//
//  VỎ tab "💾 Sao lưu" (chỉ admin — perm manageTools). Gộp 3 khu:
//    • XUẤT  : nút xuất file JSON (sao lưu) + CSV (Excel) — mượn mountExportButtons.
//    • NHẬP  : chọn file JSON do app xuất → xem trước số THÊM/GHI ĐÈ → xác nhận gộp.
//    • SAO LƯU NHANH: chụp ảnh dữ liệu vào máy + danh sách + khôi phục/xóa.
//
//  Tự đăng ký vào router qua registerTab('saoluu', render) (side-effect import).
//  Mọi thao tác phá hủy (nhập đè / khôi phục) đều qua confirm2 trước khi chạy.
// ============================================================================

import { registerTab } from '../../router.js';
import { toast, setLoading, confirm2 } from '../../utils/ui.js';
import { mountExportButtons } from './nhapxuat.export.js';
import { parseBackupFile, previewImport, applyImport } from './nhapxuat.import.js';
import { parseVisionFile, convertVision, applyVisionImport } from './nhapxuat.vision.js';
import { createSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot } from '../backup/backup.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// fmtDateTime(ts) — "HH:mm dd/mm/yyyy" cho mốc thời gian ảnh chụp.
function fmtDateTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Nhãn tiếng Việt cho từng kho (hiện ở bảng xem trước khi nhập).
const STORE_LABEL = {
  projects: 'Công trình', contracts: 'Hợp đồng chính', subcontracts: 'Thầu phụ',
  receipts: 'Đợt thu', invoices: 'Hóa đơn', timesheets: 'Chấm công',
  advances: 'Tiền ứng', equipment: 'Thiết bị', categories: 'Danh mục', users: 'Tài khoản',
};

let _host = null;       // ô nội dung tab
let _parsed = null;     // file đã parse đang chờ xác nhận nhập
let _vision = null;     // kết quả convertVision đang chờ xác nhận GHI ĐÈ

// ----------------------------------------------------------------------------
//  render(host) — Vẽ toàn bộ tab.
// ----------------------------------------------------------------------------
async function render(host) {
  _host = host;
  _parsed = null;
  _vision = null;
  host.innerHTML = shell();

  mountExportButtons(host.querySelector('[data-export-host]'));
  wireImport();
  wireVision();
  wireBackup();
  await refreshSnapshots();
}

// shell() — Khung HTML 3 thẻ.
function shell() {
  return `
    <div class="container-fluid py-3" style="max-width:780px">
      <h5 class="mb-3">💾 Sao lưu &amp; Phục hồi</h5>

      <div class="card mb-3">
        <div class="card-body">
          <h6 class="card-title">⬆️ Xuất ra file</h6>
          <p class="small text-muted mb-2">Tải về máy: <b>JSON</b> (sao lưu đầy đủ, nhập lại được) hoặc <b>CSV</b> (mở bằng Excel).</p>
          <div data-export-host></div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-body">
          <h6 class="card-title">📥 Nhập từ file JSON</h6>
          <p class="small text-muted mb-2">Chọn file <code>.json</code> do chính app này xuất. Dữ liệu được <b>gộp</b> theo bản mới nhất (không xóa bản đang có).</p>
          <input type="file" accept=".json,application/json" class="form-control form-control-sm mb-2" data-import-file>
          <div data-import-preview></div>
        </div>
      </div>

      <div class="card mb-3 border-warning">
        <div class="card-body">
          <h6 class="card-title">🧪 Nhập dữ liệu Vision (kiểm thử)</h6>
          <p class="small text-muted mb-2">
            Nạp file sao lưu <b>schema cũ</b> (kiểu <code>cpct_snapshot_*.json</code>, có kho <code>inv_v3</code>…)
            để thử dữ liệu thật trên app mới. ⚠️ Thao tác này <b>GHI ĐÈ</b> toàn bộ dữ liệu nghiệp vụ hiện tại
            (giữ nguyên tài khoản đăng nhập). App sẽ <b>tự chụp 1 bản sao lưu</b> trước khi đè để hoàn tác.
          </p>
          <input type="file" accept=".json,application/json" class="form-control form-control-sm mb-2" data-vision-file>
          <div data-vision-preview></div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <h6 class="card-title">📸 Sao lưu nhanh trong máy</h6>
          <p class="small text-muted mb-2">Chụp nhanh toàn bộ dữ liệu (lưu ngay trong trình duyệt, giữ 10 bản gần nhất). Lỡ tay có thể <b>khôi phục</b> lại.</p>
          <button type="button" class="btn btn-primary btn-sm mb-3" data-snap-create>📸 Tạo bản sao lưu</button>
          <div data-snap-list><div class="text-muted small">Đang tải…</div></div>
        </div>
      </div>
    </div>`;
}

// ----------------------------------------------------------------------------
//  NHẬP — chọn file → xem trước → xác nhận.
// ----------------------------------------------------------------------------
function wireImport() {
  const input = _host.querySelector('[data-import-file]');
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    const box = _host.querySelector('[data-import-preview]');
    _parsed = null;
    if (!file) { box.innerHTML = ''; return; }
    setLoading(true, 'Đang đọc file…');
    try {
      _parsed = await parseBackupFile(file);
      const diff = await previewImport(_parsed);
      box.innerHTML = previewTable(diff, _parsed.meta);
      box.querySelector('[data-import-apply]').addEventListener('click', doApply);
    } catch (e) {
      box.innerHTML = `<div class="alert alert-danger py-2 mb-0">${escapeHtml(e.message || e)}</div>`;
    } finally {
      setLoading(false);
    }
  });
}

// previewTable(diff, meta) — Bảng "thêm mới / ghi đè" từng kho + nút xác nhận.
function previewTable(diff, meta) {
  let totalAdd = 0, totalUpd = 0;
  const rows = Object.keys(diff).map((name) => {
    const d = diff[name];
    totalAdd += d.add; totalUpd += d.upd;
    if (!d.incoming) return '';
    return `<tr>
      <td>${escapeHtml(STORE_LABEL[name] || name)}</td>
      <td class="text-end">${d.incoming}</td>
      <td class="text-end text-success">${d.add}</td>
      <td class="text-end text-primary">${d.upd}</td>
    </tr>`;
  }).join('');

  const when = meta && meta.exportedAt ? `<div class="small text-muted mb-2">File xuất lúc: ${escapeHtml(meta.exportedAt)}</div>` : '';
  if (!totalAdd && !totalUpd) {
    return `${when}<div class="alert alert-warning py-2">File không có bản ghi nào để nhập.</div>`;
  }
  return `
    ${when}
    <div class="table-responsive">
      <table class="table table-sm table-bordered align-middle mb-2">
        <thead class="table-light"><tr>
          <th>Kho</th><th class="text-end">Trong file</th>
          <th class="text-end">Thêm mới</th><th class="text-end">Ghi đè</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <button type="button" class="btn btn-success btn-sm" data-import-apply>
      📥 Xác nhận nhập (${totalAdd} mới · ${totalUpd} ghi đè)
    </button>`;
}

async function doApply() {
  if (!_parsed) return;
  if (!(await confirm2('Nhập và gộp dữ liệu từ file này vào app?', { okText: 'Nhập', danger: false }))) return;
  try {
    await applyImport(_parsed);
    _parsed = null;
    _host.querySelector('[data-import-file]').value = '';
    _host.querySelector('[data-import-preview]').innerHTML =
      '<div class="alert alert-success py-2 mb-0">✅ Đã nhập xong. Mở lại các tab để xem dữ liệu mới.</div>';
  } catch {
    /* applyImport đã toast lỗi */
  }
}

// ----------------------------------------------------------------------------
//  NHẬP VISION (schema cũ) — chọn file → chuyển đổi → xem trước/cảnh báo → GHI ĐÈ.
// ----------------------------------------------------------------------------
const VISION_LABEL = {
  projects: 'Công trình', contracts: 'Hợp đồng chính', subcontracts: 'Thầu phụ',
  invoices: 'Hóa đơn', timesheets: 'Chấm công', advances: 'Tiền ứng',
  equipment: 'Thiết bị', receipts: 'Đợt thu', categories: 'Danh mục',
};

function wireVision() {
  const input = _host.querySelector('[data-vision-file]');
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    const box = _host.querySelector('[data-vision-preview]');
    _vision = null;
    if (!file) { box.innerHTML = ''; return; }
    setLoading(true, 'Đang chuyển đổi dữ liệu Vision…');
    try {
      const parsed = await parseVisionFile(file);
      _vision = convertVision(parsed);
      box.innerHTML = visionPreview(_vision);
      box.querySelector('[data-vision-apply]').addEventListener('click', doVisionApply);
    } catch (e) {
      box.innerHTML = `<div class="alert alert-danger py-2 mb-0">${escapeHtml(e.message || e)}</div>`;
    } finally {
      setLoading(false);
    }
  });
}

// visionPreview(v) — Bảng số bản ghi sau chuyển đổi + cảnh báo + nút GHI ĐÈ.
function visionPreview(v) {
  const rows = Object.keys(v.counts).map((k) => `<tr>
      <td>${escapeHtml(VISION_LABEL[k] || k)}</td>
      <td class="text-end">${v.counts[k]}</td>
    </tr>`).join('');
  const total = Object.values(v.counts).reduce((s, n) => s + n, 0);
  const warns = (v.warnings || []).map((w) =>
    `<li class="small">${escapeHtml(w)}</li>`).join('');

  return `
    <div class="table-responsive">
      <table class="table table-sm table-bordered align-middle mb-2">
        <thead class="table-light"><tr><th>Kho</th><th class="text-end">Sau chuyển đổi</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${warns ? `<div class="alert alert-warning py-2"><b>Lưu ý chuyển đổi:</b><ul class="mb-0 ps-3">${warns}</ul></div>` : ''}
    <button type="button" class="btn btn-warning btn-sm" data-vision-apply>
      ⚠️ GHI ĐÈ bằng dữ liệu Vision (${total} bản ghi)
    </button>`;
}

async function doVisionApply() {
  if (!_vision) return;
  if (!(await confirm2(
    'GHI ĐÈ toàn bộ dữ liệu nghiệp vụ hiện tại bằng dữ liệu Vision? '
    + 'App sẽ tự chụp 1 bản sao lưu trước để bạn hoàn tác được.',
    { okText: 'Ghi đè' }))) return;
  setLoading(true, 'Đang chụp sao lưu an toàn…');
  try {
    await createSnapshot('Trước khi nhập Vision');     // phao cứu sinh để hoàn tác
    setLoading(true, 'Đang ghi đè dữ liệu Vision…');
    const n = await applyVisionImport(_vision);
    _vision = null;
    _host.querySelector('[data-vision-file]').value = '';
    _host.querySelector('[data-vision-preview]').innerHTML =
      `<div class="alert alert-success py-2 mb-0">✅ Đã nạp ${n} bản ghi Vision. Mở lại các tab để kiểm thử. `
      + 'Muốn quay lại: dùng “Khôi phục” bản “Trước khi nhập Vision” ở mục Sao lưu nhanh.</div>';
    await refreshSnapshots();
    toast(`🧪 Đã nạp dữ liệu Vision (${n} bản ghi).`, 'success');
  } catch (e) {
    toast(`⚠ ${e.message || 'Lỗi khi nhập Vision.'}`, 'error');
  } finally {
    setLoading(false);
  }
}

// ----------------------------------------------------------------------------
//  SAO LƯU NHANH — tạo / liệt kê / khôi phục / xóa.
// ----------------------------------------------------------------------------
function wireBackup() {
  _host.querySelector('[data-snap-create]').addEventListener('click', async () => {
    setLoading(true, 'Đang chụp dữ liệu…');
    try {
      const m = await createSnapshot();
      toast(`📸 Đã tạo bản sao lưu (${m.records} bản ghi).`, 'success');
      await refreshSnapshots();
    } catch {
      toast('⚠ Lỗi khi tạo bản sao lưu.', 'error');
    } finally {
      setLoading(false);
    }
  });
}

async function refreshSnapshots() {
  const box = _host.querySelector('[data-snap-list]');
  const list = await listSnapshots();
  if (!list.length) {
    box.innerHTML = '<div class="text-muted small">Chưa có bản sao lưu nào.</div>';
    return;
  }
  box.innerHTML = `
    <ul class="list-group list-group-flush">
      ${list.map((s) => `
        <li class="list-group-item px-0 d-flex justify-content-between align-items-center gap-2">
          <span class="small">
            <b>${fmtDateTime(s.at)}</b>
            <span class="text-muted">· ${s.records} bản ghi${s.label ? ' · ' + escapeHtml(s.label) : ''}</span>
          </span>
          <span class="d-flex gap-1">
            <button type="button" class="btn btn-outline-primary btn-sm" data-snap-restore="${s.id}">Khôi phục</button>
            <button type="button" class="btn btn-outline-danger btn-sm" data-snap-del="${s.id}">Xóa</button>
          </span>
        </li>`).join('')}
    </ul>`;

  box.querySelectorAll('[data-snap-restore]').forEach((b) => {
    b.addEventListener('click', () => doRestore(b.dataset.snapRestore));
  });
  box.querySelectorAll('[data-snap-del]').forEach((b) => {
    b.addEventListener('click', () => doDelete(b.dataset.snapDel));
  });
}

async function doRestore(id) {
  if (!(await confirm2('Khôi phục sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại bằng bản sao lưu này. Tiếp tục?', { okText: 'Khôi phục' }))) return;
  setLoading(true, 'Đang khôi phục…');
  try {
    const n = await restoreSnapshot(id);
    toast(`♻️ Đã khôi phục ${n} bản ghi. Mở lại các tab để xem.`, 'success');
  } catch (e) {
    toast(`⚠ ${e.message || 'Lỗi khi khôi phục.'}`, 'error');
  } finally {
    setLoading(false);
  }
}

async function doDelete(id) {
  if (!(await confirm2('Xóa bản sao lưu này?', { okText: 'Xóa' }))) return;
  await deleteSnapshot(id);
  toast('🗑️ Đã xóa bản sao lưu.', 'success');
  await refreshSnapshots();
}

registerTab('saoluu', render);
