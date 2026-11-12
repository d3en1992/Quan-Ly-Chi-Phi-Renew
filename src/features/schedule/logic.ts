// Tiến Độ Thi Công — hàm thuần (có test ở logic.test.ts). Không đụng tiền.
// Ngày luôn là chuỗi 'YYYY-MM-DD' (ngày địa phương), tính bằng UTC để không lệch múi giờ.
// "Trễ" và "Chậm" là trạng thái TÍNH RA, không lưu trong kho:
//   • Trễ n ngày = đã qua ngày kết thúc mà chưa xong (n = số ngày làm việc từ sau ngày kết thúc tới hôm nay).
//   • Chậm = đang trong thời gian làm nhưng % thực tế thấp hơn % kế hoạch hôm nay từ BEHIND_GAP điểm trở lên.

export type RestDays = 'sun' | 'sat_sun' | 'none';
export type Calendar = { restDays: RestDays; holidays: string[] };
export type TaskKind = 'task' | 'milestone';
export type TaskStatus = 'todo' | 'doing' | 'paused' | 'done';

export const REST_DAYS: Record<RestDays, string> = { sun: 'Nghỉ Chủ nhật', sat_sun: 'Nghỉ Thứ 7 và Chủ nhật', none: 'Làm cả tuần' };
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'Chưa làm', doing: 'Đang làm', paused: 'Tạm dừng', done: 'Xong' };
/** Chênh % kế hoạch − % thực tế từ mức này trở lên thì báo "Chậm" */
export const BEHIND_GAP = 20;

// ============ Ngày ============
const toUtc = (iso: string) => { const [y, m, d] = iso.split('-').map(Number) as [number, number, number]; return Date.UTC(y, m - 1, d); };
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);
const DAY = 86_400_000;
export const addDays = (iso: string, n: number) => fromUtc(toUtc(iso) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY);
export const weekday = (iso: string) => new Date(toUtc(iso)).getUTCDay(); // 0 = CN
export const fmtDm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
export const fmtDmy = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const minIso = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort()[0] ?? null;
export const maxIso = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;

// ============ Lịch làm việc ============
export function isOff(iso: string, cal: Calendar): boolean {
  const w = weekday(iso);
  if (cal.restDays === 'sun' && w === 0) return true;
  if (cal.restDays === 'sat_sun' && (w === 0 || w === 6)) return true;
  return cal.holidays.includes(iso);
}
/** Ngày làm việc gần nhất từ ngày này trở đi */
export function nextWorkDay(iso: string, cal: Calendar): string {
  let d = iso;
  for (let i = 0; i < 400 && isOff(d, cal); i++) d = addDays(d, 1);
  return d;
}
/** Số ngày làm việc trong khoảng [a, b] (tính cả 2 đầu); b < a → 0 */
export function workDays(a: string, b: string, cal: Calendar): number {
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) if (!isOff(d, cal)) n++;
  return n;
}
/** Ngày kết thúc của việc bắt đầu `start` dài `days` ngày làm việc (≥ 1) */
export function endFromDuration(start: string, days: number, cal: Calendar): string {
  let d = nextWorkDay(start, cal);
  for (let left = Math.max(1, Math.round(days)) - 1; left > 0; left--) d = nextWorkDay(addDays(d, 1), cal);
  return d;
}

// ============ Việc / giai đoạn / công trình ============
export type TaskInput = {
  id: string; phase_id: string | null; name: string; kind: TaskKind; status: TaskStatus; progress_pct: number;
  start_date: string | null; end_date: string | null; position: number;
};
export type PhaseInput = { id: string; name: string; position: number };

export type TaskView<T extends TaskInput = TaskInput> = T & {
  /** số ngày làm việc (mốc = 0); chưa có lịch = null */
  days: number | null;
  /** % kế hoạch tới đầu ngày hôm nay; chưa có lịch = null */
  plannedPct: number | null;
  lateDays: number;
  late: boolean;
  behind: boolean;
};

