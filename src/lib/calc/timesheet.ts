// CHẤM CÔNG — tổng công, lương, thực lãnh. Chép từ `calcCCRow` (chamcong.week-form.js)
// và phần chấm công của `buildInvoices` (tienich.js).
import type { CalcTimesheetLine, CalcTimesheetWeek, CostEntry } from './types';
import { weekEnd } from './year';

/** `round1`: làm tròn 1 số lẻ (0,5 công) */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Làm tròn 2 số lẻ (ô ngày công gõ số lẻ từ GĐ99: 1,3 · 0,75) — khớp kiểu numeric(…,2) trong kho */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Tiền công = số công × lương ngày, tính trên phần trăm công (số nguyên) để 2,05 × 400.000 ra đúng 820.000
 * (nhân số thực trực tiếp ra 819.999,99…). Số công bội số của 0,5 (dữ liệu cũ) cho đúng kết quả cũ.
 * Làm tròn về đồng nguyên (tiền trong kho là bigint): 1,25 công × 350.050 = 437.562,5 → 437.563.
 */
export function dayWage(dayUnits: number, dailyWage: number): number {
  return Math.round((Math.round(dayUnits * 100) * (dailyWage || 0)) / 100);
}

/**
 * Tổng công của 1 người trong tuần (7 ô ngày) = ô "TC" trên bảng chấm công.
 * App cũ làm tròn 1 số lẻ (`round1`) vì ô chỉ có 1 / ½ / 0; GĐ99 cho gõ số lẻ (0,75) nên làm tròn 2 số lẻ.
 * Dữ liệu cũ (bội số của 0,5) cho cùng kết quả.
 */
export function totalDayUnits(dayUnits: readonly (number | null)[]): number {
  let tc = 0;
  for (let i = 0; i < 7; i++) tc += Number(dayUnits[i]) || 0;
  return round2(tc);
}

export type TimesheetRowTotals = {
  /** Tổng công */
  dayUnits: number;
  /** Tổng lương = tổng công × lương ngày */
  wage: number;
  /** Thực lãnh = tổng lương + phụ cấp + HĐ mua lẻ (tạm ứng / trừ nợ nằm ở sổ Tạm ứng lương) */
  netPay: number;
};

export function calcTimesheetRow(line: Pick<CalcTimesheetLine, 'day_units' | 'daily_wage' | 'allowance' | 'retail_purchase'>): TimesheetRowTotals {
  const dayUnits = totalDayUnits(line.day_units);
  const wage = dayWage(dayUnits, line.daily_wage || 0);
  return { dayUnits, wage, netPay: wage + (line.allowance || 0) + (line.retail_purchase || 0) };
}

/**
 * Lương 1 người khi tính CHI PHÍ công trình = Σ công × lương ngày + phụ cấp.
 * (`buildInvoices` cộng thẳng 7 ô ngày, KHÔNG làm tròn 1 số lẻ như `calcCCRow` — giữ đúng như vậy.)
 */
export function lineWageCost(line: Pick<CalcTimesheetLine, 'day_units' | 'daily_wage' | 'allowance'>): number {
  const tc = (line.day_units ?? []).reduce((a: number, v) => a + (Number(v) || 0), 0);
  return dayWage(tc, line.daily_wage || 0) + (line.allowance || 0);
}

/**
 * Dòng chi phí sinh từ chấm công (không lưu trong bảng hóa đơn), như `buildInvoices`:
 * - mỗi tuần × công trình: 1 dòng "Nhân công" = tổng lương cả tổ (chỉ khi > 0);
 * - mỗi người có HĐ mua lẻ > 0: 1 dòng "Hóa đơn lẻ".
 * Ngày = THỨ BẢY của tuần (tuần vắt năm thì lương tính vào năm mới).
 */
export function timesheetCostEntries(weeks: readonly CalcTimesheetWeek[], lines: readonly CalcTimesheetLine[]): CostEntry[] {
  const byWeek = new Map<string, CalcTimesheetLine[]>();
  for (const l of lines) {
    const arr = byWeek.get(l.week_id);
    if (arr) arr.push(l); else byWeek.set(l.week_id, [l]);
  }
  const out: CostEntry[] = [];
  for (const w of weeks) {
    const ls = byWeek.get(w.id);
    if (!w.week_start || !ls || ls.length === 0) continue;
    const date = weekEnd(w.week_start);
    ls.forEach((l, i) => {
      if (l.retail_purchase > 0) {
        out.push({ id: `cc|${w.id}|${l.worker_id ?? i}|hdml`, project_id: w.project_id, date, amount: l.retail_purchase, paid_at_purchase: true, source: 'retail', week_id: w.id, worker_id: l.worker_id ?? null });
      }
    });
    const wage = ls.reduce((s, l) => s + lineWageCost(l), 0);
    if (wage > 0) out.push({ id: `cc|${w.id}|nhanCong`, project_id: w.project_id, date, amount: wage, paid_at_purchase: true, source: 'wage', week_id: w.id });
  }
  return out;
}
