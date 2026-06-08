// ============================================================================
//  modules/chamcong/chamcong.week.js  —  TẦNG GIAO DIỆN (Layer 6): Sổ Chấm Công
// ----------------------------------------------------------------------------
//  @module chamcong.week
//
//  FORM NHẬP TUẦN (doc 04 §5): điều hướng tuần CN→T7, chọn công trình, nhập công
//  nhân bằng lưới chuyên dụng (chamcong.grid.js) rồi LƯU 1 bản ghi tuần × CT.
//  Việc chính của file này (phần "nghiệp vụ" quanh lưới):
//    • Điều hướng tuần (◀/Tuần này/▶) + snap ô "Từ ngày" về Chủ Nhật.
//    • Nạp dữ liệu tuần: có bản ghi cũ → sửa; chưa có → AUTO-COPY danh sách + lương
//      từ tuần gần nhất của CT (xóa ngày công/nợ).
//    • Validate tên theo DANH MỤC công nhân (không dấu) + auto-fill T/P + chống trùng.
//    • Cột "Nợ Cũ" hiển thị LIVE (calcDebtBefore); Copy/Dán tuần; gọi saveWeek.
//
//  Là sub-tab 'week' của tab Chấm công (vỏ ở chamcong.ui.js gọi renderWeek).
// ============================================================================

import { toast, setLoading, confirm2 } from '../../utils/ui.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';
import { loadCategories, getCategory } from '../../utils/cat.js';
import { loadProjects, getProjectOptions } from '../projects/projects.data.js';
import { getSelectedYear } from '../../topbar.js';
import { createWeekGrid } from './chamcong.grid.js';
import {
  snapToSunday, sundayISO, saturdayISO, weekLabel, calcDebtBefore,
} from './chamcong.calc.js';
import { getTimesheetWeeks, saveWeek, loadWeek } from './chamcong.data.js';
import { exportWeekCsv } from './chamcong.report.js';

// Tên 7 ngày để dựng nhãn cột động (CN…T7).
const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// ----------------------------------------------------------------------------
//  TRẠNG THÁI MODULE — sống trong lần render hiện tại của sub-tab.
// ----------------------------------------------------------------------------
let _host = null;
let _grid = null;
let _cats = null;          // document danh mục (nguồn tên + vai trò công nhân)
let _weeks = [];           // mọi tuần còn dùng (cho nợ cũ live + auto-copy)
let _model = [];           // mảng worker đang nhập (NGUỒN SỰ THẬT của lưới)
let _sunISO = sundayISO(0);// Chủ Nhật của tuần đang xem
let _projectId = '';       // CT đang chọn
let _showDebt = false;     // nhóm cột nợ đang mở?
let _loadedId = null;      // id bản ghi đang sửa (null = tạo mới)

// Clipboard "Copy tuần" — sống xuyên các lần render (chỉ tên+vai trò+lương+ngày công).
let _clip = null;

// Truy cập nhanh các ô trong layout.
const $ = (sel) => _host.querySelector(sel);

// ----------------------------------------------------------------------------
//  dayLabels() — 7 nhãn cột ngày cho lưới: 'CN 17/5', 'T2 18/5'… theo _sunISO.
// ----------------------------------------------------------------------------
function dayLabels() {
  const m = _sunISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return DAY_NAMES;
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return DAY_NAMES.map((nm, i) => {
    const d = new Date(base); d.setDate(base.getDate() + i);
    return `${nm} ${d.getDate()}/${d.getMonth() + 1}`;
  });
}

// blankWorker() — 1 dòng công nhân rỗng.
function blankWorker() {
  return { name: '', role: '', wage: 0, days: [0, 0, 0, 0, 0, 0, 0],
    allowance: 0, retailInvoice: 0, loanAmount: 0, deduction: 0, note: '' };
}

