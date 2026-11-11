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
