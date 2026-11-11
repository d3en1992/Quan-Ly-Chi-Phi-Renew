// Test từng công thức bằng số nhỏ tự đặt (so số thật với app cũ nằm ở so-chuan.test.ts).
import { describe, expect, it } from 'vitest';
import {
  ALL_YEARS, addDays, allocateOverhead, allocateSupplierPayment, buildCostEntries, calcTimesheetRow, contractValue, costBreakdown,
  effectiveYear, inYear, inYearLoose, isCrossYearWeek, lineWageCost, percentOf, profitMargin, profitRating, profitReport, projectDays,
  projectIdsInYear, projectInYear, projectK, projectRevenue, settlementDeltas, subcontractPayables, supplierPayables, timesheetCostEntries,
  weekEnd, weekNumber, weekStartOf, weeklyCosts, type CalcData, type CalcProject,
} from '../index';

const NOW = Date.parse('2026-11-11T10:00:00+07:00');
const proj = (id: string, o: Partial<CalcProject> = {}): CalcProject => ({ id, name: id, is_company_overhead: false, start_date: null, end_date: null, cost_weight_k: null, created_year: null, ...o });
const empty = (): CalcData => ({ projects: [], expenses: [], timesheetWeeks: [], timesheetLines: [], payments: [], paymentAllocations: [], receipts: [], mainContracts: [], settlements: [] });

describe('year — lọc năm (mục 4K)', () => {
  it('inYear: thiếu ngày thì không thuộc năm nào; Tất cả năm nhận mọi ngày', () => {
    expect(inYear('2026-03-01', [2026])).toBe(true);
    expect(inYear('2025-12-31', [2026])).toBe(false);
    expect(inYear('2025-12-31', [2025, 2026])).toBe(true);
    expect(inYear('2019-01-01', ALL_YEARS)).toBe(true);
    expect(inYear(null, ALL_YEARS)).toBe(false);
  });
  it('inYearLoose: thiếu ngày thì hiện ở mọi năm', () => {
    expect(inYearLoose(null, [2026])).toBe(true);
    expect(inYearLoose('2025-01-01', [2026])).toBe(false);
  });
  it('tuần vắt năm: CN 28/12/2025 – T7 03/01/2026', () => {
    expect(weekEnd('2025-12-28')).toBe('2026-01-03');
    expect(isCrossYearWeek('2025-12-28')).toBe(true);
    expect(isCrossYearWeek('2026-01-04')).toBe(false);
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
  });
  it('công trình thuộc năm: năm tạo hoặc có phát sinh', () => {
    const d = { ...empty(), expenses: [{ id: 'e', project_id: 'b', date: '2026-02-01', amount: 1, paid_at_purchase: true }] };
    expect(projectInYear({ id: 'a', created_year: 2026 }, [2026], d)).toBe(true);
    expect(projectInYear({ id: 'b', created_year: 2025 }, [2026], d)).toBe(true);
    expect(projectInYear({ id: 'c', created_year: 2025 }, [2026], d)).toBe(false);
    expect(projectInYear({ id: 'c', created_year: 2025 }, ALL_YEARS, d)).toBe(true);
    expect([...projectIdsInYear([{ id: 'a', created_year: 2026 }, { id: 'b', created_year: 2025 }, { id: 'c', created_year: 2025 }], [2026], d)].sort()).toEqual(['a', 'b']);
  });
});

