// ============================================================================
//  modules/nhapxuat/nhapxuat.export.js  —  TẦNG TỔNG HỢP (Layer 7): Xuất dữ liệu
// ----------------------------------------------------------------------------
//  @module nhapxuat.export
//
//  NHIỆM VỤ: Xuất TOÀN BỘ dữ liệu app ra file để sao lưu / xem ngoài Excel.
//    • exportJsonBackup() — gom cả 10 kho → 1 file .json đầy đủ, NHẬP LẠI ĐƯỢC
//      (P31 import sẽ đọc đúng cấu trúc này). File nằm trên máy người dùng nên
//      GIỮ NGUYÊN cả `users` (kể cả mật khẩu) để khôi phục trung thực — khác với
//      đẩy lên cloud (cloud luôn stripPassword).
//    • exportExcel() — gộp mọi kho vào 1 file CSV (UTF-8 BOM + CRLF) để Excel mở
//      đọc tiếng Việt đúng. KHÔNG dùng thư viện XLSX (đồng nhất toàn app, chạy
//      offline). Mỗi kho là 1 mục: dòng tiêu đề + hàng header + các hàng dữ liệu.
//    • mountExportButtons(host) — gắn 2 nút bấm để test/dùng tạm (P31 sẽ gộp vào
//      tab "💾 Sao lưu" cùng Import + Backup).
//
//  Mọi kho lưu nguyên cục trong IndexedDB (xem core/store.js): 9 kho dạng MẢNG
//  bản ghi, riêng `categories` dạng ĐỐI TƯỢNG { nhóm: [item,...] }.
// ============================================================================

import { STORE } from '../../core/db.js';
import { load } from '../../core/store.js';
import { toast, setLoading } from '../../utils/ui.js';

// Thứ tự kho khi xuất (đọc dễ: nền trước, giao dịch sau, tài khoản cuối).
const EXPORT_ORDER = [
  STORE.PROJECTS, STORE.CONTRACTS, STORE.SUBCONTRACTS, STORE.RECEIPTS,
  STORE.INVOICES, STORE.TIMESHEETS, STORE.ADVANCES, STORE.EQUIPMENT,
  STORE.CATEGORIES, STORE.USERS,
];

// Nhãn tiếng Việt cho từng kho (hiện ở tiêu đề mục CSV).
const STORE_LABEL = {
  projects: 'Công trình', contracts: 'Hợp đồng chính', subcontracts: 'Hợp đồng thầu phụ',
  receipts: 'Đợt thu tiền', invoices: 'Hóa đơn', timesheets: 'Chấm công',
  advances: 'Tiền ứng', equipment: 'Thiết bị', categories: 'Danh mục', users: 'Tài khoản',
};

// ----------------------------------------------------------------------------
//  TIỆN ÍCH CHUNG
// ----------------------------------------------------------------------------
// pad2(n) — số 2 chữ số (07, 11) cho mốc thời gian.
function pad2(n) { return String(n).padStart(2, '0'); }

