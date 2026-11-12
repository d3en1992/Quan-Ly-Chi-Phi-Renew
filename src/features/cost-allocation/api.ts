// Đọc / ghi cho tab Tỉ Trọng & Định Mức. Công thức ở src/lib/calc/cost-allocation.ts (chép tytrong.core.js).
// Bảng `cost_allocations` giữ jsonb như app cũ: kind 'project' (gán tay của 1 công trình), 'config' (cấu hình rổ dùng chung),
// 'benchmark' (định mức đã lưu). KHÔNG ghi gì vào hóa đơn / phiếu chi.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { readAllocConfig, type AllocItem, type AllocSource, type Benchmark, type FloorRow, type GroupRule } from '@/lib/calc';
import { fetchLive, type ReportData } from '@/features/reports/api';
import { PROJECTS_KEY } from '@/features/projects/api';

const sb = supabase as unknown as SupabaseClient;

const recordSchema = z.object({
  id: z.string(), kind: z.enum(['project', 'benchmark', 'config']), project_id: z.string().nullable(), name: z.string().nullable(),
  data: z.record(z.unknown()).catch({}), created_at: z.string().nullable(), created_by: z.string().nullable(),
});
const lineSchema = z.object({
  expense_id: z.string(), position: z.number(), name: z.string().nullable(), quantity: z.coerce.number().nullable(), unit_price: z.coerce.number().nullable(), amount: z.coerce.number(),
});
export type AllocRecord = z.infer<typeof recordSchema>;

export const ALLOC_KEY = ['cost-allocations'] as const;
const LINES_KEY = ['cost-allocation-lines'] as const;

export function useAllocRecords() {
  return useQuery({ queryKey: ALLOC_KEY, staleTime: 30_000, queryFn: () => fetchLive('cost_allocations', recordSchema) });
}

/** Dòng vật tư của MỌI hóa đơn (để tách nhóm theo món), gom theo id hóa đơn, xếp theo thứ tự dòng */
export function useAllExpenseLines() {
  return useQuery({
    queryKey: LINES_KEY, staleTime: 60_000,
    queryFn: async (): Promise<Map<string, AllocItem[]>> => {
      const rows = await fetchLive('expense_lines', lineSchema);
      const m = new Map<string, (AllocItem & { position: number })[]>();
      for (const r of rows) {
        const arr = m.get(r.expense_id) ?? [];
        arr.push({ name: r.name, amount: r.amount, quantity: r.quantity, unit_price: r.unit_price, position: r.position });
        m.set(r.expense_id, arr);
      }
      for (const arr of m.values()) arr.sort((a, b) => a.position - b.position);
      return m;
    },
  });
}

export function toAllocSource(d: ReportData, expenseLines: ReadonlyMap<string, readonly AllocItem[]>): AllocSource {
  return {
    expenses: d.expenses, expenseLines, timesheetWeeks: d.timesheetWeeks, timesheetLines: d.timesheetLines, payments: d.payments,
    paymentAllocations: d.paymentAllocations, subcontracts: d.subcontracts, catalogName: d.catalogName, supplierName: d.supplierName,
    workerName: d.workerName, subcontractorName: d.subcontractorName,
  };
}

function friendly(e: { message: string; code?: string }): Error {
  if (e.code === '42501') return new Error('Bạn không có quyền sửa Tỉ trọng & Định mức.');
  if (e.code === '23505') return new Error('Vừa có người khác lưu cùng lúc. Tải lại trang rồi thử lại.');
  return new Error(e.message);
}
function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ALLOC_KEY });
}
async function updateData(id: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const { data: rows, error } = await sb.from('cost_allocations').update({ data, ...extra }).eq('id', id).select('id');
  if (error) throw friendly(error);
  if (!rows?.length) throw new Error('Không lưu được: bản ghi do người khác tạo (cần Toàn quyền hoặc quyền "Sửa / xóa dòng người khác nhập").');
}

/** `tytSaveStruct`: ghi phân nhóm của 1 công trình (tạo mới nếu chưa có). changes: { nhomTay?, theoHdtp? } */
export function useSaveProjectAlloc() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; current: AllocRecord | undefined; changes: Record<string, unknown> }) => {
      if (v.current) return updateData(v.current.id, { ...v.current.data, ...v.changes });
      const { error } = await sb.from('cost_allocations').insert({ kind: 'project', project_id: v.projectId, data: { nhomTay: {}, theoHdtp: {}, ...v.changes } });
      if (error) throw friendly(error);
    },
    onSuccess: refresh,
  });
}

export type ConfigChanges = Partial<{ nhomLoai: Record<string, number>; nhomLuat: GroupRule[]; truLoai: Record<string, string>; quyMuc: number }>;
/** `tytSaveNhomCfg`: lần đầu ghi theo tên trường mới thì ghi luôn cả bảng / luật đã chuyển đổi từ rổ cũ */
export function useSaveConfig() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { current: AllocRecord | undefined; changes: ConfigChanges }) => {
      const base = readAllocConfig(v.current?.data ?? null);
      const full = { nhomLoai: base.nhomLoai, nhomLuat: base.nhomLuat, truLoai: base.truLoai, quyMuc: base.quyMuc, ...v.changes };
      if (v.current) {
        const d = v.current.data;
        return updateData(v.current.id, { ...d, ...(d.nhomLoai && d.nhomLuat ? v.changes : full) });
      }
      const { error } = await sb.from('cost_allocations').insert({ kind: 'config', data: { kind: 'cauhinh', ...full } });
      if (error) throw friendly(error);
    },
    onSuccess: refresh,
  });
}

export function useCreateBenchmark() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { name: string; fields: Benchmark }) => {
      const name = v.name.trim() || `Định mức ${v.fields.nguonTen}`;
      const { error } = await sb.from('cost_allocations').insert({ kind: 'benchmark', name, data: { kind: 'dinhmuc', ten: name, ...v.fields } });
      if (error) throw friendly(error);
    },
    onSuccess: refresh,
  });
}
/** Đổi tên, hoặc cập nhật lại số liệu từ công trình nguồn (giữ tên + id) */
export function useUpdateBenchmark() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { record: AllocRecord; name?: string; fields?: Benchmark }) => {
      const name = (v.name ?? v.record.name ?? '').trim() || 'Định mức';
      await updateData(v.record.id, { ...v.record.data, ...(v.fields ?? {}), ten: name }, { name });
    },
    onSuccess: refresh,
  });
}
export function useDeleteBenchmark() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.from('cost_allocations').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Không xóa được: định mức do người khác tạo.');
    },
    onSuccess: refresh,
  });
}

/** Bảng khối lượng sàn nằm ở công trình (`projects.floor_areas`) — cần quyền sửa Công trình */
export function useSaveFloorAreas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { projectId: string; rows: FloorRow[] }) => {
      const { data, error } = await sb.from('projects').update({ floor_areas: v.rows }).eq('id', v.projectId).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Không lưu được khối lượng sàn: cần quyền sửa công trình này (mục Công Trình).');
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: PROJECTS_KEY })]),
  });
}
