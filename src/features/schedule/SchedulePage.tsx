// Tab TIẾN ĐỘ (PAGES.tiendo / MP.tiendo) — tính năng phụ: chọn công trình → lập kế hoạch từ mẫu giai đoạn → bảng việc + Gantt
// (vạch Hôm nay, việc trễ tô đỏ, chậm tô cam), chi tiết việc, báo cáo chữ gửi Zalo. Tiến độ KHÔNG lọc theo năm (công trình kéo dài qua năm).
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { FilterBar, FilterSelect, HBar, KpiStrip, MobileCard, MobileRow, PhoneKpis, SearchBox, Segmented } from '@/components/ui/data';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { Card, EmptyState, ErrorState, LoadingState, Note, PageHeader, Pill } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { hasLevel } from '@/lib/permissions';
import { canEditRow } from '@/features/payments/shared';
import { matchesSearch, todayIso } from '@/features/reports/shared';
import {
  calendarOf, projectSchedule, useAddPhase, useAddTask, useCreatePlan, useDeletePhase, useDeletePlan, useSaveTemplate, useSchedData,
  useSetProgress, useUpdatePhase, useUpdatePlan, useUpdateTask, type Phase, type Plan, type SchedData, type SchedProject, type Task,
} from './api';
import {
  addDays, barGeometry, daysBetween, buildFromTemplate, DEFAULT_TEMPLATES, fmtDm, fmtDmy, ganttScale, guessTemplate, nextStartFor, nextWorkDay, planToTemplate,
  planView, REST_DAYS, zaloReport, type Calendar, type PlanView, type RestDays, type TaskView, type Template,
} from './logic';
import { TaskSheet, type TaskSheetTarget } from './TaskSheet';

const LS_KEY = 'qlcp.tiendo.project';
const lsGet = () => { try { return localStorage.getItem(LS_KEY) ?? ''; } catch { return ''; } };
const lsSet = (v: string) => { try { localStorage.setItem(LS_KEY, v); } catch { /* bỏ qua */ } };

type TV = TaskView<Task>;
type QuickFilter = 'all' | 'late' | 'behind' | 'doing';

function TaskPill({ t }: { t: TV }) {
  if (t.status === 'done') return <Pill tone="good">Xong</Pill>;
  if (t.late) return <Pill tone="bad">Trễ {t.lateDays} ngày</Pill>;
  if (t.behind) return <Pill tone="warn">Chậm</Pill>;
  if (t.status === 'paused') return <Pill>Tạm dừng</Pill>;
  if (t.status === 'doing') return <Pill tone="accent">Đang làm</Pill>;
  return <Pill>Chưa làm</Pill>;
}
const barClass = (t: TV) => (t.status === 'done' ? 'done' : t.late ? 'late' : t.behind ? 'behind' : '');

