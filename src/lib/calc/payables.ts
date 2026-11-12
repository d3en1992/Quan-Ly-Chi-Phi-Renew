// CÔNG NỢ PHẢI TRẢ (công ty nợ NCC / thầu phụ).
// - NCC: chia phiếu chi vào hóa đơn mua nợ CŨ NHẤT TRƯỚC (KẾ HOẠCH mục 4J).
// - Thầu phụ: chia phiếu chi vào hợp đồng như `_hdtpUngAlloc` (congno.hdtp.js).
import { sortByDateThenCreated } from './revenue';
import type { CalcExpense, CalcPayment, CalcSubcontract } from './types';

export type OpenInvoice = { id: string; project_id: string; date: string | null; created_at?: string | null; amount: number; alreadyPaid?: number };

export type AllocationPiece = { expense_id: string | null; project_id: string | null; amount: number };

/**
 * Chia MỘT cục tiền trả NCC vào các hóa đơn mua nợ chưa trả hết, cũ nhất trước (bất kể công trình).
 * `onlyProjectId`: trường hợp "Trả cho công trình…" → chỉ chia trong công trình đó.
 * Tiền còn dư sau khi hết hóa đơn → 1 mảnh không gắn hóa đơn (trả dư / trả trước), gắn `onlyProjectId` nếu có.
 */
export function allocateSupplierPayment(amount: number, invoices: readonly OpenInvoice[], onlyProjectId?: string | null): AllocationPiece[] {
  const out: AllocationPiece[] = [];
  let left = amount;
  const open = sortByDateThenCreated(invoices.filter((i) => !onlyProjectId || i.project_id === onlyProjectId));
  for (const inv of open) {
    if (left <= 0) break;
    const room = inv.amount - (inv.alreadyPaid ?? 0);
    if (room <= 0) continue;
    const take = Math.min(left, room);
    out.push({ expense_id: inv.id, project_id: inv.project_id, amount: take });
    left -= take;
  }
  if (left > 0) out.push({ expense_id: null, project_id: onlyProjectId ?? null, amount: left });
  return out;
}

export type SupplierPayable = {
  supplierId: string;
  /** Tổng hóa đơn mua nợ (chưa tích Đã TT) */
  creditInvoices: number;
  /** Tổng đã trả */
  paid: number;
  /** Còn nợ = mua nợ − đã trả (âm = trả dư) */
  debt: number;
};

/** Công nợ từng NCC = Σ hóa đơn chưa tích Đã TT − Σ phiếu trả NCC (mục 4F điểm 5). */
export function supplierPayables(expenses: readonly CalcExpense[], payments: readonly CalcPayment[]): SupplierPayable[] {
  const m = new Map<string, SupplierPayable>();
  const get = (id: string) => {
    let r = m.get(id);
    if (!r) { r = { supplierId: id, creditInvoices: 0, paid: 0, debt: 0 }; m.set(id, r); }
    return r;
  };
  for (const e of expenses) if (!e.paid_at_purchase && e.supplier_id) get(e.supplier_id).creditInvoices += e.amount || 0;
  for (const p of payments) if (p.kind === 'supplier_payment' && p.supplier_id) get(p.supplier_id).paid += p.amount || 0;
  for (const r of m.values()) r.debt = r.creditInvoices - r.paid;
  return [...m.values()];
}

/** Giá trị 1 HĐ thầu phụ = giá trị + phát sinh đời cũ (`_hdtpTong`) */
export function subcontractTotal(h: Pick<CalcSubcontract, 'value' | 'legacy_variation'>): number {
  return (h.value || 0) + (h.legacy_variation || 0);
}

export type SubcontractPayable = { subcontractId: string; total: number; paid: number; debt: number };

/**
 * Đã trả của từng HĐ thầu phụ (`_hdtpUngAlloc`):
 * 1) phiếu gắn thẳng HĐ (và vẫn cùng cặp thầu phụ × công trình) → tính cho HĐ đó;
 * 2) phiếu không gắn HĐ → gom theo cặp thầu phụ × công trình, HĐ cũ nhất được trả đủ trước, dư dồn vào HĐ mới nhất.
 */
