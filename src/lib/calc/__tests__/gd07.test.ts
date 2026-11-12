// GĐ7 — chia tiền trả NCC theo cục (mục 4J), đối chiếu NCC, công nợ thầu phụ theo cặp, phiếu thu còn lại sau quyết toán.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformSnapshot } from '../../../../scripts/legacy/transform.ts';
import {
  contractItemsTotal, paidByInvoice, reallocateSupplierPayments, remainingAfterSettlement, settlementHistory, subcontractorPairPayables,
  sumOf, supplierPayables, supplierStatement, type AllocationRow, type CreditInvoice, type SupplierPaymentIn,
} from '../index';

const inv = (id: string, project_id: string, date: string, amount: number, supplier_id = 'phuong'): CreditInvoice => ({ id, supplier_id, project_id, date, amount, created_at: `${date}T08:00:00Z` });
const pay = (id: string, date: string, amount: number, o: Partial<SupplierPaymentIn> = {}): SupplierPaymentIn => ({ id, supplier_id: 'phuong', date, amount, project_id: null, allocation_mode: 'fifo', created_at: `${date}T09:00:00Z`, ...o });
const byProject = (rows: AllocationRow[]) => { const m: Record<string, number> = {}; for (const r of rows) m[r.project_id] = (m[r.project_id] ?? 0) + r.amount; return m; };

// Ví dụ VLXD Phương (KẾ HOẠCH mục 4J)
const PHUONG = [inv('n1', 'nhut', '2026-10-05', 20_000_000), inv('n2', 'nhut', '2026-10-12', 30_037_000), inv('h1', 'huynh', '2026-10-08', 30_110_000)];

