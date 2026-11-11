// LÃI / LỖ TỪNG CÔNG TRÌNH — đúng công thức app cũ (KẾ HOẠCH mục 4F điểm 6).
// Chép từ `lnTinhCongTrinh`, `_lnContext`, `_lnUngCT`, `lnEffectiveYear`, `renderLoiNhuan`
// (doanhthu.reports-export.js). Tính theo TIỀN THỰC THU, THỰC CHI, theo năm đang lọc.
//
//   A = hóa đơn đã tích "Đã TT" (gồm lương + HĐ mua lẻ từ chấm công, ngày thứ Bảy)
//       + tiền đã trả NCC chia vào công trình (lọc năm theo NGÀY PHIẾU CHI)
//   B = tiền đã chi thầu phụ (tạm ứng + thanh toán đợt)
//   C = chi phí chung CÔNG TY phân bổ theo ngày × k
//   Lợi nhuận = Tổng đã thu − (A + B + C)
import { allocateOverhead, companyOverheadCost, type OverheadShare } from './overhead';
import { projectRevenue, type ProjectRevenue } from './revenue';
import { timesheetCostEntries } from './timesheet';
import type { CalcData, CalcMainContract, CalcProject, CalcReceipt, CalcSettlement, CostEntry } from './types';
import { ALL_YEARS, inYear, inYearLoose, isAllYears, yearOf, type YearFilter } from './year';

/** Mọi dòng chi phí: hóa đơn nhập tay + dòng sinh từ chấm công (`buildInvoices`). */
export function buildCostEntries(data: Pick<CalcData, 'expenses' | 'timesheetWeeks' | 'timesheetLines'>): CostEntry[] {
  const manual: CostEntry[] = data.expenses.map((e) => ({
    id: e.id, project_id: e.project_id, date: e.date, amount: e.amount || 0, paid_at_purchase: e.paid_at_purchase,
    source: e.source === 'quick' || e.source === 'detail' ? e.source : 'manual', expense: e,
  }));
  return [...manual, ...timesheetCostEntries(data.timesheetWeeks, data.timesheetLines)];
}

function groupBy<T>(rows: readonly T[], key: (r: T) => string | null | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const arr = m.get(k);
    if (arr) arr.push(r); else m.set(k, [r]);
  }
  return m;
}

/** Dữ liệu đã gom theo công trình — dựng 1 lần, dùng cho mọi năm. */
export type ProfitIndex = {
  projects: CalcProject[];
  /** Công trình thật (không gồm CÔNG TY) */
  realProjects: CalcProject[];
  companyIds: Set<string>;
  costs: CostEntry[];
  costsByProject: Map<string, CostEntry[]>;
  /** Phần tiền trả NCC đã chia, kèm ngày phiếu chi */
  supplierPaidByProject: Map<string, { date: string | null; amount: number }[]>;
  subcontractPaidByProject: Map<string, { date: string | null; amount: number }[]>;
  receiptsByProject: Map<string, CalcReceipt[]>;
  contractsByProject: Map<string, CalcMainContract[]>;
  settlementsByProject: Map<string, CalcSettlement[]>;
};

export function buildProfitIndex(data: CalcData): ProfitIndex {
  const costs = buildCostEntries(data);
  const payById = new Map(data.payments.map((p) => [p.id, p]));
  const supplierPaid = new Map<string, { date: string | null; amount: number }[]>();
  for (const a of data.paymentAllocations) {
    const pay = payById.get(a.payment_id);
    // Phiếu chi đã xóa thì phần chia của nó không còn tính. Dòng không gắn hóa đơn (trả dư) vẫn tính.
    if (!pay || pay.kind !== 'supplier_payment' || !a.project_id) continue;
    const arr = supplierPaid.get(a.project_id);
    const item = { date: pay.date, amount: a.amount || 0 };
    if (arr) arr.push(item); else supplierPaid.set(a.project_id, [item]);
  }
  const subPaid = new Map<string, { date: string | null; amount: number }[]>();
  for (const p of data.payments) {
    if ((p.kind !== 'advance' && p.kind !== 'progress') || !p.project_id) continue;
    const arr = subPaid.get(p.project_id);
    const item = { date: p.date, amount: p.amount || 0 };
    if (arr) arr.push(item); else subPaid.set(p.project_id, [item]);
  }
  return {
    projects: data.projects,
    realProjects: data.projects.filter((p) => !p.is_company_overhead),
    companyIds: new Set(data.projects.filter((p) => p.is_company_overhead).map((p) => p.id)),
    costs,
    costsByProject: groupBy(costs, (c) => c.project_id),
    supplierPaidByProject: supplierPaid,
    subcontractPaidByProject: subPaid,
    receiptsByProject: groupBy(data.receipts, (r) => r.project_id),
    contractsByProject: groupBy(data.mainContracts, (c) => c.project_id),
    settlementsByProject: groupBy(data.settlements, (s) => s.project_id),
  };
}

