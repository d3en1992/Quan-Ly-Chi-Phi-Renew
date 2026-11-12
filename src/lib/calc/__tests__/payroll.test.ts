// GĐ6 — Chấm công, Tổng lương tuần, Tạm ứng lương, Phiếu lương.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformSnapshot } from '../../../../scripts/legacy/transform.ts';
import {
  buildPayrollIndex, calcSheetRow, currentDebt, cycleDayUnit, debtBefore, debtUpTo, ledgerRows, monthRange, netPayLedgerAdj,
  parseDayUnit, payslipData, payslipText, sheetTotals, shiftWeek, weekHistory, weekLabel, weekRangeLabel, weeklyPayroll,
  workerLedger, type PayrollLine, type PayWeek, type WageAdvance,
} from '../payroll';
import { weekStartOf } from '../stats';
import { buildProfitIndex, profitContext, projectProfit } from '../profit';
import { ALL_YEARS, weekEnd } from '../year';
import type { CalcData, CalcProject } from '../types';

const line = (p: Partial<PayrollLine> & { week_id: string; worker_id: string }): PayrollLine => ({
  day_units: [0, 0, 0, 0, 0, 0, 0], daily_wage: 0, allowance: 0, retail_purchase: 0, debt_deduction: 0, legacy_loan: 0, ...p,
});
const adv = (p: Partial<WageAdvance> & { worker_id: string; date: string; amount: number }): WageAdvance => ({
  id: Math.random().toString(36), project_id: null, direction: 'advance', counts_in_net_pay: false, ...p,
});

describe('tuần CN → T7', () => {
  it('ngày bất kỳ → Chủ nhật đầu tuần (snapToSunday)', () => {
    expect(weekStartOf('2026-11-12')).toBe('2026-11-08'); // thứ Năm
    expect(weekStartOf('2026-11-08')).toBe('2026-11-08'); // Chủ nhật
    expect(weekStartOf('2026-11-14')).toBe('2026-11-08'); // thứ Bảy
    expect(weekStartOf('2026-01-02')).toBe('2025-12-28'); // vắt năm
  });
  it('lùi / tiến tuần, nhãn tuần', () => {
    expect(shiftWeek('2026-10-26', -1)).toBe('2026-10-19');
    expect(shiftWeek('2025-12-28', 1)).toBe('2026-01-04');
    expect(weekLabel('2026-10-26')).toBe('26/10–01/11/2026');
    expect(weekRangeLabel('2025-12-28')).toBe('CN 28/12 – T7 03/01/2026');
    expect(monthRange('2024-02')).toEqual(['2024-02-01', '2024-02-29']);
  });
});