describe('timesheet — chấm công', () => {
  it('calcTimesheetRow: tổng công làm tròn 1 số lẻ, thực lãnh = lương + phụ cấp + HĐ mua lẻ', () => {
    const r = calcTimesheetRow({ day_units: [0, 1, 1, 0.5, 1, 1, 1], daily_wage: 400_000, allowance: 50_000, retail_purchase: 120_000 });
    expect(r).toEqual({ dayUnits: 5.5, wage: 2_200_000, netPay: 2_370_000 });
  });
  it('dòng chi phí từ chấm công: lương cả tổ 1 dòng, HĐ mua lẻ mỗi người 1 dòng, ngày thứ Bảy', () => {
    const lines = [
      { week_id: 'w', worker_id: 'a', day_units: [0, 1, 1, 1, 1, 1, 1], daily_wage: 500_000, allowance: 100_000, retail_purchase: 0 },
      { week_id: 'w', worker_id: 'b', day_units: [0, 1, 0.5, 0, 0, 0, 0], daily_wage: 400_000, allowance: 0, retail_purchase: 75_000 },
    ];
    expect(lineWageCost(lines[0]!)).toBe(3_100_000);
    const out = timesheetCostEntries([{ id: 'w', project_id: 'p', week_start: '2025-12-28' }, { id: 'rong', project_id: 'p', week_start: '2026-01-04' }], lines);
    expect(out.map((c) => [c.source, c.date, c.amount])).toEqual([['retail', '2026-01-03', 75_000], ['wage', '2026-01-03', 3_700_000]]);
    expect(out.every((c) => c.paid_at_purchase)).toBe(true);
  });
});

describe('overhead — phân bổ chi phí chung', () => {
  it('số ngày: không ngày bắt đầu = 1; cắt theo năm; không giao nhau = 0; chưa kết thúc tính tới hôm nay', () => {
    expect(projectDays({ start_date: null, end_date: null }, [2026], NOW)).toBe(1);
    expect(projectDays({ start_date: '2026-01-01', end_date: '2026-01-10' }, [2026], NOW)).toBe(10);
    expect(projectDays({ start_date: '2025-12-01', end_date: '2026-01-10' }, [2026], NOW)).toBe(10);
    expect(projectDays({ start_date: '2025-12-01', end_date: '2026-01-10' }, [2025], NOW)).toBe(31);
    expect(projectDays({ start_date: '2025-01-01', end_date: '2025-06-30' }, [2026], NOW)).toBe(0);
    expect(projectDays({ start_date: '2026-11-01', end_date: null }, [2026], NOW)).toBe(11);
    // Tất cả năm / nhiều năm: cả vòng đời (hiệu 2 ngày, như app cũ)
    expect(projectDays({ start_date: '2025-12-01', end_date: '2026-01-10' }, ALL_YEARS, NOW)).toBe(40);
    expect(projectDays({ start_date: '2025-12-01', end_date: '2026-01-10' }, [2025, 2026], NOW)).toBe(40);
    expect(projectDays({ start_date: '2026-05-05', end_date: '2026-05-05' }, ALL_YEARS, NOW)).toBe(1);
  });
  it('hệ số k: mặc định 1, k = 0 không gánh', () => {
    expect(projectK({ cost_weight_k: null })).toBe(1);
    expect(projectK({ cost_weight_k: -2 })).toBe(1);
    expect(projectK({ cost_weight_k: 0 })).toBe(0);
    expect(projectK({ cost_weight_k: 0.5 })).toBe(0.5);
  });
  it('chia theo ngày × k; công trình không có ngày bắt đầu và CÔNG TY không gánh', () => {
    const ps = [
      proj('a', { start_date: '2026-01-01', end_date: '2026-01-30' }),
      proj('b', { start_date: '2026-02-01', end_date: '2026-02-10', cost_weight_k: 3 }),
      proj('c', { start_date: '2026-03-01', end_date: '2026-03-31', cost_weight_k: 0 }),
      proj('d'),
      proj('cty', { is_company_overhead: true, start_date: '2026-01-01' }),
    ];
    const out = allocateOverhead(ps, 6_000_000, [2026], NOW);
    expect(out.map((o) => [o.projectId, o.days, o.weight, o.allocated])).toEqual([['a', 30, 30, 3_000_000], ['b', 10, 30, 3_000_000], ['c', 31, 0, 0]]);
  });
});