export type ProjectProfit = {
  projectId: string;
  name: string;
  /** A · Hóa đơn = paidInvoices + supplierPaid */
  A: number;
  /** Phần hóa đơn đã tích Đã TT (gồm lương chấm công) */
  paidInvoices: number;
  /** Phần tiền đã trả NCC mua nợ */
  supplierPaid: number;
  /** B · Đã chi thầu phụ */
  B: number;
  /** C · Chi phí chung phân bổ (chưa làm tròn) */
  C: number;
  /** Tổng đã chi = A + B + C */
  spent: number;
  /** Tổng đã thu (= doanh thu) */
  received: number;
  /** Lợi nhuận = đã thu − đã chi */
  profit: number;
  revenue: ProjectRevenue;
  /** Nợ NCC còn lại của công trình = hóa đơn mua nợ − đã trả (không âm) */
  supplierDebt: number;
  /** Tổng chi phí (mọi HĐ) = đã chi + nợ NCC còn lại — CỘT THAM KHẢO, không dùng tính lãi / lỗ */
  totalCost: number;
};

export type ProfitContext = {
  index: ProfitIndex;
  years: YearFilter;
  /** Tổng chi phí chung CÔNG TY trong năm */
  overheadTotal: number;
  overhead: OverheadShare[];
  overheadByProject: Map<string, number>;
};

/** `_lnContext`: phân bổ chi phí chung cho phạm vi năm, tính 1 lần cho mọi công trình. */
export function profitContext(index: ProfitIndex, years: YearFilter, now: number): ProfitContext {
  const overheadTotal = companyOverheadCost(index.costs, index.companyIds, years);
  const overhead = allocateOverhead(index.projects, overheadTotal, years, now);
  return { index, years, overheadTotal, overhead, overheadByProject: new Map(overhead.map((o) => [o.projectId, o.allocated])) };
}

/** `lnTinhCongTrinh`: số liệu lãi / lỗ của 1 công trình trong phạm vi năm của `ctx`. */
export function projectProfit(p: Pick<CalcProject, 'id' | 'name'>, ctx: ProfitContext): ProjectProfit {
  const { index, years } = ctx;
  let paidInvoices = 0, unpaidInvoices = 0;
  // Hóa đơn: `_dtInYear` — dòng thiếu ngày vẫn hiện ở mọi năm
  for (const c of index.costsByProject.get(p.id) ?? []) {
    if (!inYearLoose(c.date, years)) continue;
    if (c.paid_at_purchase) paidInvoices += c.amount; else unpaidInvoices += c.amount;
  }
  const sumInYear = (rows: { date: string | null; amount: number }[] | undefined) =>
    (rows ?? []).reduce((s, r) => s + (inYearLoose(r.date, years) ? r.amount : 0), 0);
  const supplierPaid = sumInYear(index.supplierPaidByProject.get(p.id));
  const B = sumInYear(index.subcontractPaidByProject.get(p.id));
  const C = ctx.overheadByProject.get(p.id) ?? 0;
  const revenue = projectRevenue(index.contractsByProject.get(p.id) ?? [], index.receiptsByProject.get(p.id) ?? [], index.settlementsByProject.get(p.id) ?? [], years);
  const A = paidInvoices + supplierPaid;
  const spent = A + B + C;
  const supplierDebt = Math.max(0, unpaidInvoices - supplierPaid);
  return {
    projectId: p.id, name: p.name, A, paidInvoices, supplierPaid, B, C, spent,
    received: revenue.received, profit: revenue.received - spent, revenue, supplierDebt, totalCost: spent + supplierDebt,
  };
}

/** Ngưỡng tỉ trọng năm hạch toán (80%) */
export const EFFECTIVE_YEAR_RATE = 0.8;

export type EffectiveYear = {
  /** Năm chiếm ≥ 80% tổng hóa đơn vòng đời; không có → null */
  year: number | null;
  /** Tỉ lệ của năm cao nhất 0..1 */
  share: number;
  total: number;
  byYear: Record<number, number>;
};

