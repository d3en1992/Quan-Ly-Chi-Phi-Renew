// TN02 — "Đã xuất gần đây": lưu BỘ LỌC (không lưu file) 30 lần gần nhất theo tài khoản, trong localStorage của máy này.
import { vnDate } from '@/lib/export/ten-file';
import { timeRange, type ExportFilter } from './fetchDataset';

export type HistoryItem<S> = { at: string; by: string; summary: string; rows: number; state: S };
const KEY = (userId: string) => `qlcp-xuat-du-lieu:${userId}`;
const MAX = 30;

export function readHistory<S>(userId: string): HistoryItem<S>[] {
  try {
    const raw = localStorage.getItem(KEY(userId));
    const xs = raw ? (JSON.parse(raw) as HistoryItem<S>[]) : [];
    return Array.isArray(xs) ? xs : [];
  } catch {
    return [];
  }
}

export function pushHistory<S>(userId: string, item: HistoryItem<S>): void {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify([item, ...readHistory<S>(userId)].slice(0, MAX)));
  } catch { /* trình duyệt chặn lưu: bỏ qua */ }
}

/** Mô tả bộ lọc bằng chữ (đầu file + lịch sử) */
export function describeFilter(f: ExportFilter, projectName: (id: string) => string): string {
  const parts: string[] = [];
  if (f.projectMode === 'all') parts.push('Tất cả công trình');
  else if (f.projectMode === 'none') parts.push('Dòng không gán công trình');
  else {
    const names = f.projectIds.map(projectName).filter(Boolean);
    parts.push(names.length ? (names.length > 3 ? `${names.slice(0, 3).join(', ')} và ${names.length - 3} công trình khác` : names.join(', ')) : '(chưa chọn công trình)');
  }
  const r = timeRange(f.time);
  parts.push(!r ? 'mọi thời gian' : f.time.mode === 'year' ? `năm ${f.time.year}` : f.time.mode === 'month' ? `tháng ${f.time.ym.slice(5)}/${f.time.ym.slice(0, 4)}` : `từ ${vnDate(r[0])} đến ${vnDate(r[1])}`);
  if (f.includeDeleted) parts.push('gồm dòng đã xóa');
  if (f.projectMode !== 'all' && !f.contactsByProject) parts.push('danh bạ lấy tất cả');
  return parts.join(' · ');
}
