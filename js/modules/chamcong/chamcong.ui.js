// ============================================================================
//  modules/chamcong/chamcong.ui.js  —  TẦNG GIAO DIỆN (Layer 6): VỎ tab 🗓️ Chấm công
// ----------------------------------------------------------------------------
//  @module chamcong.ui
//
//  Tab "Chấm công" gồm 2 sub-tab → đây là vỏ nhỏ cắm vào router, vẽ thanh sub-tab
//  rồi gọi đúng màn con vào ô nội dung:
//    📝 Sổ chấm công (renderWeek) · 📊 Tổng lương / Lịch sử (renderSalaryHistory).
//
//  P18→P20 xong. Xuất báo cáo (P20, doc 04 §8) KHÔNG là sub-tab riêng: phiếu lương
//  PNG nằm ở bảng "Tổng Lương Tuần" (tick công nhân), các nút CSV nằm ngay trong
//  từng màn (chamcong.report.js là thư viện hàm). Thêm sub-tab chỉ cần khai báo
//  trong SUBS + nối hàm render tương ứng (giống hoadon.ui.js).
// ============================================================================

import { registerTab } from '../../router.js';
import { renderWeek, goToTimesheetWeek } from './chamcong.week.js';
import { renderSalaryHistory } from './chamcong.history.js';

// Danh sách sub-tab (id + nhãn) theo thứ tự hiển thị.
const SUBS = [
  { id: 'week', label: '📝 Sổ chấm công' },
  { id: 'salary', label: '📊 Tổng lương / Lịch sử' },
];

// Sub-tab đang xem — nhớ giữa các lần vẽ lại tab chính (đổi năm/điều hướng).
let _sub = 'week';

// ----------------------------------------------------------------------------
//  render(host) — Vẽ thanh sub-tab + ô nội dung con, rồi gọi màn con tương ứng.
// ----------------------------------------------------------------------------
async function render(host) {
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
      render(host);
    });
  });

  if (_sub === 'week') await renderWeek(content);
  else await renderSalaryHistory(content, { onLoadWeek: openWeek(host) });
}

// openWeek(host) — Trả callback cho Lịch sử: chuyển sang Sổ chấm công rồi nạp tuần.
function openWeek(host) {
  return async (weekId, projectId) => {
    _sub = 'week';
    await render(host);
    await goToTimesheetWeek(weekId, projectId);
  };
}

// Cắm vỏ vào router (tab 🗓️ Chấm công).
registerTab('chamcong', render);
