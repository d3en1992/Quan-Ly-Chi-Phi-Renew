// Đọc / ghi tab Tiến Độ: schedule_plans (1 kế hoạch / công trình), schedule_phases, schedule_tasks, schedule_notes (nhật ký % / ghi chú),
// schedule_templates (mẫu riêng do người dùng lưu). Lập kế hoạch từ mẫu qua hàm kho `create_schedule` (1 giao dịch).
// Xóa = xóa mềm; xóa kế hoạch / giai đoạn thì việc con nhận CÙNG deleted_at để Thùng rác khôi phục kèm.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { fetchLive } from '@/features/reports/api';
import {
  clampPct, statusForProgress, type BuiltPhase, type Calendar, type RestDays, type TaskStatus, type Template, type TemplatePhase,
} from './logic';

const sb = supabase as unknown as SupabaseClient;

const projectSchema = z.object({
  id: z.string(), name: z.string(), kind: z.string().nullable(), status: z.string(), is_company_overhead: z.boolean(),
  scope_note: z.string().nullable(), start_date: z.string().nullable(), end_date: z.string().nullable(),
});
const planSchema = z.object({
  id: z.string(), project_id: z.string(), start_date: z.string(), deadline: z.string().nullable(),
  rest_days: z.enum(['sun', 'sat_sun', 'none']), holidays: z.array(z.string()).nullable(), template_key: z.string().nullable(),
  created_by: z.string().nullable(),
});
const phaseSchema = z.object({ id: z.string(), project_id: z.string(), name: z.string(), position: z.number(), created_by: z.string().nullable() });
const taskSchema = z.object({
  id: z.string(), project_id: z.string(), phase_id: z.string().nullable(), name: z.string(), position: z.number(),
  kind: z.enum(['task', 'milestone']), status: z.enum(['todo', 'doing', 'paused', 'done']),
  start_date: z.string().nullable(), end_date: z.string().nullable(), progress_pct: z.coerce.number(),
  assignee: z.string().nullable(), depends_on: z.array(z.string()).nullable(), blocker: z.string().nullable(), note: z.string().nullable(),
  created_by: z.string().nullable(), updated_at: z.string(),
});
const templateSchema = z.object({ id: z.string(), kind: z.string(), name: z.string(), project_kind: z.string().nullable(), data: z.unknown() });
const nameSchema = z.object({ id: z.string(), name: z.string() });
const employeeSchema = z.object({ id: z.string(), full_name: z.string() });
const noteSchema = z.object({
  id: z.string(), task_id: z.string().nullable(), date: z.string(), content: z.string(), progress_pct: z.coerce.number().nullable(),
  created_by: z.string().nullable(), created_at: z.string(),
});

export type SchedProject = z.infer<typeof projectSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Phase = z.infer<typeof phaseSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskNote = z.infer<typeof noteSchema>;

export type SchedData = {
  projects: SchedProject[];
  plans: Plan[];
  phases: Phase[];
  tasks: Task[];
  /** mẫu riêng đã lưu (có giai đoạn) */
  customTemplates: Template[];
  /** gợi ý người phụ trách: công nhân, thầu phụ, nhân viên */
  people: { id: string; name: string }[];
};

export const SCHEDULE_KEY = ['schedule-data'] as const;

const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);

/** Mẫu trong kho: data = [{name, tasks:[{name, days, milestone}]}] — mẫu tạo ở Danh Mục chưa có giai đoạn thì bỏ qua */
function readTemplate(r: z.infer<typeof templateSchema>): Template | null {
  const phases = z.array(z.object({
    name: z.string(), tasks: z.array(z.object({ name: z.string(), days: z.coerce.number(), milestone: z.boolean().optional() })).default([]),
  })).safeParse(r.data);
  if (!phases.success || !phases.data.length) return null;
  return { key: `custom:${r.id}`, label: `${r.name} (mẫu riêng)`, phases: phases.data, custom: true };
}

