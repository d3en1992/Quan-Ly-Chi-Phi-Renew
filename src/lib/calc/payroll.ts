// SỔ CHẤM CÔNG · TỔNG LƯƠNG TUẦN · TẠM ỨNG LƯƠNG · PHIẾU LƯƠNG — chép từ app cũ:
// `calcCCRow`, `updateCCSumRow` (chamcong.week-form.js), `renderCCTLT`, `ccPayslipData`, `ccPayslipText`
// (chamcong.history-reports.js), `_ccLegacyDebt`, `_calcDebtBefore`, `ccWorkerDebtUpTo`, `ccUngInRange`, `ccTraInRange`,
// `ccThucLanhLedgerAdj`, `snapToSunday`, `weekLabel` (chamcong.core.js), `renderCCUngLedger` (chamcong.ung-ledger.js).
//
// Khác app cũ (đã chốt ở GĐ6): cột "Trừ nợ" của sổ chấm công tự thành dòng "Trả" (repay, counts_in_net_pay = true,
// ngày = thứ Bảy) trong sổ Tạm ứng lương. Vì vậy Thực lãnh một dòng sổ = lương + phụ cấp + HĐ mua lẻ − trừ nợ, còn
// Thực lãnh ở Tổng lương tuần vẫn đúng công thức cũ: tl + pc + loan + hdml − tru + điều chỉnh từ sổ cái.
import type { CalcTimesheetLine, IsoDate } from './types';
import { dayWage, round2, totalDayUnits } from './timesheet';
import { addDays, inYear, weekEnd, type YearFilter } from './year';

export type PayWeek = { id: string; project_id: string; week_start: IsoDate };
export type PayrollLine = CalcTimesheetLine & {
  id?: string;
  worker_id: string;
  /** "Trừ nợ" đời cũ (tru) — dữ liệu mới luôn 0, tiền trừ nợ nằm ở wage_advances */
  debt_deduction: number;
  /** "Ứng" ghi thẳng trong tuần đời cũ (loanAmount) */
  legacy_loan: number;
  role?: string | null;
  position?: number;
};
export type WageAdvance = {
  id: string;
  worker_id: string;
  project_id: string | null;
  date: IsoDate;
  /** advance = ứng (+ nợ), repay = trả (− nợ) */
  direction: string;
  amount: number;
  counts_in_net_pay: boolean;
  source_week_id?: string | null;
  note?: string | null;
};

// ───────────── Ngày / tuần ─────────────

// Chủ nhật của tuần chứa một ngày (`snapToSunday`) = `weekStartOf` ở stats.ts

export function shiftWeek(weekStart: IsoDate, n: number): IsoDate {
  return addDays(weekStart, 7 * n);
}

const dm = (iso: IsoDate) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** `weekLabel`: "26/10–01/11/2026" (năm theo Chủ nhật, như app cũ) */
export function weekLabel(weekStart: IsoDate): string {
  return `${dm(weekStart)}–${dm(weekEnd(weekStart))}/${weekStart.slice(0, 4)}`;
}

/** Nhãn ô chọn tuần theo mẫu: "CN 26/10 – T7 01/11/2026" */
export function weekRangeLabel(weekStart: IsoDate): string {
  const sat = weekEnd(weekStart);
  return `CN ${dm(weekStart)} – T7 ${dm(sat)}/${sat.slice(0, 4)}`;
}

