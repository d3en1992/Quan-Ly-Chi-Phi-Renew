// Đọc / ghi cho 2 tab Chi Trả TP/NCC và Công Nợ Phải Trả: phiếu chi, dòng chia tiền trả NCC, HĐ thầu phụ, tất toán,
// hóa đơn mua nợ (chưa tích Đã TT). Công thức ở src/lib/calc/payables.ts; file này chỉ đọc / ghi.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/fetch-pages';
import { fetchLive, REPORT_DATA_KEY } from '@/features/reports/api';
import { reallocateSupplierPayments, type AllocationRow, type ContractItem } from '@/lib/calc';

const sb = supabase as unknown as SupabaseClient;
const money = z.coerce.number();
const date = z.string().nullable();

const paymentSchema = z.object({
  id: z.string(), kind: z.string(), date: z.string(), amount: money, subcontractor_id: z.string().nullable(), subcontract_id: z.string().nullable(),
  supplier_id: z.string().nullable(), project_id: z.string().nullable(), allocation_mode: z.string(), closure_id: z.string().nullable(),
  note: z.string().nullable(), created_by: z.string().nullable(), created_at: z.string().nullable(),
});
const allocationSchema = z.object({ payment_id: z.string(), expense_id: z.string().nullable(), project_id: z.string(), amount: money });
const itemSchema = z.object({ name: z.string().catch(''), donVi: z.string().catch(''), sl: z.coerce.number().catch(0), donGia: z.coerce.number().catch(0) });
export const itemsSchema = z.array(itemSchema).catch([]);
const subcontractSchema = z.object({
  id: z.string(), project_id: z.string(), subcontractor_id: z.string(), date, value: money, legacy_variation: money,
  items: itemsSchema, description: z.string().nullable(), created_by: z.string().nullable(), created_at: z.string().nullable(),
});
const closureSchema = z.object({
  id: z.string(), party_kind: z.string(), subcontractor_id: z.string().nullable(), supplier_id: z.string().nullable(), project_id: z.string().nullable(),
  closed_on: z.string(), amount: money, closed_by_name: z.string().nullable(), note: z.string().nullable(), created_by: z.string().nullable(), created_at: z.string().nullable(),
});
const creditSchema = z.object({
  id: z.string(), project_id: z.string(), supplier_id: z.string().nullable(), date, amount: money, paid_at_purchase: z.boolean(),
  description: z.string().nullable(), created_at: z.string().nullable(),
});
const partySchema = z.object({ id: z.string(), name: z.string(), archived: z.boolean() });
const supplierSchema = partySchema.extend({ buys_on_credit: z.boolean() });
const projectSchema = z.object({ id: z.string(), name: z.string(), status: z.string(), is_company_overhead: z.boolean(), created_year: z.number().nullable() });
const profileSchema = z.object({ id: z.string(), display_name: z.string() });

export type Payment = z.infer<typeof paymentSchema>;
export type Allocation = z.infer<typeof allocationSchema>;
export type Subcontract = z.infer<typeof subcontractSchema>;
export type Closure = z.infer<typeof closureSchema>;
export type CreditExpense = z.infer<typeof creditSchema> & { supplier_id: string };
export type Party = z.infer<typeof partySchema>;
export type PayProject = z.infer<typeof projectSchema>;
export type PaymentKind = 'advance' | 'progress' | 'supplier_payment';

export const KIND_LABEL: Record<string, string> = { advance: 'Tạm ứng TP', progress: 'Thanh toán đợt TP', supplier_payment: 'Trả nợ NCC' };
export const MODE_LABEL: Record<string, string> = { fifo: 'Theo cục (cũ nhất trước)', project: 'Riêng một công trình', manual: 'Theo hóa đơn đã tích' };

export type PayData = {
  payments: Payment[];
  allocations: Allocation[];
  subcontracts: Subcontract[];
  closures: Closure[];
  /** Hóa đơn mua nợ (chưa tích Đã TT) có NCC */
  credits: CreditExpense[];
  suppliers: z.infer<typeof supplierSchema>[];
  subcontractors: Party[];
  projects: PayProject[];
  /** Công trình chọn được khi ghi phiếu mới: bỏ đã quyết toán, CÔNG TY cuối */
  projectOptions: PayProject[];
  projectName: (id: string | null | undefined) => string;
  supplierName: (id: string | null | undefined) => string;
  subcontractorName: (id: string | null | undefined) => string;
  partyName: (p: Pick<Payment, 'supplier_id' | 'subcontractor_id'>) => string;
  userName: (id: string | null | undefined) => string;
};

export const PAY_KEY = ['pay-data'] as const;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'vi');

