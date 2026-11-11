// Đọc / ghi cho tab Nhập Chi Phí: danh sách để gợi ý (công trình, loại chi phí, người mua, NCC, ĐVT),
// hóa đơn đã nhập (để hiện "trong ngày", cảnh báo trùng, gợi ý nội dung), lưu / sửa / xóa mềm hóa đơn.
// Mỗi lần lưu chỉ ghi đúng các dòng của hóa đơn đó (KẾ HOẠCH mục 4E). RLS trong kho kiểm tra quyền lần nữa.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { CATALOG_KEY, normalizeCatalogName } from '@/features/catalog/api';
import { CONTACTS_KEY } from '@/features/contacts/api';
import { fetchLive, REPORT_DATA_KEY } from '@/features/reports/api';
import { expenseInputSchema, type ExpenseInput } from './schema';

const sb = supabase as unknown as SupabaseClient;

const projectSchema = z.object({
  id: z.string(), name: z.string(), status: z.string(), is_company_overhead: z.boolean(), address: z.string().nullable(), kind: z.string().nullable(),
});
const catalogSchema = z.object({ id: z.string(), name: z.string(), kind: z.string(), archived: z.boolean() });
const supplierSchema = z.object({ id: z.string(), name: z.string(), address: z.string().nullable(), buys_on_credit: z.boolean(), archived: z.boolean() });
const expenseSchema = z.object({
  id: z.string(), project_id: z.string(), date: z.string(), expense_type_id: z.string(), supplier_id: z.string().nullable(), buyer_id: z.string().nullable(),
  paid_at_purchase: z.boolean(), description: z.string().nullable().transform((v) => v ?? ''), amount: z.coerce.number(), invoice_no: z.string().nullable(),
  source: z.string(), created_by: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});
const lineSchema = z.object({
  id: z.string(), position: z.number(), name: z.string().nullable().transform((v) => v ?? ''), unit: z.string().nullable(),
  quantity: z.coerce.number(), unit_price: z.coerce.number(), discount: z.string().nullable(), amount: z.coerce.number(),
});

export type EntryProject = z.infer<typeof projectSchema>;
export type EntrySupplier = z.infer<typeof supplierSchema>;
export type EntryExpense = z.infer<typeof expenseSchema>;
export type EntryLine = z.infer<typeof lineSchema>;
export type Named = { id: string; name: string };

export type Lookups = {
  /** Mọi công trình còn sống (để hiện tên hóa đơn cũ) */
  projects: EntryProject[];
  /** Công trình được chọn khi nhập: CÔNG TY đứng đầu, bỏ công trình đã quyết toán (như app cũ) */
  projectOptions: EntryProject[];
  types: Named[];
  buyers: Named[];
  suppliers: EntrySupplier[];
  units: Named[];
  /** Tên theo id, gồm cả mục đã lưu trữ (để hiện hóa đơn cũ) */
  nameOf: Map<string, string>;
};

export const LOOKUPS_KEY = ['expense-lookups'] as const;
export const ENTRY_EXPENSES_KEY = ['expense-entries'] as const;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'vi');

export function useLookups() {
  return useQuery({
    queryKey: LOOKUPS_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<Lookups> => {
      const [projects, catalog, suppliers] = await Promise.all([
        fetchLive('projects', projectSchema), fetchLive('catalog_items', catalogSchema), fetchLive('suppliers', supplierSchema),
      ]);
      const live = catalog.filter((c) => !c.archived).sort(byName);
      const company = projects.filter((p) => p.is_company_overhead);
      const open = projects.filter((p) => !p.is_company_overhead && p.status !== 'closed').sort(byName);
      return {
        projects,
        projectOptions: [...company, ...open],
        types: live.filter((c) => c.kind === 'expense_type'),
        buyers: live.filter((c) => c.kind === 'person'),
        units: live.filter((c) => c.kind === 'unit'),
        suppliers: suppliers.filter((s) => !s.archived).sort(byName),
        nameOf: new Map([...projects, ...catalog, ...suppliers].map((r) => [r.id, r.name])),
      };
    },
  });
}

/** Mọi hóa đơn nhập tay còn sống (vài nghìn dòng): dùng cho "trong ngày", cảnh báo trùng, gợi ý nội dung */
export function useEntryExpenses() {
  return useQuery({ queryKey: ENTRY_EXPENSES_KEY, staleTime: 30_000, queryFn: () => fetchLive('expenses', expenseSchema) });
}

export async function fetchExpenseLines(expenseId: string): Promise<EntryLine[]> {
  const { data, error } = await sb.from('expense_lines').select(Object.keys(lineSchema.shape).join(',')).eq('expense_id', expenseId).is('deleted_at', null).order('position');
  if (error) throw new Error(`Không đọc được dòng vật tư: ${error.message}`);
  return z.array(lineSchema).parse(data ?? []);
}

/** Tên vật tư + ĐVT đã từng nhập (gợi ý ở Hóa đơn chi tiết) */
export function useLineHistory(enabled: boolean) {
  return useQuery({
    queryKey: ['expense-line-history'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows = await fetchLive('expense_lines', z.object({ id: z.string(), name: z.string().nullable(), unit: z.string().nullable(), created_at: z.string().nullable() }));
      return rows.map((r) => ({ name: r.name ?? '', unit: r.unit ?? '', date: r.created_at ?? '' }));
    },
  });
}