/** `lnEffectiveYear`: gom MỌI hóa đơn (cả mua nợ, cả lương chấm công) của công trình theo năm, toàn vòng đời. */
export function effectiveYear(costs: readonly CostEntry[]): EffectiveYear {
  const byYear: Record<number, number> = {};
  let total = 0;
  for (const c of costs) {
    const y = yearOf(c.date);
    if (!y) continue;
    byYear[y] = (byYear[y] ?? 0) + c.amount;
    total += c.amount;
  }
  let year: number | null = null, share = 0;
  if (total > 0) {
    for (const [y, v] of Object.entries(byYear)) {
      const s = v / total;
      if (s > share) share = s;
      if (s >= EFFECTIVE_YEAR_RATE) year = parseInt(y, 10);
    }
  }
  return { year, share, total, byYear };
}

/**
 * Cách một dòng hiện trên tab Lợi Nhuận:
 * - 'all'   : đang xem "Tất cả năm" → số toàn vòng đời;
 * - 'ey'    : công trình hạch toán vào năm đang lọc (≥ 80% hóa đơn) → mọi cột là số TOÀN VÒNG ĐỜI;
 * - 'split' : không năm nào đạt 80% → các cột theo năm đang lọc, riêng LỢI NHUẬN là số toàn thời gian.
 */
export type ProfitRowMode = 'all' | 'ey' | 'split';

export type ProfitRow = ProjectProfit & {
  mode: ProfitRowMode;
  ey: EffectiveYear;
  /** Lãi / lỗ riêng năm đang lọc (chỉ có ở dòng 'split') */
  profitInYear?: number;
};

export type ProfitReport = {
  rows: ProfitRow[];
  totals: { baseContract: number; received: number; A: number; B: number; C: number; spent: number; profit: number };
  overheadTotal: number;
};

export function sumProfitRows(rows: readonly ProfitRow[]): ProfitReport['totals'] {
  const t = { baseContract: 0, received: 0, A: 0, B: 0, C: 0, spent: 0, profit: 0 };
  for (const r of rows) {
    t.baseContract += r.revenue.baseContract; t.received += r.received; t.A += r.A; t.B += r.B; t.C += r.C; t.profit += r.profit;
  }
  t.spent = t.A + t.B + t.C;
  return t;
}

/**
 * Bảng tab Lợi Nhuận (`renderLoiNhuan`), gồm quy tắc năm hạch toán 80%:
 * công trình có năm hạch toán chỉ hiện khi lọc đúng năm đó; công trình không có số liệu thì bỏ.
 * Tổng lợi nhuận = Σ lợi nhuận từng dòng (không lấy tổng thu − tổng chi, vì dòng 'split' dùng lãi toàn thời gian).
 */
export function profitReport(data: CalcData, years: YearFilter, now: number): ProfitReport {
  const index = buildProfitIndex(data);
  const lifeCtx = profitContext(index, ALL_YEARS, now);
  const yearMode = !isAllYears(years);
  const yearCtx = yearMode ? profitContext(index, years, now) : lifeCtx;
  const rows: ProfitRow[] = [];
  for (const p of index.realProjects) {
    const ey = effectiveYear(index.costsByProject.get(p.id) ?? []);
    const life = projectProfit(p, lifeCtx);
    let row: ProfitRow;
    if (!yearMode) row = { ...life, mode: 'all', ey };
    else if (ey.year) {
      if (!years.includes(ey.year)) continue;
      row = { ...life, mode: 'ey', ey };
    } else {
      const y = projectProfit(p, yearCtx);
      row = { ...y, profitInYear: y.profit, profit: life.profit, mode: 'split', ey };
    }
    if (row.received || row.A || row.B || row.C || row.revenue.baseContract || row.revenue.settlement) rows.push(row);
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return { rows, totals: sumProfitRows(rows), overheadTotal: yearCtx.overheadTotal };
}

/** Tỷ suất lợi nhuận (%) = lợi nhuận / đã thu; chưa có doanh thu → null */
export function profitMargin(profit: number, received: number): number | null {
  return received > 0 ? (profit / received) * 100 : null;
}

/** Ngưỡng "Tốt" của tỷ suất lợi nhuận (%) */
export const GOOD_MARGIN = 15;
export type ProfitRating = 'loss' | 'no_revenue' | 'good' | 'low';
/** `lnMarginBadge` */
export function profitRating(profit: number, margin: number | null): ProfitRating {
  if (profit < 0) return 'loss';
  if (margin === null) return 'no_revenue';
  return margin > GOOD_MARGIN ? 'good' : 'low';
}

/** Tổng chi phí theo năm của các dòng chi phí (dùng cho Dashboard / Thống kê). `inActiveYear`: thiếu ngày thì bỏ. */
export function sumCosts(costs: readonly CostEntry[], years: YearFilter): number {
  let s = 0;
  for (const c of costs) if (inYear(c.date, years)) s += c.amount;
  return s;
}