/** Đọc hết dòng còn sống của 1 bảng có điều kiện lọc (trang 1000 dòng, tải cùng lúc) */
async function fetchWhere<S extends z.ZodObject<z.ZodRawShape>>(table: string, schema: S, apply: (q: any) => any): Promise<z.infer<S>[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const data = await fetchAllPages<unknown>((withCount) =>
    apply(sb.from(table).select(Object.keys(schema.shape).join(','), withCount ? { count: 'exact' } : undefined).is('deleted_at', null)).order('id'),
  ).catch((e: Error) => { throw new Error(`Không đọc được bảng ${table}: ${e.message}`); });
  return z.array(schema).parse(data);
}
const fetchCredits = async () =>
  (await fetchWhere('expenses', creditSchema, (q) => q.eq('paid_at_purchase', false).not('supplier_id', 'is', null))) as CreditExpense[];

export async function fetchPayData(): Promise<PayData> {
  const [payments, allocations, subcontracts, closures, credits, suppliers, subcontractors, projects, profiles] = await Promise.all([
    fetchLive('payments', paymentSchema), fetchLive('payment_allocations', allocationSchema), fetchLive('subcontracts', subcontractSchema),
    fetchLive('payable_closures', closureSchema).catch(() => [] as Closure[]),
    fetchCredits().catch(() => [] as CreditExpense[]),
    fetchLive('suppliers', supplierSchema), fetchLive('subcontractors', partySchema), fetchLive('projects', projectSchema).catch(() => [] as PayProject[]),
    fetchLive('profiles', profileSchema, false).catch(() => [] as z.infer<typeof profileSchema>[]),
  ]);
  const payIds = new Set(payments.map((p) => p.id));
  const pj = new Map(projects.map((p) => [p.id, p.name]));
  const sup = new Map(suppliers.map((s) => [s.id, s.name]));
  const sub = new Map(subcontractors.map((s) => [s.id, s.name]));
  const users = new Map(profiles.map((p) => [p.id, p.display_name]));
  const open = projects.filter((p) => !p.is_company_overhead && p.status !== 'closed').sort(byName);
  const supplierName = (id: string | null | undefined) => (id ? sup.get(id) ?? '?' : '—');
  const subcontractorName = (id: string | null | undefined) => (id ? sub.get(id) ?? '?' : '—');
  return {
    payments, subcontracts, closures, credits,
    allocations: allocations.filter((a) => payIds.has(a.payment_id)),
    suppliers: suppliers.sort(byName), subcontractors: subcontractors.sort(byName), projects: projects.sort(byName),
    projectOptions: [...open, ...projects.filter((p) => p.is_company_overhead)],
    projectName: (id) => (id ? pj.get(id) ?? '—' : '—'),
    supplierName, subcontractorName,
    partyName: (p) => (p.supplier_id ? supplierName(p.supplier_id) : subcontractorName(p.subcontractor_id)),
    userName: (id) => (id ? users.get(id) ?? '' : ''),
  };
}

export function usePayData() {
  return useQuery({ queryKey: PAY_KEY, queryFn: fetchPayData, staleTime: 30_000 });
}

function friendly(e: { message: string; code?: string }): Error {
  if (e.code === '42501') return new Error(/quyền|người khác/.test(e.message) ? e.message : 'Bạn không có quyền thực hiện thao tác này.');
  if (e.code === '23505') return new Error(e.message.includes('tất toán') ? e.message : 'Tên này đã có sẵn.');
  if (e.code === '23503') return new Error('Công trình / đối tác vừa chọn không còn tồn tại. Tải lại trang rồi thử lại.');
  return new Error(e.message);
}

function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: PAY_KEY }), qc.invalidateQueries({ queryKey: REPORT_DATA_KEY }),
    qc.invalidateQueries({ queryKey: ['trash'] })]);
}

const allocKey = (a: AllocationRow) => `${a.payment_id}|${a.expense_id ?? ''}|${a.project_id}|${a.amount}`;

/**
 * TÍNH LẠI cách chia tiền trả NCC (mục 4J) rồi ghi những NCC có thay đổi. Gọi sau mỗi lần lưu / sửa / xóa phiếu Trả nợ NCC
 * và sau mỗi lần lưu / sửa / xóa hóa đơn (hóa đơn mua nợ đổi thì phần đã chia đổi theo).
 * `picks`: phiếu "tích từng hóa đơn" vừa lưu → các hóa đơn đã tích. `clear`: phiếu vừa xóa → gỡ dòng chia của nó.
 */
