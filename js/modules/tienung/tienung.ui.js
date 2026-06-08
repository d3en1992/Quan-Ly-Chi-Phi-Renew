// ============================================================================
//  modules/tienung/tienung.ui.js  —  TẦNG GIAO DIỆN (Layer 6): VỎ tab 💵 Tiền ứng
// ----------------------------------------------------------------------------
//  @module tienung.ui
//
//  Tab "Tiền ứng" gồm 2 sub-tab → vỏ nhỏ cắm vào router, vẽ thanh sub-tab rồi gọi
//  đúng màn con vào ô nội dung:
//    📝 Nhập tiền ứng (renderEntry) · 📜 Lịch sử (renderList — 2 bảng Thầu phụ/NCC).
//
//  SỬA CHÉO: từ "Lịch sử" bấm ✏️ → editAdvanceFromList(rec) chuyển sang sub-tab Nhập
//  rồi nạp khoản ứng lên form (editAdvance).
// ============================================================================

import { registerTab } from '../../router.js';
import { renderEntry, editAdvance } from './tienung.form.js';
import { renderList } from './tienung.list.js';

// Danh sách sub-tab (id + nhãn) theo thứ tự hiển thị.
const SUBS = [
  { id: 'entry', label: '📝 Nhập tiền ứng' },
  { id: 'history', label: '📜 Lịch sử' },
];

// Sub-tab đang xem — nhớ giữa các lần vẽ lại tab chính (đổi năm/điều hướng).
let _sub = 'entry';
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

  if (_sub === 'history') await renderList(content, { onEdit: editAdvanceFromList });
  else await renderEntry(content);
}

// ----------------------------------------------------------------------------
//  editAdvanceFromList(rec) — Chuyển sang sub-tab Nhập rồi nạp khoản ứng để sửa.
// ----------------------------------------------------------------------------
async function editAdvanceFromList(rec) {
  _sub = 'entry';
  await render(_host);              // dựng lại form nhập
  editAdvance(rec);                 // nạp 1 dòng + đổi nút sang "Cập nhật"
}

// Cắm vỏ vào router (tab 💵 Tiền ứng).
registerTab('tienung', render);
