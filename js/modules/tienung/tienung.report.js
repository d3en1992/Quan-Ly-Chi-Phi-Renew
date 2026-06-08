// ============================================================================
//  modules/tienung/tienung.report.js  —  TẦNG GIAO DIỆN (Layer 6): Xuất Tiền ứng
// ----------------------------------------------------------------------------
//  @module tienung.report
//
//  Xuất dữ liệu tab Tiền Ứng (doc 05 §4). Là THƯ VIỆN hàm (không có màn riêng) —
//  bảng lịch sử (tienung.list.js) gọi vào:
//    • exportAdvancesCsv({ typeLabel, rows, fileTag })  → CSV tập đang lọc.
//    • exportAdvanceSlip({ groups, periodText, fileTag }) → PHIẾU CHI tạm ứng PNG
//      (gom theo đối tác để cộng dồn, tiện gửi nhanh qua Zalo).
//  CSV dùng UTF-8 BOM + CRLF để Excel đọc tiếng Việt đúng.
// ============================================================================

import { toast, setLoading } from '../../utils/ui.js';
import { formatMoney } from '../../utils/fmt.js';

const HTML2CANVAS_SRC = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';

const num = (x) => Number(x) || 0;
const money = (v) => formatMoney(num(v));

// esc(s) — chống vỡ HTML khi đổ chuỗi người dùng vào template phiếu chi.
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ----------------------------------------------------------------------------
//  removeVietnameseTones(s) — Bỏ dấu tiếng Việt NHƯNG GIỮ HOA/THƯỜNG (đặt tên file).
// ----------------------------------------------------------------------------
export function removeVietnameseTones(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// ----------------------------------------------------------------------------
//  TIỆN ÍCH CHUNG — bọc ô CSV + tải file (BOM UTF-8, ngắt dòng CRLF cho Excel).
// ----------------------------------------------------------------------------
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, rows) {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(filename, blob);
}

// triggerDownload(filename, blob) — Tạo <a download> tạm rồi click để tải về.
function triggerDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// today2() — ddmmyy cho tên file.
function today2() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0')
    + String(d.getMonth() + 1).padStart(2, '0')
    + String(d.getFullYear()).slice(2);
}

// ----------------------------------------------------------------------------
//  exportAdvancesCsv({ typeLabel, rows, fileTag }) — CSV tập tiền ứng đang lọc.
//   rows = mảng { date, partner, projectName, note, amount }.
// ----------------------------------------------------------------------------
export function exportAdvancesCsv({ typeLabel = '', rows = [], fileTag = '' } = {}) {
  if (!rows.length) { toast('Không có dữ liệu để xuất.', 'warning'); return; }
  const head = ['#', 'Ngày', 'Đối tác', 'Công trình', 'Nội dung', 'Số tiền'];
  const body = rows.map((r, i) =>
    [i + 1, r.date || '', r.partner || '', r.projectName || '', r.note || '', money(r.amount)]);
  const total = rows.reduce((s, r) => s + num(r.amount), 0);
  body.push(['', '', '', '', 'TỔNG', money(total)]);
  const tag = removeVietnameseTones(fileTag || typeLabel) || 'TienUng';
  downloadCsv(`TienUng_${tag}_${today2()}.csv`, [head, ...body]);
  toast(`⬇️ Đã xuất CSV ${typeLabel}.`, 'success');
}

// ----------------------------------------------------------------------------
//  ensureHtml2Canvas() — Nạp thư viện html2canvas từ CDN 1 lần (offline thì lỗi rõ).
// ----------------------------------------------------------------------------
function ensureHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HTML2CANVAS_SRC;
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => reject(new Error('Không tải được html2canvas (cần mạng).'));
    document.head.appendChild(s);
  });
}

// groupSection(g) — 1 khối phiếu cho 1 đối tác (các dòng + dòng cộng dồn).
function groupSection(g) {
  const rows = g.items.map((it, i) => `
    <tr>
      <td style="border:1px solid #999;padding:6px;text-align:center">${i + 1}</td>
      <td style="border:1px solid #999;padding:6px;white-space:nowrap">${esc(it.date)}</td>
      <td style="border:1px solid #999;padding:6px">${esc(it.projectName)}</td>
      <td style="border:1px solid #999;padding:6px">${esc(it.note)}</td>
      <td style="border:1px solid #999;padding:6px;text-align:right">${money(it.amount)}</td>
    </tr>`).join('');
  return `
    <p style="margin:14px 0 4px;font-weight:700">Đối tác: ${esc(g.partner)}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr style="background:#f0f0f0">
        <th style="border:1px solid #999;padding:6px">#</th>
        <th style="border:1px solid #999;padding:6px">Ngày</th>
        <th style="border:1px solid #999;padding:6px">Công trình</th>
        <th style="border:1px solid #999;padding:6px">Nội dung</th>
        <th style="border:1px solid #999;padding:6px">Số tiền</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="background:#f7f7f7;font-weight:700">
        <td style="border:1px solid #999;padding:6px;text-align:right" colspan="4">Cộng dồn ${esc(g.partner)}</td>
        <td style="border:1px solid #999;padding:6px;text-align:right">${money(g.total)}</td>
      </tr></tfoot>
    </table>`;
}

// ----------------------------------------------------------------------------
//  exportAdvanceSlip({ groups, periodText, fileTag }) — PHIẾU CHI tạm ứng PNG.
//   groups = [{ partner, items:[{date,projectName,note,amount}], total }] (gom theo đối tác).
// ----------------------------------------------------------------------------
export async function exportAdvanceSlip({ groups = [], periodText = '', fileTag = '' } = {}) {
  if (!groups.length) { toast('Chưa chọn khoản ứng nào.', 'warning'); return; }

  const grand = groups.reduce((s, g) => s + num(g.total), 0);
  const tpl = document.createElement('div');
  tpl.style.cssText = 'position:fixed;left:-99999px;top:0;width:900px;background:#fff;'
    + 'padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111;';
  tpl.innerHTML = `
    <h2 style="text-align:center;margin:0 0 4px">PHIẾU CHI TẠM ỨNG</h2>
    ${periodText ? `<p style="text-align:center;margin:0 0 10px">${esc(periodText)}</p>` : ''}
    ${groups.map(groupSection).join('')}
    <p style="margin:16px 0 0;text-align:right;font-size:16px;font-weight:700">
      TỔNG CHI: ${money(grand)}</p>
    <p style="margin-top:16px;font-size:12px;color:#666">Xuất lúc ${new Date().toLocaleString('vi-VN')}</p>`;

  setLoading(true, 'Đang tạo phiếu ứng…');
  document.body.appendChild(tpl);
  try {
    const h2c = await ensureHtml2Canvas();
    const canvas = await h2c(tpl, { scale: 2, backgroundColor: '#ffffff' });
    await new Promise((resolve) => canvas.toBlob((blob) => {
      const k = Math.round(grand / 1000);
      const tag = removeVietnameseTones(fileTag
        || (groups.length === 1 ? groups[0].partner : `${groups.length}doitac`));
      triggerDownload(`Phieuung_${today2()}_${tag}_${k}k.png`, blob);
      resolve();
    }, 'image/png'));
    toast('📸 Đã xuất phiếu ứng PNG.', 'success');
  } catch (e) {
    toast(e.message || 'Xuất phiếu ứng thất bại.', 'danger');
  } finally {
    tpl.remove();
    setLoading(false);
  }
}