describe('chia tiền trả NCC — mục 4J', () => {
  it('ví dụ VLXD Phương: trả 50 tr → đúng từng đồng', () => {
    const rows = reallocateSupplierPayments(PHUONG, [pay('p1', '2026-10-31', 50_000_000)]);
    expect(rows).toEqual([
      { payment_id: 'p1', expense_id: 'n1', project_id: 'nhut', amount: 20_000_000 },
      { payment_id: 'p1', expense_id: 'h1', project_id: 'huynh', amount: 30_000_000 },
    ]);
    expect(byProject(rows)).toEqual({ nhut: 20_000_000, huynh: 30_000_000 });
    const st = supplierStatement(PHUONG, rows);
    expect(st.map((l) => [l.id, l.paid, l.remaining])).toEqual([['n1', 20_000_000, 0], ['h1', 30_000_000, 110_000], ['n2', 0, 30_037_000]]);
    expect(sumOf(st.filter((l) => l.project_id === 'nhut'), (l) => l.remaining)).toBe(30_037_000);
    expect(sumOf(st.filter((l) => l.project_id === 'huynh'), (l) => l.remaining)).toBe(110_000);
    expect(st.at(-1)!.running).toBe(80_147_000);
    const debt = supplierPayables(
      PHUONG.map((i) => ({ ...i, paid_at_purchase: false })),
      [{ id: 'p1', kind: 'supplier_payment', date: '2026-10-31', amount: 50_000_000, project_id: null, supplier_id: 'phuong' }],
    );
    expect(debt[0]!.debt).toBe(30_147_000);
  });

  it('trả tiếp: phiếu sau nối vào chỗ phiếu trước dừng; xóa phiếu thì chia lại từ đầu', () => {
    const two = reallocateSupplierPayments(PHUONG, [pay('p1', '2026-10-31', 50_000_000), pay('p2', '2026-11-05', 30_147_000)]);
    expect(paidByInvoice(two)).toEqual(new Map([['n1', 20_000_000], ['h1', 30_110_000], ['n2', 30_037_000]]));
    expect(two.filter((r) => r.payment_id === 'p2')).toEqual([
      { payment_id: 'p2', expense_id: 'h1', project_id: 'huynh', amount: 110_000 },
      { payment_id: 'p2', expense_id: 'n2', project_id: 'nhut', amount: 30_037_000 },
    ]);
    expect(reallocateSupplierPayments(PHUONG, [pay('p2', '2026-11-05', 30_147_000)])).toEqual([
      { payment_id: 'p2', expense_id: 'n1', project_id: 'nhut', amount: 20_000_000 },
      { payment_id: 'p2', expense_id: 'h1', project_id: 'huynh', amount: 10_147_000 },
    ]);
  });

  it('"Trả cho công trình…": chỉ chia trong công trình đó, chia trước phiếu theo cục; trả dư vẫn tính cho công trình', () => {
    const rows = reallocateSupplierPayments(PHUONG, [
      pay('cuc', '2026-10-20', 25_000_000),
      pay('rieng', '2026-10-31', 31_000_000, { project_id: 'huynh', allocation_mode: 'project' }),
    ]);
    expect(rows.filter((r) => r.payment_id === 'rieng')).toEqual([
      { payment_id: 'rieng', expense_id: 'h1', project_id: 'huynh', amount: 30_110_000 },
      { payment_id: 'rieng', expense_id: null, project_id: 'huynh', amount: 890_000 },
    ]);
    expect(rows.filter((r) => r.payment_id === 'cuc')).toEqual([
      { payment_id: 'cuc', expense_id: 'n1', project_id: 'nhut', amount: 20_000_000 },
      { payment_id: 'cuc', expense_id: 'n2', project_id: 'nhut', amount: 5_000_000 },
    ]);
  });

  it('tích từng hóa đơn: chia vào hóa đơn đã tích; dư thì chia tiếp cũ nhất trước', () => {
    const picks = new Map([['tay', ['n2']]]);
    const rows = reallocateSupplierPayments(PHUONG, [pay('tay', '2026-10-31', 31_000_000, { allocation_mode: 'manual' })], picks);
    expect(rows).toEqual([
      { payment_id: 'tay', expense_id: 'n2', project_id: 'nhut', amount: 30_037_000 },
      { payment_id: 'tay', expense_id: 'n1', project_id: 'nhut', amount: 963_000 },
    ]);
  });

  it('trả theo cục dư so với hóa đơn: phần dư chưa tính cho công trình nào; nhiều NCC không lẫn nhau', () => {
    const invoices = [...PHUONG, inv('x1', 'nhut', '2026-10-01', 5_000_000, 'hunghue')];
    const rows = reallocateSupplierPayments(invoices, [pay('p1', '2026-10-31', 90_000_000), pay('q1', '2026-10-31', 1_000_000, { supplier_id: 'hunghue' })]);
    expect(sumOf(rows.filter((r) => r.payment_id === 'p1'), (r) => r.amount)).toBe(80_147_000);
    expect(rows.filter((r) => r.payment_id === 'q1')).toEqual([{ payment_id: 'q1', expense_id: 'x1', project_id: 'nhut', amount: 1_000_000 }]);
    expect(rows.every((r) => r.project_id)).toBe(true);
  });
});

