// ============================================================================
//  utils/sheet-grid.js  —  TẦNG KẾT NỐI (Layer 2): Lưới nhập kiểu Excel/Google Sheets
// ----------------------------------------------------------------------------
//  NHIỆM VỤ: Tạo một BẢNG NHẬP LIỆU nhiều dòng, thao tác nhanh như bảng tính:
//     - Gõ vào ô, bấm Tab/Enter để nhảy ô (hết hàng tự xuống dòng/đẻ thêm dòng).
//     - Chọn vùng nhiều ô bằng Shift + mũi tên (hoặc Shift + click).
//     - Copy/Paste cả khối — dán thẳng từ Excel/Google Sheets vào (TSV: cột cách
//       nhau bằng Tab, dòng cách nhau bằng xuống dòng) → đổ đầy bảng tức thì.
//     - Các LOẠI CỘT: text, number, money (tự chấm hàng nghìn), discount (% hoặc tiền),
//       autocomplete (gợi ý không dấu từ danh mục), project (chọn công trình, lưu id).
//     - Tự điền thông minh: copyFromAbove (ô trống lấy giá trị dòng trên),
//       suggestFromAbove (gợi ý theo các giá trị đã gõ ở cột phía trên).
//     - Nút [+1] [+5] [+10] thêm dòng, [✕] xóa dòng, [🗑 Xóa bảng] làm sạch,
//       và bộ đếm "Dòng có dữ liệu".
//
//  DÙNG CHUNG cho nhiều tab (Nhập nhanh, Hóa đơn chi tiết, Chấm công…). Mỗi tab chỉ
//  cần khai báo CỘT rồi gọi createSheetGrid(); engine lo phần thao tác bàn phím/chuột.
//
//  CÁCH DÙNG (ví dụ rút gọn):
//     const grid = createSheetGrid(document.getElementById('khung'), {
//       columns: [
//         { field:'category', label:'Loại CP', type:'autocomplete',
//           source:()=>['Vật Tư','Nhân Công'], required:true, copyFromAbove:true },
//         { field:'amount',   label:'Số tiền', type:'money' },
//         { field:'note',     label:'Nội dung', type:'text', suggestFromAbove:true },
//       ],
//       rows: 5,                       // số dòng trống ban đầu
//       onChange: () => { /* bảng vừa đổi → cập nhật tổng, bộ đếm… */ },
//     });
//     const duLieu = grid.getData();   // mảng object đã parse theo type
//
//  PHỤ THUỘC: fmt.js (định dạng tiền) + autocomplete.js (gợi ý không dấu) — đều ở Layer ≤1.
// ============================================================================

import { formatMoney, parseMoney, formatNumber } from './fmt.js';
import { attachAutocomplete, normalizeVietnamese } from './autocomplete.js';

// ----------------------------------------------------------------------------
//  CSS tối thiểu cho lưới — chèn 1 LẦN duy nhất cho cả trang (dùng chung mọi grid).
//  Đa số dựa vào Bootstrap; chỉ thêm vài luật mà Bootstrap không có sẵn:
//  ô input liền mạch như ô bảng tính, tô sáng vùng chọn, viền ô đang focus.
// ----------------------------------------------------------------------------
function ensureStyleOnce() {
  if (document.getElementById('sheet-grid-style')) return; // đã chèn rồi → thôi
  const style = document.createElement('style');
  style.id = 'sheet-grid-style';
  style.textContent = `
    .sg-table { table-layout: fixed; width: max-content; min-width: 100%; }
    .sg-table th, .sg-table td { padding: 0; vertical-align: middle; }
    .sg-table thead th {
      background:#f1f3f5; font-size:.8rem; font-weight:600; white-space:nowrap;
      padding:.35rem .5rem; position:sticky; top:0; z-index:2;
    }
    .sg-cell {
      border:0; border-radius:0; box-shadow:none; height:38px;
      font-size:.9rem; background:transparent;
    }
    .sg-cell:focus { outline:2px solid #0d6efd; outline-offset:-2px; background:#fff; z-index:1; }
    .sg-td.sg-sel { background:#cfe2ff; }            /* ô nằm trong vùng đang chọn */
    .sg-stt { width:42px; text-align:center; color:#868e96; font-size:.8rem; }
    .sg-del { width:40px; text-align:center; }
    .sg-req-empty { background:#fff5f5; }            /* cột bắt buộc còn trống (gợi nhắc nhẹ) */
  `;
  document.head.appendChild(style);
}