// cloneWorker(w, { keepMoney }) — Sao 1 worker. keepMoney=false → reset phụ cấp/nợ/ngày.
function cloneWorker(w, { keepDays = true, keepExtra = true } = {}) {
  return {
    name: w.name || '', role: w.role || '', wage: Number(w.wage) || 0,
    days: keepDays ? [...(w.days || [])].slice(0, 7) : [0, 0, 0, 0, 0, 0, 0],
    allowance: keepExtra ? Number(w.allowance) || 0 : 0,
    retailInvoice: keepExtra ? Number(w.retailInvoice) || 0 : 0,
    loanAmount: keepExtra ? Number(w.loanAmount) || 0 : 0,
    deduction: keepExtra ? Number(w.deduction) || 0 : 0,
    note: keepExtra ? (w.note || '') : '',
  };
}

// ----------------------------------------------------------------------------
//  renderWeek(host) — Vẽ toàn bộ Sổ Chấm Công vào ô nội dung sub-tab.
// ----------------------------------------------------------------------------
export async function renderWeek(host) {
  _host = host;
  host.innerHTML = `
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-body">
        <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
          <div class="btn-group btn-group-sm" role="group">
            <button type="button" class="btn btn-outline-secondary" data-prev>◀ Tuần trước</button>
            <button type="button" class="btn btn-outline-secondary" data-this>Tuần này</button>
            <button type="button" class="btn btn-outline-secondary" data-next>Tuần sau ▶</button>
          </div>
          <div>
            <label class="form-label small mb-1 fw-semibold">📅 Từ ngày (CN)</label>
            <input type="date" class="form-control form-control-sm" data-from style="max-width:160px">
          </div>
          <div>
            <label class="form-label small mb-1 fw-semibold">🏗️ Công trình</label>
            <select class="form-select form-select-sm" data-project style="min-width:200px"></select>
          </div>
          <div class="ms-auto d-flex gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-toggle-debt>▶ Cột nợ</button>
            <button type="button" class="btn btn-sm btn-outline-primary" data-copy>📋 Copy</button>
            <button type="button" class="btn btn-sm btn-outline-primary" data-paste>📌 Dán</button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-clear>🗑 Xóa bảng</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-csv>⬇ CSV</button>
            <button type="button" class="btn btn-sm btn-primary" data-save>💾 Lưu tuần này</button>
          </div>
        </div>
        <div class="small text-muted mb-2" data-weeklabel></div>
        <div data-grid></div>
      </div>
    </div>`;

  setLoading(true, 'Đang tải dữ liệu…');
  try {
    [_cats] = await Promise.all([loadCategories(), loadProjects()]);
  } finally {
    setLoading(false);
  }

  // Đổ dropdown công trình (ẩn CT đã quyết toán; giữ CT đang chọn nếu có).
  fillProjects();

  // Sự kiện thanh điều hướng + công cụ.
  $('[data-prev]').addEventListener('click', () => goToWeek(-1));
  $('[data-this]').addEventListener('click', () => { _sunISO = sundayISO(0); syncDateInput(); reloadData(); });
  $('[data-next]').addEventListener('click', () => goToWeek(1));
  $('[data-from]').addEventListener('change', (e) => {
    _sunISO = snapToSunday(e.target.value);
    syncDateInput(); reloadData();
  });
  $('[data-project]').addEventListener('change', (e) => { _projectId = e.target.value; reloadData(); });
  $('[data-toggle-debt]').addEventListener('click', toggleDebt);
  $('[data-copy]').addEventListener('click', copyWeek);
  $('[data-paste]').addEventListener('click', pasteWeek);
  $('[data-clear]').addEventListener('click', clearWeek);
  $('[data-csv]').addEventListener('click', handleCsv);
  $('[data-save]').addEventListener('click', handleSave);

  _projectId = $('[data-project]').value || '';
  syncDateInput();
  await reloadData();
}