describe('một dòng sổ chấm công (calcCCRow + Trừ nợ)', () => {
  it('mẫu: LONG 6 công × 600.000 + 60.000 phụ cấp − 500.000 trừ nợ', () => {
    const r = calcSheetRow({ day_units: [0, 1, 1, 1, 1, 1, 1], daily_wage: 600_000, allowance: 60_000, retail_purchase: 0, deduction: 500_000 });
    expect(r).toEqual({ dayUnits: 6, wage: 3_600_000, netPay: 3_160_000 });
  });
  it('nửa công làm tròn 1 số lẻ; dòng tổng', () => {
    const rows = [
      { day_units: [0, 1, 1, 0.5, 1, 1, 0], daily_wage: 540_000, allowance: 30_000, retail_purchase: 0, deduction: 0 },
      { day_units: [0, 1, 1, 1, 1, 1, 1], daily_wage: 520_000, allowance: 0, retail_purchase: 85_000, deduction: 300_000 },
    ];
    expect(calcSheetRow(rows[0]!).dayUnits).toBe(4.5);
    const t = sheetTotals(rows);
    expect(t.days).toEqual([0, 2, 2, 1.5, 2, 2, 1]);
    expect(t.dayUnits).toBe(10.5);
    expect(t.wage).toBe(4.5 * 540_000 + 6 * 520_000);
    expect(t.netPay).toBe(t.wage + 30_000 + 85_000 - 300_000);
  });
  it('chạm ô ngày: 1 → ½ → 0 → 1; gõ tay', () => {
    expect(cycleDayUnit(1)).toBe(0.5);
    expect(cycleDayUnit(0.5)).toBe(0);
    expect(cycleDayUnit(0)).toBe(1);
    expect(parseDayUnit('0,5')).toBe(0.5);
    expect(parseDayUnit('1')).toBe(1);
  });
  it('GĐ99: gõ số lẻ dấu chấm / phẩy, không giới hạn trên; đúng "5" một mình = nửa công; âm / chữ = null', () => {
    expect(parseDayUnit('1.3')).toBe(1.3);
    expect(parseDayUnit('1,5')).toBe(1.5);
    expect(parseDayUnit('2')).toBe(2);
    expect(parseDayUnit('0.75')).toBe(0.75);
    expect(parseDayUnit(',5')).toBe(0.5);
    expect(parseDayUnit('5')).toBe(0.5);
    expect(parseDayUnit('5.5')).toBe(5.5);
    expect(parseDayUnit('15')).toBe(15);
    expect(parseDayUnit('8')).toBe(8);
    expect(parseDayUnit('1.333')).toBe(1.33);
    expect(parseDayUnit('')).toBe(0);
    expect(parseDayUnit('-1')).toBeNull();
    expect(parseDayUnit('abc')).toBeNull();
    expect(parseDayUnit('1a')).toBeNull();
    expect(parseDayUnit('1.2.3')).toBeNull();
  });
  it('GĐ99: TC, TC Lương, Thực lãnh, dòng tổng với số công lẻ 1,3 và 1,5', () => {
    const a = { day_units: [0, 1.3, 1.5, 1, 0, 0, 0], daily_wage: 500_000, allowance: 20_000, retail_purchase: 10_000, deduction: 0 };
    const b = { day_units: [0, 0.75, 0, 0, 0, 0, 1.3], daily_wage: 400_000, allowance: 0, retail_purchase: 0, deduction: 0 };
    expect(calcSheetRow(a)).toEqual({ dayUnits: 3.8, wage: 1_900_000, netPay: 1_930_000 });
    expect(calcSheetRow(b)).toEqual({ dayUnits: 2.05, wage: 820_000, netPay: 820_000 });
    const t = sheetTotals([a, b]);
    expect(t.days).toEqual([0, 2.05, 1.5, 1, 0, 0, 1.3]);
    expect(t.dayUnits).toBe(5.85);
    expect(t.wage).toBe(2_720_000);
    expect(t.netPay).toBe(2_750_000);
  });
  it('GĐ99: Tổng lương tuần + phiếu lương với số công lẻ', () => {
    const wk: PayWeek = { id: 'wx', project_id: 'A', week_start: '2026-11-08' };
    const ix = buildPayrollIndex([wk], [line({ week_id: 'wx', worker_id: 'L', day_units: [0, 1.3, 1.5, 0, 0, 0, 0], daily_wage: 500_000, allowance: 50_000 })], []);
    const p = payslipData(ix, 'L', '2026-11-08', '2026-11-14');
    expect(p.dayUnits).toBe(2.8);
    expect(p.wage).toBe(1_400_000);
    expect(p.netPay).toBe(1_450_000);
    expect(payslipText(p, 'LONG', () => 'CT A')).toContain('2,8 công × 500.000');
  });
});