describe('revenue — giá trị hợp đồng, quyết toán', () => {
  it('contractValue: chưa quyết toán lấy max(HĐ, đã thu); đã quyết toán thì HĐ + quyết toán', () => {
    expect(contractValue(100, 120, 0, false)).toBe(120);
    expect(contractValue(100, 80, 0, false)).toBe(100);
    expect(contractValue(100, 120, 10, true)).toBe(110);
  });
  it('quyết toán: tăng, giảm, thay thế (thay thế = số mới − giá trị ngay trước đó)', () => {
    const { deltas, finalValue } = settlementDeltas(1000, [
      { id: 'c', project_id: 'p', date: '2026-03-01', kind: 'replace', amount: 1500 },
      { id: 'a', project_id: 'p', date: '2026-01-01', kind: 'increase', amount: 200 },
      { id: 'b', project_id: 'p', date: '2026-02-01', kind: 'decrease', amount: 50 },
    ]);
    expect([deltas.get('a'), deltas.get('b'), deltas.get('c')]).toEqual([200, -50, 350]);
    expect(finalValue).toBe(1500);
  });
  it('projectRevenue theo năm: quyết toán năm khác không cộng nhưng vẫn bỏ quy tắc max', () => {
    const contracts = [{ project_id: 'p', date: '2025-06-01', value: 1000, extra_value: 0, legacy_variation: 0 }];
    const receipts = [{ project_id: 'p', date: '2025-07-01', amount: 600 }, { project_id: 'p', date: '2026-02-01', amount: 500 }];
    const settlements = [{ id: 's', project_id: 'p', date: '2026-03-01', kind: 'increase', amount: 100 }];
    expect(projectRevenue(contracts, receipts, settlements, ALL_YEARS)).toMatchObject({ baseContract: 1000, received: 1100, settlement: 100, contractValue: 1100, receivable: 0 });
    expect(projectRevenue(contracts, receipts, settlements, [2025])).toMatchObject({ baseContract: 1000, received: 600, settlement: 0, contractValue: 1000, receivable: 400 });
    expect(projectRevenue(contracts, receipts, [], ALL_YEARS)).toMatchObject({ contractValue: 1100, hasSettlement: false });
  });
});