/** 'YYYY-MM' → [ngày đầu, ngày cuối] (`_ccUngMonthRange`) */
export function monthRange(ym: string): [IsoDate, IsoDate] {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`];
}

// ───────────── Một dòng sổ chấm công ─────────────

export type SheetRowInput = { day_units: readonly (number | null)[]; daily_wage: number; allowance: number; retail_purchase: number; deduction: number };
export type SheetRowTotals = { dayUnits: number; wage: number; netPay: number };

/** `calcCCRow` + cột Trừ nợ: Thực lãnh = công × lương ngày + phụ cấp + HĐ mua lẻ − trừ nợ */
export function calcSheetRow(r: SheetRowInput): SheetRowTotals {
  const dayUnits = totalDayUnits(r.day_units);
  const wage = dayWage(dayUnits, r.daily_wage || 0);
  return { dayUnits, wage, netPay: wage + (r.allowance || 0) + (r.retail_purchase || 0) - (r.deduction || 0) };
}

export type SheetTotals = { days: number[]; dayUnits: number; wage: number; allowance: number; retail: number; deduction: number; netPay: number };

/** `updateCCSumRow`: dòng tổng của sổ chấm công */
export function sheetTotals(rows: readonly SheetRowInput[]): SheetTotals {
  const days = [0, 0, 0, 0, 0, 0, 0];
  const t: SheetTotals = { days, dayUnits: 0, wage: 0, allowance: 0, retail: 0, deduction: 0, netPay: 0 };
  for (const r of rows) {
    for (let i = 0; i < 7; i++) days[i]! += Number(r.day_units[i]) || 0;
    const c = calcSheetRow(r);
    t.dayUnits += c.dayUnits;
    t.wage += c.wage;
    t.allowance += r.allowance || 0;
    t.retail += r.retail_purchase || 0;
    t.deduction += r.deduction || 0;
    t.netPay += c.netPay;
  }
  t.days = days.map(round2);
  t.dayUnits = round2(t.dayUnits);
  return t;
}

/** Ô ngày công: chạm đổi 1 → ½ → 0 → 1 (điện thoại, MP.cc) */
export function cycleDayUnit(v: number): number {
  if (v >= 1) return 0.5;
  if (v > 0) return 0;
  return 1;
}

/**
 * Ô ngày công gõ tay (GĐ99, anh Tình chọn): nhận số lẻ dấu chấm hoặc phẩy, không giới hạn trên — "1,3", "1.5", "2", "0.75".
 * Riêng đúng chữ "5" một mình = nửa công (0,5) như app cũ; "5.5", "15" là đúng số đó. Rỗng = 0.
 * Số âm / có chữ → null (báo lỗi, không nhận). Làm tròn 2 số lẻ.
 */
export function parseDayUnit(text: string): number | null {
  const t = text.trim();
  if (t === '') return 0;
  if (t === '5') return 0.5;
  if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

// ───────────── Sổ cái nợ công nhân ─────────────

type WeekLine = { week: PayWeek; line: PayrollLine };

export type PayrollIndex = {
  weekById: Map<string, PayWeek>;
  linesByWorker: Map<string, WeekLine[]>;
  advancesByWorker: Map<string, WageAdvance[]>;
};

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const a = m.get(k);
  if (a) a.push(v); else m.set(k, [v]);
};

/** Mọi danh sách đưa vào phải là bản ghi CÒN SỐNG (dòng của tuần đã xóa bị bỏ qua) */
export function buildPayrollIndex(weeks: readonly PayWeek[], lines: readonly PayrollLine[], advances: readonly WageAdvance[]): PayrollIndex {
  const weekById = new Map(weeks.map((w) => [w.id, w]));
  const linesByWorker = new Map<string, WeekLine[]>();
  for (const l of lines) {
    const w = weekById.get(l.week_id);
    if (w) push(linesByWorker, l.worker_id, { week: w, line: l });
  }
  const advancesByWorker = new Map<string, WageAdvance[]>();
  for (const a of advances) push(advancesByWorker, a.worker_id, a);
  return { weekById, linesByWorker, advancesByWorker };
}

const sign = (a: WageAdvance) => (a.direction === 'repay' ? -1 : 1);

/** `_ccLegacyDebt`: nợ từ dữ liệu chấm công đời cũ (ứng − trừ) ở các tuần thỏa điều kiện theo ngày đầu tuần */
function legacyDebt(ix: PayrollIndex, workerId: string, pred: (weekStart: IsoDate) => boolean): number {
  let s = 0;
  for (const { week, line } of ix.linesByWorker.get(workerId) ?? []) {
    if (pred(week.week_start)) s += (line.legacy_loan || 0) - (line.debt_deduction || 0);
  }
  return s;
}

function ledgerNet(ix: PayrollIndex, workerId: string, pred: (date: IsoDate) => boolean): number {
  let s = 0;
  for (const a of ix.advancesByWorker.get(workerId) ?? []) if (a.date && pred(a.date)) s += sign(a) * (a.amount || 0);
  return s;
}

/** `_calcDebtBefore`: dư nợ TRƯỚC ngày này (nợ cũ mang sang) */
export function debtBefore(ix: PayrollIndex, workerId: string, date: IsoDate): number {
  return legacyDebt(ix, workerId, (d) => d < date) + ledgerNet(ix, workerId, (d) => d < date);
}

/** `ccWorkerDebtUpTo`: dư nợ tính đến HẾT ngày này */
export function debtUpTo(ix: PayrollIndex, workerId: string, date: IsoDate): number {
  return legacyDebt(ix, workerId, (d) => d <= date) + ledgerNet(ix, workerId, (d) => d <= date);
}

/** Dư nợ hiện tại (mọi giao dịch) */
export function currentDebt(ix: PayrollIndex, workerId: string): number {
  return debtUpTo(ix, workerId, '9999-12-31');
}

function sumKind(ix: PayrollIndex, workerId: string, dir: 'advance' | 'repay', start: IsoDate, end: IsoDate): number {
  let s = 0;
  for (const a of ix.advancesByWorker.get(workerId) ?? []) {
    const isRepay = a.direction === 'repay';
    if (isRepay !== (dir === 'repay') || !a.date || a.date < start || a.date > end) continue;
    s += a.amount || 0;
  }
  return s;
}
/** `ccUngInRange` */
export const advancesInRange = (ix: PayrollIndex, workerId: string, start: IsoDate, end: IsoDate) => sumKind(ix, workerId, 'advance', start, end);
/** `ccTraInRange` */
export const repaysInRange = (ix: PayrollIndex, workerId: string, start: IsoDate, end: IsoDate) => sumKind(ix, workerId, 'repay', start, end);

/** `ccThucLanhLedgerAdj`: phiếu có "tính vào Thực lãnh" trong khoảng → ứng (+), trả (−) */
export function netPayLedgerAdj(ix: PayrollIndex, workerId: string, start: IsoDate, end: IsoDate): number {
  let s = 0;
  for (const a of ix.advancesByWorker.get(workerId) ?? []) {
    if (!a.counts_in_net_pay || !a.date || a.date < start || a.date > end) continue;
    s += sign(a) * (a.amount || 0);
  }
  return s;
}

export type LedgerRow = { workerId: string; before: number; advances: number; repays: number; total: number; lastProjectId: string | null };

/**
 * `renderCCUngLedger`: mỗi công nhân trong kỳ [start, end]: nợ cũ mang sang, ứng (+), trả (−), tổng nợ đến hết kỳ.
 * Bỏ công nhân toàn số 0. Xếp nợ nhiều đứng trên (tên xếp ở màn hình).
 */
export function ledgerRows(ix: PayrollIndex, workerIds: Iterable<string>, start: IsoDate, end: IsoDate): LedgerRow[] {
  const ids = new Set(workerIds);
  for (const k of ix.advancesByWorker.keys()) ids.add(k);
  for (const [k, arr] of ix.linesByWorker) if (arr.some(({ line }) => line.legacy_loan || line.debt_deduction)) ids.add(k);
  const out: LedgerRow[] = [];
  for (const id of ids) {
    const before = debtBefore(ix, id, start);
    const advances = advancesInRange(ix, id, start, end);
    const repays = repaysInRange(ix, id, start, end);
    const total = debtUpTo(ix, id, end);
    if (!before && !advances && !repays && !total) continue;
    out.push({ workerId: id, before, advances, repays, total, lastProjectId: lastProjectOf(ix, id) });
  }
  return out.sort((a, b) => b.total - a.total);
}

/** Công trình gần nhất của công nhân (tuần chấm công / phiếu ứng mới nhất) */
export function lastProjectOf(ix: PayrollIndex, workerId: string): string | null {
  let best: { d: string; p: string } | null = null;
  for (const { week } of ix.linesByWorker.get(workerId) ?? []) if (!best || week.week_start > best.d) best = { d: week.week_start, p: week.project_id };
  for (const a of ix.advancesByWorker.get(workerId) ?? []) if (a.project_id && (!best || a.date > best.d)) best = { d: a.date, p: a.project_id };
  return best?.p ?? null;
}

export type LedgerEntry = { date: IsoDate; kind: 'advance' | 'repay' | 'legacy'; amount: number; projectId: string | null; note: string; advance?: WageAdvance; balance: number };

/** Lịch sử nợ của MỘT công nhân (cũ → mới) kèm số dư sau mỗi dòng */
export function workerLedger(ix: PayrollIndex, workerId: string): LedgerEntry[] {
  const items: Omit<LedgerEntry, 'balance'>[] = [];
  for (const { week, line } of ix.linesByWorker.get(workerId) ?? []) {
    const net = (line.legacy_loan || 0) - (line.debt_deduction || 0);
    if (net) items.push({ date: week.week_start, kind: 'legacy', amount: net, projectId: week.project_id, note: `Ghi trong chấm công đời cũ tuần ${weekLabel(week.week_start)}` });
  }
  for (const a of ix.advancesByWorker.get(workerId) ?? []) {
    items.push({ date: a.date, kind: a.direction === 'repay' ? 'repay' : 'advance', amount: sign(a) * (a.amount || 0), projectId: a.project_id, note: a.note ?? '', advance: a });
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let bal = 0;
  return items.map((it) => ({ ...it, balance: (bal += it.amount) }));
}

// ───────────── Tổng lương tuần ─────────────

export type PayrollRow = {
  /** khóa nhóm: worker_id (nhiều tuần) hoặc week_start|worker_id (một tuần) */
  key: string;
  workerId: string;
  role: string | null;
  from: IsoDate;
  to: IsoDate;
  days: number[];
  dayUnits: number;
  /** TC lương = Σ công × lương ngày */
  wage: number;
  allowance: number;
  retail: number;
  legacyLoan: number;
  legacyDeduction: number;
  /** Phiếu ứng / trả có "tính vào Thực lãnh" trong khoảng [from, to] (gồm cột Trừ nợ của sổ) */
  ledgerAdj: number;
  /** "TC Lương" của bảng app cũ = lương + phụ cấp */
  wageWithAllowance: number;
  /** Lương TB/ngày = TC Lương ÷ TC */
  avgDaily: number;
  /** Trừ nợ hiện trên bảng = tru đời cũ + phiếu trả tính vào Thực lãnh trong khoảng */
  deduction: number;
  netPay: number;
  projectIds: string[];
};

export type PayrollFilter = { years: YearFilter; weekStart?: IsoDate | null; projectId?: string | null; workerIds?: ReadonlySet<string> | null };

/**
 * `renderCCTLT`: gộp theo công nhân (mọi công trình). Chọn 1 tuần → mỗi (tuần, người) 1 dòng; không chọn → cộng mọi tuần
 * trong năm đang chọn (theo ngày đầu tuần). Thực lãnh = tl + pc + loan + hdml − tru + điều chỉnh sổ cái.
 */
export function weeklyPayroll(ix: PayrollIndex, f: PayrollFilter): PayrollRow[] {
  const map = new Map<string, PayrollRow>();
  for (const [workerId, arr] of ix.linesByWorker) {
    if (f.workerIds && !f.workerIds.has(workerId)) continue;
    for (const { week, line } of arr) {
      if (!inYear(week.week_start, f.years)) continue;
      if (f.projectId && week.project_id !== f.projectId) continue;
      if (f.weekStart && week.week_start !== f.weekStart) continue;
      const key = f.weekStart ? `${week.week_start}|${workerId}` : workerId;
      let r = map.get(key);
      if (!r) {
        r = { key, workerId, role: null, from: week.week_start, to: weekEnd(week.week_start), days: [0, 0, 0, 0, 0, 0, 0], dayUnits: 0, wage: 0, allowance: 0, retail: 0, legacyLoan: 0, legacyDeduction: 0, ledgerAdj: 0, wageWithAllowance: 0, avgDaily: 0, deduction: 0, netPay: 0, projectIds: [] };
        map.set(key, r);
      }
      line.day_units.forEach((v, i) => { r!.days[i] = (r!.days[i] ?? 0) + (Number(v) || 0); });
      const tc = totalDayUnits(line.day_units);
      r.dayUnits += tc;
      r.wage += dayWage(tc, line.daily_wage || 0);
      r.allowance += line.allowance || 0;
      r.retail += line.retail_purchase || 0;
      r.legacyLoan += line.legacy_loan || 0;
      r.legacyDeduction += line.debt_deduction || 0;
      if (line.role) r.role = line.role;
      if (!r.projectIds.includes(week.project_id)) r.projectIds.push(week.project_id);
      if (week.week_start < r.from) r.from = week.week_start;
      if (weekEnd(week.week_start) > r.to) r.to = weekEnd(week.week_start);
    }
  }
  const rows = [...map.values()];
  for (const r of rows) {
    r.dayUnits = round2(r.dayUnits);
    r.days = r.days.map(round2);
    r.ledgerAdj = netPayLedgerAdj(ix, r.workerId, r.from, r.to);
    r.wageWithAllowance = r.wage + r.allowance;
    r.avgDaily = r.dayUnits > 0 ? Math.round(r.wageWithAllowance / r.dayUnits) : 0;
    r.netPay = r.wage + r.allowance + r.legacyLoan + r.retail - r.legacyDeduction + r.ledgerAdj;
  }
  // Trừ nợ hiện trên bảng = tru đời cũ + Σ phiếu TRẢ tính vào Thực lãnh trong khoảng (ứng tính vào Thực lãnh không gộp vào đây)
  for (const r of rows) {
    let repay = 0;
    for (const a of ix.advancesByWorker.get(r.workerId) ?? []) {
      if (a.counts_in_net_pay && a.direction === 'repay' && a.date >= r.from && a.date <= r.to) repay += a.amount || 0;
    }
    r.deduction = r.legacyDeduction + repay;
  }
  return rows;
}

/** Cộng Thực lãnh các dòng đang tick (`updateTLTSelectedSum`) */
export function sumNetPay(rows: readonly Pick<PayrollRow, 'netPay'>[]): number {
  return rows.reduce((s, r) => s + r.netPay, 0);
}

export type WeekHistoryRow = { weekId: string; weekStart: IsoDate; projectId: string; workers: number; dayUnits: number; wage: number; netPay: number };

/** `renderCCHistory`: mỗi tuần × công trình 1 dòng (mới nhất trên). Thực lãnh = lương + phụ cấp + HĐ lẻ + ứng cũ − trừ cũ − trừ nợ của tuần. */
export function weekHistory(weeks: readonly PayWeek[], lines: readonly PayrollLine[], advances: readonly WageAdvance[], years: YearFilter, projectId?: string | null): WeekHistoryRow[] {
  const byWeek = new Map<string, PayrollLine[]>();
  for (const l of lines) push(byWeek, l.week_id, l);
  const dedByWeek = new Map<string, number>();
  for (const a of advances) if (a.source_week_id && a.direction === 'repay') dedByWeek.set(a.source_week_id, (dedByWeek.get(a.source_week_id) ?? 0) + (a.amount || 0));
  const out: WeekHistoryRow[] = [];
  for (const w of weeks) {
    if (!inYear(w.week_start, years) || (projectId && w.project_id !== projectId)) continue;
    const ls = byWeek.get(w.id) ?? [];
    let tc = 0, wage = 0, net = 0;
    for (const l of ls) {
      const c = totalDayUnits(l.day_units);
      tc += c;
      wage += dayWage(c, l.daily_wage || 0);
      net += dayWage(c, l.daily_wage || 0) + (l.allowance || 0) + (l.retail_purchase || 0) + (l.legacy_loan || 0) - (l.debt_deduction || 0);
    }
    out.push({ weekId: w.id, weekStart: w.week_start, projectId: w.project_id, workers: ls.length, dayUnits: round2(tc), wage, netPay: net - (dedByWeek.get(w.id) ?? 0) });
  }
  return out.sort((a, b) => (a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : 0));
}

// ───────────── Phiếu lương (gửi Zalo) ─────────────

export type Payslip = {
  workerId: string; from: IsoDate; to: IsoDate;
  projects: { projectId: string; dayUnits: number; dailyWage: number }[];
  dayUnits: number; wage: number; allowance: number; retail: number; advance: number; repay: number; netPay: number; debt: number;
};

/** `ccPayslipData`: 1 người, 1 tuần, gộp mọi công trình. Thực lãnh khớp cột Thực lãnh của Tổng lương tuần. */
export function payslipData(ix: PayrollIndex, workerId: string, from: IsoDate, to: IsoDate): Payslip {
  const d: Payslip = { workerId, from, to, projects: [], dayUnits: 0, wage: 0, allowance: 0, retail: 0, advance: 0, repay: 0, netPay: 0, debt: 0 };
  for (const { week, line } of ix.linesByWorker.get(workerId) ?? []) {
    if (week.week_start < from || week.week_start > to) continue;
    const c = totalDayUnits(line.day_units);
    d.dayUnits += c;
    d.wage += dayWage(c, line.daily_wage || 0);
    d.allowance += line.allowance || 0;
    d.retail += line.retail_purchase || 0;
    d.advance += line.legacy_loan || 0;
    d.repay += line.debt_deduction || 0;
    d.projects.push({ projectId: week.project_id, dayUnits: c, dailyWage: line.daily_wage || 0 });
  }
  for (const a of ix.advancesByWorker.get(workerId) ?? []) {
    if (!a.counts_in_net_pay || !a.date || a.date < from || a.date > to) continue;
    if (a.direction === 'repay') d.repay += a.amount || 0; else d.advance += a.amount || 0;
  }
  d.dayUnits = round2(d.dayUnits);
  d.netPay = d.wage + d.allowance + d.retail + d.advance - d.repay;
  d.debt = debtUpTo(ix, workerId, to);
  return d;
}

/** `fmtM` của app cũ: "1.234.567 đ" */
const fmtM = (v: number) => (Math.round(v || 0) ? Math.round(v).toLocaleString('vi-VN') + ' đ' : '0 đ');

/** `ccPayslipText`: chữ sạch, xuống dòng rõ ràng — dán thẳng vào Zalo */
export function payslipText(d: Payslip, workerName: string, projectName: (id: string) => string, signature = 'CTY NGUYỄN HỮU'): string {
  const L = [
    'PHIẾU LƯƠNG TUẦN ' + weekLabel(d.from),
    'Người lao động: ' + workerName,
    '────────────',
    ...d.projects.map((c) => '• ' + (projectName(c.projectId) || '—') + ': ' + String(c.dayUnits).replace('.', ',') + ' công × ' + fmtM(c.dailyWage)),
    'Lương chính: ' + fmtM(d.wage),
  ];
  if (d.allowance) L.push('Phụ cấp: ' + fmtM(d.allowance));
  if (d.retail) L.push('Mua vật tư lẻ: ' + fmtM(d.retail));
  if (d.repay) L.push('Trừ trả nợ: −' + fmtM(d.repay));
  if (d.advance) L.push('Cộng tiền ứng: ' + fmtM(d.advance));
  L.push('────────────', 'THỰC LÃNH: ' + fmtM(d.netPay));
  if (Math.round(d.debt)) L.push('Nợ còn lại: ' + fmtM(d.debt));
  L.push('— ' + signature);
  return L.join('\n');
}

// ───────────── Xuất dữ liệu (TN02) ─────────────

/**
 * Thực lãnh của MỘT dòng sổ chấm công khi xuất kiểu "chi tiết": đúng các thành phần `weeklyPayroll` cộng theo dòng
 * (công × lương ngày + phụ cấp + ứng đời cũ + HĐ mua lẻ − trừ nợ đời cũ). Phần phiếu ứng / trả "tính vào Thực lãnh"
 * không thuộc dòng nào → xuất thành dòng riêng bằng `netPayLedgerItems`. Cộng hai phần = Thực lãnh của Tổng lương tuần.
 */
export function exportLineNetPay(line: Pick<PayrollLine, 'day_units' | 'daily_wage' | 'allowance' | 'retail_purchase' | 'legacy_loan' | 'debt_deduction'>): number {
  const tc = totalDayUnits(line.day_units);
  return dayWage(tc, line.daily_wage || 0) + (line.allowance || 0) + (line.legacy_loan || 0) + (line.retail_purchase || 0) - (line.debt_deduction || 0);
}

/** Các phiếu ứng (+) / trả (−) "tính vào Thực lãnh" trong khoảng — tổng đúng bằng `netPayLedgerAdj` cùng khoảng */
export function netPayLedgerItems(ix: PayrollIndex, workerId: string, start: IsoDate, end: IsoDate): { advance: WageAdvance; amount: number }[] {
  const out: { advance: WageAdvance; amount: number }[] = [];
  for (const a of ix.advancesByWorker.get(workerId) ?? []) {
    if (!a.counts_in_net_pay || !a.date || a.date < start || a.date > end) continue;
    out.push({ advance: a, amount: sign(a) * (a.amount || 0) });
  }
  return out;
}