// stamp() — YYYYMMDD_HHmm cho tên file (sắp xếp theo thời gian được).
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
    + `_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
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
//  gatherAll() — Đọc song song cả 10 kho, trả { storeName: dữ liệu }.
//  categories fallback {} (đối tượng), còn lại fallback [] (mảng bản ghi).
// ----------------------------------------------------------------------------
export async function gatherAll() {
  const out = {};
  await Promise.all(EXPORT_ORDER.map(async (name) => {
    out[name] = await load(name, name === STORE.CATEGORIES ? {} : []);
  }));
  return out;
}

// countRecords(data) — Đếm tổng số bản ghi để ghi vào meta (categories cộng theo nhóm).
function countRecords(data) {
  let n = 0;
  for (const name of EXPORT_ORDER) {
    const v = data[name];
    if (Array.isArray(v)) n += v.length;
    else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) if (Array.isArray(v[k])) n += v[k].length;
    }
  }
  return n;
}

// ----------------------------------------------------------------------------
//  exportJsonBackup() — Sao lưu ĐẦY ĐỦ ra file JSON (nhập lại được ở P31).
//  Cấu trúc: { meta:{...}, data:{ projects:[...], ..., categories:{...} } }.
// ----------------------------------------------------------------------------
export async function exportJsonBackup() {
  setLoading(true, 'Đang gom dữ liệu…');
  try {
    const data = await gatherAll();
    const payload = {
      meta: {
        app: 'cpct',                 // mã app — P31 dùng để nhận diện file đúng
        schema: 1,                   // phiên bản cấu trúc (đề phòng đổi sau này)
        exportedAt: new Date().toISOString(),
        stores: EXPORT_ORDER,
        records: countRecords(data),
      },
      data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    triggerDownload(`cpct_backup_${stamp()}.json`, blob);
    toast(`💾 Đã xuất sao lưu (${payload.meta.records} bản ghi).`, 'success');
    return payload;
  } catch (e) {
    toast('⚠ Lỗi khi xuất sao lưu.', 'error');
    throw e;
  } finally {
    setLoading(false);
  }
}

// ----------------------------------------------------------------------------
//  CSV — bọc 1 ô (escape dấu " , xuống dòng theo chuẩn RFC 4180).
// ----------------------------------------------------------------------------
function csvCell(v) {
  let s;
  if (v == null) s = '';
  else if (typeof v === 'object') s = JSON.stringify(v); // mảng/đối tượng lồng → chuỗi JSON
  else s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ----------------------------------------------------------------------------
//  tableFromRecords(records) — Đổi 1 mảng bản ghi thành { header, rows }.
//  header = HỢP các khóa xuất hiện ở mọi bản ghi (giữ thứ tự gặp lần đầu).
// ----------------------------------------------------------------------------
function tableFromRecords(records) {
  const header = [];
  const seen = new Set();
  for (const r of records) {
    for (const k of Object.keys(r || {})) {
      if (!seen.has(k)) { seen.add(k); header.push(k); }
    }
  }
  const rows = records.map((r) => header.map((k) => (r ? r[k] : '')));
  return { header, rows };
}

// ----------------------------------------------------------------------------
//  sectionsFor(name, value) — Trả các mục [{ title, header, rows }] của 1 kho.
//   - Kho dạng MẢNG → 1 mục.
//   - categories (ĐỐI TƯỢNG) → mỗi nhóm 1 mục con "Danh mục — <nhóm>".
// ----------------------------------------------------------------------------
function sectionsFor(name, value) {
  const label = STORE_LABEL[name] || name;
  if (Array.isArray(value)) {
    const { header, rows } = tableFromRecords(value);
    return [{ title: `${label} (${name}) — ${value.length} dòng`, header, rows }];
  }
  // categories: { costType:[...], supplier:[...], ... }
  const out = [];
  for (const group of Object.keys(value || {})) {
    const arr = Array.isArray(value[group]) ? value[group] : [];
    const { header, rows } = tableFromRecords(arr);
    out.push({ title: `${label} — ${group} (${arr.length} mục)`, header, rows });
  }
  if (!out.length) out.push({ title: `${label} (${name}) — trống`, header: [], rows: [] });
  return out;
}

// ----------------------------------------------------------------------------
//  exportExcel() — Gộp mọi kho vào 1 file CSV (UTF-8 BOM + CRLF cho Excel).
//  Mỗi mục: [tiêu đề] · [hàng header] · [dữ liệu] · [dòng trống ngăn cách].
// ----------------------------------------------------------------------------
export async function exportExcel() {
  setLoading(true, 'Đang dựng bảng…');
  try {
    const data = await gatherAll();
    const lines = [];
    lines.push([`SAO LƯU APP CHI PHÍ CÔNG TRÌNH — ${new Date().toLocaleString('vi-VN')}`]);
    lines.push([]);

    for (const name of EXPORT_ORDER) {
      for (const sec of sectionsFor(name, data[name])) {
        lines.push([sec.title]);
        if (sec.header.length) lines.push(sec.header);
        for (const row of sec.rows) lines.push(row);
        lines.push([]); // dòng trống ngăn mục
      }
    }

    const body = lines.map((cols) => cols.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(`cpct_export_${stamp()}.csv`, blob);
    toast('⬇️ Đã xuất CSV toàn bộ dữ liệu.', 'success');
  } catch (e) {
    toast('⚠ Lỗi khi xuất CSV.', 'error');
    throw e;
  } finally {
    setLoading(false);
  }
}

// ----------------------------------------------------------------------------
//  mountExportButtons(host) — Gắn 2 nút Xuất vào `host` (tạm, để test P30).
//  P31 sẽ gộp vào tab "💾 Sao lưu" cùng Import + Backup.
// ----------------------------------------------------------------------------
export function mountExportButtons(host) {
  if (!host) return;
  host.innerHTML = `
    <div class="d-flex flex-wrap gap-2">
      <button type="button" class="btn btn-success btn-sm" data-export-json>
        💾 Xuất sao lưu (JSON)
      </button>
      <button type="button" class="btn btn-outline-success btn-sm" data-export-csv>
        ⬇️ Xuất CSV (Excel)
      </button>
    </div>`;
  host.querySelector('[data-export-json]').addEventListener('click', () => exportJsonBackup());
  host.querySelector('[data-export-csv]').addEventListener('click', () => exportExcel());
}
