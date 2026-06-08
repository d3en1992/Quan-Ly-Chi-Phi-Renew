// ============================================================================
//  modules/dashboard/dashboard.cards.js  —  TẦNG GIAO DIỆN (Layer 6): Thẻ & bảng
// ----------------------------------------------------------------------------
//  @module dashboard.cards
//
//  Dựng HTML cho phần KHÔNG phải biểu đồ (doc 09 §2,§4):
//    • kpiCards(kpi, year)        — 3 thẻ (1 năm) / 4 thẻ (nhiều năm).
//    • topProjectsBlock(rows)     — Top CT chi nhiều nhất (thanh tỷ lệ).
//    • advancesBlock(rows)        — Tiền ứng thầu phụ + NCC theo CT.
//    • equipmentBlock(rows)       — Thiết bị theo CT + cờ đỏ khi có TB cần lo.
//  Tất cả trả CHUỖI HTML; chuỗi người dùng (tên CT) đều escapeHtml.
// ============================================================================

import { formatMoney } from '../../utils/fmt.js';
import { getProjectName } from '../projects/projects.data.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// kpiCard(label, value, sub, cls) — 1 thẻ KPI màu (cls = lớp viền/nền Bootstrap).
function kpiCard(label, value, sub, cls) {
  return `
    <div class="col">
      <div class="card border-${cls} border-start border-4 h-100 shadow-sm">
        <div class="card-body py-2 px-3">
          <div class="text-muted small text-uppercase">${escapeHtml(label)}</div>
          <div class="h5 mb-0 fw-bold text-${cls}">${value}</div>
          ${sub ? `<div class="small text-muted text-truncate">${escapeHtml(sub)}</div>` : ''}
        </div>
      </div>
    </div>`;
}

// ----------------------------------------------------------------------------
//  kpiCards(kpi, year) — Hàng thẻ KPI (doc 09 §2). 1 năm → Tổng/Tuần cao nhất/
//  Công trình; nhiều năm → Tổng/TB tháng/HĐ lớn nhất/Công trình.
// ----------------------------------------------------------------------------
export function kpiCards(kpi, year) {
  const cards = [kpiCard(`Tổng Chi Phí${kpi.singleYear ? ' ' + year : ''}`, formatMoney(kpi.totalCost), '', 'warning')];

  if (kpi.singleYear) {
    cards.push(kpiCard('Tuần Chi Cao Nhất',
      kpi.maxWeek ? formatMoney(kpi.maxWeek.total) : '—',
      kpi.maxWeek ? kpi.maxWeek.label : 'Chưa có dữ liệu', 'danger'));
  } else {
    cards.push(kpiCard('TB / Tháng', formatMoney(kpi.avgMonth), 'theo tháng đã phát sinh', 'danger'));
    cards.push(kpiCard('HĐ Lớn Nhất', formatMoney(kpi.biggestInvoice), '', 'info'));
  }

  cards.push(kpiCard('Công Trình', String(kpi.projectCount), 'có phát sinh chi phí', 'success'));

  return `<div class="row row-cols-2 row-cols-lg-4 g-2 mb-3">${cards.join('')}</div>`;
}

// barRow(name, value, max, extra) — 1 dòng có thanh tỷ lệ theo `max`.
function barRow(name, value, max, extra = '') {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `
    <div class="mb-2">
      <div class="d-flex justify-content-between small">
        <span class="text-truncate me-2">${escapeHtml(name)}</span>
        <span class="fw-semibold text-nowrap">${formatMoney(value)}${extra}</span>
      </div>
      <div class="progress" style="height:6px;"><div class="progress-bar" style="width:${pct}%"></div></div>
    </div>`;
}

// blockCard(title, body) — Khung card chung cho các khối chi tiết.
function blockCard(title, body) {
  return `
    <div class="card h-100 shadow-sm">
      <div class="card-header py-2 fw-semibold small">${title}</div>
      <div class="card-body py-2">${body}</div>
    </div>`;
}

function emptyLine(msg) {
  return `<div class="text-center text-muted small py-3">${escapeHtml(msg)}</div>`;
}

// ----------------------------------------------------------------------------
//  topProjectsBlock(rows) — rows: [{ projectId, name, total }] (đã xếp giảm dần).
// ----------------------------------------------------------------------------
export function topProjectsBlock(rows) {
  if (!rows.length) return blockCard('🏆 Top Công Trình Chi Nhiều', emptyLine('Chưa có dữ liệu.'));
  const max = rows[0].total;
  const body = rows.slice(0, 8).map((r) => barRow(r.name, r.total, max)).join('');
  return blockCard('🏆 Top Công Trình Chi Nhiều', body);
}

// ----------------------------------------------------------------------------
//  advancesBlock(rows) — rows: [{ projectId, sub, sup, total }].
// ----------------------------------------------------------------------------
export function advancesBlock(rows) {
  if (!rows.length) return blockCard('💸 Tiền Ứng Theo Công Trình', emptyLine('Chưa có tiền ứng.'));
  const max = rows[0].total;
  const body = rows.slice(0, 8).map((r) =>
    barRow(getProjectName(r.projectId), r.total, max,
      ` <span class="text-muted">(TP ${formatMoney(r.sub)} · NCC ${formatMoney(r.sup)})</span>`)).join('');
  return blockCard('💸 Tiền Ứng Theo Công Trình', body);
}

// ----------------------------------------------------------------------------
//  equipmentBlock(rows) — rows: [{ projectId, totalQty, needQty, typeCount }].
//  needQty>0 → cờ đỏ cảnh báo có TB cần bảo trì/sửa chữa.
// ----------------------------------------------------------------------------
export function equipmentBlock(rows) {
  if (!rows.length) return blockCard('🔧 Thiết Bị Theo Công Trình', emptyLine('Chưa có thiết bị ở công trình.'));
  const body = rows.slice(0, 8).map((r) => {
    const warn = r.needQty > 0
      ? `<span class="badge bg-danger ms-1" title="Thiết bị cần bảo trì / sửa chữa">⚠ ${r.needQty}</span>` : '';
    return `
      <div class="d-flex justify-content-between align-items-center small mb-2">
        <span class="text-truncate me-2">${escapeHtml(getProjectName(r.projectId))}</span>
        <span class="text-nowrap">${r.totalQty} cái · ${r.typeCount} loại${warn}</span>
      </div>`;
  }).join('');
  return blockCard('🔧 Thiết Bị Theo Công Trình', body);
}