function friendly(e: { message: string; code?: string }): Error {
  if (e.code === '42501') return new Error('Bạn không có quyền thực hiện thao tác này.');
  if (e.code === '23505') return new Error('Tên này đã có sẵn.');
  if (e.code === '23503') return new Error('Công trình / danh mục vừa chọn không còn tồn tại. Tải lại trang rồi thử lại.');
  return new Error(e.message);
}

function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ENTRY_EXPENSES_KEY }), qc.invalidateQueries({ queryKey: REPORT_DATA_KEY }),
    qc.invalidateQueries({ queryKey: ['expense-lines'] }), qc.invalidateQueries({ queryKey: ['expense-line-history'] }),
  ]);
}

const toRow = (e: ExpenseInput) => ({
  project_id: e.projectId, date: e.date, expense_type_id: e.typeId, supplier_id: e.supplierId, buyer_id: e.buyerId,
  paid_at_purchase: e.paid, description: e.description, amount: e.amount, invoice_no: e.invoiceNo || null, source: e.source,
});
const toLines = (expenseId: string, e: ExpenseInput) =>
  (e.lines ?? []).map((l, i) => ({
    expense_id: expenseId, position: i, name: l.name, unit: l.unit || null, quantity: l.quantity, unit_price: l.unitPrice, discount: l.discount || null, amount: l.amount,
  }));

/** Lưu nhiều hóa đơn MỚI một lần (lưới nhập nhanh, hóa đơn chi tiết, nhập tay trên điện thoại) */
export function useCreateExpenses() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (inputs: ExpenseInput[]) => {
      const list = z.array(expenseInputSchema).parse(inputs);
      // Tự đặt id để ghi dòng vật tư ngay sau đó; hỏng giữa chừng thì gỡ hóa đơn vừa ghi
      const rows = list.map((e) => ({ id: crypto.randomUUID(), ...toRow(e) }));
      const { error } = await sb.from('expenses').insert(rows);
      if (error) throw friendly(error);
      const lines = list.flatMap((e, i) => toLines(rows[i]!.id, e));
      if (lines.length) {
        const { error: le } = await sb.from('expense_lines').insert(lines);
        if (le) {
          await sb.from('expenses').update({ deleted_at: new Date().toISOString() }).in('id', rows.map((r) => r.id));
          throw friendly(le);
        }
      }
      return rows.map((r) => r.id);
    },
    onSuccess: done,
  });
}

/**
 * Sửa một hóa đơn. `knownUpdatedAt` = mốc lúc mở form: nếu trong lúc đó người khác đã sửa thì vẫn lưu (người lưu sau thắng)
 * nhưng trả về `overwritten = true` để báo "dòng này vừa được người khác sửa".
 */
export function useUpdateExpense() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async ({ id, input, knownUpdatedAt }: { id: string; input: ExpenseInput; knownUpdatedAt?: string }) => {
      const e = expenseInputSchema.parse(input);
      let overwritten = false;
      if (knownUpdatedAt) {
        const { data } = await sb.from('expenses').select('updated_at').eq('id', id).maybeSingle();
        overwritten = !!data && (data as { updated_at: string }).updated_at !== knownUpdatedAt;
      }
      const { data, error } = await sb.from('expenses').update(toRow(e)).eq('id', id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Không sửa được: hóa đơn do người khác nhập (cần quyền "Sửa / xóa dòng người khác nhập") hoặc đã bị xóa.');
      if (e.lines) {
        // Dòng cũ xóa mềm (kho chỉ cho xóa hẳn từ Thùng rác), rồi ghi bộ dòng mới
        const { error: de } = await sb.from('expense_lines').update({ deleted_at: new Date().toISOString() }).eq('expense_id', id).is('deleted_at', null);
        if (de) throw friendly(de);
        const lines = toLines(id, e);
        if (lines.length) { const { error: le } = await sb.from('expense_lines').insert(lines); if (le) throw friendly(le); }
      }
      return { overwritten };
    },
    onSuccess: done,
  });
}

/** Xóa mềm → vào Thùng Rác */
export function useDeleteExpense() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Không xóa được: hóa đơn do người khác nhập (cần quyền "Sửa / xóa dòng người khác nhập").');
    },
    onSuccess: done,
  });
}

export type CreatableKind = 'expense_type' | 'person' | 'supplier';

/** "+ Tạo mới" ngay trong ô gợi ý: thêm loại chi phí / người mua / nhà cung cấp, trả về mục vừa tạo */
export function useCreateLookup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, rawName }: { kind: CreatableKind; rawName: string }): Promise<Named> => {
      const name = kind === 'supplier' ? rawName.trim().replace(/\s+/g, ' ').toUpperCase() : normalizeCatalogName(kind, rawName);
      if (!name) throw new Error('Vui lòng nhập tên.');
      const q = kind === 'supplier' ? sb.from('suppliers').insert({ name }) : sb.from('catalog_items').insert({ kind, name });
      const { data, error } = await q.select('id,name').single();
      if (error) throw friendly(error);
      return data as Named;
    },
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: LOOKUPS_KEY }), qc.invalidateQueries({ queryKey: CATALOG_KEY }),
      qc.invalidateQueries({ queryKey: CONTACTS_KEY }), qc.invalidateQueries({ queryKey: REPORT_DATA_KEY }),
    ]),
  });
}