/** Tập ngày nghỉ lễ "dd/mm/yyyy, dd/mm" → ISO (thiếu năm = năm của ngày khởi công) */
export function parseHolidays(text: string, year: number): string[] {
  const out = new Set<string>();
  for (const part of text.split(/[,;\n]+/)) {
    const m = part.trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}))?$/);
    if (!m) continue;
    const iso = `${m[3] ?? year}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
    if (!Number.isNaN(Date.parse(iso))) out.add(iso);
  }
  return [...out].sort();
}
const holidaysText = (xs: string[]) => xs.map((x) => fmtDmy(x)).join(', ');

// ============ Lập kế hoạch từ mẫu ============
function SetupCard({ project, templates, onDone }: { project: SchedProject; templates: Template[]; onDone: () => void }) {
  const toast = useToast();
  const create = useCreatePlan();
  const today = todayIso();
  const [key, setKey] = useState(() => guessTemplate(project));
  const [start, setStart] = useState(() => (project.start_date && project.start_date >= addDays(today, -60) ? project.start_date : addDays(today, 1)));
  const [rest, setRest] = useState<RestDays>('sun');
  const [deadline, setDeadline] = useState(project.end_date ?? '');
  const tpl = templates.find((t) => t.key === key) ?? templates[0]!;
  const [skip, setSkip] = useState<Set<number>>(new Set());
  useEffect(() => setSkip(new Set()), [key]);
  const cal: Calendar = { restDays: rest, holidays: [] };
  const built = useMemo(() => (start ? buildFromTemplate(tpl.phases.filter((_, i) => !skip.has(i)), start, cal) : []), [tpl, skip, start, rest]); // eslint-disable-line react-hooks/exhaustive-deps
  const end = built.flatMap((p) => p.tasks.map((t) => t.end_date)).sort().at(-1);
  const submit = () => create.mutate(
    { projectId: project.id, startDate: start, deadline, restDays: rest, holidays: [], templateKey: tpl.key, phases: built },
    { onSuccess: () => { toast('Đã lập kế hoạch tiến độ'); onDone(); }, onError: (e) => toast(`Chưa lập được: ${e.message}`, 'error') },
  );
  return (
    <Card className="grid gap-4 p-4">
      <div>
        <b className="text-[15px]">Lập tiến độ cho {project.name}</b>
        <p className="m-0 text-[12.5px] text-muted">Chọn mẫu giai đoạn, ngày khởi công và lịch nghỉ — ngày kết thúc tính theo ngày làm việc. Sửa từng việc sau khi tạo.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Mẫu giai đoạn">
          <Select aria-label="Mẫu giai đoạn" value={key} onChange={(e) => setKey(e.target.value)}>
            {templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Ngày khởi công *"><Input type="date" aria-label="Ngày khởi công" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Lịch nghỉ">
          <Select aria-label="Lịch nghỉ" value={rest} onChange={(e) => setRest(e.target.value as RestDays)}>
            {(Object.keys(REST_DAYS) as RestDays[]).map((k) => <option key={k} value={k}>{REST_DAYS[k]}</option>)}
          </Select>
        </Field>
        <Field label="Hạn bàn giao (tùy chọn)"><Input type="date" aria-label="Hạn bàn giao" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
      </div>
      <div className="grid gap-1.5">
        {tpl.phases.map((p, i) => {
          const b = built.find((x) => x.name === p.name && !skip.has(i));
          const s = b?.tasks[0]?.start_date, e = b?.tasks.at(-1)?.end_date;
          return (
            <div key={`${p.name}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line-soft px-3 py-2">
              <Checkbox label={p.name} checked={!skip.has(i)} onChange={(v) => setSkip((x) => { const n = new Set(x); if (v) n.delete(i); else n.add(i); return n; })} />
              <span className="text-[12px] text-muted">{p.tasks.length} việc · {p.tasks.reduce((a, t) => a + (t.milestone ? 0 : t.days), 0)} ngày</span>
              <span className="num ml-auto text-[12px] text-faint">{s && e ? `${fmtDm(s)} → ${fmtDm(e)}` : '—'}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-muted">Dự kiến xong: <b className="num text-fg">{end ? fmtDmy(end) : '—'}</b>
          {deadline && end && end > deadline ? <> · <Pill tone="bad">quá hạn bàn giao</Pill></> : null}</span>
        <Button variant="primary" className="ml-auto" data-testid="td-create" disabled={create.isPending || !built.length} onClick={submit}>
          <Icon name="playlist_add" />{create.isPending ? 'Đang tạo…' : 'Tạo kế hoạch'}
        </Button>
      </div>
    </Card>
  );
}

// ============ Cài đặt kế hoạch ============
function PlanSettingsSheet({ plan, project, view, cal, onClose }: { plan: Plan; project: SchedProject; view: PlanView; cal: Calendar; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdatePlan(), del = useDeletePlan(), saveTpl = useSaveTemplate();
  const [start, setStart] = useState(plan.start_date);
  const [deadline, setDeadline] = useState(plan.deadline ?? '');
  const [rest, setRest] = useState<RestDays>(plan.rest_days);
  const [hol, setHol] = useState(holidaysText(plan.holidays ?? []));
  const [tplName, setTplName] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const save = () => update.mutate(
    { id: plan.id, patch: { start_date: start, deadline: deadline || null, rest_days: rest, holidays: parseHolidays(hol, Number(start.slice(0, 4))) } },
    { onSuccess: () => { toast('Đã lưu cài đặt tiến độ'); onClose(); }, onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error') },
  );
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }} title="Cài đặt tiến độ"
      footer={<><Button onClick={onClose}>Hủy</Button><Button variant="primary" disabled={update.isPending} onClick={save}><Icon name="save" />Lưu</Button></>}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày khởi công"><Input type="date" aria-label="Ngày khởi công" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Hạn bàn giao"><Input type="date" aria-label="Hạn bàn giao" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        </div>
        <Field label="Lịch nghỉ">
          <Select aria-label="Lịch nghỉ" value={rest} onChange={(e) => setRest(e.target.value as RestDays)}>
            {(Object.keys(REST_DAYS) as RestDays[]).map((k) => <option key={k} value={k}>{REST_DAYS[k]}</option>)}
          </Select>
        </Field>
        <Field label="Ngày nghỉ lễ / nghỉ riêng" hint="Ví dụ: 01/01, 30/04, 01/05/2027 — cách nhau bằng dấu phẩy">
          <Input aria-label="Ngày nghỉ lễ" value={hol} onChange={(e) => setHol(e.target.value)} />
        </Field>
        <Note>Đổi lịch nghỉ không dời ngày của việc đã có; số ngày làm việc và % kế hoạch tính lại theo lịch mới.</Note>

        <div className="mt-2 grid gap-2 border-t border-line pt-3">
          <b className="text-[13px]">Lưu kế hoạch này làm mẫu riêng</b>
          <div className="flex gap-2">
            <Input aria-label="Tên mẫu" placeholder="Ví dụ: Nhà phố 3 tầng" value={tplName} onChange={(e) => setTplName(e.target.value)} />
            <Button disabled={saveTpl.isPending} onClick={() => saveTpl.mutate({ name: tplName, projectKind: project.kind, phases: planToTemplate(view, cal) }, {
              onSuccess: () => { toast('Đã lưu mẫu — chọn được khi lập tiến độ công trình khác'); setTplName(''); },
              onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
            })}><Icon name="bookmark_add" />Lưu mẫu</Button>
          </div>
        </div>
        <div className="mt-2 border-t border-line pt-3">
          <Button variant="danger" onClick={() => setConfirmDel(true)}><Icon name="delete" />Xóa kế hoạch tiến độ</Button>
        </div>
      </div>
      <ConfirmDialog open={confirmDel} onOpenChange={setConfirmDel} danger title="Xóa kế hoạch tiến độ?" confirmLabel="Xóa" busy={del.isPending}
        message={`Xóa toàn bộ giai đoạn và việc của ${project.name}? Vào Thùng rác — khôi phục kế hoạch là về đủ.`}
        onConfirm={() => del.mutate(plan, { onSuccess: () => { toast('Đã xóa kế hoạch tiến độ'); setConfirmDel(false); onClose(); }, onError: (e) => toast(`Chưa xóa được: ${e.message}`, 'error') })} />
    </Sheet>
  );
}

