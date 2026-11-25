// Test trang Chi tiết công trình: số nhỏ tự đặt + (nếu có snapshot) tổng "chi theo loại" phải bằng A của tab Lợi Nhuận.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformSnapshot } from '../../../../scripts/legacy/transform.ts';
import {
  ALL_YEARS, buildProfitIndex, collapseBreakdown, profitContext, projectCostByType, projectCostSummary, projectProfit, projectSubcontracts,
  type CalcData,
} from '../index';

const empty = (): CalcData => ({ projects: [], expenses: [], timesheetWeeks: [], timesheetLines: [], payments: [], paymentAllocations: [], receipts: [], mainContracts: [], settlements: [] });
const exp = (id: string, o: Record<string, unknown> = {}) => ({ id, project_id: 'p1', date: '2026-03-01', amount: 100, paid_at_purchase: true, supplier_id: 's1', expense_type_id: 't1', ...o }) as CalcData['expenses'][number];
const typeName = (id: string | null | undefined) => ({ t1: 'Sắt Thép', t2: 'Điện Nước' } as Record<string, string>)[id ?? ''] ?? '';

describe('chi theo loại của 1 công trình', () => {
  it('cộng hóa đơn đã TT + tiền trả NCC theo loại của hóa đơn, bỏ hóa đơn chưa TT', () => {
    const d = empty();
    d.expenses = [exp('e1'), exp('e2', { expense_type_id: 't2', amount: 50 }), exp('e3', { paid_at_purchase: false, amount: 999 }), exp('e4', { project_id: 'p2' })];
    d.payments = [{ id: 'pay1', kind: 'supplier_payment', date: '2026-04-01', amount: 300, project_id: null, supplier_id: 's1' }];
    d.paymentAllocations = [{ payment_id: 'pay1', expense_id: 'e3', project_id: 'p1', amount: 300 }];
    const r = projectCostByType('p1', d, ALL_YEARS, typeName);
    expect(Object.fromEntries(r.map((x) => [x.label, x.amount]))).toEqual({ 'Sắt Thép': 400, 'Điện Nước': 50 });
  });
  it('lọc năm theo ngày hóa đơn / ngày phiếu chi', () => {
    const d = empty();
    d.expenses = [exp('e1', { date: '2025-12-31' }), exp('e2', { date: '2026-01-01' })];
    expect(projectCostByType('p1', d, [2026], typeName).reduce((s, x) => s + x.amount, 0)).toBe(100);
  });
  it('gộp đuôi thành "Khác"', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ label: `L${i}`, amount: 10 - i }));
    const r = collapseBreakdown(items, 4);
    expect(r).toHaveLength(4);
    expect(r[3]!.label).toBe('Khác (7 loại)');
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(55);
  });
});

describe('thầu phụ của công trình', () => {
  it('HĐ thầu phụ: đã trả / còn phải trả', () => {
    const subs = [{ id: 'h1', project_id: 'p1', subcontractor_id: 'tp1', date: '2026-02-01', value: 1000, legacy_variation: 0 }];
    const pays = [{ id: 'a', kind: 'advance', date: '2026-02-05', amount: 400, project_id: 'p1', subcontractor_id: 'tp1', subcontract_id: 'h1' }];
    expect(projectSubcontracts('p1', subs, pays, ALL_YEARS)).toEqual([{ id: 'h1', subcontractorId: 'tp1', date: '2026-02-01', total: 1000, paid: 400, debt: 600 }]);
  });
  it('tổng chi phí = đã chi + nợ NCC + nợ thầu phụ = mọi hóa đơn + HĐ thầu phụ (không HĐ thì tiền đã ứng) + chi phí chung', () => {
    const d = empty();
    d.projects = [
      { id: 'p1', name: 'P1', is_company_overhead: false, start_date: '2026-01-01', end_date: '2026-03-01' },
      { id: 'cty', name: 'CÔNG TY', is_company_overhead: true },
    ] as CalcData['projects'];
    d.expenses = [exp('e1', { amount: 100 }), exp('e2', { paid_at_purchase: false, amount: 500 }), exp('c', { project_id: 'cty', amount: 40 })];
    const subs = [
      { id: 'h1', project_id: 'p1', subcontractor_id: 'tp1', date: '2026-02-01', value: 1000, legacy_variation: 0 },
      { id: 'h2', project_id: 'p1', subcontractor_id: 'tp2', date: '2026-02-01', value: 300, legacy_variation: 0 },
    ];
    d.payments = [
      { id: 'a', kind: 'advance', date: '2026-02-05', amount: 400, project_id: 'p1', subcontractor_id: 'tp1', subcontract_id: 'h1' },
      { id: 'b', kind: 'advance', date: '2026-02-05', amount: 300, project_id: 'p1', subcontractor_id: 'tp2', subcontract_id: 'h2' },
      { id: 'c', kind: 'advance', date: '2026-02-05', amount: 70, project_id: 'p1', subcontractor_id: 'tp3' }, // không có HĐ
      { id: 'n', kind: 'supplier_payment', date: '2026-04-01', amount: 200, project_id: null, supplier_id: 's1' },
    ];
    d.paymentAllocations = [{ payment_id: 'n', expense_id: 'e2', project_id: 'p1', amount: 200 }];
    const n = projectProfit(d.projects[0]!, profitContext(buildProfitIndex(d), ALL_YEARS, Date.parse('2026-11-01')));
    expect(n.C).toBe(40);
    const r = projectCostSummary(n, projectSubcontracts('p1', subs, d.payments, ALL_YEARS));
    expect(r).toEqual({ subcontractDebt: 600, payable: 900, totalCost: (100 + 500) + (1000 + 300 + 70) + 40 });
  });
  it('HĐ trả dư không trừ vào nợ HĐ khác', () => {
    expect(projectCostSummary({ spent: 10, supplierDebt: 5 }, [{ debt: -100 }, { debt: 20 }])).toEqual({ subcontractDebt: 20, payable: 25, totalCost: 35 });
  });
});

