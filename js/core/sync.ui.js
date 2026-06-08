// ============================================================================
//  core/sync.ui.js  —  TẦNG GIAO DIỆN (Layer 6): Báo trạng thái đồng bộ
// ----------------------------------------------------------------------------
//  @module sync.ui
//
//  PHẢN HỒI TRỰC QUAN cho bộ đồng bộ (doc 10 §7). KHÔNG chứa logic sync — chỉ
//  "nghe" trạng thái mà sync.js phát ra (qua setSyncStateListener) rồi vẽ:
//    • Chấm trạng thái cạnh nút 🔄: vàng quay (đang chạy) · xanh (xong) ·
//      đỏ (lỗi) · xám (offline). Kèm số thay đổi chờ đẩy + giờ sync cuối ở tooltip.
//    • Banner đáy màn hình: chỉ bật khi sync KÉO DÀI (>600ms) hoặc khi LỖI — tránh
//      nhấp nháy khó chịu vì push ngầm sau mỗi lần gõ thường xong trong tích tắc.
//
//  sync.js cố tình KHÔNG import file này (tránh phụ thuộc vòng) — nó chờ được "cắm"
//  hàm nghe vào qua setSyncStateListener, giống cách store.js nhận setPushScheduler.
//  Gọi mountSyncStatus(host) 1 lần khi dựng topbar là kích hoạt.
// ============================================================================

import { setSyncStateListener, getLastSync, getPendingCount, isSyncing } from './sync.js';