describe('sổ cái nợ công nhân + tổng lương tuần', () => {
  const weeks: PayWeek[] = [
    { id: 'w1', project_id: 'A', week_start: '2026-10-18' },
    { id: 'w2', project_id: 'A', week_start: '2026-10-25' },
    { id: 'w3', project_id: 'B', week_start: '2026-10-25' },
  ];
  const lines: PayrollLine[] = [
    line({ week_id: 'w1', worker_id: 'X', day_units: [0, 1, 1, 1, 1, 1, 1], daily_wage: 500_000, legacy_loan: 1_000_000, debt_deduction: 200_000 }),
    line({ week_id: 'w2', worker_id: 'X', day_units: [0, 1, 1, 1, 0, 0, 0], daily_wage: 500_000, allowance: 50_000 }),
    line({ week_id: 'w3', worker_id: 'X', day_units: [0, 0, 0, 0, 1, 1, 0.5], daily_wage: 500_000, retail_purchase: 120_000 }),
    line({ week_id: 'w2', worker_id: 'Y', day_units: [0, 1, 1, 1, 1, 1, 0], daily_wage: 400_000 }),
  ];
  const advances: WageAdvance[] = [
    adv({ worker_id: 'X', date: '2026-10-20', amount: 2_000_000 }), // ứng, không tính vào Thực lãnh
    adv({ worker_id: 'X', date: '2026-10-31', amount: 300_000, direction: 'repay', counts_in_net_pay: true, source_week_id: 'w2' }), // cột Trừ nợ
    adv({ worker_id: 'Y', date: '2026-10-27', amount: 500_000, counts_in_net_pay: true }), // ứng cộng vào Thực lãnh
  ];
  const ix = buildPayrollIndex(weeks, lines, advances);

  it('nợ: dữ liệu cũ (ứng − trừ, theo ngày đầu tuần) + sổ cái (ứng +, trả −)', () => {
    expect(debtBefore(ix, 'X', '2026-10-18')).toBe(0);
    expect(debtUpTo(ix, 'X', '2026-10-18')).toBe(800_000);
    expect(debtUpTo(ix, 'X', '2026-10-24')).toBe(2_800_000);
    expect(currentDebt(ix, 'X')).toBe(2_500_000);
    expect(netPayLedgerAdj(ix, 'X', '2026-10-25', '2026-10-31')).toBe(-300_000);
  });

  it('sổ Tạm ứng lương theo tháng 10/2026', () => {
    const [s, e] = monthRange('2026-10');
    const rows = ledgerRows(ix, ['X', 'Y', 'Z'], s, e);
    expect(rows.map((r) => r.workerId)).toEqual(['X', 'Y']);
    expect(rows[0]).toMatchObject({ before: 0, advances: 2_000_000, repays: 300_000, total: 2_500_000, lastProjectId: 'A' });
    const hist = workerLedger(ix, 'X');
    expect(hist.map((h) => h.balance)).toEqual([800_000, 2_800_000, 2_500_000]);
  });

  it('tổng lương 1 tuần: gộp mọi công trình; Thực lãnh = tl + pc + loan + hdml − tru + điều chỉnh sổ cái', () => {
    const rows = weeklyPayroll(ix, { years: ALL_YEARS, weekStart: '2026-10-25' });
    const x = rows.find((r) => r.workerId === 'X')!;
    expect(x.dayUnits).toBe(5.5);
    expect(x.projectIds.sort()).toEqual(['A', 'B']);
    expect(x.wage).toBe(5.5 * 500_000);
    expect(x.deduction).toBe(300_000);
    expect(x.netPay).toBe(2_750_000 + 50_000 + 120_000 - 300_000);
    expect(x.avgDaily).toBe(Math.round(2_800_000 / 5.5));
    const y = rows.find((r) => r.workerId === 'Y')!;
    expect(y.netPay).toBe(2_000_000 + 500_000);
    // lọc công trình
    expect(weeklyPayroll(ix, { years: ALL_YEARS, weekStart: '2026-10-25', projectId: 'B' }).map((r) => r.workerId)).toEqual(['X']);
    // nhiều tuần: 1 dòng / người
    const all = weeklyPayroll(ix, { years: [2026] });
    expect(all.find((r) => r.workerId === 'X')!.dayUnits).toBe(11.5);
    expect(weeklyPayroll(ix, { years: [2025] })).toEqual([]);
  });

  it('phiếu lương khớp Thực lãnh của Tổng lương tuần + chữ gửi Zalo', () => {
    const d = payslipData(ix, 'X', '2026-10-25', '2026-10-31');
    expect(d.netPay).toBe(weeklyPayroll(ix, { years: ALL_YEARS, weekStart: '2026-10-25' }).find((r) => r.workerId === 'X')!.netPay);
    expect(d.debt).toBe(2_500_000);
    const text = payslipText(d, 'XUÂN', (id) => (id === 'A' ? 'CT A Huynh' : 'SC Nhà Tình'));
    expect(text).toBe([
      'PHIẾU LƯƠNG TUẦN 25/10–31/10/2026',
      'Người lao động: XUÂN',
      '────────────',
      '• CT A Huynh: 3 công × 500.000 đ',
      '• SC Nhà Tình: 2,5 công × 500.000 đ',
      'Lương chính: 2.750.000 đ',
      'Phụ cấp: 50.000 đ',
      'Mua vật tư lẻ: 120.000 đ',
      'Trừ trả nợ: −300.000 đ',
      '────────────',
      'THỰC LÃNH: 2.620.000 đ',
      'Nợ còn lại: 2.500.000 đ',
      '— CTY NGUYỄN HỮU',
    ].join('\n'));
  });

  it('lịch sử tuần: mới nhất trên, Thực lãnh trừ cột Trừ nợ', () => {
    const h = weekHistory(weeks, lines, advances, ALL_YEARS);
    expect(h.map((r) => r.weekId)).toEqual(['w2', 'w3', 'w1']);
    const w2 = h[0]!;
    expect(w2).toMatchObject({ workers: 2, dayUnits: 8 });
    expect(w2.netPay).toBe(1_500_000 + 50_000 + 2_000_000 - 300_000);
  });
});

describe('tuần vắt năm: lương vào năm của thứ Bảy', () => {
  it('CN 28/12/2025 – T7 03/01/2026 → chi phí lương thuộc 2026, không thuộc 2025', () => {
    const p: CalcProject = { id: 'P', name: 'CT thử', is_company_overhead: false, start_date: null, end_date: null, cost_weight_k: null, created_year: 2025 };
    const data: CalcData = {
      projects: [p], expenses: [], payments: [], paymentAllocations: [], receipts: [], mainContracts: [], settlements: [],
      timesheetWeeks: [{ id: 'w', project_id: 'P', week_start: '2025-12-28' }],
      timesheetLines: [{ week_id: 'w', worker_id: 'X', day_units: [0, 1, 1, 1, 1, 1, 1], daily_wage: 500_000, allowance: 0, retail_purchase: 0 }],
    };
    const ix = buildProfitIndex(data);
    const now = Date.parse('2026-11-12T00:00:00Z');
    expect(projectProfit(p, profitContext(ix, [2026], now)).A).toBe(3_000_000);
    expect(projectProfit(p, profitContext(ix, [2025], now)).A).toBe(0);
  });
});

