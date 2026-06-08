// ============================================================================
//  utils/autocomplete.js  —  TẦNG HẠ TẦNG (Layer 1): Ô gợi ý "không dấu"
// ----------------------------------------------------------------------------
//  NHIỆM VỤ: Biến một ô <input> bình thường thành ô CÓ GỢI Ý (autocomplete) —
//  gõ tới đâu hiện danh sách tên khớp tới đó, KHÔNG phân biệt dấu/hoa-thường:
//     gõ "xi mang"  →  vẫn gợi ý "Xi Măng".
//  Dùng lại khắp các tab: chọn nhà cung cấp, loại chi phí, công nhân, thiết bị…
//  Mỗi tab chỉ cần đưa vào HÀM lấy danh sách tên (đọc từ STORE.categories).
//
//  CÁCH DÙNG (ví dụ ở 1 tab sau này):
//     attachAutocomplete(input, () => listNames(catDoc, 'supplier'), {
//       onSelect: (ten) => { ...làm gì đó khi chọn... }
//     });
//
//  Thiết kế ưu tiên di động: danh sách gợi ý cuộn được, dòng đủ cao để chạm tay,
//  điều hướng được bằng phím (↑ ↓ Enter Esc) trên máy tính. Dùng class Bootstrap.
// ============================================================================

// ----------------------------------------------------------------------------
//  normalizeVietnamese(str) — "Chìa khóa so khớp" không dấu, thường hóa.
//  Bỏ dấu thanh + dấu mũ (NFD tách dấu rồi xóa), đổi đ→d, viết thường, gộp khoảng
//  trắng thừa. Đây là nền tảng để gợi ý/khớp tên bất kể người dùng gõ có dấu hay không.
//  (cat.js dùng lại hàm này làm normalizeKey để CHỐNG TRÙNG danh mục → 1 chuẩn duy nhất.)
// ----------------------------------------------------------------------------
export function normalizeVietnamese(str) {
  return String(str ?? '')
    .normalize('NFD')                 // tách chữ và dấu: "ằ" → "a" + "̀"
    .replace(/[̀-ͯ]/g, '')  // xóa toàn bộ dấu thanh/mũ vừa tách ra
    .replace(/đ/gi, 'd')              // đ/Đ → d (NFD không tách được chữ này)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');            // nhiều khoảng trắng → 1
}

// ----------------------------------------------------------------------------
//  filterSuggestions(items, query, max) — Lọc danh sách tên theo từ gõ vào.
//   - items : mảng chuỗi tên (vd ['Xi Măng', 'Cát', 'Đá 1x2']).
//   - query : chuỗi người dùng đang gõ.
//   - max   : số gợi ý tối đa trả về (mặc định 8).
//  Quy tắc: khớp "chứa" theo dạng không dấu; tên BẮT ĐẦU bằng từ gõ được ưu tiên lên trên.
//  Tách riêng (không lẫn DOM) để DỄ KIỂM THỬ và tái dùng.
// ----------------------------------------------------------------------------
export function filterSuggestions(items, query, max = 8) {
  const list = (items || []).filter((x) => x != null && String(x).trim() !== '');
  const q = normalizeVietnamese(query);
  if (!q) return list.slice(0, max); // chưa gõ gì → hiện vài tên đầu cho dễ chọn

  const matched = list.filter((it) => normalizeVietnamese(it).includes(q));
  // Ưu tiên tên bắt đầu bằng từ gõ (sát ý hơn), rồi mới tới tên chỉ chứa ở giữa.
  matched.sort((a, b) => {
    const sa = normalizeVietnamese(a).startsWith(q) ? 0 : 1;
    const sb = normalizeVietnamese(b).startsWith(q) ? 0 : 1;
    return sa - sb;
  });
  return matched.slice(0, max);
}