const SNAP = join(process.cwd(), 'du-lieu', 'snapshot.json');
describe.skipIf(!existsSync(SNAP))('trên dữ liệu thật: Σ chi theo loại = A của tab Lợi Nhuận', () => {
  it('mọi công trình × (2024, 2025, 2026, Tất cả)', () => {
    const snap = JSON.parse(readFileSync(SNAP, 'utf8')) as Record<string, unknown>;
    const t = transformSnapshot(snap, { companyId: '00000000-0000-0000-0000-000000000001', userIdByLegacyName: {} }).tables as unknown as Record<string, Record<string, unknown>[]>;
    const live = <T,>(n: string) => (t[n] ?? []).filter((r) => !r.deleted_at) as unknown as T[];
    const data: CalcData = {
      projects: live('projects'), expenses: live('expenses'), timesheetWeeks: live('timesheet_weeks'), timesheetLines: live('timesheet_lines'),
      payments: live('payments'), paymentAllocations: live('payment_allocations'), receipts: live('receipts'), mainContracts: live('main_contracts'), settlements: live('settlements'),
    };
    const index = buildProfitIndex(data);
    const now = Date.parse('2026-11-03T14:25:00+07:00');
    const bad: string[] = [];
    for (const years of [[2024], [2025], [2026], ALL_YEARS]) {
      const ctx = profitContext(index, years, now);
      for (const p of index.realProjects) {
        const A = projectProfit(p, ctx).A;
        const sum = projectCostByType(p.id, data, years, () => 'x').reduce((s, x) => s + x.amount, 0);
        if (Math.round(A) !== Math.round(sum)) bad.push(`${p.name} ${years.join()}: A=${A} tổng loại=${sum}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

import { subcontractorStandings } from '../index';
describe('thầu phụ: tổng hợp theo từng thầu phụ', () => {
  it('số HĐ, giá trị, đã trả, còn phải trả (HĐ trả dư không làm giảm nợ HĐ khác)', () => {
    const subs = [
      { id: 'h1', project_id: 'p1', subcontractor_id: 'tp1', date: '2026-01-01', value: 1000, legacy_variation: 0 },
      { id: 'h2', project_id: 'p2', subcontractor_id: 'tp1', date: '2026-01-02', value: 500, legacy_variation: 0 },
    ];
    const pays = [
      { id: 'a', kind: 'advance', date: '2026-02-01', amount: 1200, project_id: 'p1', subcontractor_id: 'tp1', subcontract_id: 'h1' },
      { id: 'b', kind: 'progress', date: '2026-02-01', amount: 100, project_id: 'p2', subcontractor_id: 'tp1', subcontract_id: 'h2' },
    ];
    expect(subcontractorStandings(subs, pays).get('tp1')).toEqual({ contracts: 2, total: 1500, paid: 1300, debt: 400 });
  });
});