// ───────────── So với app cũ (cần du-lieu/snapshot.json + so-chuan.json có mục chamCong) ─────────────
const DIR = join(process.cwd(), 'du-lieu');
const SNAP = join(DIR, 'snapshot.json');
const GOLD = join(DIR, 'so-chuan.json');
type GoldPay = { ten: string; cong: number; luong: number; phuCap: number; hdml: number; ung: number; tra: number; thucLanh: number; noCon: number };
type GoldCC = { tuan: Record<string, GoldPay[]>; no: Record<string, number> };
const gold: GoldCC | null = existsSync(SNAP) && existsSync(GOLD) ? ((JSON.parse(readFileSync(GOLD, 'utf8')) as { chamCong?: GoldCC }).chamCong ?? null) : null;

describe.skipIf(!gold)('So chấm công với app cũ (ccPayslipData chạy trên snapshot) — lệch 0 đồng', () => {
  const g = gold!;
  const t = transformSnapshot(JSON.parse(readFileSync(SNAP, 'utf8')) as Record<string, unknown>, { companyId: '00000000-0000-0000-0000-000000000001', userIdByLegacyName: {} })
    .tables as unknown as Record<string, Record<string, unknown>[]>;
  const live = <T,>(name: string) => (t[name] ?? []).filter((r) => !r.deleted_at) as unknown as T[];
  const weeks = live<PayWeek>('timesheet_weeks');
  const weekIds = new Set(weeks.map((w) => w.id));
  const ix = buildPayrollIndex(weeks, live<PayrollLine>('timesheet_lines').filter((l) => weekIds.has(l.week_id)), live<WageAdvance>('wage_advances'));
  const idByName = new Map(live<{ id: string; name: string }>('workers').map((w) => [w.name, w.id]));
  const wid = (name: string) => idByName.get(name) ?? idByName.get(name.trim().toUpperCase()) ?? `?${name}`;
  const weekKeys = Object.keys(g.tuan);

  it('có đủ tuần chấm công', () => {
    expect(weekKeys.length).toBeGreaterThan(50);
    expect(weekKeys.length).toBe(new Set(weeks.map((w) => w.week_start)).size);
  });

  // 3 tuần cũ cố định (đầu, giữa, cuối) + toàn bộ các tuần
  const picks = weekKeys.length ? [weekKeys[0]!, weekKeys[Math.floor(weekKeys.length / 2)]!, weekKeys[weekKeys.length - 1]!] : [];
  it.each(picks)('tuần %s: tổng lương tuần = app cũ', (from) => {
    const rows = weeklyPayroll(ix, { years: ALL_YEARS, weekStart: from });
    const oldSum = g.tuan[from]!.reduce((s, r) => s + r.luong + r.phuCap, 0);
    expect(rows.reduce((s, r) => s + r.wageWithAllowance, 0)).toBe(oldSum);
    expect(rows.reduce((s, r) => s + r.netPay, 0)).toBe(g.tuan[from]!.reduce((s, r) => s + r.thucLanh, 0));
  });

  it('mọi tuần × mọi người: công, lương, phụ cấp, HĐ lẻ, ứng, trả, thực lãnh, nợ còn lại', () => {
    const bad: string[] = [];
    for (const from of weekKeys) {
      const to = weekEnd(from);
      for (const o of g.tuan[from]!) {
        const d = payslipData(ix, wid(o.ten), from, to);
        const pairs: [string, number, number][] = [
          ['công', d.dayUnits, o.cong], ['lương', d.wage, o.luong], ['phụ cấp', d.allowance, o.phuCap], ['HĐ lẻ', d.retail, o.hdml],
          ['ứng', d.advance, o.ung], ['trả', d.repay, o.tra], ['thực lãnh', d.netPay, o.thucLanh], ['nợ', d.debt, o.noCon],
        ];
        for (const [k, a, b] of pairs) if (Math.abs(a - b) > 1e-6) bad.push(`${from} ${o.ten} ${k}: mới ${a} ≠ cũ ${b}`);
      }
    }
    expect(bad.slice(0, 20)).toEqual([]);
  });

  it('nợ hiện tại từng công nhân = app cũ', () => {
    const bad = Object.entries(g.no).filter(([n, v]) => currentDebt(ix, wid(n)) !== v).map(([n, v]) => `${n}: mới ${currentDebt(ix, wid(n))} ≠ cũ ${v}`);
    expect(bad).toEqual([]);
  });
});