// ----------------------------------------------------------------------------
//  parseNumberVN(text) — Đọc SỐ kiểu Việt Nam ("1.234,5" → 1234.5).
//  Quy ước VN: dấu CHẤM là ngăn cách hàng nghìn, dấu PHẨY là phần thập phân.
//  Dùng cho cột type:'number' (khối lượng, số công, hệ số…). Sai/để trống → 0.
// ----------------------------------------------------------------------------
function parseNumberVN(text) {
  if (typeof text === 'number') return text;
  if (!text) return 0;
  const cleaned = String(text).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

// ----------------------------------------------------------------------------
//  createSheetGrid(container, options) — Dựng 1 lưới nhập vào phần tử `container`.
//
//  options:
//    columns   : [{ field, label?, type?, width?, required?, copyFromAbove?,
//                   suggestFromAbove?, source? }]  — BẮT BUỘC khai báo.
//        field            : tên trường trong object dữ liệu trả ra.
//        label            : nhãn cột (mặc định = field).
//        type             : 'text'|'number'|'money'|'discount'|'autocomplete'|'project'.
//        width            : bề ngang cột (px) — mặc định 120 (STT/discount nhỏ hơn).
//        required         : true → tô nền nhạt khi còn trống (nhắc nhập).
//        copyFromAbove    : true → ô trống tự lấy giá trị dòng trên khi getData().
//        suggestFromAbove : true → bật gợi ý theo các giá trị đã gõ ở cột phía trên.
//        source           : HÀM trả danh sách gợi ý. Với 'project' trả [{id,name}],
//                           các loại khác trả mảng tên (chuỗi).
//    rows      : số dòng trống ban đầu (mặc định 5).
//    minRows   : số dòng tối thiểu luôn giữ lại khi xóa/clear (mặc định 1).
//    data      : mảng object nạp sẵn lên lưới (tùy chọn).
//    onChange  : gọi mỗi khi dữ liệu thay đổi (gõ, thêm/xóa dòng, dán).
//    showDelete: hiện cột nút [✕] xóa từng dòng (mặc định true).
//
//  TRẢ VỀ một "tay cầm" (API) để tab điều khiển lưới — xem phần `return` cuối hàm.
// ----------------------------------------------------------------------------
export function createSheetGrid(container, options = {}) {
  ensureStyleOnce();

  const {
    columns = [],
    rows: initialRows = 5,
    minRows = 1,
    data = null,
    onChange = () => {},
    showDelete = true,
  } = options;

  // Chuẩn hóa khai báo cột (điền giá trị mặc định để phần dưới khỏi phải kiểm tra hoài).
  const cols = columns.map((c) => ({
    field: c.field,
    label: c.label ?? c.field,
    type: c.type ?? 'text',
    width: c.width ?? (c.type === 'discount' ? 90 : c.type === 'money' || c.type === 'number' ? 110 : 130),
    required: !!c.required,
    copyFromAbove: !!c.copyFromAbove,
    suggestFromAbove: !!c.suggestFromAbove,
    source: typeof c.source === 'function' ? c.source : null,
  }));

  // MÔ HÌNH DỮ LIỆU (nguồn sự thật): mảng các object dòng. Mỗi dòng giữ CHUỖI hiển thị
  // theo từng field. Riêng cột 'project' giữ thêm id đã chọn trong row._ids[field].
  let model = [];

  // Trạng thái ô đang chọn: ô "neo" (anchor) và ô "đầu bút" (focus) tạo thành hình chữ nhật.
  let anchor = { r: 0, c: 0 };
  let focus = { r: 0, c: 0 };

  let acDetachers = []; // các hàm gỡ autocomplete (dọn khi dựng lại/đóng)

  // --- Khởi tạo model rỗng / từ data nạp sẵn ---
  function blankRow() {
    const row = { _ids: {} };
    for (const col of cols) row[col.field] = '';
    return row;
  }
  function rowFromData(obj) {
    const row = { _ids: {} };
    for (const col of cols) {
      const v = obj?.[col.field];
      if (col.type === 'money') row[col.field] = v ? formatMoney(v) : '';
      else if (col.type === 'number') row[col.field] = (v || v === 0) ? formatNumber(v) : '';
      else row[col.field] = v == null ? '' : String(v);
    }
    return row;
  }
  if (Array.isArray(data) && data.length) {
    model = data.map(rowFromData);
  } else {
    model = Array.from({ length: Math.max(initialRows, minRows) }, blankRow);
  }

  // --- Dựng khung HTML (bảng + thanh công cụ) ---
  const root = document.createElement('div');
  root.className = 'sheet-grid';
  root.innerHTML = `
    <div class="table-responsive border rounded">
      <table class="table table-sm table-bordered mb-0 sg-table">
        <thead>
          <tr>
            <th class="sg-stt">#</th>
            ${cols.map((c) => `<th style="width:${c.width}px">${c.label}${c.required ? ' <span class="text-danger">*</span>' : ''}</th>`).join('')}
            ${showDelete ? '<th class="sg-del"></th>' : ''}
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
      <div class="btn-group btn-group-sm" role="group">
        <button type="button" class="btn btn-outline-primary sg-add" data-n="1">+1</button>
        <button type="button" class="btn btn-outline-primary sg-add" data-n="5">+5</button>
        <button type="button" class="btn btn-outline-primary sg-add" data-n="10">+10</button>
      </div>
      <span class="badge bg-secondary-subtle text-secondary-emphasis sg-counter">Dòng có dữ liệu: 0</span>
      <button type="button" class="btn btn-sm btn-outline-danger ms-auto sg-clear">🗑 Xóa bảng</button>
    </div>
  `;
  container.appendChild(root);

  const tbody = root.querySelector('tbody');
  const counterEl = root.querySelector('.sg-counter');

  // ===== TIỆN ÍCH TRUY CẬP Ô =====
  function getInput(r, c) {
    return tbody.querySelector(`input[data-r="${r}"][data-c="${c}"]`);
  }
  function getTd(r, c) {
    return tbody.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
  }

  // Đặt giá trị 1 ô (cập nhật model + ô input + định dạng lại nếu là tiền/số).
  function setCell(r, c, raw) {
    if (!model[r]) return;
    const col = cols[c];
    model[r][col.field] = raw;
    const inp = getInput(r, c);
    if (inp) inp.value = raw;
  }

  // ===== ĐỊNH DẠNG TIỀN/SỐ KHI RỜI Ô =====
  // Lúc gõ thì để nguyên cho dễ sửa; rời ô (blur) mới "đẹp hóa" (chấm hàng nghìn).
  function reformatCell(r, c) {
    const col = cols[c];
    const inp = getInput(r, c);
    if (!inp) return;
    let raw = inp.value.trim();
    if (col.type === 'money') raw = raw === '' ? '' : formatMoney(parseMoney(raw));
    else if (col.type === 'number') raw = raw === '' ? '' : formatNumber(parseNumberVN(raw));
    inp.value = raw;
    model[r][col.field] = raw;
  }

  // ===== VẼ LẠI TOÀN BỘ THÂN BẢNG =====
  // Gọi khi thay đổi cấu trúc (thêm/xóa/clear/nạp/dán). Đồng bộ DOM theo `model`.
  function rebuild() {
    // Gỡ autocomplete cũ tránh rò rỉ sự kiện.
    acDetachers.forEach((fn) => fn());
    acDetachers = [];

    tbody.innerHTML = model.map((row, r) => `
      <tr>
        <td class="sg-stt">${r + 1}</td>
        ${cols.map((col, c) => `
          <td class="sg-td" data-r="${r}" data-c="${c}">
            <input class="form-control form-control-sm sg-cell${col.required && !row[col.field] ? ' sg-req-empty' : ''}"
                   data-r="${r}" data-c="${c}" autocomplete="off"
                   inputmode="${col.type === 'money' || col.type === 'number' ? 'decimal' : 'text'}"
                   value="${escapeHtml(row[col.field] ?? '')}" />
          </td>`).join('')}
        ${showDelete ? `<td class="sg-del"><button type="button" class="btn btn-sm btn-link text-danger p-0 sg-row-del" data-r="${r}" title="Xóa dòng">✕</button></td>` : ''}
      </tr>
    `).join('');

    // Gắn autocomplete cho các cột cần gợi ý.
    cols.forEach((col, c) => {
      const needAc = col.type === 'autocomplete' || col.type === 'project' || col.suggestFromAbove;
      if (!needAc) return;
      model.forEach((row, r) => {
        const inp = getInput(r, c);
        if (!inp) return;
        const getItems = () => buildSuggestItems(col, c, r);
        const detach = attachAutocomplete(inp, getItems, {
          onSelect: (val) => {
            model[r][col.field] = val;
            if (col.type === 'project' && col.source) {
              // Lưu lại id công trình tương ứng tên vừa chọn (denormalize id để lưu DB).
              const opt = col.source().find((o) => o.name === val);
              if (opt) model[r]._ids[col.field] = opt.id;
            }
            fireChange();
          },
        });
        acDetachers.push(detach);
      });
    });

    paintSelection();
    updateCounter();
  }

  // Danh sách gợi ý cho 1 ô: từ source (danh mục/công trình) + giá trị đã gõ ở cột phía trên.
  function buildSuggestItems(col, c, r) {
    const out = [];
    if (col.source) {
      const src = col.source();
      for (const it of src) out.push(col.type === 'project' ? it.name : it);
    }
    if (col.suggestFromAbove) {
      for (let i = 0; i < r; i++) {
        const v = (model[i]?.[col.field] ?? '').trim();
        if (v) out.push(v);
      }
    }
    // Bỏ trùng (giữ thứ tự xuất hiện đầu tiên).
    return [...new Set(out)];
  }

  // ===== TÔ SÁNG VÙNG ĐANG CHỌN =====
  function rect() {
    return {
      r0: Math.min(anchor.r, focus.r), r1: Math.max(anchor.r, focus.r),
      c0: Math.min(anchor.c, focus.c), c1: Math.max(anchor.c, focus.c),
    };
  }
  function paintSelection() {
    tbody.querySelectorAll('.sg-td.sg-sel').forEach((td) => td.classList.remove('sg-sel'));
    const { r0, r1, c0, c1 } = rect();
    if (r0 === r1 && c0 === c1) return; // chỉ 1 ô → không cần tô (đã có viền focus)
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        getTd(r, c)?.classList.add('sg-sel');
  }

  // ===== DI CHUYỂN Ô =====
  // dr/dc: hướng dịch. extend=true: kéo dài vùng chọn (Shift). addIfEnd: cho phép đẻ
  // dòng mới khi đang ở dòng cuối (dùng cho Tab/Enter).
  function move(dr, dc, { extend = false, addIfEnd = false } = {}) {
    let r = focus.r + dr;
    let c = focus.c + dc;

    // Tràn ngang → cuộn dòng (Tab ở cuối hàng nhảy về đầu hàng kế).
    if (c >= cols.length) { c = 0; r += 1; }
    else if (c < 0) { c = cols.length - 1; r -= 1; }

    if (r < 0) r = 0;
    if (r >= model.length) {
      if (addIfEnd) { model.push(blankRow()); rebuild(); }
      else r = model.length - 1;
    }
    c = Math.max(0, Math.min(cols.length - 1, c));

    focus = { r, c };
    if (!extend) anchor = { r, c };
    paintSelection();
    const inp = getInput(r, c);
    if (inp) { inp.focus(); inp.select(); }
  }

  // ===== COPY: ghép vùng chọn thành TSV để dán sang Excel/ô khác =====
  function selectionToTSV() {
    const { r0, r1, c0, c1 } = rect();
    const lines = [];
    for (let r = r0; r <= r1; r++) {
      const cells = [];
      for (let c = c0; c <= c1; c++) cells.push((model[r]?.[cols[c].field] ?? '').replace(/\t|\n/g, ' '));
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }

  // ===== PASTE: đổ TSV (từ Excel/Sheets) vào, bắt đầu từ ô đang chọn =====
  function pasteTSV(text) {
    const grid = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((line) => line.split('\t'));
    const startR = focus.r, startC = focus.c;
    // Đẻ thêm dòng nếu dán vượt quá số dòng hiện có.
    const need = startR + grid.length;
    while (model.length < need) model.push(blankRow());
    rebuild(); // dựng lại để có đủ ô input cho phần vừa thêm

    grid.forEach((cells, i) => {
      cells.forEach((val, j) => {
        const r = startR + i, c = startC + j;
        if (c >= cols.length || r >= model.length) return; // dán tràn cột → bỏ phần thừa
        setCell(r, c, val.trim());
        reformatCell(r, c);
      });
    });
    rebuild();
    fireChange();
  }

  // ===== BỘ ĐẾM "DÒNG CÓ DỮ LIỆU" =====
  function countFilled() {
    return model.filter((row) => cols.some((col) => (row[col.field] ?? '').trim() !== '')).length;
  }
  function updateCounter() {
    if (counterEl) counterEl.textContent = `Dòng có dữ liệu: ${countFilled()}`;
  }

  function fireChange() {
    updateCounter();
    onChange();
  }

  // ===== SỰ KIỆN (ủy quyền tại thân bảng — dùng được cho cả dòng mới thêm) =====
  // 1) Gõ vào ô → cập nhật model + bỏ tô nền "bắt buộc trống".
  tbody.addEventListener('input', (e) => {
    const inp = e.target.closest('.sg-cell');
    if (!inp) return;
    const r = +inp.dataset.r, c = +inp.dataset.c;
    model[r][cols[c].field] = inp.value;
    if (cols[c].required) inp.classList.toggle('sg-req-empty', inp.value.trim() === '');
    fireChange();
  });

  // 2) Ô được focus → cập nhật ô neo/đầu bút (để biết đang đứng đâu mà copy/dán/di chuyển).
  tbody.addEventListener('focusin', (e) => {
    const inp = e.target.closest('.sg-cell');
    if (!inp) return;
    focus = { r: +inp.dataset.r, c: +inp.dataset.c };
    anchor = { ...focus };
    paintSelection();
  });

  // 3) Rời ô → đẹp hóa tiền/số.
  tbody.addEventListener('focusout', (e) => {
    const inp = e.target.closest('.sg-cell');
    if (!inp) return;
    reformatCell(+inp.dataset.r, +inp.dataset.c);
  });

  // 4) Phím điều hướng: Tab/Shift+Tab, Enter/Shift+Enter, mũi tên (Shift = chọn vùng).
  tbody.addEventListener('keydown', (e) => {
    const inp = e.target.closest('.sg-cell');
    if (!inp) return;
    const k = e.key;

    if (k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1, { addIfEnd: !e.shiftKey }); }
    else if (k === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0, { addIfEnd: !e.shiftKey }); }
    else if (k === 'ArrowDown') { e.preventDefault(); move(1, 0, { extend: e.shiftKey }); }
    else if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0, { extend: e.shiftKey }); }
    else if (k === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); move(0, -1, { extend: true }); }
    else if (k === 'ArrowRight' && e.shiftKey) { e.preventDefault(); move(0, 1, { extend: true }); }
    // Left/Right không Shift: để con trỏ chạy trong ô như bình thường (không chiếm phím).
  });

  // 5) Shift+Click để mở rộng vùng chọn tới ô vừa bấm.
  tbody.addEventListener('mousedown', (e) => {
    const inp = e.target.closest('.sg-cell');
    if (!inp || !e.shiftKey) return;
    focus = { r: +inp.dataset.r, c: +inp.dataset.c };
    paintSelection();
  });

  // 6) Copy/Cut: nếu đang chọn nhiều ô thì xuất TSV (1 ô để trình duyệt copy như thường).
  root.addEventListener('copy', (e) => {
    const { r0, r1, c0, c1 } = rect();
    if (r0 === r1 && c0 === c1) return; // 1 ô → copy nội dung ô như bình thường
    e.preventDefault();
    e.clipboardData.setData('text/plain', selectionToTSV());
  });

  // 7) Paste: chặn dán mặc định, tự đổ TSV vào lưới bắt đầu từ ô đang đứng.
  root.addEventListener('paste', (e) => {
    if (!e.target.closest('.sg-cell')) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    // Dán 1 ô đơn (không có Tab/xuống dòng) → để trình duyệt xử lý bình thường cho mượt.
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;
    e.preventDefault();
    pasteTSV(text);
  });

  // 8) Thanh công cụ: thêm dòng / xóa 1 dòng / xóa cả bảng.
  root.addEventListener('click', (e) => {
    const add = e.target.closest('.sg-add');
    if (add) { addRows(+add.dataset.n); return; }
    const del = e.target.closest('.sg-row-del');
    if (del) { deleteRow(+del.dataset.r); return; }
    if (e.target.closest('.sg-clear')) { clear(); return; }
  });

  // ===== CÁC HÀM THAO TÁC DÒNG =====
  function addRows(n) {
    for (let i = 0; i < n; i++) model.push(blankRow());
    rebuild();
    fireChange();
  }
  function deleteRow(r) {
    model.splice(r, 1);
    if (model.length < minRows) model.push(blankRow()); // luôn giữ tối thiểu
    if (focus.r >= model.length) focus.r = model.length - 1;
    anchor = { ...focus };
    rebuild();
    fireChange();
  }
  function clear() {
    model = Array.from({ length: minRows }, blankRow);
    anchor = { r: 0, c: 0 }; focus = { r: 0, c: 0 };
    rebuild();
    fireChange();
  }

  // ===== ĐỌC DỮ LIỆU RA NGOÀI (đã parse + áp copyFromAbove) =====
  // onlyFilled=true (mặc định): chỉ trả dòng có ít nhất 1 ô được người dùng gõ.
  function getData({ onlyFilled = true } = {}) {
    const out = [];
    const lastRaw = {}; // giá trị "gần nhất khác rỗng" của mỗi cột — phục vụ copyFromAbove
    for (const row of model) {
      const obj = {};
      let userFilled = false; // dòng này có dữ liệu người dùng tự gõ không?

      for (const col of cols) {
        const original = (row[col.field] ?? '').trim();
        if (original !== '') userFilled = true;

        // copyFromAbove: ô trống → lấy giá trị khác rỗng gần nhất phía trên.
        let raw = original;
        if (raw === '' && col.copyFromAbove && lastRaw[col.field] != null) raw = lastRaw[col.field];

        // Parse theo loại cột.
        if (col.type === 'money') obj[col.field] = raw === '' ? 0 : parseMoney(raw);
        else if (col.type === 'number') obj[col.field] = raw === '' ? 0 : parseNumberVN(raw);
        else if (col.type === 'project') obj[col.field] = resolveProjectId(row, col, raw);
        else obj[col.field] = raw;

        if (raw !== '') lastRaw[col.field] = raw;
      }

      if (!onlyFilled || userFilled) out.push(obj);
    }
    return out;
  }

  // Đổi TÊN công trình hiển thị → id để lưu DB (ưu tiên id đã chọn lúc autocomplete).
  function resolveProjectId(row, col, raw) {
    if (row._ids && row._ids[col.field]) return row._ids[col.field];
    if (raw === '' || !col.source) return '';
    const key = normalizeVietnamese(raw);
    const opt = col.source().find((o) => normalizeVietnamese(o.name) === key);
    return opt ? opt.id : raw; // không khớp danh mục → giữ nguyên (tab gọi sẽ validate)
  }

  // Nạp lại dữ liệu mới lên lưới (vd: mở 1 hóa đơn để sửa).
  function setData(rowsData) {
    model = (Array.isArray(rowsData) && rowsData.length) ? rowsData.map(rowFromData)
                                                         : Array.from({ length: minRows }, blankRow);
    anchor = { r: 0, c: 0 }; focus = { r: 0, c: 0 };
    rebuild();
    fireChange();
  }

  // Dọn sạch khi rời tab/đóng form (gỡ autocomplete + xóa khung khỏi DOM).
  function destroy() {
    acDetachers.forEach((fn) => fn());
    acDetachers = [];
    root.remove();
  }

  // Vẽ lần đầu.
  rebuild();

  // "Tay cầm" trả cho tab điều khiển lưới.
  return {
    root,                         // phần tử gốc (đã gắn vào container)
    getData,                      // đọc dữ liệu đã parse
    setData,                      // nạp dữ liệu lên lưới
    addRows,                      // thêm n dòng trống
    deleteRow,                    // xóa 1 dòng theo chỉ số
    clear,                        // xóa cả bảng (về minRows dòng trống)
    countFilled,                  // số dòng có dữ liệu
    focusCell: (r, c) => { focus = { r, c }; anchor = { r, c }; const i = getInput(r, c); if (i) i.focus(); },
    destroy,                      // dọn sạch
  };
}

// ----------------------------------------------------------------------------
//  escapeHtml(s) — Chống vỡ HTML/chèn mã khi đổ giá trị vào thuộc tính value="".
//  (Người dùng có thể gõ dấu " hoặc < > trong nội dung.)
// ----------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