/** Số ngày làm việc của việc (mốc = 0) */
export function taskDays(t: Pick<TaskInput, 'kind' | 'start_date' | 'end_date'>, cal: Calendar): number | null {
  if (!t.start_date || !t.end_date) return null;
  if (t.kind === 'milestone') return 0;
  return Math.max(1, workDays(t.start_date, t.end_date, cal));
}

export function taskView<T extends TaskInput>(t: T, cal: Calendar, today: string): TaskView<T> {
  const days = taskDays(t, cal);
  const done = t.status === 'done' || t.progress_pct >= 100;
  let plannedPct: number | null = null;
  if (t.start_date && t.end_date && days !== null) {
    if (today > t.end_date) plannedPct = 100;
    else if (today <= t.start_date || days === 0) plannedPct = 0;
    else plannedPct = Math.min(100, Math.round((workDays(t.start_date, addDays(today, -1), cal) / days) * 100));
  }
  const late = !done && !!t.end_date && today > t.end_date;
  const lateDays = late ? Math.max(1, workDays(addDays(t.end_date!, 1), today, cal)) : 0;
  const behind = !late && !done && t.status !== 'paused' && plannedPct !== null && plannedPct - t.progress_pct >= BEHIND_GAP;
  return { ...t, days, plannedPct, late, lateDays, behind };
}

/** % bình quân theo số ngày (mốc nặng 0; toàn mốc / chưa có lịch thì bình quân thường) */
function weightedPct(items: { pct: number; days: number | null }[]): number {
  if (!items.length) return 0;
  const w = items.reduce((s, x) => s + (x.days ?? 0), 0);
  if (w <= 0) return Math.round(items.reduce((s, x) => s + x.pct, 0) / items.length);
  return Math.round(items.reduce((s, x) => s + x.pct * (x.days ?? 0), 0) / w);
}

export type PhaseView<T extends TaskInput = TaskInput> = PhaseInput & {
  tasks: TaskView<T>[]; start: string | null; end: string | null; pct: number; plannedPct: number; lateCount: number;
};
export type PlanView<T extends TaskInput = TaskInput> = {
  phases: PhaseView<T>[];
  /** việc không thuộc giai đoạn nào (giai đoạn đã xóa) */
  loose: TaskView<T>[];
  tasks: TaskView<T>[];
  start: string | null; end: string | null;
  pct: number; plannedPct: number;
  lateCount: number; behindCount: number; doingCount: number; pausedCount: number; doneCount: number;
  /** đang theo hạn bàn giao: true = kế hoạch xong trước / đúng hạn; null = không có hạn */
  onDeadline: boolean | null;
};

export function planView<T extends TaskInput>(phases: PhaseInput[], tasks: T[], cal: Calendar, today: string, deadline?: string | null): PlanView<T> {
  const views = tasks.map((t) => taskView(t, cal, today)).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'vi'));
  const ids = new Set(phases.map((p) => p.id));
  const sumUp = (list: TaskView<T>[]) => ({
    start: minIso(list.map((t) => t.start_date)), end: maxIso(list.map((t) => t.end_date)),
    pct: weightedPct(list.map((t) => ({ pct: t.status === 'done' ? 100 : t.progress_pct, days: t.days }))),
    plannedPct: weightedPct(list.filter((t) => t.plannedPct !== null).map((t) => ({ pct: t.plannedPct!, days: t.days }))),
    lateCount: list.filter((t) => t.late).length,
  });
  const phaseViews = [...phases].sort((a, b) => a.position - b.position).map((p) => {
    const list = views.filter((t) => t.phase_id === p.id);
    return { ...p, tasks: list, ...sumUp(list) };
  });
  const all = sumUp(views);
  return {
    phases: phaseViews,
    loose: views.filter((t) => !t.phase_id || !ids.has(t.phase_id)),
    tasks: views,
    ...all,
    behindCount: views.filter((t) => t.behind).length,
    doingCount: views.filter((t) => t.status === 'doing').length,
    pausedCount: views.filter((t) => t.status === 'paused').length,
    doneCount: views.filter((t) => t.status === 'done').length,
    onDeadline: deadline && all.end ? all.end <= deadline : null,
  };
}

