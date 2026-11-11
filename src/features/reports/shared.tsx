// Phần dùng chung của 3 màn báo cáo: lấy dữ liệu + năm đang chọn, nhãn loại / trạng thái công trình, bỏ dấu để tìm.
import { useMemo, type ReactNode } from 'react';
import { useYears } from '@/app/year';
import { Card, ErrorState, LoadingState } from '@/components/ui/misc';
import { toYearFilter, type YearFilter } from '@/lib/calc';
import { useReportData, type ReportData } from './api';

export const KIND_LABEL: Record<string, string> = { new_build: 'CT · Xây mới', renovation: 'SC · Sửa chữa', small_repair: 'SN · Sửa nhỏ / khác' };
export const STATUS_LABEL: Record<string, string> = { planning: 'Chuẩn bị', active: 'Đang thi công', completed: 'Hoàn thành', closed: 'Đã quyết toán' };

/** "Chùa Huyền Trang" → "chua huyen trang" (tìm không dấu, như `_lnNorm` app cũ) */
export function normalizeText(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}
/** Mọi từ gõ vào đều phải có trong ít nhất một chuỗi */
export function matchesSearch(query: string, ...texts: (string | null | undefined)[]): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const words = q.split(' ');
  return texts.some((t) => { const n = normalizeText(t); return !!n && words.every((w) => n.includes(w)); });
}

/** Hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD */
export function todayIso(now = Date.now()): string {
  return new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function useReport() {
  const { years, label } = useYears();
  const query = useReportData();
  const yearFilter: YearFilter = useMemo(() => toYearFilter(years), [years]);
  return { query, data: query.data, years: yearFilter, yearLabel: years === 'all' ? 'Tất cả năm' : `Năm ${label}` };
}

/** Khung tải / lỗi chung: có dữ liệu mới vẽ nội dung */
export function ReportBody({ query, children }: { query: ReturnType<typeof useReportData>; children: (data: ReportData) => ReactNode }) {
  if (query.isPending) return <Card><LoadingState label="Đang tải số liệu…" /></Card>;
  if (query.isError) return <Card><ErrorState error={query.error} onRetry={() => void query.refetch()} /></Card>;
  return <>{children(query.data)}</>;
}
