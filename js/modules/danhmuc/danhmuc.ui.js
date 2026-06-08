// ============================================================================
//  modules/danhmuc/danhmuc.ui.js  —  TẦNG GIAO DIỆN (Layer 6): Tab Danh Mục
// ----------------------------------------------------------------------------
//  @module danhmuc.ui
//
//  Vẽ LƯỚI THẺ danh mục: mỗi nhóm (Loại chi phí / NCC / Người TH / Thầu phụ /
//  Công nhân / Thiết bị) là 1 thẻ riêng, xếp responsive (1 cột mobile → 2-3 cột
//  rộng). Mỗi thẻ có: tiêu đề + đếm, ô tìm trong thẻ, ô thêm, danh sách item với
//  badge "đang dùng", sửa tên tại chỗ, xóa, và (riêng công nhân) dropdown vai trò.
//
//  Mọi thao tác dữ liệu đi qua danhmuc.data.js. Tên là dữ liệu người dùng nhập →
//  LUÔN escape HTML trước khi đổ vào innerHTML.
// ============================================================================

import { registerTab } from '../../router.js';
import { getSelectedYear } from '../../topbar.js';
import { toast, confirm2, setLoading } from '../../utils/ui.js';
import { GROUPS, WORKER_ROLES, normalizeKey } from '../../utils/cat.js';
import {
  ensureLoaded, groupItems, getUsedKeys,
  addItem, renameItem, deleteItem, setWorkerRole,
} from './danhmuc.data.js';

// ----------------------------------------------------------------------------
//  STATE NỘI BỘ — ô DOM gốc + tập khóa "đang dùng" theo năm + item đang sửa.
// ----------------------------------------------------------------------------
let _host = null;
let _used = {};                 // { [group]: Set(normalizeKey) } — nạp ở reload()
let _editing = null;            // { group, id } của item đang sửa tên tại chỗ

// escapeHtml(s) — Chống XSS khi đổ tên (dữ liệu người dùng) vào innerHTML.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// usedBadge(group, name) — Nhãn "✓ đang dùng" nếu tên có phát sinh trong năm xem.
function usedBadge(group, name) {
  const set = _used[group];
  return set && set.has(normalizeKey(name))
    ? '<span class="badge bg-success-subtle text-success border border-success-subtle ms-1">✓ đang dùng</span>'
    : '';
}

// roleSelect(item) — Dropdown vai trò C/T/P cho 1 công nhân.
function roleSelect(item) {
  const opts = Object.entries(WORKER_ROLES)
    .map(([k, v]) => `<option value="${k}" ${item.role === k ? 'selected' : ''}>${v.label}</option>`)
    .join('');
  return `<select class="form-select form-select-sm w-auto" data-role data-id="${item.id}">${opts}</select>`;
}

// itemRow(group, item, hasRole) — 1 dòng item. Nếu đang sửa → hiện ô input tại chỗ.
function itemRow(group, item, hasRole) {
  const editing = _editing && _editing.group === group && _editing.id === item.id;
  if (editing) {
    return `
      <li class="list-group-item d-flex gap-2 align-items-center" data-row="${item.id}">
        <input class="form-control form-control-sm" data-edit-input value="${escapeHtml(item.name)}">
        <button class="btn btn-sm btn-success" data-edit-save>Lưu</button>
        <button class="btn btn-sm btn-outline-secondary" data-edit-cancel>Hủy</button>
      </li>`;
  }
  return `
    <li class="list-group-item d-flex justify-content-between align-items-center gap-2" data-row="${item.id}"
        data-key="${escapeHtml(normalizeKey(item.name))}">
      <span class="text-truncate" data-name title="Bấm đúp để sửa">${escapeHtml(item.name)}${usedBadge(group, item.name)}</span>
      <span class="d-flex align-items-center gap-1 flex-shrink-0">
        ${hasRole ? roleSelect(item) : ''}
        <button class="btn btn-sm btn-outline-primary" data-edit data-id="${item.id}" title="Sửa tên">✏️</button>
        <button class="btn btn-sm btn-outline-danger" data-del data-id="${item.id}" title="Xóa">🗑</button>
      </span>
    </li>`;
}