/** Đặt % → trạng thái tự đổi (0 chưa làm, 1–99 đang làm, 100 xong); "Tạm dừng" giữ nguyên trừ khi = 100 */
export function statusForProgress(pct: number, current: TaskStatus): TaskStatus {
  if (pct >= 100) return 'done';
  if (current === 'paused') return 'paused';
  return pct <= 0 ? 'todo' : 'doing';
}
/** Đổi trạng thái → % đi theo cho khớp (Xong = 100; bỏ Xong mà đang 100 thì về 90) */
export function progressForStatus(status: TaskStatus, pct: number): number {
  if (status === 'done') return 100;
  if (status === 'todo') return 0;
  if (pct >= 100) return 90;
  return pct;
}
export const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

// ============ Mẫu giai đoạn mặc định (PLAN_TIEN_DO_THI_CONG.md của app cũ) ============
export type TemplateTask = { name: string; days: number; milestone?: boolean };
export type TemplatePhase = { name: string; tasks: TemplateTask[] };
export type Template = { key: string; label: string; phases: TemplatePhase[]; custom?: boolean };

const t = (name: string, days: number): TemplateTask => ({ name, days });
const m = (name: string): TemplateTask => ({ name, days: 0, milestone: true });

export const DEFAULT_TEMPLATES: Template[] = [
  {
    key: 'new_build', label: 'Xây mới', phases: [
      { name: 'Chuẩn bị & móng', tasks: [t('Dọn mặt bằng, định vị', 2), t('Ép / khoan cọc', 4), t('Đào đất, đập đầu cọc', 3), t('Bê tông lót, cốp pha, thép móng – đà kiềng', 5), t('Đổ bê tông móng', 1), m('Nghiệm thu móng')] },
      { name: 'Phần thô', tasks: [t('Cột – dầm – sàn tầng trệt', 10), t('Các tầng tiếp theo (mỗi tầng)', 10), t('Mái', 7), t('Xây tô tường', 15), m('Nghiệm thu phần thô')] },
      { name: 'Điện nước (MEP)', tasks: [t('Đi ống âm tường – sàn', 7), t('Chống thấm WC – sân thượng', 4), t('Cấp thoát nước', 5), m('Thử áp, thử nước')] },
      { name: 'Hoàn thiện', tasks: [t('Trần thạch cao', 7), t('Ốp lát', 12), t('Bả sơn', 12), t('Cửa, lan can', 5), t('Lắp thiết bị điện nước', 4)] },
      { name: 'Bàn giao', tasks: [t('Vệ sinh', 2), t('Sửa lỗi tồn tại', 3), m('Nghiệm thu bàn giao')] },
    ],
  },
  {
    key: 'renovation', label: 'Sửa chữa / cải tạo', phases: [
      { name: 'Khảo sát & chuẩn bị', tasks: [t('Khảo sát hiện trạng', 1), t('Chốt phương án – vật liệu', 2), t('Che chắn', 1)] },
      { name: 'Tháo dỡ', tasks: [t('Đục phá, tháo dỡ', 4), t('Vận chuyển xà bần', 1)] },
      { name: 'Thi công', tasks: [t('Kết cấu / xây sửa', 7), t('Điện nước', 5), t('Chống thấm', 3)] },
      { name: 'Hoàn thiện', tasks: [t('Ốp lát', 6), t('Trần', 4), t('Bả sơn', 6)] },
      { name: 'Bàn giao', tasks: [t('Vệ sinh', 1), m('Nghiệm thu bàn giao')] },
    ],
  },
  {
    key: 'paint', label: 'Sơn & chống thấm', phases: [
      { name: 'Sơn & chống thấm', tasks: [t('Chuẩn bị bề mặt', 3), t('Chống thấm', 3), { name: 'Ngâm nước thử', days: 2, milestone: true }, t('Bả', 3), t('Sơn lót + phủ', 4), m('Nghiệm thu')] },
    ],
  },
  { key: 'free', label: 'Tự do', phases: [{ name: 'Thi công', tasks: [] }] },
];