// fillProjects() — Đổ option công trình vào dropdown.
function fillProjects() {
  const opts = getProjectOptions({ excludeLocked: true, includeId: _projectId || null })
    .filter((o) => o.id !== 'COMPANY'); // CÔNG TY không chấm công
  $('[data-project]').innerHTML =
    `<option value="">-- Chọn công trình --</option>` +
    opts.map((o) => `<option value="${o.id}"${o.id === _projectId ? ' selected' : ''}>${o.name}</option>`).join('');
}

// syncDateInput() — Đồng bộ ô "Từ ngày" + nhãn tuần theo _sunISO.
function syncDateInput() {
  $('[data-from]').value = _sunISO;
  $('[data-weeklabel]').textContent = weekLabel(_sunISO);
}

// goToWeek(delta) — Lùi/tới `delta` tuần so với tuần đang xem.
function goToWeek(delta) {
  const m = _sunISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  d.setDate(d.getDate() + delta * 7);
  _sunISO = snapToSunday(d);
  syncDateInput();
  reloadData();
}

// ----------------------------------------------------------------------------
//  reloadData() — Nạp lại danh sách tuần + dựng model cho (tuần × CT) hiện tại:
//   - Có bản ghi cũ → SỬA (đổ workers lên).
//   - Chưa có nhưng CT có tuần trước → AUTO-COPY tên+lương (xóa ngày công/nợ).
//   - Không có gì → 1 dòng trống.
// ----------------------------------------------------------------------------
async function reloadData() {
  _weeks = await getTimesheetWeeks({ year: 0 });   // mọi năm: cần đủ lịch sử cho nợ cũ
  _loadedId = null;

  const existing = _projectId
    ? _weeks.find((w) => w.fromDate === _sunISO && w.projectId === _projectId)
    : null;

  if (existing) {
    _loadedId = existing.id;
    _model = (existing.workers || []).map((w) => cloneWorker(w));
  } else if (_projectId) {
    const prev = _weeks
      .filter((w) => w.projectId === _projectId && w.fromDate < _sunISO)
      .sort((a, b) => (b.fromDate || '').localeCompare(a.fromDate || ''))[0];
    _model = prev
      ? (prev.workers || []).map((w) => cloneWorker(w, { keepDays: false, keepExtra: false }))
      : [blankWorker()];
  } else {
    _model = [blankWorker()];
  }
  if (!_model.length) _model = [blankWorker()];

  mountGrid();
}

// mountGrid() — Dựng (lại) lưới với _model hiện tại.
function mountGrid() {
  if (_grid) _grid.destroy();
  $('[data-grid]').innerHTML = '';
  _grid = createWeekGrid($('[data-grid]'), {
    model: _model,
    dayLabels: dayLabels(),
    showDebt: _showDebt,
    nameSource: () => getCategory(_cats, 'worker').map((it) => it.name),
    resolveName,
    getDebtBefore: (w) => calcDebtBefore(w.name, _sunISO, _weeks, true),
  });
}

// ----------------------------------------------------------------------------
//  resolveName(raw, rowIndex) — Validate tên theo danh mục công nhân:
//   - rỗng → bỏ qua (cho phép dòng trống).
//   - không có trong danh mục → toast + báo 'notfound' (lưới sẽ xóa ô).
//   - có → trả TÊN CHUẨN + vai trò; nếu trùng tên trong tuần → báo 'dup'.
// ----------------------------------------------------------------------------
function resolveName(raw, rowIndex) {
  const v = String(raw || '').trim();
  if (!v) return { name: '', role: _model[rowIndex]?.role || '', invalid: null };

  const key = normalizeVietnamese(v);
  const item = getCategory(_cats, 'worker').find((it) => normalizeVietnamese(it.name) === key);
  if (!item) {
    toast(`⚠️ "${v}" không có trong danh mục công nhân!`, 'warning');
    return { name: '', role: '', invalid: 'notfound' };
  }

  // Chống trùng tên trong cùng tuần (bỏ qua chính dòng đang xét).
  const dup = _model.some((w, i) => i !== rowIndex && normalizeVietnamese(w.name) === key);
  if (dup) {
    toast(`⚠️ "${item.name}" đã có trong tuần này.`, 'warning');
    return { name: item.name, role: item.role || '', invalid: 'dup' };
  }
  return { name: item.name, role: item.role || '', invalid: null };
}

