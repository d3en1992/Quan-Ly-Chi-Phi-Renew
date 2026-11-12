// Bảng trượt CHI TIẾT VIỆC: trạng thái, % xong (bấm nhanh), thời gian theo ngày làm việc, phụ trách, việc trước – sau,
// vướng mắc, ghi chú, nhật ký cập nhật %. Dùng chung máy tính và điện thoại.
import { useMemo, useState, type ReactNode } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { ConfirmDialog } from '@/components/ui/confirm';
import { Segmented } from '@/components/ui/data';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { Note, Pill } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { todayIso } from '@/features/reports/shared';
import { useAddTask, useDeleteTask, useTaskNotes, useUpdateTask, type Phase, type Task, type TaskDraft } from './api';
import {
  addDays, clampPct, endFromDuration, fmtDm, fmtDmy, nextStartFor, nextWorkDay, progressForStatus, STATUS_LABEL, statusForProgress, taskDays, taskView,
  type Calendar, type TaskStatus,
} from './logic';

const STATUS_OPTS = (Object.keys(STATUS_LABEL) as TaskStatus[]).map((value) => ({ value, label: STATUS_LABEL[value] }));
const textareaCls = 'min-h-[64px] w-full rounded-[7px] border border-line bg-surface px-2.5 py-2 text-[13px] text-fg placeholder:text-faint focus:outline-2 focus:outline-accent disabled:bg-surface-2';

/** Nhóm có nhãn nhưng không phải <label> (bên trong có nhiều nút) */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid min-w-0 content-start gap-1 text-xs font-medium text-muted"><span>{label}</span>{children}</div>;
}

export type TaskSheetTarget = { task: Task } | { newIn: string | null };