export function subcontractPayables(contracts: readonly CalcSubcontract[], payments: readonly CalcPayment[]): SubcontractPayable[] {
  const paid = new Map<string, number>(contracts.map((h) => [h.id, 0]));
  const pairKey = (subId: string | null | undefined, projectId: string | null | undefined) => `${subId ?? ''}|${projectId ?? ''}`;
  const byPair = new Map<string, CalcSubcontract[]>();
  const pairOf = new Map<string, string>();
  for (const h of contracts) {
    const k = pairKey(h.subcontractor_id, h.project_id);
    const arr = byPair.get(k);
    if (arr) arr.push(h); else byPair.set(k, [h]);
    pairOf.set(h.id, k);
  }
  const pool = new Map<string, CalcPayment[]>();
  for (const u of payments) {
    if (u.kind !== 'advance' && u.kind !== 'progress') continue;
    const k = pairKey(u.subcontractor_id, u.project_id);
    if (u.subcontract_id && paid.has(u.subcontract_id) && pairOf.get(u.subcontract_id) === k) {
      paid.set(u.subcontract_id, (paid.get(u.subcontract_id) ?? 0) + (u.amount || 0));
      continue;
    }
    if (!u.subcontractor_id || !byPair.has(k)) continue;
    const arr = pool.get(k);
    if (arr) arr.push(u); else pool.set(k, [u]);
  }
  for (const [k, list] of pool) {
    const hs = sortByDateThenCreated(byPair.get(k) ?? []);
    const room = (h: CalcSubcontract) => subcontractTotal(h) - (paid.get(h.id) ?? 0);
    let i = 0;
    for (const u of sortByDateThenCreated(list)) {
      let left = u.amount || 0;
      if (left <= 0) { const h = hs[i]!; paid.set(h.id, (paid.get(h.id) ?? 0) + left); continue; }
      while (left > 0) {
        while (i < hs.length - 1 && room(hs[i]!) <= 0) i++;
        const h = hs[i]!;
        const amt = i === hs.length - 1 ? left : Math.min(left, room(h));
        paid.set(h.id, (paid.get(h.id) ?? 0) + amt);
        left -= amt;
      }
    }
  }
  return contracts.map((h) => {
    const total = subcontractTotal(h), p = paid.get(h.id) ?? 0;
    return { subcontractId: h.id, total, paid: p, debt: total - p };
  });
}

// ───────────────────────── GĐ7 ─────────────────────────

/** Còn nợ ≤ 100.000 đ coi như đã trả đủ (`CN_DONE_TOLERANCE` của app cũ) */
export const PAYABLE_DONE_TOLERANCE = 100_000;

export type CreditInvoice = { id: string; supplier_id: string; project_id: string; date: string | null; created_at?: string | null; amount: number };
export type SupplierPaymentIn = {
  id: string; supplier_id: string; date: string | null; created_at?: string | null; amount: number; project_id: string | null;
  /** fifo = cũ nhất trước mọi công trình · project = chỉ trong công trình project_id · manual = theo hóa đơn đã tích */
  allocation_mode: string;
};
export type AllocationRow = { payment_id: string; expense_id: string | null; project_id: string; amount: number };

/**
 * TÍNH LẠI toàn bộ cách chia tiền trả NCC (mục 4J). Gọi mỗi khi lưu / sửa / xóa phiếu Trả nợ NCC hoặc hóa đơn mua nợ.
 * - Phiếu có chỉ định (tích hóa đơn = manual, "Trả cho công trình…" = project, phiếu đời cũ = project) chia TRƯỚC, theo ngày phiếu.
 *   · manual: chia vào các hóa đơn đã tích (cũ nhất trước); còn dư thì chia tiếp trong công trình của phiếu, không có công trình thì như fifo.
 *   · project: chỉ chia trong công trình; trả dư vẫn tính cho công trình đó (1 dòng không gắn hóa đơn) — để A khớp app cũ.
 * - Phiếu trả theo cục (fifo) chia SAU: hóa đơn mua nợ cũ nhất trước (ngày, rồi ngày tạo), bất kể công trình.
 *   Trả dư chưa có hóa đơn để chia thì CHƯA tính cho công trình nào (nợ NCC âm = trả trước); có hóa đơn mới sẽ tự chia.
 * `manualPicks`: phiếu manual → danh sách id hóa đơn đã tích.
 */
