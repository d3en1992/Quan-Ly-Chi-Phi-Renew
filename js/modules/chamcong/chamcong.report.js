// ============================================================================
//  modules/chamcong/chamcong.report.js  —  TẦNG GIAO DIỆN (Layer 6): Xuất báo cáo
// ----------------------------------------------------------------------------
//  @module chamcong.report
//
//  THÀNH PHẦN 4 (doc 04 §8): xuất PHIẾU LƯƠNG (ảnh PNG) + 3 kiểu CSV. Đây là
//  THƯ VIỆN hàm (không có màn riêng) — các màn khác gọi vào:
//    • exportSalarySlip(payload)  → render template ẩn rồi html2canvas → tải PNG.
//    • exportTltCsv(payload)      → CSV bảng Tổng Lương Tuần (chamcong.salary.js).
//    • exportHistoryCsv(payload)  → CSV bảng Lịch Sử (chamcong.history.js).
//    • exportWeekCsv(payload)     → CSV tuần đang mở trên form (chamcong.week.js).
//  Mọi CSV đều UTF-8 BOM để Excel đọc tiếng Việt đúng.
// ============================================================================

import { toast, setLoading } from '../../utils/ui.js';
import { formatMoney, formatNumber } from '../../utils/fmt.js';

const HTML2CANVAS_SRC = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';

const num = (x) => Number(x) || 0;
const money = (v) => formatMoney(num(v));
const dayNum = (v) => (num(v) ? formatNumber(v) : '');

// esc(s) — chống vỡ HTML khi đổ chuỗi người dùng vào template phiếu lương.
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
//  TIỆN ÍCH CSV — bọc ô + ghép + tải file (BOM UTF-8, ngắt dòng CRLF cho Excel).
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

// ----------------------------------------------------------------------------
//  exportTltCsv({ list, single, dayNames, weekText }) — CSV bảng Tổng Lương Tuần.
//  list = mảng đã gom theo công nhân (xem chamcong.salary.js aggregate()).
// ----------------------------------------------------------------------------
export function exportTltCsv({ list = [], single = false, dayNames = [], weekText = '' } = {}) {
  if (!list.length) { toast('Không có dữ liệu để xuất.', 'warning'); return; }
  const head = ['#', 'Tên công nhân', ...dayNames, 'TC', 'TC Lương', 'TB/ngày', 'Công trình'];
  if (single) head.push('Trừ Nợ', 'Thực Lãnh');
  const rows = [head];
  list.forEach((a, i) => {
    const r = [i + 1, a.name, ...a.days.map(dayNum),
      formatNumber(a.td), money(num(a.pay) + num(a.allow)),
      money(a.td ? a.pay / a.td : 0), a.projNames || ''];
    if (single) r.push(money(a.ded), money(a.take));
    rows.push(r);
  });
  const tag = weekText ? removeVietnameseTones(weekText) : 'TatCaTuan';
  downloadCsv(`TongLuongTuan_${tag}.csv`, rows);
  toast('⬇️ Đã xuất CSV Tổng lương tuần.', 'success');
}