describe('công nợ thầu phụ theo cặp, hợp đồng, quyết toán', () => {
  it('cặp thầu phụ × công trình: giá trị = Σ HĐ, đã trả = Σ phiếu chi', () => {
    const rows = subcontractorPairPayables(
      [{ id: 'h1', project_id: 'a', subcontractor_id: 'tp', date: '2026-01-01', value: 60, legacy_variation: 3 }, { id: 'h2', project_id: 'a', subcontractor_id: 'tp', date: '2026-02-01', value: 40, legacy_variation: 0 }],
      [{ id: 'u1', kind: 'advance', date: '2026-01-05', amount: 50, project_id: 'a', subcontractor_id: 'tp' }, { id: 'u2', kind: 'progress', date: '2026-01-06', amount: 20, project_id: 'b', subcontractor_id: 'tp' },
        { id: 'n', kind: 'supplier_payment', date: '2026-01-06', amount: 999, project_id: 'a', supplier_id: 's' }],
    );
    expect(rows.find((r) => r.key === 'tp|a')).toMatchObject({ value: 103, paid: 50, debt: 53, contractCount: 2 });
    expect(rows.find((r) => r.key === 'tp|b')).toMatchObject({ value: 0, paid: 20, debt: -20, contractCount: 0 });
  });
  it('hạng mục hợp đồng: Σ khối lượng × đơn giá', () => {
    expect(contractItemsTotal([{ sl: 412, donGia: 4_200_000 }, { sl: 412, donGia: 3_423_000 }])).toBe(3_140_676_000);
    expect(contractItemsTotal([{ sl: 1.5, donGia: 333_333 }])).toBe(500_000);
  });
  it('phiếu thu còn lại sau quyết toán = HĐ gốc + quyết toán − đã thu (toàn vòng đời, bỏ quy tắc max)', () => {
    const hd = [{ project_id: 'a', date: '2025-01-01', value: 100, extra_value: 10, legacy_variation: 0 }];
    const thu = [{ project_id: 'a', date: '2025-06-01', amount: 70 }, { project_id: 'a', date: '2026-02-01', amount: 20 }];
    expect(remainingAfterSettlement(hd, thu, [{ id: 'q', project_id: 'a', date: '2026-03-01', kind: 'increase', amount: 15 }])).toBe(35);
    expect(remainingAfterSettlement(hd, thu, [{ id: 'q', project_id: 'a', date: '2026-03-01', kind: 'replace', amount: 80 }])).toBe(-10);
    expect(remainingAfterSettlement(hd, thu, [{ id: 'q', project_id: 'a', date: '2026-03-01', kind: 'decrease', amount: 20 }])).toBe(0);
    expect(settlementHistory(hd, [{ id: 'q1', project_id: 'a', date: '2026-03-01', kind: 'increase', amount: 15 }, { id: 'q2', project_id: 'a', date: '2026-04-01', kind: 'replace', amount: 200 }]))
      .toEqual([{ id: 'q1', before: 110, delta: 15, after: 125 }, { id: 'q2', before: 125, delta: 75, after: 200 }]);
  });
});

// Phiếu chi NCC đời cũ (chia theo công trình): tính lại bằng công thức mới phải ra ĐÚNG cách chia script chuyển dữ liệu đã ghi
// → A phần trả NCC của mọi công trình × năm không đổi (test so số GĐ3 vẫn xanh sau lần tính lại đầu tiên).
const SNAP = join(process.cwd(), 'du-lieu', 'snapshot.json');
describe.skipIf(!existsSync(SNAP))('dữ liệu thật: tính lại cách chia phiếu chi NCC cũ', () => {
  it('ra đúng các dòng chia đang có trong kho', () => {
    const t = transformSnapshot(JSON.parse(readFileSync(SNAP, 'utf8')) as Record<string, unknown>, { companyId: '00000000-0000-0000-0000-000000000001', userIdByLegacyName: {} })
      .tables as unknown as Record<string, Record<string, unknown>[]>;
    const live = <T,>(name: string) => (t[name] ?? []).filter((r) => !r.deleted_at) as unknown as T[];
    const invoices = live<CreditInvoice & { paid_at_purchase: boolean }>('expenses').filter((e) => e.supplier_id && e.paid_at_purchase === false);
    const payments = live<SupplierPaymentIn & { kind: string }>('payments').filter((p) => p.kind === 'supplier_payment');
    const payIds = new Set(payments.map((p) => p.id));
    const key = (r: AllocationRow) => `${r.payment_id}|${r.expense_id}|${r.project_id}|${r.amount}`;
    const old = live<AllocationRow>('payment_allocations').filter((a) => payIds.has(a.payment_id)).map(key).sort();
    const fresh = reallocateSupplierPayments(invoices, payments).map(key).sort();
    expect(payments.length).toBeGreaterThan(0);
    expect(fresh).toEqual(old);
  });
});