// ----------------------------------------------------------------------------
//  CÔNG CỤ: ẩn/hiện cột nợ · copy/dán tuần · xóa bảng.
// ----------------------------------------------------------------------------
function toggleDebt() {
  _showDebt = !_showDebt;
  _grid.setShowDebt(_showDebt);
  $('[data-toggle-debt]').textContent = _showDebt ? '◀ Cột nợ' : '▶ Cột nợ';
}

function copyWeek() {
  _clip = _model
    .filter((w) => w.name || (w.days || []).some((d) => Number(d) > 0))
    .map((w) => cloneWorker(w, { keepDays: true, keepExtra: false }));
  toast(`📋 Đã copy ${_clip.length} công nhân.`, 'success');
}

function pasteWeek() {
  if (!_clip || !_clip.length) { toast('Chưa có dữ liệu đã copy.', 'warning'); return; }
  _model = _clip.map((w) => cloneWorker(w, { keepDays: true, keepExtra: false }));
  mountGrid();
  toast(`📌 Đã dán ${_model.length} công nhân.`, 'success');
}

async function clearWeek() {
  if (!(await confirm2('Xóa toàn bộ dòng trong bảng tuần này?'))) return;
  _model = [blankWorker()];
  mountGrid();
}

// handleCsv() — Xuất CSV tuần đang mở trên form (doc 04 §8). Nợ Cũ tính LIVE
// (giống cột trên lưới) vì _model không giữ snapshot debtBefore.
function handleCsv() {
  const sel = $('[data-project]');
  const projectName = _projectId ? sel.options[sel.selectedIndex]?.text || '' : '';
  const workers = _model.map((w) => ({ ...w, debtBefore: calcDebtBefore(w.name, _sunISO, _weeks, true) }));
  exportWeekCsv({ projectName, weekText: weekLabel(_sunISO), workers, dayNames: dayLabels() });
}

// ----------------------------------------------------------------------------
//  handleSave() — Lưu tuần: chống double-click, gom workers, gọi saveWeek (đóng
//  băng nợ cũ + dedup), rồi nạp lại để thấy snapshot.
// ----------------------------------------------------------------------------
async function handleSave() {
  if (!_projectId) { toast('Vui lòng chọn Công trình.', 'warning'); return; }

  const workers = _model.filter((w) => w.name || (w.days || []).some((d) => Number(d) > 0));
  if (!workers.length) { toast('Chưa có công nhân nào để lưu.', 'warning'); return; }

  const btn = $('[data-save]');
  btn.disabled = true;
  setLoading(true, 'Đang lưu tuần…');
  try {
    await saveWeek({ id: _loadedId || undefined, projectId: _projectId, fromDate: _sunISO, workers });
    toast('💾 Đã lưu tuần chấm công.', 'success');
    await reloadData();
  } catch (e) {
    toast(e.message || 'Lưu tuần thất bại.', 'danger');
  } finally {
    setLoading(false);
    btn.disabled = false;
  }
}

// ----------------------------------------------------------------------------
//  goToTimesheetWeek(weekId, projectId) — Điều hướng từ Tab 03 / Lịch sử về đúng
//  tuần + CT rồi nạp form (doc 04 §9). Trả true nếu nạp được.
// ----------------------------------------------------------------------------
export async function goToTimesheetWeek(weekId, projectId) {
  if (!_host) return false;
  const rec = await loadWeek(weekId);
  if (!rec) { toast('Không tìm thấy tuần chấm công.', 'warning'); return false; }
  _sunISO = rec.fromDate;
  _projectId = projectId || rec.projectId;
  fillProjects();
  syncDateInput();
  await reloadData();
  _host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

// Ghi chú: getSelectedYear/saturdayISO có sẵn cho các sub-tab khác (history/report).
void getSelectedYear; void saturdayISO;
