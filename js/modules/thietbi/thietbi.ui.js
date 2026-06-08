// ============================================================================
//  modules/thietbi/thietbi.ui.js  —  TẦNG GIAO DIỆN (Layer 6): Vỏ tab Thiết Bị
// ----------------------------------------------------------------------------
//  @module thietbi.ui
//
//  VỎ điều phối tab 🔧 Thiết bị (doc 06): xếp dọc 1 trang gồm KHU NHẬP (entry) ở
//  trên và 3 BẢNG hiển thị (tables) ở dưới. Tự đăng ký hàm vẽ vào router qua
//  registerTab('thietbi', render) (side-effect import từ app.js).
//
//  Luồng làm tươi: lưu nhập xong (onSaved) hoặc xóa/luân chuyển xong (onChanged)
//  → gọi refresh() vẽ lại 3 bảng (khu nhập giữ nguyên, tự reset sau khi lưu).
// ============================================================================

import { registerTab } from '../../router.js';
import { renderEntry } from './thietbi.entry.js';
import { renderTables } from './thietbi.tables.js';

// ----------------------------------------------------------------------------
//  render(host) — Vẽ toàn bộ tab vào ô nội dung của router.
// ----------------------------------------------------------------------------
async function render(host) {
  host.innerHTML = `
    <div data-entry class="mb-3"></div>
    <div data-tables></div>`;

  const entryHost  = host.querySelector('[data-entry]');
  const tablesHost = host.querySelector('[data-tables]');

  const refresh = () => renderTables(tablesHost, { onChanged: refresh });

  await renderEntry(entryHost, { onSaved: refresh });
  await refresh();
}

registerTab('thietbi', render);
