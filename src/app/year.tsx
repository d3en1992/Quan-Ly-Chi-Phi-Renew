// Chọn năm trên thanh trên: nhiều năm hoặc "Tất cả". Lưu trên máy (localStorage) cho tiện.
// Cách lọc theo năm cụ thể làm ở GĐ3 (KẾ HOẠCH mục 4K).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const FIRST_YEAR = 2019; // dữ liệu cũ nhập lại bắt đầu từ 2019 (27/11/2026); có năm cũ hơn thì ô chọn năm tự thêm (useYearOptions)
export type YearSelection = 'all' | number[];

type YearState = {
  years: YearSelection;
  setYears: (y: YearSelection) => void;
  options: number[];
  label: string;
};

const YearContext = createContext<YearState | null>(null);
const STORAGE_KEY = 'qlcp-years';

export function yearOptions(now: Date = new Date(), firstYear: number = FIRST_YEAR): number[] {
  const out: number[] = [];
  for (let y = now.getFullYear(); y >= Math.min(firstYear, FIRST_YEAR); y--) out.push(y);
  return out;
}

/** Năm sớm nhất có dữ liệu (công trình theo năm tạo, hóa đơn theo ngày) — dữ liệu cũ nhập bằng lệnh có thể về trước FIRST_YEAR */
async function firstDataYear(): Promise<number | null> {
  const [p, e] = await Promise.all([
    supabase.from('projects').select('created_year').is('deleted_at', null).not('created_year', 'is', null).order('created_year').limit(1),
    supabase.from('expenses').select('date').is('deleted_at', null).order('date').limit(1),
  ]);
  const ys = [p.data?.[0]?.created_year, e.data?.[0]?.date ? Number(String(e.data[0].date).slice(0, 4)) : null].filter((y): y is number => typeof y === 'number' && y > 1990);
  return ys.length ? Math.min(...ys) : null;
}

/** Danh sách năm cho ô chọn năm (chỉ dùng sau khi đăng nhập) */
export function useYearOptions(): number[] {
  const q = useQuery({ queryKey: ['first-data-year'], queryFn: firstDataYear, staleTime: 10 * 60_000 });
  return useMemo(() => yearOptions(new Date(), q.data ?? FIRST_YEAR), [q.data]);
}

export function yearLabel(years: YearSelection): string {
  if (years === 'all') return 'Tất cả';
  if (years.length === 0) return 'Chưa chọn';
  const sorted = [...years].sort((a, b) => a - b);
  if (sorted.length <= 2) return sorted.join(', ');
  return `${sorted[0]}–${sorted[sorted.length - 1]} (${sorted.length} năm)`;
}

function load(): YearSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'all') return 'all';
    const arr = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(arr) && arr.every((x) => typeof x === 'number') && arr.length > 0) return arr as number[];
  } catch {
    /* bỏ qua */
  }
  return [new Date().getFullYear()];
}

export function YearProvider({ children }: { children: ReactNode }) {
  const [years, setYearsState] = useState<YearSelection>(load);
  const value = useMemo<YearState>(
    () => ({
      years,
      options: yearOptions(),
      label: yearLabel(years),
      setYears: (y) => {
        setYearsState(y);
        try {
          localStorage.setItem(STORAGE_KEY, y === 'all' ? 'all' : JSON.stringify(y));
        } catch {
          /* bỏ qua */
        }
      },
    }),
    [years],
  );
  return <YearContext.Provider value={value}>{children}</YearContext.Provider>;
}

export function useYears(): YearState {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error('useYears phải nằm trong YearProvider');
  return ctx;
}
