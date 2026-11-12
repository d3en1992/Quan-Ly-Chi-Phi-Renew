// Đọc / ghi cho tab Doanh Thu (HĐ chính, thu tiền) và Quyết Toán. Công thức ở src/lib/calc/revenue.ts.
// Lưu / xóa quyết toán đi qua hàm `save_settlement` / `delete_settlement` (1 giao dịch: quyết toán + phiếu thu tự động + đóng công trình).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { fetchLive } from '@/features/reports/api';
import { itemsSchema } from '@/features/payments/api';
import type { ContractItem } from '@/lib/calc';

const sb = supabase as unknown as SupabaseClient;
const money = z.coerce.number();

const contractSchema = z.object({
  id: z.string(), project_id: z.string(), date: z.string().nullable(), value: money, extra_value: money, legacy_variation: money, items: itemsSchema,
  customer_name: z.string().nullable(), description: z.string().nullable(), created_by: z.string().nullable(), created_at: z.string().nullable(),
});
const receiptSchema = z.object({
  id: z.string(), project_id: z.string(), date: z.string(), amount: money, kind: z.string(), is_auto: z.boolean(), settlement_id: z.string().nullable(),
  note: z.string().nullable(), created_by: z.string().nullable(), created_at: z.string().nullable(),
});
const settlementSchema = z.object({
  id: z.string(), project_id: z.string(), date: z.string(), kind: z.string(), amount: money, is_final: z.boolean(), note: z.string().nullable(),
  created_by: z.string().nullable(), created_at: z.string().nullable(),
});
const projectSchema = z.object({
  id: z.string(), name: z.string(), status: z.string(), is_company_overhead: z.boolean(), customer_id: z.string().nullable(), owner_name: z.string().nullable(),
});
const namedSchema = z.object({ id: z.string(), name: z.string() });
const profileSchema = z.object({ id: z.string(), display_name: z.string() });

export type MainContract = z.infer<typeof contractSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type Settlement = z.infer<typeof settlementSchema>;
export type RevProject = z.infer<typeof projectSchema>;
export type ReceiptKind = 'advance' | 'stage' | 'settlement' | 'other';
export type SettlementKind = 'increase' | 'decrease' | 'replace';

export const RECEIPT_KIND: Record<string, { label: string; tone: 'accent' | 'good' | 'warn' | 'neutral' }> = {
  advance: { label: 'Tạm ứng', tone: 'accent' }, stage: { label: 'Giai đoạn', tone: 'good' }, settlement: { label: 'Quyết toán', tone: 'warn' }, other: { label: 'Khác', tone: 'neutral' },
};
export const SETTLEMENT_KIND: Record<string, { label: string; tone: 'good' | 'bad' | 'accent' }> = {
  increase: { label: 'Tăng', tone: 'good' }, decrease: { label: 'Giảm', tone: 'bad' }, replace: { label: 'Thay thế', tone: 'accent' },
};

export type RevData = {
  contracts: MainContract[];
  receipts: Receipt[];
  settlements: Settlement[];
  projects: RevProject[];
  /** Công trình thật (không gồm CÔNG TY), xếp theo tên */
  projectOptions: RevProject[];
  projectName: (id: string | null | undefined) => string;
  /** Chủ đầu tư của công trình: khách hàng đã gắn, hoặc tên ghi tay */
  ownerOf: (projectId: string) => string;
  userName: (id: string | null | undefined) => string;
  contractOf: (projectId: string) => MainContract | undefined;
};

export const REV_KEY = ['revenue-data'] as const;

export async function fetchRevData(): Promise<RevData> {
  const [contracts, receipts, settlements, projects, customers, profiles] = await Promise.all([
    fetchLive('main_contracts', contractSchema), fetchLive('receipts', receiptSchema), fetchLive('settlements', settlementSchema),
    fetchLive('projects', projectSchema),
    fetchLive('customers', namedSchema).catch(() => [] as z.infer<typeof namedSchema>[]),
    fetchLive('profiles', profileSchema, false).catch(() => [] as z.infer<typeof profileSchema>[]),
  ]);
  const pj = new Map(projects.map((p) => [p.id, p]));
  const cus = new Map(customers.map((c) => [c.id, c.name]));
  const users = new Map(profiles.map((p) => [p.id, p.display_name]));
  const byProject = new Map(contracts.map((c) => [c.project_id, c]));
  return {
    contracts, receipts, settlements, projects,
    projectOptions: projects.filter((p) => !p.is_company_overhead).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    projectName: (id) => (id ? pj.get(id)?.name ?? '—' : '—'),
    ownerOf: (id) => { const p = pj.get(id); return (p?.customer_id && cus.get(p.customer_id)) || p?.owner_name || byProject.get(id)?.customer_name || ''; },
    userName: (id) => (id ? users.get(id) ?? '' : ''),
    contractOf: (id) => byProject.get(id),
  };
}

export function useRevData() {
  return useQuery({ queryKey: REV_KEY, queryFn: fetchRevData, staleTime: 30_000 });
}