describe('profit — lãi / lỗ', () => {
  const data = (): CalcData => ({
    ...empty(),
    projects: [proj('p', { start_date: '2026-01-01', end_date: '2026-01-10' }), proj('q', { start_date: '2026-01-01', end_date: '2026-01-10' }), proj('cty', { is_company_overhead: true })],
    expenses: [
      { id: 'e1', project_id: 'p', date: '2026-01-05', amount: 300, paid_at_purchase: true },
      { id: 'e2', project_id: 'p', date: '2026-01-06', amount: 500, paid_at_purchase: false, supplier_id: 's' }, // mua nợ: không vào A
      { id: 'e3', project_id: 'cty', date: '2026-01-07', amount: 200, paid_at_purchase: true },
    ],
    timesheetWeeks: [{ id: 'w', project_id: 'p', week_start: '2026-01-04' }],
    timesheetLines: [{ week_id: 'w', worker_id: 'a', day_units: [0, 1, 1, 0, 0, 0, 0], daily_wage: 50, allowance: 0, retail_purchase: 0 }],
    payments: [
      { id: 'pay1', kind: 'supplier_payment', date: '2026-02-01', amount: 400, project_id: 'p', supplier_id: 's' },
      { id: 'pay2', kind: 'advance', date: '2026-01-08', amount: 150, project_id: 'p' },
    ],
    paymentAllocations: [{ payment_id: 'pay1', expense_id: 'e2', project_id: 'p', amount: 400 }, { payment_id: 'da-xoa', expense_id: 'e2', project_id: 'p', amount: 999 }],
    receipts: [{ project_id: 'p', date: '2026-01-20', amount: 2000 }],
    mainContracts: [{ project_id: 'p', date: '2026-01-01', value: 2500, extra_value: 0, legacy_variation: 0 }],
  });
  it('A = hóa đơn Đã TT + lương chấm công + tiền đã trả NCC; B = đã chi thầu phụ; C chia đều; lợi nhuận = thu − chi', () => {
    const r = profitReport(data(), [2026], NOW);
    expect(r.overheadTotal).toBe(200);
    const p = r.rows.find((x) => x.projectId === 'p')!;
    expect(p).toMatchObject({ paidInvoices: 400, supplierPaid: 400, A: 800, B: 150, C: 100, spent: 1050, received: 2000, profit: 950, supplierDebt: 100, totalCost: 1150 });
    expect(p.revenue).toMatchObject({ baseContract: 2500, contractValue: 2500, receivable: 500 });
    const q = r.rows.find((x) => x.projectId === 'q')!;
    expect(q).toMatchObject({ A: 0, C: 100, profit: -100 });
    expect(r.totals).toMatchObject({ received: 2000, A: 800, B: 150, C: 200, spent: 1150, profit: 850 });
  });
  it('dòng chi phí: hóa đơn + chấm công; nguồn scan / import coi như nhập tay', () => {
    const d = data();
    d.expenses[0]!.source = 'import';
    expect(buildCostEntries(d).map((c) => c.source)).toEqual(['manual', 'manual', 'manual', 'wage']);
  });
  it('năm hạch toán 80%: đủ 80% thì chỉ hiện ở năm đó với số cả vòng đời; không đủ thì theo năm, lợi nhuận toàn thời gian', () => {
    expect(effectiveYear([{ id: '1', project_id: 'p', date: '2025-05-01', amount: 90, paid_at_purchase: true, source: 'manual' }, { id: '2', project_id: 'p', date: '2026-01-01', amount: 10, paid_at_purchase: true, source: 'manual' }]))
      .toMatchObject({ year: 2025, share: 0.9, total: 100 });
    const d: CalcData = {
      ...empty(), projects: [proj('ey'), proj('split')],
      expenses: [
        { id: '1', project_id: 'ey', date: '2025-05-01', amount: 90, paid_at_purchase: true }, { id: '2', project_id: 'ey', date: '2026-01-01', amount: 10, paid_at_purchase: true },
        { id: '3', project_id: 'split', date: '2025-05-01', amount: 60, paid_at_purchase: true }, { id: '4', project_id: 'split', date: '2026-01-01', amount: 40, paid_at_purchase: true },
      ],
      receipts: [{ project_id: 'split', date: '2026-02-01', amount: 150 }],
    };
    const r26 = profitReport(d, [2026], NOW);
    expect(r26.rows.map((r) => [r.projectId, r.mode, r.A, r.profit, r.profitInYear])).toEqual([['split', 'split', 40, 50, 110]]);
    const r25 = profitReport(d, [2025], NOW);
    expect(r25.rows.map((r) => [r.projectId, r.mode, r.A, r.profit])).toEqual([['ey', 'ey', 100, -100], ['split', 'split', 60, 50]]);
    expect(profitReport(d, ALL_YEARS, NOW).rows.map((r) => r.mode)).toEqual(['all', 'all']);
  });
  it('tỷ suất và xếp loại', () => {
    expect(profitMargin(20, 100)).toBe(20);
    expect(profitMargin(20, 0)).toBeNull();
    expect([profitRating(-1, null), profitRating(0, null), profitRating(20, 20), profitRating(10, 10)]).toEqual(['loss', 'no_revenue', 'good', 'low']);
  });
});