// ============ Giai đoạn: đổi tên / xóa ============
function PhaseSheet({ phase, count, onClose }: { phase: Phase; count: number; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdatePhase(), del = useDeletePhase();
  const [name, setName] = useState(phase.name);
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }} title="Giai đoạn"
      footer={<>
        <Button variant="ghost-danger" className="mr-auto" onClick={() => setConfirmDel(true)}><Icon name="delete" />Xóa</Button>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="primary" disabled={update.isPending} onClick={() => update.mutate({ id: phase.id, patch: { name: name.trim() } }, { onSuccess: onClose, onError: (e) => toast(e.message, 'error') })}>Lưu</Button>
      </>}>
      <Field label="Tên giai đoạn"><Input aria-label="Tên giai đoạn" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <ConfirmDialog open={confirmDel} onOpenChange={setConfirmDel} danger title="Xóa giai đoạn?" confirmLabel="Xóa" busy={del.isPending}
        message={`Xóa "${phase.name}" cùng ${count} việc bên trong? Vào Thùng rác, khôi phục được.`}
        onConfirm={() => del.mutate(phase.id, { onSuccess: () => { toast('Đã xóa giai đoạn'); setConfirmDel(false); onClose(); }, onError: (e) => toast(e.message, 'error') })} />
    </Sheet>
  );
}

// ============ Báo cáo Zalo ============
function ZaloSheet({ text, onClose }: { text: string; onClose: () => void }) {
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast('Đã chép — dán vào Zalo'); } catch { toast('Không chép tự động được — bôi đen rồi chép tay.', 'error'); }
  };
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }} title="Báo cáo Zalo"
      footer={<><Button onClick={onClose}>Đóng</Button><Button variant="primary" onClick={copy}><Icon name="content_copy" />Chép</Button></>}>
      <textarea aria-label="Nội dung báo cáo" readOnly data-testid="td-zalo-text" value={text}
        className="h-[60vh] w-full rounded-[7px] border border-line bg-surface-2 p-3 font-[inherit] text-[13px] leading-relaxed text-fg" />
    </Sheet>
  );
}

// ============ Ô "+ Việc" / "+ Giai đoạn" gõ tên → Enter ============
function QuickAdd({ placeholder, label, onAdd, busy }: { placeholder: string; label: string; onAdd: (name: string) => Promise<unknown>; busy?: boolean }) {
  const [v, setV] = useState('');
  return (
    <input aria-label={label} placeholder={placeholder} value={v} disabled={busy} onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && v.trim()) { e.preventDefault(); void onAdd(v.trim()).then(() => setV('')).catch(() => undefined); }
        if (e.key === 'Escape') setV('');
      }}
      className="h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-[12.5px] text-fg placeholder:text-faint hover:border-line focus:border-line focus:bg-surface focus:outline-none" />
  );
}

