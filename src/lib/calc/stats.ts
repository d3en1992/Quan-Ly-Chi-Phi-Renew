// SỐ TỔNG HỢP cho Dashboard và Thống Kê CP/HĐ: chi theo tuần, cơ cấu chi theo loại, tổng một danh sách hóa đơn.
// Chỉ cộng các dòng chi phí đã dựng bởi `buildCostEntries` — không có công thức lãi / lỗ riêng ở đây.
import { subcontractPayables } from './payables';
import type { ProfitRow } from './profit';
import type { CalcPayment, CalcSubcontract, CostEntry, IsoDate } from './types';
import { addDays, inYear, inYearLoose, type YearFilter } from './year';

/** Chủ nhật đầu tuần của một ngày (tuần chấm công: CN → T7) */
export function weekStartOf(date: IsoDate): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, -dow);
}

/** Số thứ tự tuần trong năm (tuần 1 chứa ngày 01/01, tuần bắt đầu Chủ nhật) — chỉ để ghi nhãn "T44" */
export function weekNumber(weekStart: IsoDate): number {
  const sat = addDays(weekStart, 6);
  const jan1 = `${sat.slice(0, 4)}-01-01`;
  const first = weekStartOf(jan1);
  const [y1, m1, d1] = first.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = weekStart.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (7 * 86_400_000)) + 1;
}

export type WeekCost = { weekStart: IsoDate; week: number; amount: number };

/**
 * Tổng chi phí (mọi hóa đơn + lương chấm công) của `count` tuần liên tiếp, kết thúc ở tuần chứa `lastDate`.
 * Lương chấm công nằm ở thứ Bảy nên rơi đúng vào tuần của nó.
 */
export function weeklyCosts(costs: readonly CostEntry[], lastDate: IsoDate, count: number): WeekCost[] {
  const last = weekStartOf(lastDate);
  const first = addDays(last, -7 * (count - 1));
  const sums = new Map<IsoDate, number>();
  for (const c of costs) {
    if (!c.date || c.date < first || c.date > addDays(last, 6)) continue;
    const w = weekStartOf(c.date);
    sums.set(w, (sums.get(w) ?? 0) + c.amount);
  }
  return Array.from({ length: count }, (_, i) => {
    const weekStart = addDays(first, 7 * i);
    return { weekStart, week: weekNumber(weekStart), amount: sums.get(weekStart) ?? 0 };
  });
}

/** Ngày cuối để vẽ biểu đồ tuần: hôm nay nếu thuộc năm đang chọn, không thì ngày có chi phí muộn nhất trong năm. */
export function lastCostDate(costs: readonly CostEntry[], years: YearFilter, today: IsoDate): IsoDate {
  if (inYear(today, years)) return today;
  let max = '';
  for (const c of costs) if (c.date && inYear(c.date, years) && c.date > max) max = c.date;
  return max || today;
}

export type BreakdownItem = { label: string; amount: number };

/**
 * Cơ cấu chi theo loại trong năm: mỗi loại chi phí của các công trình; lương chấm công = "Nhân Công";
 * HĐ mua lẻ trong chấm công = "Hóa Đơn Lẻ"; mọi chi phí của CÔNG TY gộp thành "Chi phí chung";
 * tiền đã chi thầu phụ = "Thầu phụ". Xếp giảm dần; quá `top` loại thì gộp phần còn lại vào "Khác".
 */
export function costBreakdown(
  costs: readonly CostEntry[],
  payments: readonly CalcPayment[],
  companyProjectIds: ReadonlySet<string>,
  typeName: (expenseTypeId: string | null | undefined) => string,
  years: YearFilter,
  top = 8,
): BreakdownItem[] {
  const m = new Map<string, number>();
  const add = (k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const c of costs) {
    if (!inYear(c.date, years)) continue;
    if (companyProjectIds.has(c.project_id)) add('Chi phí chung', c.amount);
    else if (c.source === 'wage') add('Nhân Công', c.amount);
    else if (c.source === 'retail') add('Hóa Đơn Lẻ', c.amount);
    else add(typeName(c.expense?.expense_type_id) || 'Chưa phân loại', c.amount);
  }
  for (const p of payments) if ((p.kind === 'advance' || p.kind === 'progress') && inYearLoose(p.date, years)) add('Thầu phụ', p.amount || 0);
  const all = [...m].map(([label, amount]) => ({ label, amount })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  if (all.length <= top) return all;
  const rest = all.slice(top - 1).reduce((s, x) => s + x.amount, 0);
  return [...all.slice(0, top - 1), { label: 'Khác', amount: rest }];
}

/** Tổng còn phải trả thầu phụ của các hợp đồng trong phạm vi năm (chỉ cộng HĐ còn nợ > 0). */
export function subcontractDebtTotal(contracts: readonly CalcSubcontract[], payments: readonly CalcPayment[], years: YearFilter): number {
  const inScope = new Set(contracts.filter((h) => inYearLoose(h.date, years)).map((h) => h.id));
  return subcontractPayables(contracts, payments).reduce((s, r) => s + (inScope.has(r.subcontractId) && r.debt > 0 ? r.debt : 0), 0);
}

export type DashboardTotals = {
  spent: number; totalCost: number; received: number; contractValue: number; receivable: number; profit: number;
  profitable: number; losing: number;
};

/** Cộng các dòng của bảng Lợi Nhuận cho dải số tổng (Dashboard và Lợi Nhuận dùng chung → luôn cùng số). */
export function dashboardTotals(rows: readonly ProfitRow[]): DashboardTotals {
  const t: DashboardTotals = { spent: 0, totalCost: 0, received: 0, contractValue: 0, receivable: 0, profit: 0, profitable: 0, losing: 0 };
  for (const r of rows) {
    t.spent += r.spent; t.totalCost += r.totalCost; t.received += r.received;
    t.contractValue += r.revenue.contractValue; t.receivable += r.revenue.receivable; t.profit += r.profit;
    if (Math.round(r.profit) < 0) t.losing++; else t.profitable++;
  }
  return t;
}

export type ExpenseSummary = {
  count: number;
  total: number;
  /** Hóa đơn nhập từ ảnh chụp */
  scanned: number;
  /** Hóa đơn mua nợ (chưa tích Đã TT) trong danh sách */
  creditTotal: number;
  topType: BreakdownItem | null;
};

/** Dải số tổng của tab Thống Kê CP/HĐ, tính trên danh sách ĐÃ lọc. */
export function summarizeExpenses(costs: readonly CostEntry[], typeLabel: (c: CostEntry) => string): ExpenseSummary {
  const byType = new Map<string, number>();
  let total = 0, scanned = 0, creditTotal = 0;
  for (const c of costs) {
    total += c.amount;
    if (c.source === 'scan' || c.expense?.source === 'scan') scanned++;
    if (!c.paid_at_purchase) creditTotal += c.amount;
    const k = typeLabel(c);
    byType.set(k, (byType.get(k) ?? 0) + c.amount);
  }
  let topType: BreakdownItem | null = null;
  for (const [label, amount] of byType) if (!topType || amount > topType.amount) topType = { label, amount };
  return { count: costs.length, total, scanned, creditTotal, topType };
}

/** % (làm tròn) của a trên b; b ≤ 0 → null */
export function percentOf(a: number, b: number): number | null {
  return b > 0 ? Math.round((a / b) * 100) : null;
}
