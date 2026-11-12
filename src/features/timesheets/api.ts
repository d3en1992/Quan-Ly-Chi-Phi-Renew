// Đọc / ghi cho tab Chấm Công: tuần chấm công, dòng công nhân, sổ Tạm ứng lương, danh sách công nhân + công trình.
// Lưu tuần = 1 lời gọi hàm `save_timesheet_week` (1 giao dịch, RLS vẫn kiểm tra). Công thức ở src/lib/calc/payroll.ts.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { CONTACTS_KEY } from '@/features/contacts/api';
import { fetchLive, REPORT_DATA_KEY } from '@/features/reports/api';
import type { PayrollLine, PayWeek, WageAdvance } from '@/lib/calc';

const sb = supabase as unknown as SupabaseClient;
const money = z.coerce.number();

const weekSchema = z.object({ id: z.string(), project_id: z.string(), week_start: z.string(), created_by: z.string().nullable(), updated_at: z.string() });
const lineSchema = z.object({
  id: z.string(), week_id: z.string(), worker_id: z.string(), position: z.number(), role: z.string().nullable(),
  day_units: z.array(z.coerce.number().nullable().transform((v) => v ?? 0)), daily_wage: money, allowance: money, retail_purchase: money,
  debt_deduction: money, legacy_loan: money, note: z.string().nullable(),
});
const advanceSchema = z.object({
  id: z.string(), worker_id: z.string(), project_id: z.string().nullable(), date: z.string(), direction: z.string(), amount: money,
  counts_in_net_pay: z.boolean(), source_week_id: z.string().nullable(), note: z.string().nullable(), created_by: z.string().nullable(),
});
const workerSchema = z.object({ id: z.string(), name: z.string(), role: z.string().nullable(), archived: z.boolean() });
const projectSchema = z.object({ id: z.string(), name: z.string(), status: z.string(), is_company_overhead: z.boolean() });

export type TsWeek = z.infer<typeof weekSchema> & PayWeek;
export type TsLine = z.infer<typeof lineSchema> & PayrollLine;
export type TsAdvance = z.infer<typeof advanceSchema> & WageAdvance;
export type TsWorker = z.infer<typeof workerSchema>;
export type TsProject = z.infer<typeof projectSchema>;

export type TimesheetData = {
  weeks: TsWeek[];
  lines: TsLine[];
  advances: TsAdvance[];
  workers: TsWorker[];
  projects: TsProject[];
  /** Công trình chọn được khi chấm công: đang làm (bỏ đã quyết toán), CÔNG TY cuối */
  projectOptions: TsProject[];
  workerById: Map<string, TsWorker>;
  projectName: (id: string | null | undefined) => string;
  workerName: (id: string) => string;
};

export const TIMESHEET_KEY = ['timesheets'] as const;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'vi');

export async function fetchTimesheetData(): Promise<TimesheetData> {
  const [weeks, lines, advances, workers, projects] = await Promise.all([
    fetchLive('timesheet_weeks', weekSchema), fetchLive('timesheet_lines', lineSchema), fetchLive('wage_advances', advanceSchema),
    fetchLive('workers', workerSchema), fetchLive('projects', projectSchema),
  ]);
  const weekIds = new Set(weeks.map((w) => w.id));
  const workerById = new Map(workers.map((w) => [w.id, w]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const open = projects.filter((p) => !p.is_company_overhead && p.status !== 'closed').sort(byName);
  return {
    weeks, advances, projects,
    lines: lines.filter((l) => weekIds.has(l.week_id)),
    workers: workers.sort(byName),
    projectOptions: [...open, ...projects.filter((p) => p.is_company_overhead)],
    workerById,
    projectName: (id) => (id ? projectById.get(id)?.name ?? '—' : '—'),
    workerName: (id) => workerById.get(id)?.name ?? '?',
  };
}

export function useTimesheetData() {
  return useQuery({ queryKey: TIMESHEET_KEY, queryFn: fetchTimesheetData, staleTime: 30_000 });
}

function friendly(e: { message: string; code?: string }): Error {
  if (e.code === '42501') return new Error(e.message.includes('người khác') ? e.message : 'Bạn không có quyền thực hiện thao tác này.');
  if (e.code === '23505') return new Error(e.message.includes('2 dòng') ? e.message : 'Dữ liệu bị trùng (tên công nhân hoặc tuần đã có).');
  if (e.code === '23503') return new Error('Công trình / công nhân vừa chọn không còn tồn tại. Tải lại trang rồi thử lại.');
  return new Error(e.message);
}

function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: TIMESHEET_KEY }), qc.invalidateQueries({ queryKey: REPORT_DATA_KEY })]);
}

export type SaveLine = {
  worker_id: string; role: string | null; day_units: number[]; daily_wage: number; allowance: number; retail_purchase: number; note: string;
};

export function useSaveWeek() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; weekStart: string; lines: SaveLine[] }) => {
      const { data, error } = await sb.rpc('save_timesheet_week', { p_project_id: v.projectId, p_week_start: v.weekStart, p_lines: v.lines });
      if (error) throw friendly(error);
      return data as string;
    },
    onSuccess: done,
  });
}

export function useDeleteWeek() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (weekId: string) => {
      const { error } = await sb.rpc('delete_timesheet_week', { p_week_id: weekId });
      if (error) throw friendly(error);
    },
    onSuccess: done,
  });
}

/** Thêm công nhân mới vào Danh Bạ ngay trong sổ chấm công (tên viết HOA như app cũ) */
export function useCreateWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rawName: string): Promise<TsWorker> => {
      const name = rawName.trim().replace(/\s+/g, ' ').toUpperCase();
      if (!name) throw new Error('Vui lòng nhập tên công nhân.');
      const { data, error } = await sb.from('workers').insert({ name }).select('id,name,role,archived').single();
      if (error) throw friendly(error);
      return workerSchema.parse(data);
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: TIMESHEET_KEY }), qc.invalidateQueries({ queryKey: CONTACTS_KEY })]),
  });
}

export type AdvanceInput = {
  workerId: string; projectId: string | null; date: string; direction: 'advance' | 'repay'; amount: number; countsInNetPay: boolean; note: string;
};
export const advanceInputSchema = z.object({
  workerId: z.string().uuid('Chọn công nhân'),
  projectId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Chọn ngày giao dịch'),
  direction: z.enum(['advance', 'repay']),
  amount: z.number().int().positive('Nhập số tiền > 0'),
  countsInNetPay: z.boolean(),
  note: z.string(),
});

const toAdvanceRow = (a: AdvanceInput) => ({
  worker_id: a.workerId, project_id: a.projectId, date: a.date, direction: a.direction, amount: a.amount, counts_in_net_pay: a.countsInNetPay, note: a.note.trim() || null,
});

export function useSaveAdvance() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string | null; input: AdvanceInput }) => {
      const a = advanceInputSchema.parse(input);
      if (id) {
        const { data, error } = await sb.from('wage_advances').update(toAdvanceRow(a)).eq('id', id).select('id');
        if (error) throw friendly(error);
        if (!data?.length) throw new Error('Không sửa được: phiếu do người khác ghi (cần quyền "Sửa / xóa dòng người khác nhập") hoặc đã bị xóa.');
        return;
      }
      const { error } = await sb.from('wage_advances').insert(toAdvanceRow(a));
      if (error) throw friendly(error);
    },
    onSuccess: done,
  });
}

/** Xóa mềm → Thùng Rác */
export function useDeleteAdvance() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.from('wage_advances').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Không xóa được: phiếu do người khác ghi (cần quyền "Sửa / xóa dòng người khác nhập").');
    },
    onSuccess: done,
  });
}