// ============ Thanh việc kéo được: giữa = dời cả việc, mép trái = đổi ngày bắt đầu, mép phải = đổi ngày kết thúc ============
type DragMode = 'move' | 'start' | 'end';
function DragBar({ t, scale, editable, onOpen, onDates }: {
  t: TV; scale: ReturnType<typeof ganttScale>; editable: boolean; onOpen: () => void; onDates: (start: string, end: string) => void;
}) {
  const [drag, setDrag] = useState<{ mode: DragMode; x0: number; w: number; delta: number } | null>(null);
  const moved = useRef(false);
  const s0 = t.start_date!, e0 = t.end_date!;
  const shift = (mode: DragMode, d: number): [string, string] => {
    if (mode === 'move') return [addDays(s0, d), addDays(e0, d)];
    if (mode === 'start') { const st = addDays(s0, d); return [st > e0 ? e0 : st, e0]; }
    const en = addDays(e0, d); return [s0, en < s0 ? s0 : en];
  };
  const [s, e] = drag ? shift(drag.mode, drag.delta) : [s0, e0];
  const g = barGeometry(scale, s, e);
  const down = (mode: DragMode) => (ev: RPointerEvent<HTMLElement>) => {
    if (!editable || ev.button !== 0) return;
    ev.stopPropagation(); ev.preventDefault();
    const row = (ev.currentTarget.closest('.gr') as HTMLElement | null)?.getBoundingClientRect().width ?? 1;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    moved.current = false;
    setDrag({ mode, x0: ev.clientX, w: row, delta: 0 });
  };
  const move = (ev: RPointerEvent<HTMLElement>) => {
    if (!drag) return;
    const d = Math.round(((ev.clientX - drag.x0) / drag.w) * scale.total);
    if (Math.abs(ev.clientX - drag.x0) > 3) moved.current = true;
    if (d !== drag.delta) setDrag({ ...drag, delta: d });
  };
  const up = (ev: RPointerEvent<HTMLElement>) => {
    if (!drag) return;
    ev.stopPropagation();
    const [ns, ne] = shift(drag.mode, drag.delta);
    setDrag(null);
    if (!moved.current) { onOpen(); return; }
    if (ns !== s0 || ne !== e0) onDates(ns, ne);
  };
  const tip = `${t.name} · ${fmtDm(s)} → ${fmtDm(e)} (${daysBetween(s, e) + 1} ngày) · ${t.progress_pct}%`;
  const handlers = { onPointerMove: move, onPointerUp: up, onPointerCancel: () => setDrag(null) };
  if (t.kind === 'milestone') {
    return <div className={`gmile ${barClass(t)} ${editable ? 'cursor-grab' : 'cursor-pointer'}`} style={{ left: `${g.left + g.width / 2}%` }} title={tip}
      onPointerDown={down('move')} {...handlers} onClick={editable ? undefined : onOpen} />;
  }
  return (
    <div className={`gbar ${barClass(t)} ${editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${drag ? 'z-[3] shadow-md' : ''}`}
      style={{ left: `${g.left}%`, width: `${g.width}%` }} title={tip} data-testid="td-bar"
      onPointerDown={down('move')} {...handlers} onClick={editable ? undefined : onOpen}>
      <i style={{ width: `${t.progress_pct}%` }} />
      {editable ? <>
        <span className="gh-l" aria-hidden onPointerDown={down('start')} {...handlers} />
        <span className="gh-r" aria-hidden onPointerDown={down('end')} {...handlers} />
      </> : null}
      {drag ? <span className="gdrag-tip">{fmtDm(s)} → {fmtDm(e)}</span> : null}
    </div>
  );
}