// ----------------------------------------------------------------------------
//  attachAutocomplete(input, getItems, opts) — Gắn gợi ý vào 1 ô <input>.
//   - input    : phần tử <input> cần gắn.
//   - getItems : HÀM trả về mảng tên hiện có (gọi lại MỖI lần gõ → luôn mới nhất).
//   - opts:
//       onSelect(value) : gọi khi người dùng chọn 1 gợi ý (hoặc Enter).
//       max             : số gợi ý tối đa (mặc định 8).
//       minChars        : số ký tự tối thiểu mới hiện gợi ý (mặc định 0 = hiện ngay khi focus).
//  Trả về hàm detach() để gỡ bỏ gợi ý (dọn sự kiện + xóa menu) khi không cần nữa.
// ----------------------------------------------------------------------------
export function attachAutocomplete(input, getItems, opts = {}) {
  const { onSelect = () => {}, max = 8, minChars = 0 } = opts;

  // Menu gợi ý: gắn thẳng vào body, định vị "fixed" ngay dưới ô input.
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu p-0 shadow-sm';
  menu.style.cssText = 'position:fixed;z-index:1095;max-height:240px;overflow-y:auto;display:none;';
  document.body.appendChild(menu);

  let matches = []; // danh sách gợi ý đang hiển thị
  let active  = -1; // dòng đang được tô sáng (điều hướng bằng phím)

  // Đặt menu đúng vị trí + bề ngang bằng ô input (gọi mỗi lần mở vì cuộn/đổi layout).
  function position() {
    const r = input.getBoundingClientRect();
    menu.style.left  = r.left + 'px';
    menu.style.top   = (r.bottom + 2) + 'px';
    menu.style.width = r.width + 'px';
  }

  // Vẽ lại danh sách gợi ý theo từ đang gõ.
  function render() {
    matches = filterSuggestions(getItems(), input.value, max);
    active = -1;
    if (matches.length === 0) { hide(); return; }

    menu.innerHTML = matches.map((ten, i) =>
      `<button type="button" class="dropdown-item text-wrap py-2" data-i="${i}">${ten}</button>`
    ).join('');
    position();
    menu.style.display = 'block';
  }

  function hide() { menu.style.display = 'none'; }

  // Tô sáng dòng thứ idx (cuộn cho thấy nếu cần).
  function highlight(idx) {
    const items = menu.querySelectorAll('.dropdown-item');
    items.forEach((el, i) => el.classList.toggle('active', i === idx));
    if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
    active = idx;
  }

  // Chọn 1 gợi ý: gán vào input + báo ra ngoài + đóng menu.
  function choose(idx) {
    const ten = matches[idx];
    if (ten == null) return;
    input.value = ten;
    hide();
    onSelect(ten);
  }

  // --- Gắn các sự kiện ---
  const onInput = () => { if (input.value.length >= minChars) render(); else hide(); };
  const onFocus = () => { if (input.value.length >= minChars) render(); };
  const onBlur  = () => setTimeout(hide, 150); // trễ chút để kịp nhận cú click vào menu

  const onKeyDown = (e) => {
    if (menu.style.display === 'none') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(active + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(active - 1, 0)); }
    else if (e.key === 'Enter') {
      if (active >= 0) { e.preventDefault(); choose(active); }
      else hide(); // chưa chọn dòng nào → để Enter gửi form như bình thường
    } else if (e.key === 'Escape') { hide(); }
  };

  // Click 1 dòng gợi ý (dùng mousedown để chạy TRƯỚC sự kiện blur của input).
  const onMenuDown = (e) => {
    const btn = e.target.closest('.dropdown-item');
    if (!btn) return;
    e.preventDefault();
    choose(Number(btn.dataset.i));
  };

  input.addEventListener('input', onInput);
  input.addEventListener('focus', onFocus);
  input.addEventListener('blur', onBlur);
  input.addEventListener('keydown', onKeyDown);
  menu.addEventListener('mousedown', onMenuDown);

  // detach(): gỡ sạch để tránh rò rỉ khi rời tab/đóng form.
  return function detach() {
    input.removeEventListener('input', onInput);
    input.removeEventListener('focus', onFocus);
    input.removeEventListener('blur', onBlur);
    input.removeEventListener('keydown', onKeyDown);
    menu.removeEventListener('mousedown', onMenuDown);
    menu.remove();
  };
}
