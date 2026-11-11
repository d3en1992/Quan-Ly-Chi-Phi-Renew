// Định dạng hiển thị dùng chung (tiền, ngày). Không chứa công thức tiền — công thức ở src/lib/calc/.

const vnNumber = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

/** 1234567 → "1.234.567" */
export function formatMoney(n: number): string {
  return vnNumber.format(Math.round(n));
}

/** Rút gọn: 1.540.000.000 → "1,54 tỷ"; 5.350.000 → "5 tr" (giống giao diện mẫu) */
export function formatShortMoney(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e9) return s + (a / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  return s + Math.round(a / 1e6).toLocaleString('vi-VN') + ' tr';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Date | ISO → "dd/mm/yyyy" */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return '—';
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`;
}

/** Lần đăng nhập gần nhất: "hôm nay 08:12", "hôm qua 21:40", "31/10/2026" */
export function formatLastSeen(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return `hôm nay ${time}`;
  if (diffDays === 1) return `hôm qua ${time}`;
  return formatDate(d);
}

/** Chữ viết tắt trên avatar: "PHẠM VĂN LAM" → "PL", "TÌNH" → "TÌ" (giống mẫu) */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
