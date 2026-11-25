// SỐ LIỆU TRANG CHI TIẾT CÔNG TRÌNH (GĐ4). Mọi phép cộng trừ tiền của trang này nằm ở đây.
// Phần "chi theo loại" cộng lại đúng bằng A của `projectProfit` (cùng quy tắc: hóa đơn đã tích Đã TT + tiền trả NCC,
// ngày thiếu thì hiện ở mọi năm), nên trang chi tiết và tab Lợi Nhuận không bao giờ lệch nhau.
import { buildCostEntries, type ProjectProfit } from './profit';
import { subcontractPayables, subcontractTotal } from './payables';
import type { BreakdownItem } from './stats';
import type { CalcData, CalcPayment, CalcSubcontract } from './types';
import { inYearLoose, type YearFilter } from './year';

type Scope = Pick<CalcData, 'expenses' | 'timesheetWeeks' | 'timesheetLines' | 'payments' | 'paymentAllocations'>;

/** Chi (phần A) của 1 công trình, chia theo loại chi phí. Tổng các dòng = A của `projectProfit`. */
export function projectCostByType(
  projectId: string,
  data: Scope,
  years: YearFilter,
  typeName: (expenseTypeId: string | null | undefined) => string,
): BreakdownItem[] {
  const m = new Map<string, number>();
  const add = (k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const c of buildCostEntries(data)) {
    if (c.project_id !== projectId || !c.paid_at_purchase || !inYearLoose(c.date, years)) continue;
    if (c.source === 'wage') add('Nhân Công', c.amount);
    else if (c.source === 'retail') add('Hóa Đơn Lẻ', c.amount);
    else add(typeName(c.expense?.expense_type_id) || 'Chưa phân loại', c.amount);
  }
  const payById = new Map(data.payments.map((p) => [p.id, p]));
  const expById = new Map(data.expenses.map((e) => [e.id, e]));
  for (const a of data.paymentAllocations) {
    const pay = payById.get(a.payment_id);
    if (!pay || pay.kind !== 'supplier_payment' || a.project_id !== projectId || !inYearLoose(pay.date, years)) continue;
    const e = a.expense_id ? expById.get(a.expense_id) : undefined;
    add(e ? typeName(e.expense_type_id) || 'Chưa phân loại' : 'Trả NCC (chưa gắn hóa đơn)', a.amount || 0);
  }
  return [...m].map(([label, amount]) => ({ label, amount })).filter((x) => x.amount !== 0).sort((a, b) => b.amount - a.amount);
}

/** Gộp phần đuôi quá `top` loại vào "Khác (n loại)" */
export function collapseBreakdown(items: readonly BreakdownItem[], top = 8): BreakdownItem[] {
  if (items.length <= top) return [...items];
  const rest = items.slice(top - 1);
  return [...items.slice(0, top - 1), { label: `Khác (${rest.length} loại)`, amount: rest.reduce((s, x) => s + x.amount, 0) }];
}

export type ProjectSubcontractRow = { id: string; subcontractorId: string; date: string | null; total: number; paid: number; debt: number };

/** Hợp đồng thầu phụ của 1 công trình: giá trị, đã trả, còn phải trả (cách chia cũ nhất trước như app cũ). */
export function projectSubcontracts(
  projectId: string,
  contracts: readonly CalcSubcontract[],
  payments: readonly CalcPayment[],
  years: YearFilter,
): ProjectSubcontractRow[] {
  const mine = contracts.filter((h) => h.project_id === projectId);
  const paid = new Map(subcontractPayables(mine, payments.filter((p) => p.project_id === projectId)).map((r) => [r.subcontractId, r]));
  return mine
    .filter((h) => inYearLoose(h.date, years))
    .map((h) => ({ id: h.id, subcontractorId: h.subcontractor_id, date: h.date, total: subcontractTotal(h), paid: paid.get(h.id)?.paid ?? 0, debt: paid.get(h.id)?.debt ?? 0 }));
}

export type ProjectCostSummary = {
  /** Nợ thầu phụ = Σ phần chưa trả của từng hợp đồng (HĐ trả dư không làm giảm nợ HĐ khác) */
  subcontractDebt: number;
  /** Còn phải trả = nợ thầu phụ + nợ NCC */
  payable: number;
  /**
   * Tổng chi phí = đã chi + nợ NCC + nợ thầu phụ.
   * Cũng chính là: mọi hóa đơn (cả mua nợ, cả nhân công) + giá trị HĐ thầu phụ (chưa có HĐ / đã trả quá HĐ thì lấy tiền đã trả) + chi phí chung.
   */
  totalCost: number;
};

/** Còn phải trả + Tổng chi phí của trang Chi tiết công trình (anh chốt 25/11/2026 — có nợ thầu phụ, khác `totalCost` của `projectProfit`). */
export function projectCostSummary(n: Pick<ProjectProfit, 'spent' | 'supplierDebt'>, subs: readonly Pick<ProjectSubcontractRow, 'debt'>[]): ProjectCostSummary {
  const subcontractDebt = subs.reduce((s, r) => s + Math.max(0, r.debt), 0);
  const payable = subcontractDebt + n.supplierDebt;
  return { subcontractDebt, payable, totalCost: n.spent + payable };
}

export type SubcontractorStanding = { contracts: number; total: number; paid: number; debt: number };

/** Mỗi thầu phụ: số HĐ, tổng giá trị, đã trả, còn phải trả (chỉ cộng HĐ còn nợ > 0 vào `debt`, như tab Công nợ). */
export function subcontractorStandings(contracts: readonly CalcSubcontract[], payments: readonly CalcPayment[]): Map<string, SubcontractorStanding> {
  const byId = new Map(contracts.map((h) => [h.id, h]));
  const out = new Map<string, SubcontractorStanding>();
  for (const r of subcontractPayables(contracts, payments)) {
    const h = byId.get(r.subcontractId);
    if (!h) continue;
    const s = out.get(h.subcontractor_id) ?? { contracts: 0, total: 0, paid: 0, debt: 0 };
    s.contracts++; s.total += r.total; s.paid += r.paid; if (r.debt > 0) s.debt += r.debt;
    out.set(h.subcontractor_id, s);
  }
  return out;
}
