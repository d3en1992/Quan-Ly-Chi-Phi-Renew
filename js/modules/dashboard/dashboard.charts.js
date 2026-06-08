// ============================================================================
//  modules/dashboard/dashboard.charts.js  —  TẦNG GIAO DIỆN (Layer 6): Biểu đồ
// ----------------------------------------------------------------------------
//  @module dashboard.charts
//
//  Vẽ biểu đồ bằng SVG THUẦN (doc 09 §2,§3 — KHÔNG dùng thư viện chart):
//    • barChart(bars, {stacked}) — cột (chồng lớp cho tuần, đơn cho tháng).
//        Tooltip native qua <title> hiện nhãn + top-3 CT + tổng.
//    • pieChart(slices) — hình tròn tỷ trọng loại chi phí + chú thích %.
//  Mọi hàm trả CHUỖI HTML (SVG width:100% + viewBox → co giãn theo màn hình,
//  hợp mobile 375px). Chuỗi người dùng (loại CP, tên CT) đều escapeHtml.
// ============================================================================

import { formatMoney } from '../../utils/fmt.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Màu lớp chi phí (đồng bộ giữa cột chồng + chú thích).
export const LAYER_COLORS = { invoice: '#0d6efd', labor: '#198754', subcontract: '#fd7e14' };
export const LAYER_LABELS = { invoice: 'Hóa đơn', labor: 'Nhân công', subcontract: 'Thầu phụ' };
const LAYER_ORDER = ['invoice', 'labor', 'subcontract'];

// Bảng màu pie (7 màu, lặp lại nếu nhiều hơn).
const PIE_COLORS = ['#0d6efd', '#198754', '#fd7e14', '#dc3545', '#6f42c1', '#20c997', '#adb5bd'];

// ----------------------------------------------------------------------------
//  barChart(bars, { stacked }) — bars: [{ label, total, layers?, byCT? }].
//    stacked=true → vẽ 3 lớp invoice/labor/subcontract (tuần).
//    stacked=false → 1 cột màu xanh theo total (tháng).
//  byCT (nếu có) → đưa vào tooltip top-3 CT.
// ----------------------------------------------------------------------------
export function barChart(bars, { stacked = false } = {}) {
  if (!bars.length) return emptyBox('Chưa có dữ liệu chi phí.');

  const H = 220, PAD_B = 46, PAD_T = 12, PAD_L = 6, barW = 34, gap = 14;
  const plotH = H - PAD_B - PAD_T;
  const W = PAD_L * 2 + bars.length * (barW + gap);
  const maxVal = Math.max(...bars.map((b) => b.total), 1);
  const y = (v) => PAD_T + plotH * (1 - v / maxVal);

  const cols = bars.map((b, i) => {
    const x = PAD_L + i * (barW + gap) + gap / 2;
    let segs = '';
    if (stacked) {
      let acc = 0;
      for (const k of LAYER_ORDER) {
        const v = Number(b.layers?.[k]) || 0;
        if (v <= 0) continue;
        const h = (plotH * v) / maxVal;
        const yTop = y(acc + v);
        segs += `<rect x="${x}" y="${yTop.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" fill="${LAYER_COLORS[k]}"/>`;
        acc += v;
      }
    } else {
      const h = (plotH * b.total) / maxVal;
      segs += `<rect x="${x}" y="${y(b.total).toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" fill="${LAYER_COLORS.invoice}" rx="2"/>`;
    }

    const top3 = (b.byCT || []).map((c) => `  • ${c.name}: ${formatMoney(c.amount)}`).join('\n');
    const tip = `${b.label}\nTổng: ${formatMoney(b.total)}${top3 ? '\n' + top3 : ''}`;
    const cx = x + barW / 2;
    return `<g><title>${escapeHtml(tip)}</title>${segs}`
      + `<text x="${cx.toFixed(1)}" y="${H - PAD_B + 14}" text-anchor="middle" font-size="9" fill="#6c757d" transform="rotate(35 ${cx.toFixed(1)} ${H - PAD_B + 14})">${escapeHtml(shortLabel(b.label))}</text></g>`;
  }).join('');

  const legend = stacked
    ? LAYER_ORDER.map((k) => `<span class="me-3"><span style="display:inline-block;width:10px;height:10px;background:${LAYER_COLORS[k]};border-radius:2px;"></span> ${LAYER_LABELS[k]}</span>`).join('')
    : '';

  return `
    <div class="overflow-auto">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid meet" style="width:100%;min-width:${Math.min(W, 320)}px;height:${H}px;">
        <line x1="${PAD_L}" y1="${PAD_T + plotH}" x2="${W - PAD_L}" y2="${PAD_T + plotH}" stroke="#dee2e6"/>
        ${cols}
      </svg>
    </div>
    ${legend ? `<div class="small text-muted mt-1">${legend}</div>` : ''}`;
}

// shortLabel(label) — Rút gọn nhãn tuần dài "CN dd/mm → T7 ..." còn "dd/mm".
function shortLabel(label) {
  const m = String(label).match(/(\d{2}\/\d{2})/);
  return m ? m[1] : label;
}

// ----------------------------------------------------------------------------
//  pieChart(slices) — slices: [{ type, value, pct }]. Vẽ tròn bằng path arc +
//  chú thích % bên cạnh. 1 lát duy nhất → vẽ vòng tròn đầy.
// ----------------------------------------------------------------------------
export function pieChart(slices) {
  if (!slices.length) return emptyBox('Chưa có dữ liệu loại chi phí.');

  const cx = 90, cy = 90, r = 80;
  let acc = 0, paths = '';

  if (slices.length === 1) {
    paths = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PIE_COLORS[0]}"/>`;
  } else {
    slices.forEach((s, i) => {
      const a0 = acc * 2 * Math.PI;
      acc += s.pct / 100;
      const a1 = acc * 2 * Math.PI;
      const x0 = cx + r * Math.sin(a0), y0 = cy - r * Math.cos(a0);
      const x1 = cx + r * Math.sin(a1), y1 = cy - r * Math.cos(a1);
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      paths += `<path d="M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z" fill="${PIE_COLORS[i % PIE_COLORS.length]}"><title>${escapeHtml(`${s.type}: ${formatMoney(s.value)} (${s.pct.toFixed(1)}%)`)}</title></path>`;
    });
  }

  const legend = slices.map((s, i) => `
    <div class="d-flex align-items-center small mb-1">
      <span style="display:inline-block;width:11px;height:11px;background:${PIE_COLORS[i % PIE_COLORS.length]};border-radius:2px;" class="me-2"></span>
      <span class="flex-grow-1 text-truncate">${escapeHtml(s.type)}</span>
      <span class="fw-semibold ms-2">${s.pct.toFixed(1)}%</span>
    </div>`).join('');

  return `
    <div class="row g-3 align-items-center">
      <div class="col-auto">
        <svg viewBox="0 0 180 180" style="width:160px;max-width:100%;height:auto;">${paths}</svg>
      </div>
      <div class="col">${legend}</div>
    </div>`;
}

// emptyBox(msg) — Khung "chưa có dữ liệu" gọn, không vỡ layout.
function emptyBox(msg) {
  return `<div class="text-center text-muted small py-4">${escapeHtml(msg)}</div>`;
}
