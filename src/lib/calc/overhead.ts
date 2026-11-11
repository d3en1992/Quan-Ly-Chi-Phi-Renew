// PHÂN BỔ CHI PHÍ CHUNG CÔNG TY (cột C). Chép từ `getProjectDays`, `getProjectK`, `getProjectWeight`,
// `getCompanyCost`, `allocateCompanyCost` (projects.model.js).
import type { CalcProject, CostEntry, IsoDate } from './types';
import { inYear, type YearFilter } from './year';

const DAY_MS = 86_400_000;
/** App cũ tính ngày theo giờ máy ở Việt Nam (UTC+7, không đổi giờ mùa hè) → cố định để máy nào cũng ra cùng số. */
const VN_OFFSET_MS = 7 * 3_600_000;

/** 'YYYY-MM-DD' lúc 00:00 giờ UTC — cách `new Date('2026-01-05')` của app cũ hiểu chuỗi chỉ có ngày */
function utcMidnight(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}
/** Giờ Việt Nam → mốc thời gian — `new Date('2026-01-05T00:00:00')` của app cũ */
function vnTime(date: IsoDate, h = 0, mi = 0, s = 0): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d, h, mi, s) - VN_OFFSET_MS;
}

/**
 * Số ngày thi công của công trình trong phạm vi năm đang chọn (`getProjectDays`).
 * - Không có ngày bắt đầu → 1.
 * - Chọn ĐÚNG 1 năm → cắt theo năm đó; không giao nhau → 0; có giao nhau thì tối thiểu 1.
 * - "Tất cả năm" hoặc chọn NHIỀU năm → cả vòng đời (app cũ: `activeYear = 0` khi chọn nhiều năm).
 * - Chưa có ngày kết thúc → tính tới `now`.
 */
export function projectDays(p: Pick<CalcProject, 'start_date' | 'end_date'>, years: YearFilter, now: number): number {
  if (!p.start_date) return 1;
  if (years.length !== 1) {
    const endMs = p.end_date ? utcMidnight(p.end_date) : now;
    const days = Math.ceil((endMs - utcMidnight(p.start_date)) / DAY_MS);
    return days <= 0 ? 1 : days;
  }
  const year = years[0]!;
  const yearStart = vnTime(`${year}-01-01`);
  const yearEnd = vnTime(`${year}-12-31`, 23, 59, 59);
  const projStart = vnTime(p.start_date);
  const projEnd = p.end_date ? vnTime(p.end_date, 23, 59, 59) : now;
  if (projEnd < yearStart || projStart > yearEnd) return 0;
  const days = Math.ceil((Math.min(projEnd, yearEnd) - Math.max(projStart, yearStart)) / DAY_MS);
  return days <= 0 ? 1 : days;
}

/** Hệ số k (`getProjectK`): chưa nhập / không hợp lệ → 1; k = 0 → không gánh chi phí chung. */
export function projectK(p: Pick<CalcProject, 'cost_weight_k'>): number {
  const k = p.cost_weight_k;
  return typeof k === 'number' && Number.isFinite(k) && k >= 0 ? k : 1;
}

/** Trọng số = số ngày thi công × k */
export function projectWeight(p: Pick<CalcProject, 'start_date' | 'end_date' | 'cost_weight_k'>, years: YearFilter, now: number): number {
  return projectDays(p, years, now) * projectK(p);
}

/** Tổng chi phí chung của CÔNG TY trong năm đang chọn (`getCompanyCost`): mọi dòng chi phí của CÔNG TY, kể cả mua nợ. */
export function companyOverheadCost(costs: readonly CostEntry[], companyProjectIds: ReadonlySet<string>, years: YearFilter): number {
  let s = 0;
  for (const c of costs) if (companyProjectIds.has(c.project_id) && inYear(c.date, years)) s += c.amount;
  return s;
}

export type OverheadShare = {
  projectId: string;
  /** Số ngày thi công trong phạm vi năm */
  days: number;
  k: number;
  /** ngày × k (chưa làm tròn) */
  weight: number;
  /** Tỉ lệ gánh 0..1 */
  ratio: number;
  /** Tiền chi phí chung phân bổ (chưa làm tròn — làm tròn lúc hiển thị, như app cũ) */
  allocated: number;
};

/**
 * Phân bổ chi phí chung theo ngày × k (`allocateCompanyCost`).
 * Chỉ công trình CÓ ngày bắt đầu và có ngày thi công trong phạm vi mới gánh. CÔNG TY không gánh.
 */
export function allocateOverhead(projects: readonly CalcProject[], totalCost: number, years: YearFilter, now: number): OverheadShare[] {
  const rows = projects
    .filter((p) => !p.is_company_overhead && p.start_date)
    .map((p) => ({ p, days: projectDays(p, years, now), k: projectK(p) }))
    .filter((r) => r.days > 0);
  const totalWeight = rows.reduce((s, r) => s + r.days * r.k, 0);
  return rows.map((r) => {
    const weight = r.days * r.k;
    const ratio = totalWeight > 0 ? weight / totalWeight : 0;
    return { projectId: r.p.id, days: r.days, k: r.k, weight, ratio, allocated: totalCost * ratio };
  });
}