// ----------------------------------------------------------------------------
//  exportHistoryCsv({ list, dayNames }) — CSV bảng Lịch Sử (mỗi dòng = 1 tuần×CT).
//  list = mảng { label, projName, days[7], td, avg, pay, allow, retail, note, take }.
// ----------------------------------------------------------------------------
export function exportHistoryCsv({ list = [], dayNames = [] } = {}) {
  if (!list.length) { toast('Không có dữ liệu để xuất.', 'warning'); return; }
  const head = ['Kỳ tuần', 'Công trình', ...dayNames, 'TC', 'TB/ngày',
    'Tổng lương', 'Phụ cấp', 'HĐ lẻ', 'Nội dung', 'Tổng cộng'];
  const rows = [head];
  for (const r of list) {
    rows.push([r.label, r.projName, ...r.days.map(dayNum), formatNumber(r.td),
      money(r.avg), money(r.pay), money(r.allow), money(r.retail), r.note || '', money(r.take)]);
  }
  downloadCsv(`LichSuChamCong_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  toast('⬇️ Đã xuất CSV Lịch sử.', 'success');
}

// ----------------------------------------------------------------------------
//  exportWeekCsv({ projectName, weekText, workers, dayNames }) — CSV tuần đang mở.
//  workers = _model trên form; mỗi dòng 1 công nhân + nhóm nợ.
// ----------------------------------------------------------------------------
export function exportWeekCsv({ projectName = '', weekText = '', workers = [], dayNames = [] } = {}) {
  const list = workers.filter((w) => w.name || (w.days || []).some((d) => num(d) > 0));
  if (!list.length) { toast('Không có công nhân để xuất.', 'warning'); return; }
  const rows = [[`Công trình: ${projectName}`], [`Kỳ tuần: ${weekText}`], []];
  rows.push(['#', 'Tên công nhân', 'T/P', ...dayNames, 'TC', 'Lương/ngày', 'Tổng lương',
    'Phụ cấp', 'HĐ lẻ', 'Nội dung', 'Nợ cũ', 'Vay mới', 'Trừ nợ', 'Thực lãnh']);
  list.forEach((w, i) => {
    const td = round1((w.days || []).reduce((s, d) => s + num(d), 0));
    const pay = td * num(w.wage);
    const take = pay + num(w.allowance) + num(w.loanAmount) + num(w.retailInvoice) - num(w.deduction);
    rows.push([i + 1, w.name || '', w.role || '', ...(w.days || []).map(dayNum),
      formatNumber(td), money(w.wage), money(pay), money(w.allowance), money(w.retailInvoice),
      w.note || '', money(w.debtBefore), money(w.loanAmount), money(w.deduction), money(take)]);
  });
  const tag = removeVietnameseTones(`${weekText}_${projectName}`);
  downloadCsv(`Tuan_${tag}.csv`, rows);
  toast('⬇️ Đã xuất CSV tuần.', 'success');
}

const round1 = (n) => Math.round(n * 10) / 10;

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

// ----------------------------------------------------------------------------
//  exportSalarySlip({ periodText, projNames, workers, fileTag }) — Phiếu lương PNG.
//  workers = mảng { name, td, avg, allow, payTotal, retail, ded, loan, debtNow, take }.
// ----------------------------------------------------------------------------
export async function exportSalarySlip({ periodText = '', projNames = '', workers = [], fileTag = '' } = {}) {
  if (!workers.length) { toast('Chưa chọn công nhân nào.', 'warning'); return; }

  const sum = (k) => workers.reduce((s, w) => s + num(w[k]), 0);
  const rowsHtml = workers.map((w, i) => `
    <tr>
      <td style="border:1px solid #999;padding:6px;text-align:center">${i + 1}</td>
      <td style="border:1px solid #999;padding:6px;white-space:nowrap">${esc(w.name)}</td>
      <td style="border:1px solid #999;padding:6px;text-align:center">${formatNumber(w.td)}</td>
      <td style="border:1px solid #999;padding:6px;text-align:right">${money(w.avg)}</td>
      <td style="border:1px solid #999;padding:6px;text-align:right">${money(w.allow)}</td>
      <td style="border:1px solid #999;padding:6px;text-align:right">${money(w.payTotal)}</td>
      <td style="border:1px solid #999;padding:6px;text-align:right">${money(w.retail)}</td>
      <td style="border:1px solid #999;padding:6px;text-align:right">${money(w.loan)}</td>
      <td style="border:1px solid #999;padding:6px;text-align:right">${money(w.ded)}</td>
      <td style="border:1px solid #999;padding:6px;text-align:right">${money(w.debtNow)}</td>
      <td style="border:1px solid #999;padding:6px;text-align:right;font-weight:700${num(w.take) < 0 ? ';color:#c00' : ''}">${money(w.take)}</td>
    </tr>`).join('');

  const tpl = document.createElement('div');
  tpl.style.cssText = 'position:fixed;left:-99999px;top:0;width:1100px;background:#fff;'
    + 'padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111;';
  tpl.innerHTML = `
    <h2 style="text-align:center;margin:0 0 4px">PHIẾU LƯƠNG</h2>
    <p style="text-align:center;margin:0 0 2px">Kỳ lương: <b>${esc(periodText)}</b></p>
    <p style="text-align:center;margin:0 0 14px">Công trình: ${esc(projNames)}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead>
        <tr style="background:#f0f0f0">
          <th style="border:1px solid #999;padding:6px">#</th>
          <th style="border:1px solid #999;padding:6px">Tên công nhân</th>
          <th style="border:1px solid #999;padding:6px">TC</th>
          <th style="border:1px solid #999;padding:6px">Lương TB</th>
          <th style="border:1px solid #999;padding:6px">Phụ cấp</th>
          <th style="border:1px solid #999;padding:6px">Tổng thanh toán</th>
          <th style="border:1px solid #999;padding:6px">HĐ mua lẻ</th>
          <th style="border:1px solid #999;padding:6px">Vay mới</th>
          <th style="border:1px solid #999;padding:6px">Trừ nợ</th>
          <th style="border:1px solid #999;padding:6px">Nợ hiện tại</th>
          <th style="border:1px solid #999;padding:6px">THỰC LÃNH</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr style="background:#f7f7f7;font-weight:700">
          <td style="border:1px solid #999;padding:6px;text-align:center" colspan="2">TỔNG (${workers.length})</td>
          <td style="border:1px solid #999;padding:6px;text-align:center">${formatNumber(sum('td'))}</td>
          <td style="border:1px solid #999;padding:6px"></td>
          <td style="border:1px solid #999;padding:6px;text-align:right">${money(sum('allow'))}</td>
          <td style="border:1px solid #999;padding:6px;text-align:right">${money(sum('payTotal'))}</td>
          <td style="border:1px solid #999;padding:6px;text-align:right">${money(sum('retail'))}</td>
          <td style="border:1px solid #999;padding:6px;text-align:right">${money(sum('loan'))}</td>
          <td style="border:1px solid #999;padding:6px;text-align:right">${money(sum('ded'))}</td>
          <td style="border:1px solid #999;padding:6px;text-align:right">${money(sum('debtNow'))}</td>
          <td style="border:1px solid #999;padding:6px;text-align:right">${money(sum('take'))}</td>
        </tr>
      </tfoot>
    </table>
    <p style="margin-top:16px;font-size:12px;color:#666">Xuất lúc ${new Date().toLocaleString('vi-VN')}</p>`;

  setLoading(true, 'Đang tạo phiếu lương…');
  document.body.appendChild(tpl);
  try {
    const h2c = await ensureHtml2Canvas();
    const canvas = await h2c(tpl, { scale: 2, backgroundColor: '#ffffff' });
    await new Promise((resolve) => canvas.toBlob((blob) => {
      const dd = String(new Date().getDate()).padStart(2, '0');
      const mm = String(new Date().getMonth() + 1).padStart(2, '0');
      const yy = String(new Date().getFullYear()).slice(2);
      const name = `Phieuluong_${dd}${mm}${yy}_${workers.length}c_${removeVietnameseTones(fileTag || projNames)}.png`;
      triggerDownload(name, blob);
      resolve();
    }, 'image/png'));
    toast('🧾 Đã xuất phiếu lương PNG.', 'success');
  } catch (e) {
    toast(e.message || 'Xuất phiếu lương thất bại.', 'danger');
  } finally {
    tpl.remove();
    setLoading(false);
  }
}
