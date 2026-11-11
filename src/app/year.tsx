// Chọn năm trên thanh trên: nhiều năm hoặc "Tất cả". Lưu trên máy (localStorage) cho tiện.
// Cách lọc theo năm cụ thể làm ở GĐ3 (KẾ HOẠCH mục 4K).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export const FIRST_YEAR = 2020; // dữ liệu cũ bắt đầu từ 2020
export type YearSelection = 'all' | number[];

type YearState = {
  years: YearSelection;
  setYears: (y: YearSelection) => void;
  options: number[];
  label: string;
};

const YearContext = createContext<YearState | null>(null);
const STORAGE_KEY = 'qlcp-years';

export function yearOptions(now: Date = new Date()): number[] {
  const out: number[] = [];
  for (let y = now.getFullYear(); y >= FIRST_YEAR; y--) out.push(y);
  return out;
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
