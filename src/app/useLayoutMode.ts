// 3 khổ màn hình (KẾ HOẠCH 4I): ≥1024 máy tính · 640–1023 máy tính bảng / Z Fold mở · <640 điện thoại.
// Đổi ngay khi gập / mở máy, không cần tải lại.
import { useSyncExternalStore } from 'react';

export type LayoutMode = 'desktop' | 'tablet' | 'phone';

export function modeForWidth(w: number): LayoutMode {
  if (w >= 1024) return 'desktop';
  if (w >= 640) return 'tablet';
  return 'phone';
}

function subscribe(cb: () => void) {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(
    subscribe,
    () => modeForWidth(window.innerWidth),
    () => 'desktop',
  );
}