// hh:mm của 1 mốc thời gian (ms) — dùng cho tooltip + banner "Đã đồng bộ lúc…".
function hhmm(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ----------------------------------------------------------------------------
//  CHẤM TRẠNG THÁI
//  renderSyncDot(state) — Trả CHUỖI HTML cho 1 chấm theo trạng thái:
//    'syncing' → spinner vàng nhỏ · 'error' → ● đỏ · 'offline' → ● xám · còn lại → ● xanh.
// ----------------------------------------------------------------------------
const DOT = {
  syncing: { cls: 'text-warning', char: '', title: 'Đang đồng bộ…', spin: true },
  error:   { cls: 'text-danger',  char: '●', title: 'Đồng bộ lỗi' },
  offline: { cls: 'text-secondary', char: '●', title: 'Ngoại tuyến' },
  ok:      { cls: 'text-success', char: '●', title: 'Đã đồng bộ' },
};

export function renderSyncDot(state) {
  const d = DOT[state] || DOT.ok;
  if (d.spin) {
    return `<span class="spinner-border spinner-border-sm ${d.cls}" role="status" style="width:.7rem;height:.7rem;"></span>`;
  }
  return `<span class="${d.cls}" style="font-size:.7rem;line-height:1;">${d.char}</span>`;
}

// _dotHost: ô chứa chấm + chữ phụ (số chờ / giờ sync). Lưu để cập nhật khi có trạng thái mới.
let _dotHost = null;

// Vẽ lại chấm + chữ phụ theo trạng thái + thông tin (pending, lastSync).
function paintDot(state, info) {
  if (!_dotHost) return;
  const pending = info ? info.pending : getPendingCount();
  const last = info ? info.lastSync : getLastSync();

  // Chữ phụ (ẩn trên màn hình rất hẹp): ưu tiên số thay đổi chờ; không thì giờ sync cuối.
  let extra = '';
  if (pending > 0) extra = `<span class="badge bg-warning text-dark">${pending}</span>`;
  else if (last) extra = `<span class="text-white-50 small d-none d-lg-inline">${hhmm(last)}</span>`;

  const meta = DOT[state] || DOT.ok;
  const tip = [meta.title, pending > 0 ? `${pending} thay đổi chờ đẩy` : '', last ? `lần cuối ${hhmm(last)}` : '']
    .filter(Boolean).join(' · ');

  _dotHost.title = tip;
  _dotHost.innerHTML = `${renderSyncDot(state)}${extra}`;
}

// ----------------------------------------------------------------------------
//  BANNER ĐÁY MÀN HÌNH
//  showSyncBanner(msg, type, ms) — Hiện dải thông báo ngắn; tự ẩn sau `ms` (0 = giữ).
//  hideSyncBanner() — Ẩn ngay.
//  Dùng 1 phần tử cố định gắn vào body; gọn trên mobile 375px (căn giữa, không che nav).
// ----------------------------------------------------------------------------
let _banner = null;
let _bannerTimer = null;

function ensureBanner() {
  if (_banner) return _banner;
  _banner = document.createElement('div');
  _banner.setAttribute('data-sync-banner', '');
  _banner.style.cssText =
    'position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:1080;'
    + 'max-width:92vw;display:none;';
  document.body.appendChild(_banner);
  return _banner;
}

export function showSyncBanner(msg, type = 'info', ms = 0) {
  const el = ensureBanner();
  const cls = { info: 'bg-primary', success: 'bg-success', error: 'bg-danger', warning: 'bg-warning text-dark' }[type] || 'bg-primary';
  el.innerHTML = `<div class="${cls} text-white rounded-pill shadow px-3 py-1 small text-nowrap">${msg}</div>`;
  el.style.display = 'block';
  clearTimeout(_bannerTimer);
  if (ms > 0) _bannerTimer = setTimeout(hideSyncBanner, ms);
}

export function hideSyncBanner() {
  clearTimeout(_bannerTimer);
  if (_banner) _banner.style.display = 'none';
}

// ----------------------------------------------------------------------------
//  GẮN BANNER VÀO PHA SYNC (chống nhấp nháy)
//  Push ngầm thường xong <100ms → KHÔNG hiện banner. Chỉ khi sync kéo dài >600ms
//  mới hiện "⏳ Đang đồng bộ…"; xong thì đổi "✅ Đã đồng bộ" rồi tự ẩn; lỗi thì "⚠".
// ----------------------------------------------------------------------------
let _delayTimer = null;     // hẹn 600ms mới hiện banner "đang chạy"
let _bannerShown = false;   // banner "đang chạy" có đang hiện không (để biết có cần đổi kết quả)

function onState(state, info) {
  paintDot(state, info);

  if (state === 'syncing') {
    clearTimeout(_delayTimer);
    _delayTimer = setTimeout(() => { _bannerShown = true; showSyncBanner('⏳ Đang đồng bộ…', 'info', 0); }, 600);
    return;
  }

  // Kết thúc 1 pha sync (ok/error/offline).
  clearTimeout(_delayTimer);
  if (state === 'error') {
    _bannerShown = false;
    showSyncBanner('⚠ Đồng bộ lỗi — sẽ thử lại sau', 'error', 4000);
  } else if (_bannerShown) {
    // Chỉ báo "xong" nếu trước đó đã lỡ hiện "đang chạy" (sync lâu) → khỏi nhấp nháy.
    _bannerShown = false;
    if (state === 'ok') showSyncBanner(`✅ Đã đồng bộ lúc ${hhmm(info && info.lastSync)}`, 'success', 2000);
    else hideSyncBanner();
  }
}

// ----------------------------------------------------------------------------
//  mountSyncStatus(host) — Đặt chấm trạng thái vào `host` (cạnh nút 🔄 trong topbar)
//  và đăng ký nghe trạng thái sync. Vẽ ngay trạng thái hiện tại lúc gắn.
// ----------------------------------------------------------------------------
export function mountSyncStatus(host) {
  if (!host) return;
  _dotHost = host;
  _dotHost.classList.add('d-flex', 'align-items-center', 'gap-1');

  setSyncStateListener(onState);

  // Vẽ trạng thái khởi đầu (đang sync? offline? hay nghỉ).
  const initial = isSyncing() ? 'syncing'
    : (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'ok';
  paintDot(initial, { lastSync: getLastSync(), pending: getPendingCount() });
}