// ============ Bảng việc + Gantt (máy tính / máy tính bảng) ============
function GanttBoard({ view, today, deadline, filter, query, canEdit, canEditTask, onOpenTask, onOpenPhase, onQuickAdd, onAddPhase, onSetPct, onSetDates }: {
  view: PlanView<Task>; today: string; deadline: string | null; filter: QuickFilter; query: string; canEdit: boolean; canEditTask: (t: Task) => boolean;
  onOpenTask: (t: Task) => void; onOpenPhase: (p: Phase) => void; onQuickAdd: (phaseId: string, name: string) => Promise<unknown>;
  onAddPhase: (name: string) => Promise<unknown>; onSetPct: (t: Task, pct: number) => void; onSetDates: (t: Task, start: string, end: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const scale = useMemo(() => ganttScale([...view.tasks.flatMap((t) => [t.start_date, t.end_date]), deadline], today), [view, today, deadline]);
  const match = (t: TV) => (filter === 'all' || (filter === 'late' && t.late) || (filter === 'behind' && t.behind) || (filter === 'doing' && t.status === 'doing'))
    && matchesSearch(query, t.name, t.assignee);
  const narrow = filter !== 'all' || !!query.trim();
  const weekStep = Math.max(1, Math.ceil(scale.weeks.length / 14)); // kế hoạch dài: ghi nhãn cách 2–3 tuần cho khỏi chồng chữ
  const L: ReactNode[] = [], R: ReactNode[] = [];
  const cols = 'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_80px_42px_42px_52px] items-center gap-2';

  const groups = [...view.phases, ...(view.loose.length ? [{ id: '', name: '(Chưa có giai đoạn)', position: 999, tasks: view.loose, start: null, end: null, pct: 0, plannedPct: 0, lateCount: 0, project_id: '', created_by: null }] : [])];
  for (const p of groups) {
    const list = p.tasks.filter(match);
    if (narrow && !list.length) continue;
    const open = !collapsed.has(p.id) || narrow;
    L.push(
      <div key={`l-${p.id}`} className="gl phase">
        <button type="button" aria-label={open ? `Thu gọn ${p.name}` : `Mở ${p.name}`} className="text-muted" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}>
          <Icon name={open ? 'expand_more' : 'chevron_right'} />
        </button>
        {canEdit && p.id ? <button type="button" className="min-w-0 truncate text-left hover:underline" onClick={() => onOpenPhase(p as Phase)}>{p.name}</button> : <span className="min-w-0 truncate">{p.name}</span>}
        <span className="shrink-0 text-[11.5px] font-normal text-faint">{p.tasks.length} việc{p.lateCount ? ` · ${p.lateCount} trễ` : ''}</span>
        <span className="num ml-auto shrink-0 font-medium text-muted">{p.pct}%</span>
      </div>,
    );
    const pg = p.start && p.end ? barGeometry(scale, p.start, p.end) : null;
    R.push(<div key={`r-${p.id}`} className="gr phase">{pg ? <div className="gbar ph" style={{ left: `${pg.left}%`, width: `${pg.width}%` }}><i style={{ width: `${p.pct}%` }} /></div> : null}</div>);
    if (!open) continue;
    for (const t of list) {
      const editable = canEditTask(t);
      L.push(
        <div key={`l-${t.id}`} className="gl" style={{ paddingLeft: 30 }} data-testid="td-row">
          <div className={cols}>
            <button type="button" className="flex min-w-0 items-center gap-1.5 text-left" title={t.name} onClick={() => onOpenTask(t)}>
              {t.kind === 'milestone' ? <span className="text-accent">◆</span> : null}
              <span className="min-w-[96px] truncate hover:underline">{t.name}</span>
              {t.late || t.behind ? <span className="shrink-0"><TaskPill t={t} /></span> : null}
            </button>
            <span className="truncate text-[12px] text-muted">{t.assignee ?? ''}</span>
            <span className="num text-[12px] text-muted">{fmtDm(t.start_date)}</span>
            <span className="num text-[12px] text-muted">{fmtDm(t.end_date)}</span>
            {editable ? (
              <select aria-label={`% xong ${t.name}`} value={String(t.progress_pct)} onChange={(e) => onSetPct(t, Number(e.target.value))}
                className="num h-7 cursor-pointer rounded-md border border-transparent bg-transparent pr-0 text-right text-[12.5px] font-semibold hover:border-line">
                {[...new Set([0, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100, t.progress_pct])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}%</option>)}
              </select>
            ) : <span className="num text-right text-[12.5px] font-semibold">{t.progress_pct}%</span>}
          </div>
        </div>,
      );
      const bar = t.start_date && t.end_date
        ? <DragBar t={t} scale={scale} editable={editable} onOpen={() => onOpenTask(t)} onDates={(st, en) => onSetDates(t, st, en)} />
        : null;
      R.push(<div key={`r-${t.id}`} className="gr" data-testid="td-bar-row">{bar}</div>);
    }
    if (canEdit && p.id && !narrow) {
      L.push(<div key={`la-${p.id}`} className="gl" style={{ paddingLeft: 30 }}><QuickAdd label={`Thêm việc vào ${p.name}`} placeholder="+ Việc (gõ tên rồi Enter)" onAdd={(n) => onQuickAdd(p.id, n)} /></div>);
      R.push(<div key={`ra-${p.id}`} className="gr" />);
    }
  }
  if (canEdit && !narrow) {
    L.push(<div key="l-addphase" className="gl"><QuickAdd label="Thêm giai đoạn" placeholder="+ Thêm giai đoạn (gõ tên rồi Enter)" onAdd={onAddPhase} /></div>);
    R.push(<div key="r-addphase" className="gr" />);
  }

  return (
    <Card className="overflow-hidden">
      <div className="tbl">
        <div className="gantt" data-testid="td-gantt">
          <div className="gh"><span className="flex-1">Giai đoạn / công việc</span><span className="w-[80px]">Phụ trách</span><span className="w-[42px]">Bắt đầu</span><span className="w-[42px]">Kết thúc</span><span className="w-[52px] text-right">% xong</span></div>
          <div className="gweeks">{scale.weeks.map((w, i) => <span key={w.iso} style={{ left: `${w.left}%` }}>{i % weekStep === 0 ? w.label : ''}</span>)}</div>
          <div>{L}</div>
          <div className="relative">
            {R}
            {today >= scale.from && today <= scale.to ? <div className="today" data-testid="td-today" style={{ left: `${scale.pos(today)}%` }} /> : null}
          </div>
        </div>
      </div>
      {!L.length ? <p className="m-0 p-4 text-[13px] text-muted">Không có việc nào khớp bộ lọc.</p> : null}
      <div className="flex flex-wrap gap-3 border-t border-line-soft px-3 py-2 text-[11.5px] text-muted">
        <span><i className="mr-1 inline-block h-2.5 w-4 rounded-sm bg-accent align-middle" />Đang làm / chưa làm</span>
        <span><i className="mr-1 inline-block h-2.5 w-4 rounded-sm bg-good align-middle" />Xong</span>
        <span><i className="mr-1 inline-block h-2.5 w-4 rounded-sm bg-warn align-middle" />Chậm so với kế hoạch</span>
        <span><i className="mr-1 inline-block h-2.5 w-4 rounded-sm bg-bad align-middle" />Trễ (quá ngày kết thúc)</span>
        <span><span className="mr-1 text-accent">◆</span>Mốc</span>
      </div>
    </Card>
  );
}

