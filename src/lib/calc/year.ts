// LỌC THEO NĂM — hàm duy nhất của cả app (KẾ HOẠCH mục 4K). Chép từ app cũ:
// `inActiveYear`, `_ctInActiveYear`, `_entityInYear` (tienich.js), `_dtInYear` (doanhthu.core.js).
import type { CalcData, CalcProject, IsoDate } from './types';

/** Các năm đang chọn. Mảng rỗng = "Tất cả năm". */
export type YearFilter = readonly number[];

export const ALL_YEARS: YearFilter = [];

export function toYearFilter(sel: 'all' | readonly number[]): YearFilter {
  return sel === 'all' ? ALL_YEARS : sel;
}

export function isAllYears(years: YearFilter): boolean {
  return years.length === 0;
}

export function yearOf(date: IsoDate | null | undefined): number | null {
  if (!date || date.length < 4) return null;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

/** `inActiveYear`: dòng KHÔNG có ngày thì không thuộc năm nào (kể cả "Tất cả năm"). */
export function inYear(date: IsoDate | null | undefined, years: YearFilter): boolean {
  if (!date) return false;
  if (years.length === 0) return true;
  const y = yearOf(date);
  return y !== null && years.includes(y);
}

/** `_dtInYear` (thu tiền, hợp đồng, quyết toán, phiếu chi): dòng không có ngày thì hiện ở mọi năm. */
export function inYearLoose(date: IsoDate | null | undefined, years: YearFilter): boolean {
  if (years.length === 0) return true;
  if (!date) return true;
  return inYear(date, years);
}

/** Cộng ngày cho chuỗi 'YYYY-MM-DD' (tính theo lịch, không dính múi giờ). */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Thứ Bảy của tuần chấm công (đầu tuần là Chủ nhật) — ngày tính LƯƠNG vào chi phí. */
export function weekEnd(weekStart: IsoDate): IsoDate {
  return addDays(weekStart, 6);
}

/** Tuần vắt năm: Chủ nhật thuộc năm cũ, thứ Bảy thuộc năm mới. */
export function isCrossYearWeek(weekStart: IsoDate): boolean {
  return yearOf(weekStart) !== yearOf(weekEnd(weekStart));
}

/** Chấm công khi LIỆT KÊ: theo ngày đầu tuần. */
export function timesheetWeekInYear(weekStart: IsoDate, years: YearFilter): boolean {
  return inYear(weekStart, years);
}

/**
 * Công trình có hiện trong năm đang chọn không (`_ctInActiveYear`):
 * năm tạo = năm đang chọn, HOẶC có hóa đơn / chấm công (đầu tuần) / phiếu chi trong năm.
 */
export function projectInYear(
  p: Pick<CalcProject, 'id' | 'created_year'>,
  years: YearFilter,
  data: Pick<CalcData, 'expenses' | 'timesheetWeeks' | 'payments'>,
): boolean {
  if (years.length === 0) return true;
  if (p.created_year !== null && years.includes(p.created_year)) return true;
  return (
    data.expenses.some((e) => e.project_id === p.id && inYear(e.date, years)) ||
    data.timesheetWeeks.some((w) => w.project_id === p.id && inYear(w.week_start, years)) ||
    data.payments.some((x) => x.project_id === p.id && inYear(x.date, years))
  );
}

/** Tập id công trình thuộc năm (tính 1 lượt cho cả danh sách, nhanh hơn gọi `projectInYear` từng cái). */
export function projectIdsInYear(
  projects: readonly Pick<CalcProject, 'id' | 'created_year'>[],
  years: YearFilter,
  data: Pick<CalcData, 'expenses' | 'timesheetWeeks' | 'payments'>,
): Set<string> {
  if (years.length === 0) return new Set(projects.map((p) => p.id));
  const active = new Set<string>();
  for (const e of data.expenses) if (inYear(e.date, years)) active.add(e.project_id);
  for (const w of data.timesheetWeeks) if (inYear(w.week_start, years)) active.add(w.project_id);
  for (const x of data.payments) if (x.project_id && inYear(x.date, years)) active.add(x.project_id);
  return new Set(projects.filter((p) => active.has(p.id) || (p.created_year !== null && years.includes(p.created_year))).map((p) => p.id));
}

/** Các năm có dữ liệu (để tự chọn năm lúc mở app, `_autoSelectYearsWithData`). */
export function yearsWithData(data: Pick<CalcData, 'expenses' | 'timesheetWeeks' | 'payments' | 'receipts'>): number[] {
  const s = new Set<number>();
  const add = (d: IsoDate | null) => { const y = yearOf(d); if (y) s.add(y); };
  data.expenses.forEach((e) => add(e.date));
  data.timesheetWeeks.forEach((w) => add(w.week_start));
  data.payments.forEach((x) => add(x.date));
  data.receipts.forEach((r) => add(r.date));
  return [...s].sort((a, b) => a - b);
}