// cardInner(group) — Phần ruột 1 thẻ (tiêu đề + đếm + ô tìm + ô thêm + danh sách).
function cardInner(cfg) {
  const items = groupItems(cfg.key);
  const rows = items.length
    ? items.map((it) => itemRow(cfg.key, it, !!cfg.hasRole)).join('')
    : '<li class="list-group-item text-muted small">Chưa có mục nào.</li>';
  return `
    <div class="card-body p-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h3 class="h6 mb-0">${cfg.label} <span class="text-muted">(${items.length})</span></h3>
      </div>
      <input type="search" class="form-control form-control-sm mb-2" placeholder="🔍 Tìm trong nhóm…" data-search>
      <div class="input-group input-group-sm mb-2">
        <input class="form-control" placeholder="Thêm ${escapeHtml(cfg.label.toLowerCase())}…" data-add-input>
        <button class="btn btn-primary" data-add>+ Thêm</button>
      </div>
      <ul class="list-group list-group-flush" data-list style="max-height:280px;overflow:auto;">${rows}</ul>
    </div>`;
}

// ----------------------------------------------------------------------------
//  renderDanhMucTab(host) — Hàm ROUTER gọi khi mở tab Danh Mục.
// ----------------------------------------------------------------------------
function renderDanhMucTab(host) {
  _host = host;
  host.innerHTML = `
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
      <h2 class="h5 mb-0">📁 Danh mục dùng chung</h2>
      <span class="text-muted small">Sửa tên ở đây sẽ tự cập nhật mọi tab liên quan.</span>
    </div>
    <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3" data-grid>
      <div class="col text-center text-muted py-5"><div class="spinner-border"></div></div>
    </div>`;
  reload();
}

// reload() — Nạp cache + tập "đang dùng" theo năm rồi vẽ lại toàn bộ lưới thẻ.
async function reload() {
  await ensureLoaded();
  try {
    _used = await getUsedKeys(getSelectedYear());
  } catch {
    _used = {};
  }
  renderGrid();
}

// renderGrid() — Vẽ 6 thẻ + gắn sự kiện ủy quyền 1 lần trên lưới.
function renderGrid() {
  if (!_host) return;
  const grid = _host.querySelector('[data-grid]');
  grid.innerHTML = GROUPS.map((cfg) => `
    <div class="col">
      <div class="card border-0 shadow-sm h-100" data-card="${cfg.key}">${cardInner(cfg)}</div>
    </div>`).join('');

  grid.querySelectorAll('[data-card]').forEach((card) => bindCard(card, card.dataset.card));
}

// refreshCard(group) — Vẽ lại RUỘT 1 thẻ (sau thêm/xóa/sửa) + gắn lại sự kiện thẻ đó.
function refreshCard(group) {
  const card = _host?.querySelector(`[data-card="${group}"]`);
  if (!card) return;
  const cfg = GROUPS.find((g) => g.key === group);
  card.innerHTML = cardInner(cfg);
  bindCard(card, group);
}

// ----------------------------------------------------------------------------
//  bindCard(card, group) — Gắn toàn bộ sự kiện cho 1 thẻ (thêm/tìm/sửa/xóa/vai trò).
// ----------------------------------------------------------------------------
function bindCard(card, group) {
  const addInput = card.querySelector('[data-add-input]');
  const doAdd = () => handleAdd(group, addInput);
  card.querySelector('[data-add]').addEventListener('click', doAdd);
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

  // Tìm trong thẻ: lọc dòng theo khóa không dấu (không vẽ lại, giữ con trỏ).
  card.querySelector('[data-search]').addEventListener('input', (e) => {
    const q = normalizeKey(e.target.value);
    card.querySelectorAll('[data-row]').forEach((li) => {
      const key = li.dataset.key || '';
      li.classList.toggle('d-none', !!q && !key.includes(q));
    });
  });

  // Nút trên từng dòng + dropdown vai trò (ủy quyền trên danh sách).
  const list = card.querySelector('[data-list]');
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.hasAttribute('data-edit')) startEdit(group, btn.dataset.id);
    else if (btn.hasAttribute('data-del')) handleDelete(group, btn.dataset.id);
    else if (btn.hasAttribute('data-edit-save')) saveEdit(group, btn);
    else if (btn.hasAttribute('data-edit-cancel')) cancelEdit(group);
  });
  list.addEventListener('dblclick', (e) => {
    const span = e.target.closest('[data-name]');
    if (span) startEdit(group, span.closest('[data-row]').dataset.row);
  });
  list.addEventListener('keydown', (e) => {
    if (!e.target.matches('[data-edit-input]')) return;
    if (e.key === 'Enter') saveEdit(group, e.target);
    else if (e.key === 'Escape') cancelEdit(group);
  });
  list.addEventListener('change', (e) => {
    if (e.target.matches('[data-role]')) handleRole(e.target.dataset.id, e.target.value);
  });

  // Nếu đang sửa item thuộc thẻ này → focus ô input.
  if (_editing && _editing.group === group) {
    const inp = card.querySelector('[data-edit-input]');
    if (inp) { inp.focus(); inp.select(); }
  }
}

