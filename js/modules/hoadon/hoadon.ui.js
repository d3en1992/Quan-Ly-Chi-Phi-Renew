// ============================================================================
//  modules/hoadon/hoadon.ui.js  —  TẦNG GIAO DIỆN (Layer 6): VỎ tab 🧾 Hóa đơn
// ----------------------------------------------------------------------------
//  @module hoadon.ui
//
//  Tab "Hóa đơn" gồm 4 sub-tab → đây là vỏ nhỏ cắm vào router, vẽ thanh sub-tab
//  rồi gọi đúng màn con vào ô nội dung:
//    ⚡ Nhập nhanh (renderQuick) · 📋 Hóa đơn chi tiết (renderDetail)
//    📑 Danh sách (renderList)  · 🗑 Thùng rác (renderTrash)
//
//  SỬA CHÉO: từ "Danh sách" bấm ✏️ → editInvoice(inv) tự chuyển sang đúng form
//  nhập (quick/detail theo source) và đổ dữ liệu cũ lên (openQuickEdit/openDetailEdit).
// ============================================================================

import { registerTab } from '../../router.js';
import { renderQuick, openQuickEdit } from './hoadon.quick.js';
import { renderDetail, openDetailEdit } from './hoadon.detail.js';
import { renderList } from './hoadon.list.js';
import { renderTrash } from './hoadon.trash.js';

// Danh sách sub-tab (id + nhãn) theo thứ tự hiển thị.
const SUBS = [
  { id: 'quick', label: '⚡ Nhập nhanh' },
  { id: 'detail', label: '📋 Hóa đơn chi tiết' },
  { id: 'list', label: '📑 Danh sách' },
  { id: 'trash', label: '🗑 Thùng rác' },
];

// Sub-tab đang xem — nhớ giữa các lần vẽ lại tab chính (đổi năm/điều hướng).
let _sub = 'quick';
let _host = null;

// ----------------------------------------------------------------------------
//  render(host) — Vẽ thanh sub-tab + ô nội dung con, rồi gọi màn con tương ứng.
// ----------------------------------------------------------------------------
async function render(host) {
  _host = host;
  host.innerHTML = `
    <ul class="nav nav-tabs mb-3 flex-nowrap overflow-auto">
      ${SUBS.map((s) => `
        <li class="nav-item">
          <button type="button" class="nav-link text-nowrap${s.id === _sub ? ' active' : ''}" data-sub="${s.id}">${s.label}</button>
        </li>`).join('')}
    </ul>
    <div data-sub-content></div>`;

  const content = host.querySelector('[data-sub-content]');
  host.querySelectorAll('[data-sub]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (_sub === btn.dataset.sub) return;
      _sub = btn.dataset.sub;
      render(host);                 // vẽ lại để tô đúng nút + dựng lại màn con
    });
  });

  if (_sub === 'detail') await renderDetail(content);
  else if (_sub === 'list') await renderList(content, { onEdit: editInvoice });
  else if (_sub === 'trash') await renderTrash(content);
  else await renderQuick(content);
}

// ----------------------------------------------------------------------------
//  editInvoice(inv) — Chuyển sang đúng sub-tab nhập theo nguồn rồi nạp HĐ để sửa.
// ----------------------------------------------------------------------------
async function editInvoice(inv) {
  _sub = inv.source === 'detail' ? 'detail' : 'quick';
  await render(_host);              // dựng lại form nhập tương ứng
  if (_sub === 'detail') await openDetailEdit(inv.id);
  else await openQuickEdit(inv.id);
}

// Cắm vỏ vào router (tab 🧾 Hóa đơn).
registerTab('hoadon', render);
