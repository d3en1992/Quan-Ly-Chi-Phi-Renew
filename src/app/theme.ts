// Sáng / tối: mặc định theo máy; bấm nút thì ghi đè (data-theme trên <html>)
const KEY = 'qlcp-theme';

export function applySavedTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch {
    /* bỏ qua */
  }
}

export function isDark(): boolean {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr) return attr === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function toggleTheme() {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* bỏ qua */
  }
}