async function fetchSchedData(): Promise<SchedData> {
  const [projects, plans, phases, tasks, templates, workers, subs, employees] = await Promise.all([
    fetchLive('projects', projectSchema), fetchLive('schedule_plans', planSchema), fetchLive('schedule_phases', phaseSchema),
    fetchLive('schedule_tasks', taskSchema), safe(fetchLive('schedule_templates', templateSchema)),
    safe(fetchLive('workers', nameSchema)), safe(fetchLive('subcontractors', nameSchema)), safe(fetchLive('employees', employeeSchema)),
  ]);
  const seen = new Set<string>();
  const people = [...employees.map((e) => ({ id: e.id, name: e.full_name })), ...subs, ...workers]
    .filter((p) => { const k = p.name.trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return {
    projects: projects.filter((p) => !p.is_company_overhead).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    plans, phases, tasks,
    customTemplates: templates.filter((t) => t.kind === 'phases').map(readTemplate).filter((t): t is Template => !!t),
    people,
  };
}

export function useSchedData() {
  return useQuery({ queryKey: SCHEDULE_KEY, queryFn: fetchSchedData, staleTime: 30_000 });
}

export const calendarOf = (p: Pick<Plan, 'rest_days' | 'holidays'>): Calendar => ({ restDays: p.rest_days as RestDays, holidays: p.holidays ?? [] });

/** Kế hoạch + giai đoạn + việc của 1 công trình */
export function projectSchedule(d: SchedData, projectId: string) {
  const plan = d.plans.find((p) => p.project_id === projectId) ?? null;
  return {
    plan,
    phases: d.phases.filter((p) => p.project_id === projectId),
    tasks: d.tasks.filter((t) => t.project_id === projectId),
  };
}

export function useTaskNotes(taskId: string | null) {
  return useQuery({
    queryKey: ['schedule-notes', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await sb.from('schedule_notes').select('id,task_id,date,content,progress_pct,created_by,created_at')
        .eq('task_id', taskId!).is('deleted_at', null).order('created_at', { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return z.array(noteSchema).parse(data ?? []);
    },
  });
}

function friendly(e: { message: string; code?: string }): Error {
  if (e.code === '42501') return new Error('Bạn không có quyền sửa tiến độ (hoặc dòng này do người khác nhập).');
  if (e.code === '23505') return new Error('Công trình này đã có kế hoạch tiến độ. Tải lại trang.');
  return new Error(e.message);
}
/** Câu lệnh sửa không trả dòng nào = RLS chặn (không có quyền / dòng người khác) */
async function run(q: PromiseLike<{ error: { message: string; code?: string } | null; data?: unknown }>, expectRows = false) {
  const { error, data } = await q;
  if (error) throw friendly(error);
  if (expectRows && Array.isArray(data) && data.length === 0) throw new Error('Bạn không có quyền sửa dòng này (dòng do người khác nhập).');
}

function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: SCHEDULE_KEY }), qc.invalidateQueries({ queryKey: ['trash'] }), qc.invalidateQueries({ queryKey: ['schedule-notes'] })]);
}

export function useCreatePlan() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; startDate: string; deadline: string; restDays: RestDays; holidays: string[]; templateKey: string; phases: BuiltPhase[] }) => {
      if (!v.startDate) throw new Error('Chọn ngày khởi công.');
      if (!v.phases.length) throw new Error('Chọn ít nhất 1 giai đoạn.');
      const { error } = await sb.rpc('create_schedule', {
        p_project: v.projectId,
        p_plan: { start_date: v.startDate, deadline: v.deadline || null, rest_days: v.restDays, holidays: v.holidays, template_key: v.templateKey },
        p_phases: v.phases.map((p) => ({ id: crypto.randomUUID(), name: p.name, position: p.position, tasks: p.tasks })),
      });
      if (error) throw friendly(error);
    },
    onSuccess: refresh,
  });
}

export type PlanPatch = Partial<Pick<Plan, 'start_date' | 'deadline' | 'rest_days' | 'holidays'>>;
export function useUpdatePlan() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { id: string; patch: PlanPatch }) => run(sb.from('schedule_plans').update(v.patch).eq('id', v.id).select('id'), true),
    onSuccess: refresh,
  });
}