/** Gợi ý mẫu theo loại công trình (CT → Xây mới, SC → Sửa chữa; hạng mục có "sơn" / "chống thấm" → Sơn & chống thấm; còn lại Tự do) */
export function guessTemplate(p: { kind: string | null; name: string; scope_note?: string | null }): string {
  const text = `${p.scope_note ?? ''} ${p.name}`.normalize('NFC').toLowerCase();
  if (/sơn|chống thấm/.test(text) && p.kind !== 'new_build') return 'paint';
  if (p.kind === 'new_build') return 'new_build';
  if (p.kind === 'renovation') return 'renovation';
  return 'free';
}

export type BuiltTask = { name: string; kind: TaskKind; start_date: string; end_date: string; position: number };
export type BuiltPhase = { name: string; position: number; tasks: BuiltTask[] };

/**
 * Dựng lịch từ mẫu: các việc nối tiếp nhau theo ngày làm việc, bắt đầu từ ngày khởi công.
 * Mốc ◆ đặt vào ngày kết thúc của việc ngay trước nó (mốc "Ngâm nước thử 2 ngày" chiếm 2 ngày như một việc rồi thành mốc ở ngày cuối).
 */
export function buildFromTemplate(phases: TemplatePhase[], start: string, cal: Calendar): BuiltPhase[] {
  let cursor = nextWorkDay(start, cal);
  let lastEnd: string | null = null;
  return phases.map((p, pi) => ({
    name: p.name, position: pi,
    tasks: p.tasks.map((tk, ti) => {
      if (tk.milestone) {
        let d = lastEnd ?? cursor;
        if (tk.days > 0) { d = endFromDuration(cursor, tk.days, cal); cursor = nextWorkDay(addDays(d, 1), cal); lastEnd = d; }
        return { name: tk.name, kind: 'milestone' as const, start_date: d, end_date: d, position: ti };
      }
      const s = nextWorkDay(cursor, cal);
      const e = endFromDuration(s, tk.days, cal);
      cursor = nextWorkDay(addDays(e, 1), cal);
      lastEnd = e;
      return { name: tk.name, kind: 'task' as const, start_date: s, end_date: e, position: ti };
    }),
  }));
}

/** Ngày bắt đầu cho việc mới thêm cuối giai đoạn: sau việc cuối của giai đoạn, không có thì sau việc cuối cả kế hoạch / ngày khởi công */
export function nextStartFor(phaseTasks: Pick<TaskInput, 'end_date'>[], allTasks: Pick<TaskInput, 'end_date'>[], planStart: string, cal: Calendar): string {
  const last = maxIso(phaseTasks.map((x) => x.end_date)) ?? maxIso(allTasks.map((x) => x.end_date));
  return last ? nextWorkDay(addDays(last, 1), cal) : nextWorkDay(planStart, cal);
}

/** Kế hoạch hiện tại → dữ liệu mẫu (để "Lưu làm mẫu riêng") */
export function planToTemplate(view: PlanView, cal: Calendar): TemplatePhase[] {
  return view.phases.map((p) => ({
    name: p.name,
    tasks: p.tasks.map((x) => (x.kind === 'milestone' ? { name: x.name, days: 0, milestone: true } : { name: x.name, days: x.days ?? taskDays(x, cal) ?? 1 })),
  }));
}

// ============ Gantt ============
export type GanttScale = { from: string; to: string; total: number; pos: (iso: string) => number; weeks: { iso: string; label: string; left: number }[] };

