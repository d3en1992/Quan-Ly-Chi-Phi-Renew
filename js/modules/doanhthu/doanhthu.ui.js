// ============================================================================
//  modules/doanhthu/doanhthu.ui.js  —  TẦNG KHUNG MODULE (Layer 7): vỏ tab Doanh Thu
// ----------------------------------------------------------------------------
//  @module doanhthu.ui
//
//  VỎ ráp tab Doanh Thu (doc 08) — đăng ký hàm vẽ vào router (registerTab) và
//  dựng thanh SUB-TAB điều hướng giữa các màn đã có:
//    • 📋 Khai báo/Thống kê → doanhthu.stats.js (KPI + 3 bảng HĐ chính/Thu/Thầu phụ
//      + nút mở modal khai báo — LỐI VÀO tạo HĐ chính & thầu phụ).
//    • 📈 Công nợ phải thu  → doanhthu.report.js (công nợ Chủ Đầu Tư, có CSV).
//    • 🤝 Công nợ đối tác   → doanhthu.debt.js (thầu phụ + nhà cung cấp).
//
//  Mỗi màn TỰ vẽ vào ô nội dung; bấm đổi sub-tab → render() vẽ lại. Đổi NĂM ở
//  topbar được router xử lý (navigate lại tab) nên giữ nguyên sub-tab đang xem.
// ============================================================================

import { registerTab } from '../../router.js';
import { renderStats } from './doanhthu.stats.js';
import { renderReceivableReport } from './doanhthu.report.js';
import { renderDebt } from './doanhthu.debt.js';

// SUBS — danh sách sub-tab (id + nhãn) theo thứ tự hiển thị.
const SUBS = [
  { id: 'stats',      label: '📋 Khai báo / Thống kê' },
  { id: 'receivable', label: '📈 Công nợ phải thu' },
  { id: 'debt',       label: '🤝 Công nợ đối tác' },
];

let _sub = 'stats';   // sub-tab đang xem (giữ giữa các lần vẽ lại)

// ----------------------------------------------------------------------------
//  render(host) — Dựng thanh sub-tab + vẽ nội dung sub-tab đang chọn.
// ----------------------------------------------------------------------------
async function render(host) {
  host.innerHTML = `
    <ul class="nav nav-tabs mb-3 flex-nowrap overflow-auto">
      ${SUBS.map((s) => `<li class="nav-item">
        <button type="button" class="nav-link text-nowrap${s.id === _sub ? ' active' : ''}" data-sub="${s.id}">${s.label}</button>
      </li>`).join('')}
    </ul>
    <div data-sub-content></div>`;

  const content = host.querySelector('[data-sub-content]');
  host.querySelectorAll('[data-sub]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (_sub === btn.dataset.sub) return;
      _sub = btn.dataset.sub;
      render(host);
    });
  });

  if (_sub === 'receivable') await renderReceivableReport(content);
  else if (_sub === 'debt') await renderDebt(content);
  else await renderStats(content);
}

registerTab('doanhthu', render);
