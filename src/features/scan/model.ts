// Chụp đa năng (GĐ9) — biến kết quả AI đọc thành dữ liệu cho form: hóa đơn chi tiết, CCCD, hợp đồng. Hàm thuần, có test.
// Không có công thức tiền ở đây: thành tiền / tổng dòng dùng invoice-model → src/lib/calc; so số tổng in dùng calc.printedTotalGap.
import type { ContractScan, IdCardScan, InvoiceScan } from '@shared/scan';
import { printedTotalGap } from '@/lib/calc';
import { blankLine, invoiceTotal, quantityText, type InvoiceDraft } from '@/features/expenses/invoice-model';
import { findByName, normVi } from '@/features/expenses/logic';

type Named = { id: string; name: string };
type SupplierLite = Named & { address?: string | null; phone?: string | null; buys_on_credit?: boolean };

// ───────────── Hóa đơn ─────────────

/** Ô đầu phiếu được tô vàng (AI không chắc, hoặc AI không khớp được → người dùng phải xem) */
export type HeadKey = 'date' | 'project' | 'type' | 'supplier' | 'buyer';
const HEAD_OF: Record<string, HeadKey> = {
  date: 'date', supplier_name: 'supplier', supplier_match: 'supplier',
  project_match: 'project', expense_type_match: 'type', buyer_match: 'buyer',
};
/** Cột dòng vật tư: 0 tên · 1 ĐVT · 2 SL · 3 đơn giá (thành tiền tự tính nên không tô) */
const COL_OF: Record<string, number> = { name: 0, unit: 1, quantity: 2, unit_price: 3, amount: 3 };

export type ScanInvoiceDraft = {
  draft: InvoiceDraft;
  /** Ô đầu phiếu cần xem lại */
  unsureHead: HeadKey[];
  /** `${key dòng}:${cột}` cần xem lại */
  unsureCells: string[];
  printedTotal: number;
};

/** Kết quả AI → form Hóa đơn chi tiết điền sẵn. `today` dùng khi AI không đọc được ngày. Công trình để trống nếu AI không khớp. */
export function invoiceFromScan(inv: InvoiceScan, lists: { projects: readonly Named[]; types: readonly Named[]; buyers: readonly Named[]; suppliers: readonly SupplierLite[] }, today: string): ScanInvoiceDraft {
  const supplier = findByName(inv.supplier_match, lists.suppliers) ?? findByName(inv.supplier_name, lists.suppliers);
  const project = findByName(inv.project_match, lists.projects);
  const type = findByName(inv.expense_type_match, lists.types);
  const buyer = findByName(inv.buyer_match, lists.buyers);
  const lines = inv.lines.map((l) => blankLine({ name: l.name, unit: l.unit, quantity: quantityText(l.quantity), unitPrice: l.unit_price }));
  const unsureCells: string[] = [];
  inv.lines.forEach((l, i) => {
    for (const f of l.low_confidence) if (COL_OF[f] !== undefined) unsureCells.push(`${lines[i]!.key}:${COL_OF[f]}`);
  });
  const head = new Set<HeadKey>();
  for (const f of inv.low_confidence) if (HEAD_OF[f]) head.add(HEAD_OF[f]!);
  if (!inv.date) head.add('date');
  if (!project) head.add('project');
  if (!type) head.add('type');
  return {
    draft: {
      date: inv.date || today,
      project: project?.name ?? '', type: type?.name ?? '', buyer: buyer?.name ?? '',
      // NCC chưa có → giữ tên in trên hóa đơn (ô "Thêm nhà cung cấp mới" sẽ tạo lúc lưu)
      supplier: supplier?.name ?? inv.supplier_name,
      paid: supplier ? !supplier.buys_on_credit : true,
      description: '', amount: 0,
      lines: lines.length ? lines : [blankLine()],
    },
    unsureHead: [...head], unsureCells: [...new Set(unsureCells)], printedTotal: inv.printed_total,
  };
}

export type TotalCheck = { status: 'none' } | { status: 'match'; printed: number } | { status: 'diff'; printed: number; gap: number };

/** So tổng các dòng đang có trong form với số tổng in trên hóa đơn */
export function checkPrintedTotal(draft: InvoiceDraft, printedTotal: number): TotalCheck {
  const gap = printedTotalGap(printedTotal, invoiceTotal(draft));
  if (gap === null) return { status: 'none' };
  return gap === 0 ? { status: 'match', printed: printedTotal } : { status: 'diff', printed: printedTotal, gap };
}

export type SupplierPlan =
  | { kind: 'none' }
  | { kind: 'new'; name: string; address: string; phone: string }
  | { kind: 'existing'; id: string; name: string; missingAddress: string; missingPhone: string };

/**
 * NCC trên hóa đơn so với danh mục (KẾ HOẠCH 4D điểm 6):
 * chưa có → "Thêm nhà cung cấp mới"; có rồi mà thiếu địa chỉ / SĐT trong khi hóa đơn có in → hỏi bổ sung.
 * `supplierText` = ô NCC đang có trong form (người dùng có thể đã đổi).
 */
