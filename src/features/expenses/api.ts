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
import { PAY_KEY, syncSupplierAllocations } from '@/features/payments/api';
import { expenseInputSchema, type ExpenseInput } from './schema';
import { mergeBuyerNames, normVi } from './logic';

const sb = supabase as unknown as SupabaseClient;

const projectSchema = z.object({
  id: z.string(), name: z.string(), status: z.string(), is_company_overhead: z.boolean(), address: z.string().nullable(), kind: z.string().nullable(),
});
const catalogSchema = z.object({ id: z.string(), name: z.string(), kind: z.string(), archived: z.boolean() });
const supplierSchema = z.object({ id: z.string(), name: z.string(), address: z.string().nullable(), phone: z.string().nullable(), buys_on_credit: z.boolean(), archived: z.boolean() });
const expenseSchema = z.object({
  id: z.string(), project_id: z.string(), date: z.string(), expense_type_id: z.string(), supplier_id: z.string().nullable(), buyer_id: z.string().nullable(),
  paid_at_purchase: z.boolean(), description: z.string().nullable().transform((v) => v ?? ''), amount: z.coerce.number(),
  source: z.string(), created_by: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
  /** Ảnh hóa đơn trong kho `receipts` (Trợ lý AI lưu kèm) — có thì xem lại được ở bảng sửa */
  receipt_image_path: z.string().nullable(),
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
      const [projects, catalog, suppliers, workers, profiles] = await Promise.all([
        fetchLive('projects', projectSchema), fetchLive('catalog_items', catalogSchema), fetchLive('suppliers', supplierSchema),
        // Gợi ý Người mua lấy thêm tên công nhân + tài khoản; không đọc được (thiếu quyền) thì bỏ qua
        fetchLive('workers', z.object({ id: z.string(), name: z.string() })).catch(() => [] as { id: string; name: string }[]),
        Promise.resolve(sb.from('profiles').select('display_name')).then((r) => ((r.data ?? []) as { display_name: string | null }[]).map((p) => p.display_name ?? '')).catch(() => [] as string[]),
      ]);
      const live = catalog.filter((c) => !c.archived).sort(byName);
      const company = projects.filter((p) => p.is_company_overhead);
      const open = projects.filter((p) => !p.is_company_overhead && p.status !== 'closed').sort(byName);
      return {
        projects,
        projectOptions: [...company, ...open],
        types: live.filter((c) => c.kind === 'expense_type'),
        buyers: mergeBuyerNames(live.filter((c) => c.kind === 'person'), [...profiles, ...workers.map((w) => w.name)]),
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
      const rows = await fetchLive('expense_lines', z.object({ id: z.string(), name: z.string().nullable(), unit: z.string().nullable(), unit_price: z.coerce.number().nullable().optional(), created_at: z.string().nullable() }));
      return rows.map((r) => ({ name: r.name ?? '', unit: r.unit ?? '', unitPrice: Math.round(Number(r.unit_price) || 0), date: r.created_at ?? '' }));
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
    qc.invalidateQueries({ queryKey: PAY_KEY }),
    // Thùng rác + dòng vật tư của Tỉ trọng cập nhật ngay (không chờ hết hạn cache)
    qc.invalidateQueries({ queryKey: ['trash'] }), qc.invalidateQueries({ queryKey: ['cost-allocation-lines'] }),
  ]);
}

/**
 * Hóa đơn mua nợ đổi (thêm / sửa tiền / tích Đã TT / xóa) → tính lại cách chia tiền trả NCC (mục 4J).
 * Hóa đơn đã lưu xong rồi nên lỗi ở bước này không chặn người nhập; lần lưu phiếu chi / hóa đơn sau sẽ tự chia lại.
 */
async function resyncAllocations() {
  try { await syncSupplierAllocations(); } catch (e) { console.warn('Chưa chia lại được tiền trả NCC:', e); }
}

/**
 * Người mua → id danh mục (kind 'person'). Đã có id thì giữ; có tên thì tìm / thêm vào danh mục;
 * trống cả hai thì Người mua = tên hiển thị của tài khoản đang đăng nhập. Gom theo tên để mỗi tên chỉ thêm 1 lần.
 */
async function resolveBuyers(list: ExpenseInput[]): Promise<ExpenseInput[]> {
  if (list.every((e) => e.buyerId)) return list;
  let me = '';
  if (list.some((e) => !e.buyerId && !e.buyerName)) {
    const { data: u } = await sb.auth.getUser();
    if (u.user) {
      const { data: p } = await sb.from('profiles').select('display_name').eq('id', u.user.id).maybeSingle();
      me = (p as { display_name?: string } | null)?.display_name ?? '';
    }
  }
  const { data: persons, error } = await sb.from('catalog_items').select('id,name,archived').eq('kind', 'person').is('deleted_at', null);
  if (error) throw friendly(error);
  const byKey = new Map<string, string>();
  for (const p of (persons ?? []) as { id: string; name: string; archived: boolean }[]) byKey.set(normVi(p.name), p.id);
  const idFor = async (raw: string): Promise<string | null> => {
    const name = normalizeCatalogName('person', raw);
    if (!name) return null;
    const k = normVi(name);
    const hit = byKey.get(k);
    if (hit) return hit;
    const { data, error: ie } = await sb.from('catalog_items').insert({ kind: 'person', name }).select('id').single();
    if (ie) throw friendly(ie);
    byKey.set(k, (data as { id: string }).id);
    return (data as { id: string }).id;
  };
  const out: ExpenseInput[] = [];
  for (const e of list) out.push(e.buyerId ? e : { ...e, buyerId: await idFor(e.buyerName || me) });
  return out;
}

const toRow = (e: ExpenseInput) => ({
  project_id: e.projectId, date: e.date, expense_type_id: e.typeId, supplier_id: e.supplierId, buyer_id: e.buyerId,
  paid_at_purchase: e.paid, description: e.description, amount: e.amount, source: e.source,
  ...(e.receiptImagePath !== undefined ? { receipt_image_path: e.receiptImagePath } : {}),
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
      const list = await resolveBuyers(z.array(expenseInputSchema).parse(inputs));
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
      if (list.some((e) => e.supplierId && !e.paid)) await resyncAllocations();
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
      const [e] = await resolveBuyers([expenseInputSchema.parse(input)]) as [ExpenseInput];
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
      await resyncAllocations();
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
      await resyncAllocations();
    },
    onSuccess: done,
  });
}

/** Gắn / thay ảnh hóa đơn (đã tải lên kho `receipts`) cho hóa đơn cũ — nút "Lưu ảnh hóa đơn" ở bảng Sửa hóa đơn */
export function useSetExpenseImage() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (v: { id: string; path: string }) => {
      const { data, error } = await sb.from('expenses').update({ receipt_image_path: v.path }).eq('id', v.id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Không gắn được ảnh: hóa đơn do người khác nhập (cần quyền "Sửa / xóa dòng người khác nhập") hoặc đã bị xóa.');
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
