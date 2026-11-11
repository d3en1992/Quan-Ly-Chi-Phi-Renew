// Số tiền của từng công trình cho màn Công Trình và Chi tiết — CHỈ gọi công thức trong src/lib/calc,
// cùng hàm `profitReport` với tab Lợi Nhuận nên hai nơi luôn ra cùng một số.
import { ALL_YEARS, buildProfitIndex, profitContext, profitReport, projectProfit, type CalcProject, type ProfitReport, type ProjectProfit, type YearFilter } from '@/lib/calc';
import type { ReportData } from '@/features/reports/api';

export type ProjectNumbers = {
  report: ProfitReport;
  /** Số của 1 công trình trong phạm vi năm (đúng dòng tab Lợi Nhuận); công trình chưa có dòng thì tính toàn vòng đời */
  of: (project: Pick<CalcProject, 'id' | 'name'>) => ProjectProfit;
  /** Số công trình đang gánh chi phí chung (C > 0) */
  overheadBearers: number;
};

export function projectNumbers(data: ReportData, years: YearFilter, now: number): ProjectNumbers {
  const report = profitReport(data, years, now);
  const byId = new Map(report.rows.map((r) => [r.projectId, r]));
  let lifeCtx: ReturnType<typeof profitContext> | null = null;
  const of = (p: Pick<CalcProject, 'id' | 'name'>): ProjectProfit => {
    const row = byId.get(p.id);
    if (row) return row;
    lifeCtx ??= profitContext(buildProfitIndex(data), ALL_YEARS, now);
    return projectProfit(p, lifeCtx);
  };
  return { report, of, overheadBearers: report.rows.filter((r) => r.C > 0).length };
}