export function reallocateSupplierPayments(
  invoices: readonly CreditInvoice[], payments: readonly SupplierPaymentIn[], manualPicks: ReadonlyMap<string, readonly string[]> = new Map(),
): AllocationRow[] {
  const out: AllocationRow[] = [];
  const bySupplier = new Map<string, { inv: CreditInvoice[]; pay: SupplierPaymentIn[] }>();
  const slot = (id: string) => { let s = bySupplier.get(id); if (!s) { s = { inv: [], pay: [] }; bySupplier.set(id, s); } return s; };
  for (const i of invoices) slot(i.supplier_id).inv.push(i);
  for (const p of payments) slot(p.supplier_id).pay.push(p);

  for (const { inv, pay } of bySupplier.values()) {
    const sortedInv = sortByDateThenCreated(inv);
    const room = new Map(sortedInv.map((i) => [i.id, i.amount || 0]));
    const spend = (p: SupplierPaymentIn, amount: number, candidates: readonly CreditInvoice[]) => {
      let left = amount;
      for (const i of candidates) {
        if (left <= 0) break;
        const r = room.get(i.id) ?? 0;
        if (r <= 0) continue;
        const take = Math.min(left, r);
        out.push({ payment_id: p.id, expense_id: i.id, project_id: i.project_id, amount: take });
        room.set(i.id, r - take);
        left -= take;
      }
      return left;
    };
    const general: { p: SupplierPaymentIn; left: number }[] = [];
    for (const p of sortByDateThenCreated(pay)) {
      const amount = p.amount || 0;
      if (p.allocation_mode === 'manual') {
        const picks = new Set(manualPicks.get(p.id) ?? []);
        let left = spend(p, amount, sortedInv.filter((i) => picks.has(i.id)));
        if (left > 0 && p.project_id) {
          const pid = p.project_id;
          left = spend(p, left, sortedInv.filter((i) => i.project_id === pid));
          if (left > 0) out.push({ payment_id: p.id, expense_id: null, project_id: pid, amount: left });
        } else if (left > 0) general.push({ p, left });
      } else if (p.allocation_mode === 'project' && p.project_id) {
        const pid = p.project_id;
        const left = amount > 0 ? spend(p, amount, sortedInv.filter((i) => i.project_id === pid)) : amount;
        if (left !== 0) out.push({ payment_id: p.id, expense_id: null, project_id: pid, amount: left });
      } else if (amount > 0) general.push({ p, left: amount });
    }
    for (const g of general) spend(g.p, g.left, sortedInv);
  }
  return out;
}

/** Đã trả của từng hóa đơn mua nợ (theo các dòng chia) */
export function paidByInvoice(allocations: readonly { expense_id: string | null; amount: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of allocations) if (a.expense_id) m.set(a.expense_id, (m.get(a.expense_id) ?? 0) + (a.amount || 0));
  return m;
}

/** Phần tiền của từng phiếu chi đã chia (vào hóa đơn / công trình) */
export function allocatedByPayment(allocations: readonly { payment_id: string; amount: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of allocations) m.set(a.payment_id, (m.get(a.payment_id) ?? 0) + (a.amount || 0));
  return m;
}

export type StatementLine = { id: string; date: string | null; project_id: string; amount: number; paid: number; remaining: number; running: number };

/** ĐỐI CHIẾU với NCC: hóa đơn mua nợ theo ngày, đã trả (phần đã chia), còn lại và cộng dồn tiền hàng */
export function supplierStatement(invoices: readonly CreditInvoice[], allocations: readonly { expense_id: string | null; amount: number }[]): StatementLine[] {
  const paid = paidByInvoice(allocations);
  let running = 0;
  return sortByDateThenCreated(invoices).map((i) => {
    const p = paid.get(i.id) ?? 0;
    running += i.amount || 0;
    return { id: i.id, date: i.date, project_id: i.project_id, amount: i.amount || 0, paid: p, remaining: (i.amount || 0) - p, running };
  });
}

export type PairPayable = { key: string; subcontractorId: string; projectId: string; value: number; paid: number; debt: number; contractCount: number };

/** Công nợ theo cặp THẦU PHỤ × CÔNG TRÌNH (`ungPartnerDebt`, `_ttBuildRows`): giá trị = Σ HĐ thầu phụ, đã trả = Σ phiếu chi */
export function subcontractorPairPayables(contracts: readonly CalcSubcontract[], payments: readonly CalcPayment[]): PairPayable[] {
  const m = new Map<string, PairPayable>();
  const get = (sub: string, project: string) => {
    const key = `${sub}|${project}`;
    let r = m.get(key);
    if (!r) { r = { key, subcontractorId: sub, projectId: project, value: 0, paid: 0, debt: 0, contractCount: 0 }; m.set(key, r); }
    return r;
  };
  for (const h of contracts) { const r = get(h.subcontractor_id, h.project_id); r.value += subcontractTotal(h); r.contractCount++; }
  for (const u of payments) {
    if ((u.kind !== 'advance' && u.kind !== 'progress') || !u.subcontractor_id || !u.project_id) continue;
    get(u.subcontractor_id, u.project_id).paid += u.amount || 0;
  }
  for (const r of m.values()) r.debt = r.value - r.paid;
  return [...m.values()];
}

/** Cộng một cột tiền của danh sách (màn hình dùng hàm này, không tự cộng) */
export function sumOf<T>(rows: readonly T[], pick: (r: T) => number): number {
  let s = 0;
  for (const r of rows) s += pick(r) || 0;
  return s;
}
