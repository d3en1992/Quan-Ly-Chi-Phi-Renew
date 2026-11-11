// Đọc / ghi Công Trình. Số tiền KHÔNG tính ở đây — lấy từ `useReportData()` + src/lib/calc.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { REPORT_DATA_KEY } from '@/features/reports/api';
import { normalizeName, type FloorArea, type ProjectKind } from './logic';

const projectFullSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string().nullable(),
  status: z.string(),
  is_company_overhead: z.boolean(),
  customer_id: z.string().nullable(),
  owner_name: z.string().nullable(),
  address: z.string().nullable(),
  scope_note: z.string().nullable(),
  cost_weight_k: z.coerce.number().nullable(),
  floor_areas: z.array(z.object({ ten: z.string().optional(), dvt: z.string().optional(), kl: z.coerce.number().nullable().optional(), heSo: z.coerce.number().optional(), tinh: z.boolean().optional() }).passthrough()).catch([]),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  completed_date: z.string().nullable(),
  closed_date: z.string().nullable(),
  created_year: z.number().nullable(),
  aliases: z.array(z.string()).nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
});
export type ProjectFull = z.infer<typeof projectFullSchema>;

const customerSchema = z.object({ id: z.string(), name: z.string(), full_name: z.string().nullable(), address: z.string().nullable() });
export type CustomerLite = z.infer<typeof customerSchema>;

export const PROJECTS_KEY = ['projects-full'] as const;
export const CUSTOMERS_KEY = ['customers-lite'] as const;

const cols = (s: z.ZodObject<z.ZodRawShape>) => Object.keys(s.shape).join(',');

export function useProjectsFull() {
  return useQuery({
    queryKey: PROJECTS_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<ProjectFull[]> => {
      const { data, error } = await supabase.from('projects').select(cols(projectFullSchema)).is('deleted_at', null).order('name');
      if (error) throw new Error(`Không đọc được công trình: ${error.message}`);
      return z.array(projectFullSchema).parse(data ?? []);
    },
  });
}

export function useCustomersLite() {
  return useQuery({
    queryKey: CUSTOMERS_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<CustomerLite[]> => {
      const { data, error } = await supabase.from('customers').select(cols(customerSchema)).is('deleted_at', null).order('name');
      if (error) throw new Error(`Không đọc được khách hàng: ${error.message}`);
      return z.array(customerSchema).parse(data ?? []);
    },
  });
}

/** Lỗi trùng tên (chỉ mục duy nhất) → câu tiếng Việt */
function friendly(error: { message: string; code?: string }): Error {
  if (error.code === '23505') return new Error('Đã có công trình trùng tên này. Đổi tên khác.');
  if (error.code === '42501') return new Error('Bạn không có quyền thực hiện thao tác này.');
  return new Error(error.message);
}

export type ProjectInput = {
  name: string;
  kind: ProjectKind;
  status: string;
  customer_id: string;
  scope_note: string | null;
  address: string | null;
  cost_weight_k: number;
  floor_areas: FloorArea[];
  start_date: string | null;
  end_date: string | null;
  completed_date: string | null;
  closed_date: string | null;
  start_date_user_edited?: boolean;
  note?: string | null;
};

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
    qc.invalidateQueries({ queryKey: REPORT_DATA_KEY }),
  ]);
}

export function useCreateProject() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async (input: ProjectInput) => {
      const year = Number((input.start_date ?? new Date().toISOString()).slice(0, 4));
      const { data, error } = await supabase.from('projects')
        .insert({ ...input, start_date_user_edited: !!input.start_date, created_year: year, aliases: [] })
        .select('id').single();
      if (error) throw friendly(error);
      return data.id;
    },
    onSuccess: done,
  });
}

export function useUpdateProject() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, patch, oldName }: { id: string; patch: Partial<ProjectInput>; oldName?: string; oldAliases?: string[] }) => {
      const row: Record<string, unknown> = { ...patch };
      // Đổi tên: nhớ tên cũ (đã chuẩn hóa) làm bí danh để tìm lại được (như `findProjectByAlias` app cũ)
      if (patch.name && oldName && normalizeName(oldName) !== normalizeName(patch.name)) {
        const { data } = await supabase.from('projects').select('aliases').eq('id', id).single();
        const set = new Set<string>([...(data?.aliases ?? []), normalizeName(oldName)]);
        set.delete(normalizeName(patch.name));
        row.aliases = [...set];
      }
      if (patch.start_date !== undefined) row.start_date_user_edited = true;
      const { error } = await supabase.from('projects').update(row as never).eq('id', id);
      if (error) throw friendly(error);
    },
    onSuccess: done,
  });
}

/** Đếm dữ liệu còn gắn với công trình (như `canDeleteProject` app cũ + thêm thu / hợp đồng để không mất số) */
const USAGE_TABLES = ['expenses', 'timesheet_weeks', 'wage_advances', 'payments', 'equipment', 'receipts', 'main_contracts', 'subcontracts', 'settlements'] as const;
export async function projectUsageCount(projectId: string): Promise<number> {
  const counts = await Promise.all(USAGE_TABLES.map(async (t) => {
    const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true }).eq('project_id', projectId).is('deleted_at', null);
    if (error) throw new Error(`Không kiểm tra được ${t}: ${error.message}`);
    return count ?? 0;
  }));
  return counts.reduce((a, b) => a + b, 0);
}

export function useDeleteProject() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const used = await projectUsageCount(id);
      if (used > 0) throw new Error('Công trình còn dữ liệu (hóa đơn, chấm công, phiếu chi, thu…). Xóa dữ liệu trước!');
      const { error } = await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw friendly(error);
    },
    onSuccess: done,
  });
}

export function useQuickAddCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { name: string; address: string | null }) => {
      const { data, error } = await supabase.from('customers').insert({ name: v.name.trim(), address: v.address }).select('id').single();
      if (error) throw new Error(error.code === '23505' ? 'Đã có khách hàng trùng tên này.' : error.message);
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOMERS_KEY }),
  });
}
