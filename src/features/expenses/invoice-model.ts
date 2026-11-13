// Mô hình của FORM một hóa đơn (hóa đơn chi tiết, sửa hóa đơn, nhập tay trên điện thoại) — hàm thuần, có test.
// Chép hành vi hoadon.detail-entry.js: thành tiền từng dòng (`calcDetailRow`), tổng (`calcDetailTotals`),
// nội dung tự ghép từ tên vật tư (`generateDetailNd`), kiểm tra đầu phiếu (`validateDetailHeaderCategories`).
import { lineAmount, sumAmounts } from '@/lib/calc';
import type { ExpenseInput } from './schema';
import { buildDescription, buyerOf, findByName } from './logic';

export type LineDraft = { key: number; name: string; unit: string; quantity: string; unitPrice: number; discount: string };

export type InvoiceDraft = {
  /** YYYY-MM-DD */
  date: string;
  project: string; type: string; supplier: string; buyer: string;
  invoiceNo: string;
  paid: boolean;
  /** Nội dung; ở hóa đơn chi tiết để trống = tự ghép từ tên vật tư */
  description: string;
  /** Số tiền gõ tay — chỉ dùng khi hóa đơn KHÔNG có dòng vật tư */
  amount: number;
  /** null = hóa đơn không có dòng vật tư (nhập nhanh / nhập tay) */
  lines: LineDraft[] | null;
};

type Named = { id: string; name: string };
export type InvoiceLists = { projects: readonly Named[]; types: readonly Named[]; buyers: readonly Named[]; suppliers: readonly Named[] };

let nextKey = 1;
export const blankLine = (from?: Partial<LineDraft>): LineDraft => ({ key: nextKey++, name: '', unit: '', quantity: '', unitPrice: 0, discount: '', ...from });
export const blankLines = (n: number): LineDraft[] => Array.from({ length: n }, () => blankLine());

export function blankInvoice(date: string, withLines: boolean): InvoiceDraft {
  return { date, project: '', type: '', supplier: '', buyer: '', invoiceNo: '', paid: true, description: '', amount: 0, lines: withLines ? blankLines(5) : null };
}

/** Số lượng gõ tay: "2,5" / "2.5" / "10" → số; sai hoặc âm → 0 */
export function parseQuantity(raw: string | number | null | undefined): number {
  const n = Number(String(raw ?? '').trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Số lượng để hiện lại trong ô: 2.5 → "2,5" */
export const quantityText = (n: number | null | undefined): string => (n ? String(n).replace('.', ',') : '');

export const lineIsBlank = (l: LineDraft): boolean => !l.name.trim() && !l.unit.trim() && !l.quantity.trim() && !l.unitPrice && !l.discount.trim();

/** Thành tiền một dòng (để trống số lượng = 1, như app cũ) */
export function lineTotal(l: LineDraft): number {
  if (lineIsBlank(l)) return 0;
  const qty = l.quantity.trim() ? parseQuantity(l.quantity) : 1;
  return lineAmount(qty, l.unitPrice, l.discount);
}

/** Tổng hóa đơn: có dòng vật tư thì cộng các dòng, không thì lấy số tiền gõ tay */
export function invoiceTotal(d: InvoiceDraft): number {
  return d.lines ? sumAmounts(d.lines.map(lineTotal)) : Math.round(d.amount) || 0;
}

/** Nội dung sẽ lưu: người dùng có gõ thì giữ, không thì tự ghép từ tên vật tư */
export function invoiceDescription(d: InvoiceDraft): string {
  const typed = d.description.trim();
  if (typed || !d.lines) return typed;
  return buildDescription(d.lines.filter((l) => !lineIsBlank(l)).map((l) => l.name));
}

export type InvoiceField = 'date' | 'project' | 'type' | 'supplier' | 'buyer' | 'amount' | 'lines';
export type InvoiceCheck = { ok: true; input: ExpenseInput } | { ok: false; bad: InvoiceField[]; message: string };

const LABEL: Record<InvoiceField, string> = {
  date: 'Ngày', project: 'Công trình', type: 'Loại chi phí', supplier: 'Nhà cung cấp', buyer: 'Người mua', amount: 'Số tiền', lines: 'Dòng vật tư',
};

/** Kiểm tra form → dữ liệu để ghi. `source`: 'detail' khi có dòng vật tư, 'quick' khi không (sửa thì giữ nguồn cũ). */
export function checkInvoice(d: InvoiceDraft, lists: InvoiceLists, source: ExpenseInput['source']): InvoiceCheck {
  const bad: InvoiceField[] = [];
  const project = findByName(d.project, lists.projects);
  const type = findByName(d.type, lists.types);
  const supplier = d.supplier.trim() ? findByName(d.supplier, lists.suppliers) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) bad.push('date');
  if (!project) bad.push('project');
  if (!type) bad.push('type');
  if (supplier === undefined) bad.push('supplier');
  const used = d.lines?.filter((l) => !lineIsBlank(l)) ?? null;
  const amount = invoiceTotal(d);
  if (used && used.length === 0) bad.push('lines');
  else if (amount <= 0) bad.push(used ? 'lines' : 'amount');
  if (bad.length || !project || !type) {
    return { ok: false, bad, message: `Chưa đủ hoặc sai: ${bad.map((b) => LABEL[b]).join(', ')}. Mục có dấu * phải chọn đúng trong danh mục; số tiền phải lớn hơn 0.` };
  }
  return {
    ok: true,
    input: {
      date: d.date, projectId: project.id, typeId: type.id, supplierId: supplier?.id ?? null, ...buyerOf(d.buyer, lists.buyers), paid: d.paid,
      description: invoiceDescription(d), amount, invoiceNo: d.invoiceNo.trim() || null, source,
      ...(used ? {
        lines: used.map((l) => ({
          name: l.name.trim(), unit: l.unit.trim() || null, quantity: l.quantity.trim() ? parseQuantity(l.quantity) : 1,
          unitPrice: Math.round(l.unitPrice) || 0, discount: l.discount.trim() || null, amount: lineTotal(l),
        })),
      } : {}),
    },
  };
}