export function TaskSheet({ target, projectId, planStart, cal, phases, tasks, people, canEdit, canEditTask, onClose }: {
  target: TaskSheetTarget; projectId: string; planStart: string; cal: Calendar; phases: Phase[]; tasks: Task[];
  people: { id: string; name: string }[]; canEdit: boolean; canEditTask: (t: Task) => boolean; onClose: () => void;
}) {
  const toast = useToast();
  const add = useAddTask(), update = useUpdateTask(), del = useDeleteTask();
  const existing = 'task' in target ? target.task : null;
  const readOnly = existing ? !canEditTask(existing) : !canEdit;
  const today = todayIso();

  const [d, setD] = useState<TaskDraft>(() => {
    if (existing) {
      return {
        phase_id: existing.phase_id, name: existing.name, kind: existing.kind, status: existing.status, progress_pct: existing.progress_pct,
        start_date: existing.start_date, end_date: existing.end_date, assignee: existing.assignee, depends_on: existing.depends_on ?? [],
        blocker: existing.blocker, note: existing.note,
      };
    }
    const phaseId = 'newIn' in target ? target.newIn ?? phases.at(-1)?.id ?? null : null;
    const start = nextStartFor(tasks.filter((t) => t.phase_id === phaseId), tasks, planStart, cal);
    return { phase_id: phaseId, name: '', kind: 'task', status: 'todo', progress_pct: 0, start_date: start, end_date: start, assignee: null, depends_on: [], blocker: null, note: null };
  });
  const [logNote, setLogNote] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (p: Partial<TaskDraft>) => setD((x) => ({ ...x, ...p }));
  const days = taskDays(d, cal);
  const view = taskView({ ...d, id: existing?.id ?? 'new', position: 0 }, cal, today);
  const notes = useTaskNotes(existing?.id ?? null);

  const setPct = (n: number) => { const p = clampPct(n); set({ progress_pct: p, status: statusForProgress(p, d.status) }); };
  const setStatus = (s: TaskStatus) => set({ status: s, progress_pct: progressForStatus(s, d.progress_pct) });
  const setStart = (s: string) => {
    if (!s) return set({ start_date: null, end_date: null });
    if (d.kind === 'milestone') return set({ start_date: s, end_date: s });
    set({ start_date: s, end_date: endFromDuration(s, days ?? 1, cal) });
  };
  const setDays = (n: number) => { if (d.start_date && n >= 1) set({ end_date: endFromDuration(d.start_date, n, cal) }); };
  const setEnd = (e: string) => { if (e && d.start_date && e >= d.start_date) set({ end_date: e }); };
  const setKind = (k: TaskDraft['kind']) => set(k === 'milestone' ? { kind: k, end_date: d.start_date } : { kind: k, end_date: d.start_date ? endFromDuration(d.start_date, 1, cal) : null });
  const noSchedule = !d.start_date;

  const others = tasks.filter((t) => t.id !== existing?.id);
  const preds = others.filter((t) => d.depends_on.includes(t.id));
  const succs = existing ? others.filter((t) => (t.depends_on ?? []).includes(existing.id)) : [];
  const predEnd = preds.map((t) => t.end_date).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const startsTooEarly = !!predEnd && !!d.start_date && d.start_date <= predEnd;
  const phaseName = useMemo(() => new Map(phases.map((p) => [p.id, p.name])), [phases]);

  const save = () => {
    if (!d.name.trim()) { toast('Nhập tên việc.', 'error'); return; }
    const opts = { onSuccess: () => { toast(existing ? 'Đã lưu việc' : 'Đã thêm việc'); onClose(); }, onError: (e: Error) => toast(`Chưa lưu được: ${e.message}`, 'error') };
    if (existing) update.mutate({ task: existing, patch: d, logNote }, opts);
    else add.mutate({ ...d, projectId, position: Math.max(-1, ...tasks.filter((t) => t.phase_id === d.phase_id).map((t) => t.position)) + 1 }, opts);
  };
  const busy = add.isPending || update.isPending;

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }} title={existing ? (readOnly ? 'Xem việc' : 'Chi tiết việc') : 'Thêm việc'}
      footer={readOnly ? <Button onClick={onClose}>Đóng</Button> : <>
        {existing ? <Button variant="ghost-danger" className="mr-auto" onClick={() => setConfirmDel(true)}><Icon name="delete" />Xóa</Button> : null}
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="primary" data-testid="td-task-save" disabled={busy} onClick={save}><Icon name="save" />{busy ? 'Đang lưu…' : 'Lưu'}</Button>
      </>}>
      <fieldset disabled={readOnly} className="grid min-w-0 gap-3">
        <Field label="Tên việc *"><Input aria-label="Tên việc" autoFocus={!existing} value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Giai đoạn">
            <Select aria-label="Giai đoạn" value={d.phase_id ?? ''} onChange={(e) => set({ phase_id: e.target.value || null })}>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Group label="Loại"><Segmented value={d.kind} onChange={setKind} options={[{ value: 'task', label: 'Việc' }, { value: 'milestone', label: '◆ Mốc' }]} /></Group>
        </div>

        <Group label="Trạng thái"><Segmented value={d.status} onChange={setStatus} options={STATUS_OPTS} /></Group>

        <div className="grid gap-2 rounded-lg border border-line-soft p-3">
          <div className="flex items-center gap-3">
            <b className="num text-[32px] leading-none" data-testid="td-pct">{d.progress_pct}%</b>
            <div className="text-[12px] text-muted">
              {view.plannedPct === null ? 'Chưa có lịch' : `Kế hoạch hôm nay ${view.plannedPct}%`}
              <div>{view.late ? <Pill tone="bad">Trễ {view.lateDays} ngày</Pill> : view.behind ? <Pill tone="warn">Chậm</Pill> : d.status === 'done' ? <Pill tone="good">Xong</Pill> : view.plannedPct !== null ? <Pill tone="good">Đúng kế hoạch</Pill> : null}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" aria-label="Giảm 10%" onClick={() => setPct(d.progress_pct - 10)}>−</Button>
            {[0, 25, 50, 75, 100].map((n) => <Button key={n} size="sm" variant={d.progress_pct === n ? 'primary' : 'default'} onClick={() => setPct(n)}>{n}%</Button>)}
            <Button size="sm" aria-label="Tăng 10%" onClick={() => setPct(d.progress_pct + 10)}>+</Button>
          </div>
          {existing ? <Input aria-label="Ghi chú lần cập nhật" placeholder="Ghi chú lần cập nhật này (vào nhật ký)" value={logNote} onChange={(e) => setLogNote(e.target.value)} /> : null}
        </div>

        <Checkbox label="Chưa có lịch (không tính trễ)" checked={noSchedule} onChange={(v) => (v ? set({ start_date: null, end_date: null }) : setStart(nextWorkDay(today, cal)))} />
        {!noSchedule ? (
          <div className="grid grid-cols-3 gap-2">
            <Field label="Bắt đầu"><Input type="date" aria-label="Bắt đầu" value={d.start_date ?? ''} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Số ngày">
              <Input aria-label="Số ngày" inputMode="numeric" className="num text-right" disabled={d.kind === 'milestone' || readOnly} value={d.kind === 'milestone' ? '0' : String(days ?? '')}
                onChange={(e) => setDays(parseInt(e.target.value, 10))} />
            </Field>
            <Field label="Kết thúc"><Input type="date" aria-label="Kết thúc" disabled={d.kind === 'milestone' || readOnly} value={d.end_date ?? ''} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
        ) : null}

        <Field label="Người phụ trách">
          <Combo aria-label="Người phụ trách" free value={d.assignee ?? ''} onChange={(v) => set({ assignee: v || null })} items={people} groupLabel="Danh bạ" placeholder="Gõ tên hoặc chọn" />
        </Field>

        <Group label="Làm sau việc (việc trước)">
          <div className="grid gap-1.5">
            {preds.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-[13px] text-fg">
                <span className="min-w-0 flex-1 truncate">{t.name} <span className="text-faint">· xong {fmtDm(t.end_date)}</span></span>
                <Button size="sm" variant="ghost" aria-label={`Bỏ liên kết ${t.name}`} onClick={() => set({ depends_on: d.depends_on.filter((x) => x !== t.id) })}><Icon name="close" /></Button>
              </div>
            ))}
            <Select aria-label="Thêm việc trước" value="" onChange={(e) => e.target.value && set({ depends_on: [...d.depends_on, e.target.value] })}>
              <option value="">+ Chọn việc phải xong trước…</option>
              {others.filter((t) => !d.depends_on.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{phaseName.get(t.phase_id ?? '') ?? ''} › {t.name}</option>)}
            </Select>
            {startsTooEarly ? (
              <Note icon="warning">Việc này bắt đầu trước khi việc trước xong ({fmtDmy(predEnd)}).{' '}
                <button type="button" className="font-semibold text-accent" onClick={() => setStart(nextWorkDay(addDays(predEnd!, 1), cal))}>Dời sau việc trước</button>
              </Note>
            ) : null}
            {succs.length ? <span className="text-[12px] font-normal text-faint">Việc làm sau: {succs.map((t) => t.name).join(', ')}</span> : null}
          </div>
        </Group>

        <Field label="Vướng mắc / lý do chậm"><Input aria-label="Vướng mắc" value={d.blocker ?? ''} onChange={(e) => set({ blocker: e.target.value || null })} /></Field>
        <Field label="Ghi chú"><textarea aria-label="Ghi chú" className={textareaCls} value={d.note ?? ''} onChange={(e) => set({ note: e.target.value || null })} /></Field>
      </fieldset>

      {existing ? (
        <div className="mt-4 grid gap-1.5">
          <b className="text-[12.5px]">Nhật ký cập nhật</b>
          {notes.isLoading ? <span className="text-[12px] text-faint">Đang tải…</span> : null}
          {notes.data && !notes.data.length ? <span className="text-[12px] text-faint">Chưa có lần cập nhật nào.</span> : null}
          {(notes.data ?? []).map((n) => (
            <div key={n.id} className="flex gap-2 text-[12.5px]">
              <span className="num shrink-0 text-faint">{fmtDmy(n.date)}</span>
              {n.progress_pct !== null ? <b className="num shrink-0">{n.progress_pct}%</b> : null}
              <span className="min-w-0 text-muted">{n.content}</span>
            </div>
          ))}
        </div>
      ) : null}

      <ConfirmDialog open={confirmDel} onOpenChange={setConfirmDel} danger title="Xóa việc?" confirmLabel="Xóa" busy={del.isPending}
        message={`Xóa "${existing?.name}"? Việc vào Thùng rác, khôi phục được.`}
        onConfirm={() => existing && del.mutate(existing.id, {
          onSuccess: () => { toast('Đã xóa việc'); setConfirmDel(false); onClose(); },
          onError: (e) => toast(`Chưa xóa được: ${e.message}`, 'error'),
        })} />
    </Sheet>
  );
}
