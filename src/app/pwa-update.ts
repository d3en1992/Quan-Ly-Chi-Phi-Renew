// Bản cài trên điện thoại (PWA) tự lên bản mới: trước 13/11/2026 service worker tải bản mới ngầm nhưng trang vẫn chạy bản cũ
// tới khi tắt hẳn app mở lại (có máy phải 2 lần) → người dùng thấy giao diện cũ dù Vercel đã build.
// Nay: kiểm tra bản mới khi mở app, khi quay lại app (đổi tab / mở lại từ nền) và mỗi 30 phút; có bản mới thì tự tải lại.
import { registerSW } from 'virtual:pwa-register';

export function startPwaAutoUpdate() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine) void reg.update().catch(() => {}); };
      setInterval(check, 30 * 60_000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    },
    // registerType 'autoUpdate': bản mới kích hoạt xong thì tải lại trang
    onNeedRefresh() { void updateSW(true); },
  });
}