// ----------------------------------------------------------------------------
//  HANDLER — gọi tầng data rồi cập nhật giao diện.
// ----------------------------------------------------------------------------
async function handleAdd(group, input) {
  const raw = input.value.trim();
  if (!raw) return;
  setLoading(true);
  try {
    const res = await addItem(group, raw);
    if (!res.ok) {
      toast(res.reason === 'duplicate' ? `Đã có "${res.item.name}" trong nhóm.` : 'Tên không hợp lệ.', 'warning');
      return;
    }
    input.value = '';
    refreshCard(group);
    _host.querySelector(`[data-card="${group}"] [data-add-input]`)?.focus();
  } finally {
    setLoading(false);
  }
}

function startEdit(group, id) {
  _editing = { group, id };
  refreshCard(group);
}

function cancelEdit(group) {
  _editing = null;
  refreshCard(group);
}

async function saveEdit(group, fromEl) {
  if (!_editing) return;
  const card = _host.querySelector(`[data-card="${group}"]`);
  const input = card.querySelector('[data-edit-input]');
  const raw = input ? input.value.trim() : '';
  const id = _editing.id;
  if (!raw) { toast('Tên không được để trống.', 'warning'); return; }

  setLoading(true);
  try {
    const res = await renameItem(group, id, raw);
    if (!res.ok) {
      toast(res.reason === 'duplicate' ? `Đã có "${res.item.name}" trong nhóm.` : 'Đổi tên thất bại.', 'warning');
      return;
    }
    _editing = null;
    toast(res.changed > 0 ? `Đã đổi tên + cập nhật ${res.changed} bản ghi liên quan.` : 'Đã đổi tên.', 'success');
    await reload(); // cascade có thể đổi badge "đang dùng" ở nhiều nhóm → vẽ lại tất cả
  } finally {
    setLoading(false);
  }
}

async function handleDelete(group, id) {
  const item = groupItems(group).find((i) => i.id === id);
  if (!item) return;
  if (!(await confirm2(`Xóa "${escapeHtml(item.name)}" khỏi danh mục?`))) return;

  setLoading(true);
  try {
    const res = await deleteItem(group, id);
    if (!res.ok) {
      toast(res.reason === 'inuse'
        ? `Đang dùng ở ${res.count} bản ghi — không thể xóa. Hãy sửa/xóa dữ liệu đó trước.`
        : 'Xóa thất bại.', 'warning');
      return;
    }
    toast('Đã xóa.', 'success');
    refreshCard(group);
  } finally {
    setLoading(false);
  }
}

async function handleRole(id, role) {
  setLoading(true);
  try {
    const res = await setWorkerRole(id, role);
    if (!res.ok) { toast('Đổi vai trò thất bại.', 'warning'); return; }
    toast(res.changed > 0 ? `Đã đổi vai trò + đồng bộ ${res.changed} tuần chấm công.` : 'Đã đổi vai trò.', 'success');
  } finally {
    setLoading(false);
  }
}

// ----------------------------------------------------------------------------
//  ĐĂNG KÝ tab với router.
// ----------------------------------------------------------------------------
registerTab('danhmuc', renderDanhMucTab);