describe('payables — công nợ phải trả', () => {
  it('trả NCC theo cục: hóa đơn cũ nhất trước, bất kể công trình (ví dụ mục 4J)', () => {
    const invoices = [
      { id: 'n2', project_id: 'nhut', date: '2026-10-12', amount: 30_037_000 },
      { id: 'h1', project_id: 'huynh', date: '2026-10-08', amount: 30_110_000 },
      { id: 'n1', project_id: 'nhut', date: '2026-10-05', amount: 20_000_000 },
    ];
    expect(allocateSupplierPayment(50_000_000, invoices)).toEqual([
      { expense_id: 'n1', project_id: 'nhut', amount: 20_000_000 }, { expense_id: 'h1', project_id: 'huynh', amount: 30_000_000 },
    ]);
    // Trả cho riêng một công trình + trả dư
    expect(allocateSupplierPayment(60_000_000, invoices, 'nhut')).toEqual([
      { expense_id: 'n1', project_id: 'nhut', amount: 20_000_000 }, { expense_id: 'n2', project_id: 'nhut', amount: 30_037_000 }, { expense_id: null, project_id: 'nhut', amount: 9_963_000 },
    ]);
    expect(allocateSupplierPayment(5, [{ id: 'x', project_id: 'p', date: '2026-01-01', amount: 10, alreadyPaid: 8 }])).toEqual([{ expense_id: 'x', project_id: 'p', amount: 2 }, { expense_id: null, project_id: null, amount: 3 }]);
  });
  it('công nợ NCC = hóa đơn chưa tích Đã TT − đã trả', () => {
    const out = supplierPayables(
      [{ id: '1', project_id: 'p', date: '2026-01-01', amount: 80_147_000, paid_at_purchase: false, supplier_id: 's' }, { id: '2', project_id: 'p', date: '2026-01-01', amount: 999, paid_at_purchase: true, supplier_id: 's' }],
      [{ id: 'a', kind: 'supplier_payment', date: '2026-01-31', amount: 50_000_000, project_id: null, supplier_id: 's' }],
    );
    expect(out).toEqual([{ supplierId: 's', creditInvoices: 80_147_000, paid: 50_000_000, debt: 30_147_000 }]);
  });
  it('thầu phụ: phiếu gắn HĐ tính cho HĐ đó; phiếu không gắn thì HĐ cũ nhất đủ trước, dư dồn HĐ mới nhất', () => {
    const hs = [
      { id: 'h1', project_id: 'p', subcontractor_id: 't', date: '2026-01-01', value: 100, legacy_variation: 0 },
      { id: 'h2', project_id: 'p', subcontractor_id: 't', date: '2026-02-01', value: 50, legacy_variation: 10 },
    ];
    const pay = (id: string, amount: number, subcontract_id: string | null = null) => ({ id, kind: 'advance', date: '2026-03-01', amount, project_id: 'p', subcontractor_id: 't', subcontract_id, created_at: `2026-03-01T00:00:0${id}Z` });
    expect(subcontractPayables(hs, [pay('1', 30, 'h2'), pay('2', 120), pay('3', 40)])).toEqual([
      { subcontractId: 'h1', total: 100, paid: 100, debt: 0 }, { subcontractId: 'h2', total: 60, paid: 90, debt: -30 },
    ]);
  });
});

describe('stats — số tổng hợp', () => {
  it('tuần bắt đầu Chủ nhật, cộng chi theo tuần', () => {
    expect(weekStartOf('2026-11-11')).toBe('2026-11-08');
    expect(weekStartOf('2026-11-08')).toBe('2026-11-08');
    expect(weekNumber('2025-12-28')).toBe(1);
    const c = (date: string, amount: number) => ({ id: date, project_id: 'p', date, amount, paid_at_purchase: true, source: 'manual' });
    const out = weeklyCosts([c('2026-11-01', 5), c('2026-11-07', 7), c('2026-11-10', 3), c('2026-10-24', 99)], '2026-11-11', 2);
    expect(out.map((w) => [w.weekStart, w.amount])).toEqual([['2026-11-01', 12], ['2026-11-08', 3]]);
  });
  it('cơ cấu chi: loại chi phí, Nhân Công, Chi phí chung, Thầu phụ; gộp phần đuôi vào Khác', () => {
    const c = (id: string, project_id: string, amount: number, source: string, type?: string) => ({ id, project_id, date: '2026-01-01', amount, paid_at_purchase: true, source, expense: type ? { id, project_id, date: '2026-01-01', amount, paid_at_purchase: true, expense_type_id: type } : undefined });
    const out = costBreakdown(
      [c('1', 'p', 50, 'manual', 'sat'), c('2', 'p', 30, 'wage'), c('3', 'cty', 20, 'manual', 'sat'), c('4', 'p', 5, 'manual', 'dien'), c('5', 'p', 4, 'manual', 'nuoc')],
      [{ id: 'x', kind: 'advance', date: '2026-01-02', amount: 40, project_id: 'p' }, { id: 'y', kind: 'supplier_payment', date: '2026-01-02', amount: 999, project_id: 'p' }],
      new Set(['cty']), (id) => ({ sat: 'Sắt Thép', dien: 'Điện', nuoc: 'Nước' })[id ?? ''] ?? '', [2026], 4,
    );
    expect(out).toEqual([{ label: 'Sắt Thép', amount: 50 }, { label: 'Thầu phụ', amount: 40 }, { label: 'Nhân Công', amount: 30 }, { label: 'Khác', amount: 29 }]);
  });
  it('percentOf', () => {
    expect(percentOf(50, 200)).toBe(25);
    expect(percentOf(1, 0)).toBeNull();
  });
});