// ============ Điện thoại (MP.tiendo) ============
function PhoneList({ view, filter, onOpenTask }: { view: PlanView<Task>; filter: QuickFilter; onOpenTask: (t: Task) => void }) {
  const match = (t: TV) => filter === 'all' || (filter === 'late' && t.late) || (filter === 'behind' && t.behind) || (filter === 'doing' && t.status === 'doing');
  const groups = [...view.phases, ...(view.loose.length ? [{ id: '', name: '(Chưa có giai đoạn)', tasks: view.loose, pct: 0 }] : [])];
  return (
    <div className="grid gap-3">
      {groups.map((p) => {
        const list = p.tasks.filter(match);
        if (!list.length) return null;
        return (
          <div key={p.id} className="grid gap-2">
            <div className="flex items-center justify-between px-1 text-[12.5px] font-bold"><span>{p.name}</span><span className="num text-muted">{p.pct}%</span></div>
            {list.map((t) => (
              <MobileCard key={t.id} onClick={() => onOpenTask(t)}>
                <MobileRow><b className="min-w-0 truncate">{t.kind === 'milestone' ? '◆ ' : ''}{t.name}</b><TaskPill t={t} /></MobileRow>
                <HBar percent={t.progress_pct} tone={t.late ? 'bad' : t.status === 'done' ? 'good' : 'accent'} />
                <MobileRow meta><span>{t.start_date ? `${fmtDm(t.start_date)} → ${fmtDm(t.end_date)}` : 'Chưa có lịch'}{t.assignee ? ` · ${t.assignee}` : ''}</span><span className="num">{t.progress_pct}%</span></MobileRow>
              </MobileCard>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ============ Trang ============
export function SchedulePage() {
  const access = useAccess();
  const mode = useLayoutMode();
  const toast = useToast();
  const q = useSchedData();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<QuickFilter>('all');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<TaskSheetTarget | null>(null);
  const [phaseSheet, setPhaseSheet] = useState<Phase | null>(null);
  const [settings, setSettings] = useState(false);
  const [zalo, setZalo] = useState(false);
  const addTask = useAddTask(), addPhase = useAddPhase(), setProgress = useSetProgress(), updateTask = useUpdateTask();
  const canEdit = hasLevel(access.permissions, 'schedule', 'add');
  const canEditTask = (t: Task) => canEditRow(access, 'schedule', t.created_by);
  const today = todayIso();

  const data = q.data;
  const projectId = useMemo(() => {
    if (!data) return '';
    const ok = (id: string) => data.projects.some((p) => p.id === id);
    const fromUrl = params.get('project') ?? '';
    if (ok(fromUrl)) return fromUrl;
    const saved = lsGet();
    if (ok(saved)) return saved;
    const planned = data.projects.find((p) => p.status !== 'closed' && data.plans.some((x) => x.project_id === p.id));
    return planned?.id ?? data.projects.find((p) => p.status === 'active')?.id ?? data.projects[0]?.id ?? '';
  }, [data, params]);
  const choose = (id: string) => { lsSet(id); setParams((sp) => { const n = new URLSearchParams(sp); n.set('project', id); return n; }, { replace: true }); };

  const header = (extra?: ReactNode) => (
    <PageHeader title="Tiến Độ" sub="Tính năng phụ: theo dõi kế hoạch thi công" actions={extra} />
  );
  if (q.isLoading) return <div className="grid gap-4">{header()}<LoadingState /></div>;
  if (q.error || !data) return <div className="grid gap-4">{header()}<ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  if (!data.projects.length) return <div className="grid gap-4">{header()}<EmptyState icon="view_timeline" title="Chưa có công trình nào">Thêm công trình ở tab Công Trình trước.</EmptyState></div>;

  return <ProjectSchedule key={projectId} {...{ data, projectId, choose, mode, filter, setFilter, query, setQuery, sheet, setSheet, phaseSheet, setPhaseSheet, settings, setSettings, zalo, setZalo, canEdit, canEditTask, today, header, addTask, addPhase, setProgress, updateTask, toast }} />;
}

function ProjectSchedule(props: {
  data: SchedData; projectId: string; choose: (id: string) => void; mode: ReturnType<typeof useLayoutMode>;
  filter: QuickFilter; setFilter: (f: QuickFilter) => void; query: string; setQuery: (v: string) => void;
  sheet: TaskSheetTarget | null; setSheet: (s: TaskSheetTarget | null) => void; phaseSheet: Phase | null; setPhaseSheet: (p: Phase | null) => void;
  settings: boolean; setSettings: (v: boolean) => void; zalo: boolean; setZalo: (v: boolean) => void;
  canEdit: boolean; canEditTask: (t: Task) => boolean; today: string; header: (extra?: ReactNode) => ReactNode;
  addTask: ReturnType<typeof useAddTask>; addPhase: ReturnType<typeof useAddPhase>; setProgress: ReturnType<typeof useSetProgress>; updateTask: ReturnType<typeof useUpdateTask>; toast: ReturnType<typeof useToast>;
}) {
  const { data, projectId, choose, mode, filter, setFilter, query, setQuery, sheet, setSheet, phaseSheet, setPhaseSheet, settings, setSettings, zalo, setZalo, canEdit, canEditTask, today, header, addTask, addPhase, setProgress, updateTask, toast } = props;
  const project = data.projects.find((p) => p.id === projectId)!;
  const { plan, phases, tasks } = projectSchedule(data, projectId);
  const cal = plan ? calendarOf(plan) : { restDays: 'sun' as const, holidays: [] };
  const view = useMemo(() => planView(phases, tasks, cal, today, plan?.deadline), [phases, tasks, plan, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const templates = [...DEFAULT_TEMPLATES, ...data.customTemplates];
  const phone = mode === 'phone';

  const projectOpts = data.projects.filter((p) => p.status !== 'closed' || p.id === projectId || data.plans.some((x) => x.project_id === p.id))
    .map((p) => ({ value: p.id, label: `${p.name}${data.plans.some((x) => x.project_id === p.id) ? '' : ' · chưa lập'}` }));
  const actions = plan ? <>
    <Button onClick={() => setZalo(true)} data-testid="td-zalo"><Icon name="chat" />Báo cáo Zalo</Button>
    {canEdit ? <Button onClick={() => setSettings(true)} aria-label="Cài đặt tiến độ"><Icon name="tune" />{phone ? null : 'Cài đặt'}</Button> : null}
    {canEdit && !phone ? <Button variant="primary" onClick={() => setSheet({ newIn: null })}><Icon name="add" />Thêm việc</Button> : null}
  </> : null;

  const quickAdd = (phaseId: string, name: string) => {
    const start = nextStartFor(tasks.filter((t) => t.phase_id === phaseId), tasks, plan!.start_date, cal);
    return addTask.mutateAsync({
      projectId, phase_id: phaseId, name, kind: 'task', status: 'todo', progress_pct: 0, start_date: start, end_date: nextWorkDay(start, cal),
      assignee: null, depends_on: [], blocker: null, note: null, position: Math.max(-1, ...tasks.filter((t) => t.phase_id === phaseId).map((t) => t.position)) + 1,
    }).catch((e: Error) => { toast(`Chưa thêm được: ${e.message}`, 'error'); throw e; });
  };
  const quickPhase = (name: string) => addPhase.mutateAsync({ projectId, name, position: Math.max(-1, ...phases.map((p) => p.position)) + 1 })
    .catch((e: Error) => { toast(`Chưa thêm được: ${e.message}`, 'error'); throw e; });
  const setPct = (t: Task, pct: number) => setProgress.set(t, pct, { onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error') });

  const setDates = (t: Task, start: string, end: string) => updateTask.mutate({ task: t, patch: { start_date: start, end_date: end } }, {
    onSuccess: () => toast(`${t.name}: ${fmtDm(start)} → ${fmtDm(end)}`),
    onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
  });
  const counts = { all: view.tasks.length, late: view.lateCount, behind: view.behindCount, doing: view.doingCount };
  const filterOpts = [
    { value: 'all' as const, label: `Tất cả ${counts.all}` }, { value: 'late' as const, label: `Trễ ${counts.late}` },
    { value: 'behind' as const, label: `Chậm ${counts.behind}` }, { value: 'doing' as const, label: `Đang làm ${counts.doing}` },
  ];
  const gap = view.pct - view.plannedPct;

  return (
    <div className="grid min-w-0 gap-4">
      {header(actions)}
      <FilterBar>
        <FilterSelect label="Công trình" value={projectId} onChange={choose} options={projectOpts} allLabel={null} className="max-w-full" selectClassName="sm:max-w-[400px]" />
        {plan ? <span className="text-[12px] text-muted">Mẫu: {templates.find((t) => t.key === plan.template_key)?.label ?? 'tự lập'} · {REST_DAYS[plan.rest_days]}</span> : null}
      </FilterBar>

      {!plan ? (
        canEdit ? <SetupCard project={project} templates={templates} onDone={() => undefined} />
          : <EmptyState icon="view_timeline" title="Công trình này chưa có kế hoạch tiến độ">Người có quyền Nhập ở mục Tiến độ lập kế hoạch từ mẫu giai đoạn.</EmptyState>
      ) : (
        <>
          {phone ? (
            <PhoneKpis items={[
              { label: 'Tiến độ', value: <span data-testid="td-kpi-pct">{view.pct}%</span> },
              { label: 'Việc trễ', value: view.lateCount, tone: view.lateCount ? 'neg' : '' },
              { label: gap >= 0 ? 'Đúng kế hoạch' : `Chậm ${-gap}% so với kế hoạch`, value: view.end ? `Xong ${fmtDmy(view.end)}` : '—', wide: true },
            ]} />
          ) : (
            <KpiStrip items={[
              { label: 'Tiến độ thực tế', value: <span data-testid="td-kpi-pct">{view.pct}%</span>, sub: `kế hoạch hôm nay ${view.plannedPct}%`, tone: gap < 0 ? 'neg' : 'pos' },
              { label: 'Việc trễ', value: view.lateCount, sub: view.behindCount ? `${view.behindCount} việc chậm` : 'không có việc chậm', tone: view.lateCount ? 'neg' : '' },
              { label: 'Đang làm', value: view.doingCount, sub: `${view.doneCount}/${view.tasks.length} việc xong` },
              { label: 'Khởi công', value: fmtDmy(plan.start_date), sub: REST_DAYS[plan.rest_days] },
              { label: 'Dự kiến xong', value: view.end ? fmtDmy(view.end) : '—', sub: plan.deadline ? `hạn ${fmtDmy(plan.deadline)}${view.onDeadline === false ? ' · trễ hạn' : ''}` : 'chưa đặt hạn bàn giao', tone: view.onDeadline === false ? 'neg' : '' },
            ]} />
          )}
          <FilterBar>
            <Segmented value={filter} onChange={setFilter} options={filterOpts} />
            {!phone ? <SearchBox value={query} onChange={setQuery} placeholder="Tìm việc, người phụ trách…" /> : null}
          </FilterBar>
          {!view.tasks.length && !phases.length ? <Note>Kế hoạch chưa có giai đoạn nào — gõ tên ở dòng "+ Thêm giai đoạn".</Note> : null}
          {phone ? (
            <>
              <PhoneList view={view} filter={filter} onOpenTask={(t) => setSheet({ task: t })} />
              {canEdit ? <Button variant="primary" size="lg" className="w-full" onClick={() => setSheet({ newIn: null })}><Icon name="add" />THÊM VIỆC</Button> : null}
            </>
          ) : (
            <GanttBoard view={view} today={today} deadline={plan.deadline} filter={filter} query={query} canEdit={canEdit} canEditTask={canEditTask}
              onOpenTask={(t) => setSheet({ task: t })} onOpenPhase={setPhaseSheet} onQuickAdd={quickAdd} onAddPhase={quickPhase} onSetPct={setPct} onSetDates={setDates} />
          )}
        </>
      )}

      {sheet && plan ? (
        <TaskSheet target={sheet} projectId={projectId} planStart={plan.start_date} cal={cal} phases={[...phases].sort((a, b) => a.position - b.position)} tasks={tasks}
          people={data.people} canEdit={canEdit} canEditTask={canEditTask} onClose={() => setSheet(null)} />
      ) : null}
      {phaseSheet ? <PhaseSheet phase={phaseSheet} count={tasks.filter((t) => t.phase_id === phaseSheet.id).length} onClose={() => setPhaseSheet(null)} /> : null}
      {settings && plan ? <PlanSettingsSheet plan={plan} project={project} view={view} cal={cal} onClose={() => setSettings(false)} /> : null}
      {zalo ? <ZaloSheet text={zaloReport(project.name, view, today, plan?.deadline)} onClose={() => setZalo(false)} /> : null}
    </div>
  );
}