/** Xóa cả kế hoạch: kế hoạch + giai đoạn + việc cùng 1 deleted_at (khôi phục kế hoạch ở Thùng rác là về đủ) */
export function useDeletePlan() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (plan: Pick<Plan, 'id' | 'project_id'>) => {
      const ts = new Date().toISOString();
      await run(sb.from('schedule_tasks').update({ deleted_at: ts }).eq('project_id', plan.project_id).is('deleted_at', null));
      await run(sb.from('schedule_phases').update({ deleted_at: ts }).eq('project_id', plan.project_id).is('deleted_at', null));
      await run(sb.from('schedule_plans').update({ deleted_at: ts }).eq('id', plan.id).select('id'), true);
    },
    onSuccess: refresh,
  });
}

export function useAddPhase() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; name: string; position: number }) => {
      if (!v.name.trim()) throw new Error('Nhập tên giai đoạn.');
      await run(sb.from('schedule_phases').insert({ project_id: v.projectId, name: v.name.trim(), position: v.position }));
    },
    onSuccess: refresh,
  });
}
export function useUpdatePhase() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { id: string; patch: Partial<Pick<Phase, 'name' | 'position'>> }) => run(sb.from('schedule_phases').update(v.patch).eq('id', v.id).select('id'), true),
    onSuccess: refresh,
  });
}
export function useDeletePhase() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const ts = new Date().toISOString();
      await run(sb.from('schedule_tasks').update({ deleted_at: ts }).eq('phase_id', id).is('deleted_at', null));
      await run(sb.from('schedule_phases').update({ deleted_at: ts }).eq('id', id).select('id'), true);
    },
    onSuccess: refresh,
  });
}

export type TaskDraft = {
  phase_id: string | null; name: string; kind: 'task' | 'milestone'; status: TaskStatus; progress_pct: number;
  start_date: string | null; end_date: string | null; assignee: string | null; depends_on: string[]; blocker: string | null; note: string | null;
};

export function useAddTask() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; position: number } & TaskDraft) => {
      if (!v.name.trim()) throw new Error('Nhập tên việc.');
      const { projectId, ...row } = v;
      await run(sb.from('schedule_tasks').insert({ ...row, project_id: projectId, name: v.name.trim() }));
    },
    onSuccess: refresh,
  });
}

/** Sửa việc. Đổi % thì ghi 1 dòng nhật ký (ngày, %, ghi chú) */
export function useUpdateTask() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { task: Pick<Task, 'id' | 'project_id' | 'progress_pct'>; patch: Partial<TaskDraft>; logNote?: string }) => {
      const patch = { ...v.patch };
      if (patch.name !== undefined && !patch.name.trim()) throw new Error('Tên việc không được để trống.');
      await run(sb.from('schedule_tasks').update(patch).eq('id', v.task.id).select('id'), true);
      const pctChanged = patch.progress_pct !== undefined && patch.progress_pct !== v.task.progress_pct;
      if (pctChanged || v.logNote?.trim()) {
        await run(sb.from('schedule_notes').insert({
          project_id: v.task.project_id, task_id: v.task.id, content: v.logNote?.trim() ?? '',
          progress_pct: pctChanged ? patch.progress_pct : null,
        }));
      }
    },
    onSuccess: refresh,
  });
}

/** Bấm nhanh % (bảng / điện thoại): % + trạng thái tự đổi + nhật ký */
export function useSetProgress() {
  const update = useUpdateTask();
  return {
    ...update,
    set: (task: Task, pct: number, opts?: Parameters<typeof update.mutate>[1]) => {
      const p = clampPct(pct);
      update.mutate({ task, patch: { progress_pct: p, status: statusForProgress(p, task.status) } }, opts);
    },
  };
}

export function useDeleteTask() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => run(sb.from('schedule_tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id'), true),
    onSuccess: refresh,
  });
}

/** Lưu kế hoạch đang xem làm mẫu riêng (schedule_templates, kind phases) */
export function useSaveTemplate() {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { name: string; projectKind: string | null; phases: TemplatePhase[] }) => {
      if (!v.name.trim()) throw new Error('Nhập tên mẫu.');
      const kind = v.projectKind && ['new_build', 'renovation', 'small_repair'].includes(v.projectKind) ? v.projectKind : null;
      await run(sb.from('schedule_templates').insert({ kind: 'phases', name: v.name.trim(), project_kind: kind, data: v.phases }));
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['catalog'] }); return refresh(); },
  });
}
