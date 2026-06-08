// ============================================================================
//  modules/chamcong/chamcong.grid.js  —  TẦNG GIAO DIỆN (Layer 6): Lưới nhập tuần
// ----------------------------------------------------------------------------
//  @module chamcong.grid
//
//  LƯỚI nhập công nhân chuyên dụng cho Sổ Chấm Công (doc 04 §5). Khác sheet-grid
//  dùng chung ở chỗ có nhiều CỘT TÍNH (TC / Tổng Lương / Nợ Cũ / Thực Lãnh) cập
//  nhật phản ứng, ô ngày tô màu, NHÓM CỘT NỢ thu/mở (▶/◀) và DÒNG TỔNG cuối bảng.
//
//  KHÔNG đụng DB. Nhận `model` (mảng worker object) làm NGUỒN SỰ THẬT — mọi thao
//  tác gõ sửa thẳng vào object trong model; phần nghiệp vụ (validate tên, nợ cũ,
//  lưu) do chamcong.week.js cung cấp qua callback. Trả "tay cầm" để week điều khiển.
// ============================================================================

import { totalDays, laborPay, takeHome } from './chamcong.calc.js';
import { attachAutocomplete } from '../../utils/autocomplete.js';
import { formatMoney, parseMoney } from '../../utils/fmt.js';

// Tên 7 ngày trong tuần (index 0=CN…6=T7) — dùng dựng cột động khi thiếu nhãn.
const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
// Các trường TIỀN (dùng parseMoney + định dạng lại khi rời ô).
const MONEY_FIELDS = ['wage', 'allowance', 'retailInvoice', 'loanAmount', 'deduction'];

// parseDay(v) — Ô ngày chỉ nhận 1 | 0.5 | 0(trống). Quy về 3 mức cho gọn.
function parseDay(v) {
  const n = Number(String(v).replace(',', '.')) || 0;
  if (n >= 1) return 1;
  if (n > 0) return 0.5;
  return 0;
}

// money(n) — Hiển thị tiền: 0 → '' (cho bảng đỡ rối), khác 0 → có dấu chấm nghìn.
const money = (n) => (Number(n) ? formatMoney(n) : '');

// esc(s) — Chống vỡ HTML khi đổ chuỗi người dùng vào value="".
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ----------------------------------------------------------------------------
//  ensureStyleOnce() — Chèn 1 lần CSS riêng cho lưới chấm công (sticky tên, màu ngày).
// ----------------------------------------------------------------------------
function ensureStyleOnce() {
  if (document.getElementById('cc-grid-style')) return;
  const st = document.createElement('style');
  st.id = 'cc-grid-style';
  st.textContent = `
    .cc-table { table-layout:fixed; width:max-content; min-width:100%; font-size:.85rem; }
    .cc-table th,.cc-table td { padding:0; vertical-align:middle; text-align:center; }
    .cc-table thead th { background:#f1f3f5; font-weight:600; white-space:nowrap; padding:.3rem .35rem; position:sticky; top:0; z-index:2; }
    .cc-cell { border:0; border-radius:0; height:34px; background:transparent; text-align:center; font-size:.85rem; }
    .cc-cell:focus { outline:2px solid #0d6efd; outline-offset:-2px; background:#fff; }
    .cc-name { text-align:left; padding-left:.35rem; }
    .cc-day1 { background:#d3f9d8 !important; } .cc-dayh { background:#fff3bf !important; }
    .cc-calc { color:#495057; font-variant-numeric:tabular-nums; padding:0 .35rem; white-space:nowrap; }
    .cc-take.neg { color:#e03131; }
    .cc-foot td { background:#f8f9fa; font-weight:600; position:sticky; bottom:0; z-index:2; }
    .cc-debt { background:#fff9db; }
  `;
  document.head.appendChild(st);
}