export async function syncSupplierAllocations(opts: { picks?: Map<string, string[]>; clear?: string[] } = {}): Promise<void> {
  const pays = (await fetchWhere('payments', paymentSchema, (q) => q.eq('kind', 'supplier_payment')))
    .filter((p): p is Payment & { supplier_id: string } => !!p.supplier_id);
  const clear = opts.clear ?? [];
  if (!pays.length && !clear.length) return;
  const [credits, allAllocs] = await Promise.all([pays.length ? fetchCredits() : Promise.resolve([]), fetchLive('payment_allocations', allocationSchema)]);
  const payById = new Map(pays.map((p) => [p.id, p]));
  const current = allAllocs.filter((a) => payById.has(a.payment_id));
  // Hóa đơn đã tích của phiếu manual = các hóa đơn đang có dòng chia của phiếu đó (trừ phiếu vừa lưu → lấy theo `picks`)
  const picks = new Map<string, string[]>();
  for (const a of current) {
    if (!a.expense_id || payById.get(a.payment_id)?.allocation_mode !== 'manual') continue;
    picks.set(a.payment_id, [...(picks.get(a.payment_id) ?? []), a.expense_id]);
  }
  for (const [k, v] of opts.picks ?? []) picks.set(k, v);
  const fresh = reallocateSupplierPayments(credits, pays, picks);

  const group = (rows: AllocationRow[]) => {
    const m = new Map<string, AllocationRow[]>();
    for (const r of rows) { const s = payById.get(r.payment_id)!.supplier_id; m.set(s, [...(m.get(s) ?? []), r]); }
    return m;
  };
  const oldBy = group(current), newBy = group(fresh);
  const changed = new Set<string>();
  for (const s of new Set([...oldBy.keys(), ...newBy.keys()])) {
    const a = (oldBy.get(s) ?? []).map(allocKey).sort().join('\n'), b = (newBy.get(s) ?? []).map(allocKey).sort().join('\n');
    if (a !== b) changed.add(s);
  }
  const ids = [...pays.filter((p) => changed.has(p.supplier_id)).map((p) => p.id), ...clear.filter((id) => !payById.has(id))];
  if (!ids.length) return;
  const rows = fresh.filter((r) => changed.has(payById.get(r.payment_id)!.supplier_id));
  const { error } = await sb.rpc('replace_payment_allocations', { p_payment_ids: ids, p_allocs: rows });
  if (error) throw friendly(error);
}

export type PaymentInput = {
  id?: string;
  kind: PaymentKind;
  date: string;
  amount: number;
  subcontractorId: string | null;
  subcontractId: string | null;
  supplierId: string | null;
  projectId: string | null;
  /** Chỉ dùng cho Trả nợ NCC */
  mode: 'fifo' | 'project' | 'manual';
  /** Hóa đơn đã tích (mode = manual) */
  picks: string[];
  note: string;
};
export const paymentInputSchema = z.object({
  kind: z.enum(['advance', 'progress', 'supplier_payment']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Chọn ngày'),
  amount: z.number().int().positive('Nhập số tiền > 0'),
  subcontractorId: z.string().uuid().nullable(), subcontractId: z.string().uuid().nullable(), supplierId: z.string().uuid().nullable(), projectId: z.string().uuid().nullable(),
  mode: z.enum(['fifo', 'project', 'manual']), picks: z.array(z.string()), note: z.string(),
}).superRefine((v, ctx) => {
  if (v.kind === 'supplier_payment') {
    if (!v.supplierId) ctx.addIssue({ code: 'custom', message: 'Chọn nhà cung cấp' });
    if (v.mode === 'project' && !v.projectId) ctx.addIssue({ code: 'custom', message: 'Chọn công trình muốn trả riêng' });
    if (v.mode === 'manual' && !v.picks.length) ctx.addIssue({ code: 'custom', message: 'Tích ít nhất một hóa đơn' });
  } else {
    if (!v.subcontractorId) ctx.addIssue({ code: 'custom', message: 'Chọn thầu phụ' });
    if (!v.projectId) ctx.addIssue({ code: 'custom', message: 'Chọn công trình' });
  }
});

function toRow(v: PaymentInput) {
  const ncc = v.kind === 'supplier_payment';
  return {
    kind: v.kind, date: v.date, amount: v.amount, note: v.note.trim() || null,
    subcontractor_id: ncc ? null : v.subcontractorId, subcontract_id: ncc ? null : v.subcontractId,
    supplier_id: ncc ? v.supplierId : null,
    project_id: ncc ? (v.mode === 'project' ? v.projectId : null) : v.projectId,
    allocation_mode: ncc ? v.mode : 'fifo',
  };
}
const firstIssue = (e: z.ZodError) => new Error(e.issues[0]?.message ?? 'Dữ liệu chưa hợp lệ');

/** Ghi nhiều phiếu chi MỚI một lần; phiếu Trả nợ NCC thì tính lại cách chia ngay sau khi ghi */
export function useCreatePayments() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (inputs: PaymentInput[]) => {
      const list = inputs.map((i) => { const r = paymentInputSchema.safeParse(i); if (!r.success) throw firstIssue(r.error); return i; });
      const rows = list.map((v) => ({ id: crypto.randomUUID(), ...toRow(v) }));
      const { error } = await sb.from('payments').insert(rows);
      if (error) throw friendly(error);
      if (list.some((v) => v.kind === 'supplier_payment')) {
        const picks = new Map(list.flatMap((v, i) => (v.kind === 'supplier_payment' && v.mode === 'manual' ? [[rows[i]!.id, v.picks] as [string, string[]]] : [])));
        await syncSupplierAllocations({ picks });
      }
      return rows.map((r) => r.id);
    },
    onSettled: done,
  });
}