function friendly(e: { message: string; code?: string }): Error {
  if (e.code === '42501') return new Error(/quyền|người khác|đã xóa/.test(e.message) ? e.message : 'Bạn không có quyền thực hiện thao tác này.');
  if (e.code === '23505') return new Error('Công trình này đã có hợp đồng chính — mở hợp đồng đó để sửa.');
  if (e.code === '23503') return new Error('Công trình vừa chọn không còn tồn tại. Tải lại trang rồi thử lại.');
  return new Error(e.message);
}
/** Thu / hợp đồng / quyết toán đổi → Lợi Nhuận, Dashboard, Công Trình đều phải tính lại */
function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Chọn ngày');
const firstIssue = (e: z.ZodError) => new Error(e.issues[0]?.message ?? 'Dữ liệu chưa hợp lệ');
const softDelete = async (table: string, id: string, what: string) => {
  const { data, error } = await sb.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id');
  if (error) throw friendly(error);
  if (!data?.length) throw new Error(`Không xóa được: ${what} do người khác nhập (cần quyền "Sửa / xóa dòng người khác nhập").`);
};

export type ContractInput = {
  id: string | null; projectId: string; date: string; value: number; extra: number; variation: number; description: string; customerName: string; items: ContractItem[];
};
const contractInputSchema = z.object({
  projectId: z.string().uuid('Chọn công trình'), date: isoDate, value: z.number().int().min(0), extra: z.number().int().min(0), variation: z.number().int(),
}).refine((v) => v.value > 0 || v.extra > 0 || v.variation !== 0, 'Nhập giá trị hợp đồng');

export function useSaveContract() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (v: ContractInput) => {
      const r = contractInputSchema.safeParse(v);
      if (!r.success) throw firstIssue(r.error);
      const row = {
        project_id: v.projectId, date: v.date, value: v.value, extra_value: v.extra, legacy_variation: v.variation, description: v.description.trim() || null,
        customer_name: v.customerName.trim() || null, items: v.items.filter((i) => i.name.trim() || i.sl || i.donGia),
      };
      if (v.id) {
        const { data, error } = await sb.from('main_contracts').update(row).eq('id', v.id).select('id');
        if (error) throw friendly(error);
        if (!data?.length) throw new Error('Không sửa được: hợp đồng do người khác nhập hoặc đã bị xóa.');
      } else {
        const { error } = await sb.from('main_contracts').insert(row);
        if (error) throw friendly(error);
      }
    },
    onSuccess: done,
  });
}
export function useDeleteContract() {
  const done = useRefresh();
  return useMutation({ mutationFn: (id: string) => softDelete('main_contracts', id, 'hợp đồng'), onSuccess: done });
}

export type ReceiptInput = { id: string | null; projectId: string; date: string; amount: number; kind: ReceiptKind; note: string };
const receiptInputSchema = z.object({
  projectId: z.string().uuid('Chọn công trình'), date: isoDate, amount: z.number().int().positive('Nhập số tiền > 0'), kind: z.enum(['advance', 'stage', 'settlement', 'other']),
});

export function useSaveReceipt() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (v: ReceiptInput): Promise<string> => {
      const r = receiptInputSchema.safeParse(v);
      if (!r.success) throw firstIssue(r.error);
      const row = { project_id: v.projectId, date: v.date, amount: v.amount, kind: v.kind, note: v.note.trim() || null };
      if (v.id) {
        // Phiếu tự động từ quyết toán không sửa tay được (điều kiện is_auto = false)
        const { data, error } = await sb.from('receipts').update(row).eq('id', v.id).eq('is_auto', false).select('id');
        if (error) throw friendly(error);
        if (!data?.length) throw new Error('Không sửa được: phiếu tự động từ quyết toán, hoặc phiếu do người khác nhập.');
        return v.id;
      }
      const id = crypto.randomUUID();
      const { error } = await sb.from('receipts').insert({ id, ...row });
      if (error) throw friendly(error);
      return id;
    },
    onSuccess: done,
  });
}
export function useDeleteReceipt() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (r: Pick<Receipt, 'id' | 'is_auto'>) => {
      if (r.is_auto) throw new Error('Phiếu thu tự động từ quyết toán: sửa / xóa ở tab Quyết Toán.');
      await softDelete('receipts', r.id, 'phiếu thu');
    },
    onSuccess: done,
  });
}

export type SettlementInput = {
  id: string | null; projectId: string; date: string; kind: SettlementKind; amount: number; note: string; isFinal: boolean;
  /** keep = không đụng phiếu thu tự động · remove = gỡ · set = tạo / cập nhật đúng `receiptAmount` */
  receiptMode: 'keep' | 'remove' | 'set'; receiptAmount: number;
};

export function useSaveSettlement() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (v: SettlementInput) => {
      const { data, error } = await sb.rpc('save_settlement', {
        p_id: v.id, p_project_id: v.projectId, p_date: v.date, p_kind: v.kind, p_amount: v.amount, p_note: v.note, p_is_final: v.isFinal,
        p_receipt_mode: v.receiptMode, p_receipt_amount: v.receiptAmount,
      });
      if (error) throw friendly(error);
      return data as string;
    },
    onSuccess: done,
  });
}
export function useDeleteSettlement() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc('delete_settlement', { p_id: id });
      if (error) throw friendly(error);
    },
    onSuccess: done,
  });
}