// ----------------------------------------------------------------------------
//  createWeekGrid(container, opts) — Dựng lưới vào `container`.
//  opts:
//    model        : mảng worker object (NGUỒN SỰ THẬT — sửa trực tiếp).
//    dayLabels    : [7] nhãn cột ngày (vd 'CN 17/5'); thiếu → dùng DAY_NAMES.
//    showDebt     : có mở sẵn nhóm cột nợ không.
//    nameSource() : trả mảng TÊN công nhân để gợi ý.
//    resolveName(raw,r) : week.js validate → { name, role, invalid:'notfound'|'dup'|null }.
//    getDebtBefore(worker) : trả nợ cũ (số) tính live để hiển thị.
//    onChange()   : gọi sau mỗi thay đổi (week.js cập nhật nút/bộ đếm nếu cần).
//  Trả tay cầm: { root, rebuild, setShowDebt, addRow, focusName, destroy }.
// ----------------------------------------------------------------------------
export function createWeekGrid(container, opts = {}) {
  ensureStyleOnce();
  const {
    model = [], dayLabels = [], showDebt = false,
    nameSource = () => [], resolveName = (raw) => ({ name: raw, role: '', invalid: null }),
    getDebtBefore = () => 0, onChange = () => {},
  } = opts;

  let _showDebt = showDebt;
  let acDetachers = [];

  const root = document.createElement('div');
  root.className = 'cc-week-grid';
  container.appendChild(root);

  // labels[i] — nhãn cột ngày i (ưu tiên dayLabels truyền vào).
  const dayLabel = (i) => dayLabels[i] || DAY_NAMES[i];

  // ===== HÀNG TIÊU ĐỀ =====
  function headHtml() {
    const dayCols = DAY_NAMES.map((_, i) => `<th style="width:46px">${esc(dayLabel(i))}</th>`).join('');
    const debtCols = `
      <th class="cc-debt" data-debt style="width:110px">HĐ Mua Lẻ</th>
      <th class="cc-debt" data-debt style="width:140px">Nội Dung</th>
      <th class="cc-debt" data-debt style="width:100px">Nợ Cũ</th>
      <th class="cc-debt" data-debt style="width:110px">Vay Mới</th>
      <th class="cc-debt" data-debt style="width:110px">Trừ Nợ</th>`;
    return `
      <th style="width:36px">#</th>
      <th style="width:150px">Tên Công Nhân</th>
      <th style="width:48px">T/P</th>
      ${dayCols}
      <th style="width:54px">TC</th>
      <th style="width:110px">Lương/Ngày</th>
      <th style="width:110px">Tổng Lương</th>
      <th style="width:100px">Phụ Cấp</th>
      ${debtCols}
      <th style="width:120px">Thực Lãnh</th>
      <th style="width:40px"></th>`;
  }

  // ===== 1 DÒNG CÔNG NHÂN =====
  function rowHtml(w, r) {
    const dayCells = DAY_NAMES.map((_, i) => {
      const v = Number(w.days?.[i]) || 0;
      const cls = v >= 1 ? 'cc-day1' : (v > 0 ? 'cc-dayh' : '');
      const disp = v ? (v === 0.5 ? '0.5' : '1') : '';
      return `<td><input class="form-control form-control-sm cc-cell ${cls}" data-r="${r}" data-f="d${i}"
                inputmode="decimal" placeholder="·" value="${disp}"></td>`;
    }).join('');
    const debtCells = `
      <td data-debt><input class="form-control form-control-sm cc-cell cc-debt" data-r="${r}" data-f="retailInvoice" inputmode="numeric" value="${money(w.retailInvoice)}"></td>
      <td data-debt><input class="form-control form-control-sm cc-cell cc-debt cc-name" data-r="${r}" data-f="note" value="${esc(w.note)}"></td>
      <td data-debt><span class="cc-calc cc-debt d-block" data-calc="debt" data-r="${r}"></span></td>
      <td data-debt><input class="form-control form-control-sm cc-cell cc-debt" data-r="${r}" data-f="loanAmount" inputmode="numeric" value="${money(w.loanAmount)}"></td>
      <td data-debt><input class="form-control form-control-sm cc-cell cc-debt" data-r="${r}" data-f="deduction" inputmode="numeric" value="${money(w.deduction)}"></td>`;
    return `
      <tr>
        <td class="text-muted">${r + 1}</td>
        <td><input class="form-control form-control-sm cc-cell cc-name" data-r="${r}" data-f="name" autocomplete="off" value="${esc(w.name)}"></td>
        <td><input class="form-control form-control-sm cc-cell" data-r="${r}" data-f="role" maxlength="1" value="${esc(w.role)}"></td>
        ${dayCells}
        <td><span class="cc-calc d-block" data-calc="tc" data-r="${r}"></span></td>
        <td><input class="form-control form-control-sm cc-cell" data-r="${r}" data-f="wage" inputmode="numeric" value="${money(w.wage)}"></td>
        <td><span class="cc-calc d-block" data-calc="pay" data-r="${r}"></span></td>
        <td><input class="form-control form-control-sm cc-cell" data-r="${r}" data-f="allowance" inputmode="numeric" value="${money(w.allowance)}"></td>
        ${debtCells}
        <td><span class="cc-calc cc-take d-block" data-calc="take" data-r="${r}"></span></td>
        <td><button type="button" class="btn btn-sm btn-link text-danger p-0 cc-del" data-r="${r}" title="Xóa dòng">✕</button></td>
      </tr>`;
  }

  // ===== DÒNG TỔNG (sticky cuối bảng) =====
  function footHtml() {
    const dayFoot = DAY_NAMES.map((_, i) => `<td><span class="cc-calc" data-foot="d${i}"></span></td>`).join('');
    return `
      <tr class="cc-foot">
        <td></td><td class="cc-name">∑ TỔNG</td><td></td>
        ${dayFoot}
        <td><span class="cc-calc" data-foot="tc"></span></td>
        <td></td>
        <td><span class="cc-calc" data-foot="pay"></span></td>
        <td></td>
        <td data-debt><span class="cc-calc" data-foot="retailInvoice"></span></td>
        <td data-debt></td>
        <td data-debt></td>
        <td data-debt><span class="cc-calc" data-foot="loanAmount"></span></td>
        <td data-debt><span class="cc-calc" data-foot="deduction"></span></td>
        <td><span class="cc-calc cc-take" data-foot="take"></span></td>
        <td></td>
      </tr>`;
  }

  root.innerHTML = `
    <div class="table-responsive border rounded">
      <table class="table table-sm table-bordered mb-0 cc-table">
        <thead><tr>${headHtml()}</tr></thead>
        <tbody></tbody>
        <tfoot>${footHtml()}</tfoot>
      </table>
    </div>
    <div class="mt-2">
      <button type="button" class="btn btn-sm btn-outline-primary cc-add">+ Thêm công nhân</button>
    </div>`;

  const tbody = root.querySelector('tbody');

  // ===== VẼ LẠI THÂN BẢNG =====
  function rebuild() {
    acDetachers.forEach((fn) => fn());
    acDetachers = [];
    tbody.innerHTML = model.map(rowHtml).join('');

    // Gắn gợi ý tên + commit khi chọn 1 gợi ý.
    model.forEach((_, r) => {
      const inp = tbody.querySelector(`input[data-r="${r}"][data-f="name"]`);
      if (!inp) return;
      acDetachers.push(attachAutocomplete(inp, nameSource, { onSelect: () => commitName(r) }));
    });

    applyDebtVisibility();
    recalcAll();
  }

  // ===== TÍNH LẠI 1 DÒNG =====
  function recalcRow(r) {
    const w = model[r];
    if (!w) return;
    const set = (calc, val, cls) => {
      const el = tbody.querySelector(`[data-calc="${calc}"][data-r="${r}"]`);
      if (el) { el.textContent = val; if (cls !== undefined) el.classList.toggle('neg', cls); }
    };
    const tc = totalDays(w);
    set('tc', tc || '');
    set('pay', money(laborPay(w)));
    set('debt', money(getDebtBefore(w)));
    set('take', formatMoney(takeHome(w)), takeHome(w) < 0);
  }

  // ===== TÍNH LẠI DÒNG TỔNG =====
  function recalcFoot() {
    const sum = (fn) => model.reduce((s, w) => s + fn(w), 0);
    const setF = (k, v, neg) => {
      const el = root.querySelector(`[data-foot="${k}"]`);
      if (el) { el.textContent = v; if (neg !== undefined) el.classList.toggle('neg', neg); }
    };
    for (let i = 0; i < 7; i++) {
      const t = sum((w) => Number(w.days?.[i]) || 0);
      setF(`d${i}`, t || '');
    }
    setF('tc', sum(totalDays) || '');
    setF('pay', money(sum(laborPay)));
    setF('retailInvoice', money(sum((w) => Number(w.retailInvoice) || 0)));
    setF('loanAmount', money(sum((w) => Number(w.loanAmount) || 0)));
    setF('deduction', money(sum((w) => Number(w.deduction) || 0)));
    const take = sum(takeHome);
    setF('take', formatMoney(take), take < 0);
  }

  function recalcAll() {
    model.forEach((_, r) => recalcRow(r));
    recalcFoot();
  }

  // ===== COMMIT TÊN (validate qua week.js) =====
  function commitName(r) {
    const inp = tbody.querySelector(`input[data-r="${r}"][data-f="name"]`);
    if (!inp) return;
    const res = resolveName(inp.value, r) || {};
    const roleInp = tbody.querySelector(`input[data-r="${r}"][data-f="role"]`);

    if (res.invalid === 'notfound') {
      model[r].name = '';
      inp.value = '';
      inp.classList.add('is-invalid');
      setTimeout(() => inp.classList.remove('is-invalid'), 1200);
    } else {
      model[r].name = res.name ?? inp.value;
      inp.value = model[r].name;
      if (res.role != null) { model[r].role = res.role; if (roleInp) roleInp.value = res.role; }
      inp.classList.toggle('is-invalid', res.invalid === 'dup');
    }
    recalcRow(r);
    onChange();
  }

  // ===== ẨN/HIỆN NHÓM CỘT NỢ =====
  function applyDebtVisibility() {
    root.querySelectorAll('[data-debt]').forEach((el) => {
      el.style.display = _showDebt ? '' : 'none';
    });
  }
  function setShowDebt(on) { _showDebt = !!on; applyDebtVisibility(); }

  // ===== SỰ KIỆN GÕ =====
  tbody.addEventListener('input', (e) => {
    const inp = e.target.closest('.cc-cell');
    if (!inp) return;
    const r = +inp.dataset.r, f = inp.dataset.f;
    const w = model[r];
    if (!w) return;
    if (f[0] === 'd') {
      const i = +f.slice(1);
      w.days[i] = parseDay(inp.value);
      inp.classList.toggle('cc-day1', w.days[i] >= 1);
      inp.classList.toggle('cc-dayh', w.days[i] > 0 && w.days[i] < 1);
      recalcRow(r); recalcFoot();
    } else if (MONEY_FIELDS.includes(f)) {
      w[f] = parseMoney(inp.value);
      recalcRow(r); recalcFoot();
    } else if (f === 'note') {
      w.note = inp.value;
    } else if (f === 'role') {
      w.role = inp.value;
    } else if (f === 'name') {
      w.name = inp.value;             // giữ thô; chuẩn hóa khi rời ô (commit)
    }
    onChange();
  });

  // Rời ô: tên → commit (validate); tiền/ngày → định dạng lại.
  tbody.addEventListener('focusout', (e) => {
    const inp = e.target.closest('.cc-cell');
    if (!inp) return;
    const r = +inp.dataset.r, f = inp.dataset.f;
    if (f === 'name') { commitName(r); return; }
    if (MONEY_FIELDS.includes(f)) inp.value = money(model[r][f]);
    else if (f[0] === 'd') {
      const v = model[r].days[+f.slice(1)];
      inp.value = v ? (v === 0.5 ? '0.5' : '1') : '';
    }
  });

  // Thêm / xóa dòng.
  root.addEventListener('click', (e) => {
    if (e.target.closest('.cc-add')) { addRow(); return; }
    const del = e.target.closest('.cc-del');
    if (del) { deleteRow(+del.dataset.r); }
  });

  function blankWorker() {
    return { name: '', role: '', wage: 0, days: [0, 0, 0, 0, 0, 0, 0],
      allowance: 0, retailInvoice: 0, loanAmount: 0, deduction: 0, note: '' };
  }
  function addRow() { model.push(blankWorker()); rebuild(); onChange(); }
  function deleteRow(r) { model.splice(r, 1); rebuild(); onChange(); }

  function focusName(r) {
    const inp = tbody.querySelector(`input[data-r="${r}"][data-f="name"]`);
    if (inp) inp.focus();
  }

  function destroy() {
    acDetachers.forEach((fn) => fn());
    acDetachers = [];
    root.remove();
  }

  rebuild();

  return { root, rebuild, setShowDebt, addRow, focusName, destroy };
}