export function supplierPlan(supplierText: string, inv: Pick<InvoiceScan, 'supplier_name' | 'supplier_address' | 'supplier_phone'>, suppliers: readonly SupplierLite[]): SupplierPlan {
  const name = supplierText.trim().replace(/\s+/g, ' ');
  if (!name) return { kind: 'none' };
  const found = findByName(name, suppliers);
  // Địa chỉ / SĐT AI đọc chỉ thuộc về cửa hàng in trên hóa đơn — người dùng đổi sang NCC khác thì không gợi ý
  const sameShop = normVi(name) === normVi(inv.supplier_name) || (found && normVi(found.name) === normVi(inv.supplier_name));
  const address = sameShop ? inv.supplier_address : '';
  const phone = sameShop ? inv.supplier_phone : '';
  if (!found) return { kind: 'new', name: name.toUpperCase(), address, phone };
  return {
    kind: 'existing', id: found.id, name: found.name,
    missingAddress: !found.address?.trim() && address ? address : '',
    missingPhone: !found.phone?.trim() && phone ? phone : '',
  };
}

// ───────────── CCCD ─────────────

export type ContactKindForId = 'worker' | 'customer' | 'employee';
export type ContactCandidate = { id: string; kind: ContactKindForId; name: string; fullName: string | null; hasIdNumber: boolean; reason: 'full_name' | 'given_name' | 'ai' };

type PersonLite = { id: string; name: string; full_name: string | null };

/** Tên gọi = chữ cuối của họ tên ("NGUYỄN THỊ HIỀN" → "hien"); bỏ hậu tố danh bạ như " BC", " PM" khi so */
const givenName = (full: string) => normVi(full).split(' ').filter(Boolean).pop() ?? '';
const shortCore = (name: string) => normVi(name).replace(/\b(c|a|chu|co|e|t|thay)\b/g, '').replace(/\b(bc|pm|tm|mt|q|l|moi|dien|sat|xi)\b/g, '').trim();

/**
 * Tìm người trong Danh Bạ có thể là chủ CCCD: trùng họ tên đầy đủ (chắc nhất), hoặc tên gọi = tên trên CCCD (HIỀN ↔ NGUYỄN THỊ HIỀN),
 * hoặc AI đã khớp theo ghi chú. Người chưa có CCCD đứng trước.
 */
export function idCardCandidates(
  card: Pick<IdCardScan, 'full_name' | 'contact_match'>,
  book: { workers: readonly PersonLite[]; customers: readonly PersonLite[]; employees: readonly { id: string; full_name: string }[] },
  hasIdNumber: (id: string) => boolean,
): ContactCandidate[] {
  const full = normVi(card.full_name);
  const given = givenName(card.full_name);
  const ai = normVi(card.contact_match);
  const out: ContactCandidate[] = [];
  const consider = (kind: ContactKindForId, p: { id: string; name: string; full_name: string | null }) => {
    let reason: ContactCandidate['reason'] | null = null;
    if (full && p.full_name && normVi(p.full_name) === full) reason = 'full_name';
    else if (given && (shortCore(p.name) === given || normVi(p.name) === given)) reason = 'given_name';
    else if (ai && normVi(p.name) === ai) reason = 'ai';
    if (reason) out.push({ id: p.id, kind, name: p.name, fullName: p.full_name, hasIdNumber: hasIdNumber(p.id), reason });
  };
  for (const w of book.workers) consider('worker', w);
  for (const c of book.customers) consider('customer', c);
  for (const e of book.employees) consider('employee', { id: e.id, name: e.full_name, full_name: e.full_name });
  const rank = (c: ContactCandidate) => (c.reason === 'full_name' ? 0 : c.reason === 'ai' ? 1 : 2) * 2 + (c.hasIdNumber ? 1 : 0);
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'vi'));
}

/** Nhóm danh bạ đoán từ ghi chú khi AI không nói: "thợ / công nhân" → công nhân, "khách / chủ nhà" → khách hàng, "nhân viên" */
export function guessContactKind(aiKind: string, note: string): ContactKindForId {
  if (aiKind === 'worker' || aiKind === 'customer' || aiKind === 'employee') return aiKind;
  const n = normVi(note);
  if (/\b(khach|chu nha|chu dau tu)\b/.test(n)) return 'customer';
  if (/\bnhan vien\b/.test(n)) return 'employee';
  return 'worker';
}

/** Tên gọi khi tạo người mới từ CCCD: công nhân = tên cuối viết hoa (HIỀN), khách hàng = "A/C + tên" để người dùng sửa */
export function shortNameFromFull(full: string, kind: ContactKindForId): string {
  const words = full.trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] ?? '';
  if (kind === 'worker') return last.toUpperCase();
  const nice = last ? last[0]!.toUpperCase() + last.slice(1).toLowerCase() : '';
  return kind === 'customer' ? nice : words.map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// ───────────── Hợp đồng ─────────────

/** Khách hàng có sẵn khớp với hợp đồng (AI khớp, hoặc trùng tên gọi / họ tên) */
export function contractCustomer(c: Pick<ContractScan, 'customer_match' | 'customer_name' | 'customer_full_name'>, customers: readonly PersonLite[]): PersonLite | undefined {
  return findByName(c.customer_match, customers) ?? findByName(c.customer_name, customers)
    ?? (c.customer_full_name ? customers.find((x) => x.full_name && normVi(x.full_name) === normVi(c.customer_full_name)) : undefined);
}