export function useUpdatePayment() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (v: PaymentInput & { id: string }) => {
      const r = paymentInputSchema.safeParse(v);
      if (!r.success) throw firstIssue(r.error);
      const { data, error } = await sb.from('payments').update(toRow(v)).eq('id', v.id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Không sửa được: phiếu do người khác ghi (cần quyền "Sửa / xóa dòng người khác nhập") hoặc đã bị xóa.');
      if (v.kind === 'supplier_payment') await syncSupplierAllocations({ picks: v.mode === 'manual' ? new Map([[v.id, v.picks]]) : undefined });
    },
    onSettled: done,
  });
}

/** Xóa mềm phiếu chi → Thùng Rác; phiếu Trả nợ NCC thì gỡ dòng chia và chia lại các phiếu còn lại */
export function useDeletePayment() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (p: Pick<Payment, 'id' | 'kind'>) => {
      const { data, error } = await sb.from('payments').update({ deleted_at: new Date().toISOString() }).eq('id', p.id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Không xóa được: phiếu do người khác ghi (cần quyền "Sửa / xóa dòng người khác nhập").');
      if (p.kind === 'supplier_payment') await syncSupplierAllocations({ clear: [p.id] });
    },
    onSettled: done,
  });
}

/** Thêm nhanh thầu phụ / NCC mới ngay lúc ghi phiếu (tên viết HOA như app cũ) */
export function useCreateParty() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async ({ table, name: raw }: { table: 'subcontractors' | 'suppliers'; name: string }): Promise<string> => {
      const name = raw.trim().replace(/\s+/g, ' ').toUpperCase();
      if (!name) throw new Error('Vui lòng nhập tên.');
      const { error } = await sb.from(table).insert(table === 'suppliers' ? { name, buys_on_credit: true } : { name });
      if (error) throw friendly(error);
      return name;
    },
    onSuccess: done,
  });
}

export type SubcontractInput = {
  id: string | null; date: string; subcontractorId: string; projectId: string; value: number; variation: number; description: string; items: ContractItem[];
};
export const subcontractInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Chọn ngày'), subcontractorId: z.string().uuid('Chọn thầu phụ'), projectId: z.string().uuid('Chọn công trình'),
  value: z.number().int().min(0), variation: z.number().int(), description: z.string(),
}).refine((v) => v.value > 0 || v.variation !== 0, 'Nhập giá trị hợp đồng');

export function useSaveSubcontract() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (v: SubcontractInput) => {
      const r = subcontractInputSchema.safeParse(v);
      if (!r.success) throw firstIssue(r.error);
      const row = {
        date: v.date, subcontractor_id: v.subcontractorId, project_id: v.projectId, value: v.value, legacy_variation: v.variation,
        description: v.description.trim() || null, items: v.items.filter((i) => i.name.trim() || i.sl || i.donGia),
      };
      if (v.id) {
        const { data, error } = await sb.from('subcontracts').update(row).eq('id', v.id).select('id');
        if (error) throw friendly(error);
        if (!data?.length) throw new Error('Không sửa được: hợp đồng do người khác nhập hoặc đã bị xóa.');
      } else {
        const { error } = await sb.from('subcontracts').insert(row);
        if (error) throw friendly(error);
      }
    },
    onSuccess: done,
  });
}

export function useDeleteSubcontract() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.from('subcontracts').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Không xóa được: hợp đồng do người khác nhập (cần quyền "Sửa / xóa dòng người khác nhập").');
    },
    onSuccess: done,
  });
}

export function useClosePayable() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (v: { subcontractorId: string; projectId: string; date: string; amount: number; by: string }) => {
      const { data, error } = await sb.rpc('close_payable', {
        p_subcontractor_id: v.subcontractorId, p_project_id: v.projectId, p_date: v.date, p_amount: v.amount, p_by: v.by, p_note: null,
      });
      if (error) throw friendly(error);
      return data as string;
    },
    onSuccess: done,
  });
}

export function useUndoClosure() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc('undo_payable_closure', { p_closure_id: id });
      if (error) throw friendly(error);
    },
    onSuccess: done,
  });
}