/** Khung Gantt: từ thứ Hai của tuần đầu tới hết tuần cuối (gồm hôm nay và hạn bàn giao nếu gần) */
export function ganttScale(dates: (string | null | undefined)[], today: string): GanttScale {
  const lo = minIso([...dates, today])!, hi = maxIso([...dates, today])!;
  const from = addDays(lo, -((weekday(lo) + 6) % 7));        // lùi về thứ Hai
  const to = addDays(hi, 6 - ((weekday(hi) + 6) % 7));       // tới Chủ nhật
  const total = daysBetween(from, to) + 1;
  const pos = (iso: string) => (daysBetween(from, iso) / total) * 100;
  const weeks: GanttScale['weeks'] = [];
  for (let d = from; d <= to; d = addDays(d, 7)) weeks.push({ iso: d, label: fmtDm(d), left: pos(d) });
  return { from, to, total, pos, weeks };
}
/** Vị trí + bề rộng (%) của thanh việc trên Gantt (gồm cả ngày cuối) */
export function barGeometry(s: GanttScale, start: string, end: string): { left: number; width: number } {
  const left = s.pos(start);
  return { left, width: Math.max(0.6, s.pos(addDays(end, 1)) - left) };
}

// ============ Báo cáo chữ gửi Zalo ============
export function zaloReport(projectName: string, view: PlanView, today: string, deadline?: string | null): string {
  const L: string[] = [];
  L.push(`📋 BÁO CÁO TIẾN ĐỘ — ${projectName}`);
  L.push(`Ngày ${fmtDmy(today)}`);
  const gap = view.pct - view.plannedPct;
  L.push(`Tiến độ: ${view.pct}% (kế hoạch ${view.plannedPct}%) — ${gap >= 0 ? 'đúng kế hoạch' : `chậm ${-gap}%`}`);
  if (view.end) L.push(`Dự kiến xong: ${fmtDmy(view.end)}${deadline ? ` · hạn bàn giao ${fmtDmy(deadline)}${view.onDeadline === false ? ' ⚠️ trễ hạn' : ''}` : ''}`);
  const name = (x: TaskView) => x.name;
  const late = view.tasks.filter((x) => x.late);
  if (late.length) { L.push('', `⚠️ Việc trễ (${late.length}):`); late.forEach((x) => L.push(`- ${name(x)}: ${x.progress_pct}% · trễ ${x.lateDays} ngày`)); }
  const doing = view.tasks.filter((x) => !x.late && (x.status === 'doing' || (x.start_date && x.start_date <= today && x.end_date && x.end_date >= today && x.status !== 'done')));
  if (doing.length) { L.push('', '🔨 Đang làm:'); doing.forEach((x) => L.push(`- ${name(x)}: ${x.progress_pct}%${x.behind ? ' (chậm)' : ''}`)); }
  const blocked = view.tasks.filter((x) => (x as TaskView & { blocker?: string | null }).blocker);
  if (blocked.length) { L.push('', '🚧 Vướng mắc:'); blocked.forEach((x) => L.push(`- ${name(x)}: ${(x as TaskView & { blocker?: string | null }).blocker}`)); }
  const in7 = addDays(today, 7);
  const next = view.tasks.filter((x) => x.status === 'todo' && x.start_date && x.start_date > today && x.start_date <= in7);
  if (next.length) { L.push('', '📅 Sắp làm (7 ngày tới):'); next.forEach((x) => L.push(`- ${fmtDm(x.start_date)} ${x.kind === 'milestone' ? '◆ ' : ''}${name(x)}`)); }
  if (view.phases.length) { L.push('', 'Từng giai đoạn:'); view.phases.forEach((p) => L.push(`- ${p.name}: ${p.pct}%`)); }
  return L.join('\n');
}

/** 1 dòng cho Chi tiết công trình: "Tiến độ 62% · trễ 1 việc" */
export function summaryLine(view: Pick<PlanView, 'pct' | 'lateCount'>): string {
  return `Tiến độ ${view.pct}% · ${view.lateCount ? `trễ ${view.lateCount} việc` : 'không có việc trễ'}`;
}
