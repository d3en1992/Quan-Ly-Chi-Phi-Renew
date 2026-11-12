import { describe, expect, it } from 'vitest';
import {
  barGeometry, buildFromTemplate, DEFAULT_TEMPLATES, endFromDuration, ganttScale, guessTemplate, isOff, nextStartFor, nextWorkDay,
  planToTemplate, planView, progressForStatus, statusForProgress, summaryLine, taskView, workDays, zaloReport,
  type Calendar, type TaskInput,
} from './logic';

const SUN: Calendar = { restDays: 'sun', holidays: [] };
const WEEKEND: Calendar = { restDays: 'sat_sun', holidays: [] };
// 2026-11-15 là Chủ nhật
const task = (o: Partial<TaskInput>): TaskInput => ({
  id: 'x', phase_id: 'p1', name: 'Việc', kind: 'task', status: 'todo', progress_pct: 0, start_date: null, end_date: null, position: 0, ...o,
});

describe('lịch làm việc', () => {
  it('nghỉ CN / T7 & CN / ngày lễ', () => {
    expect(isOff('2026-11-15', SUN)).toBe(true);
    expect(isOff('2026-11-14', SUN)).toBe(false);
    expect(isOff('2026-11-14', WEEKEND)).toBe(true);
    expect(isOff('2026-11-16', { restDays: 'none', holidays: ['2026-11-16'] })).toBe(true);
    expect(nextWorkDay('2026-11-15', SUN)).toBe('2026-11-16');
  });
  it('ngày kết thúc theo ngày làm việc (bỏ CN)', () => {
    // T6 13/11 + 3 ngày làm việc = T6, T7, (CN nghỉ), T2 16/11
    expect(endFromDuration('2026-11-13', 3, SUN)).toBe('2026-11-16');
    expect(endFromDuration('2026-11-13', 3, WEEKEND)).toBe('2026-11-17');
    expect(endFromDuration('2026-11-15', 1, SUN)).toBe('2026-11-16'); // bắt đầu vào CN → dời sang T2
    expect(workDays('2026-11-13', '2026-11-16', SUN)).toBe(3);
    expect(workDays('2026-11-16', '2026-11-13', SUN)).toBe(0);
  });
});

describe('việc: % kế hoạch, trễ, chậm', () => {
  const t = task({ start_date: '2026-11-09', end_date: '2026-11-14' }); // T2 → T7, 6 ngày
  it('% kế hoạch tới đầu ngày hôm nay', () => {
    expect(taskView(t, SUN, '2026-11-09').plannedPct).toBe(0);
    expect(taskView(t, SUN, '2026-11-12').plannedPct).toBe(50);
    expect(taskView(t, SUN, '2026-11-16').plannedPct).toBe(100);
    expect(taskView(t, SUN, '2026-11-12').days).toBe(6);
  });
  it('quá ngày kết thúc mà chưa xong = trễ n ngày làm việc', () => {
    const v = taskView({ ...t, progress_pct: 40, status: 'doing' }, SUN, '2026-11-18');
    expect(v.late).toBe(true);
    expect(v.lateDays).toBe(3); // 16, 17, 18 (CN 15 không tính)
    expect(taskView({ ...t, progress_pct: 100, status: 'done' }, SUN, '2026-11-18').late).toBe(false);
  });
  it('đang làm mà % thấp hơn kế hoạch ≥ 20 điểm = chậm', () => {
    expect(taskView({ ...t, progress_pct: 20 }, SUN, '2026-11-13').behind).toBe(true); // kế hoạch 67%
    expect(taskView({ ...t, progress_pct: 60 }, SUN, '2026-11-13').behind).toBe(false);
    expect(taskView({ ...t, progress_pct: 0, status: 'paused' }, SUN, '2026-11-13').behind).toBe(false);
  });
  it('% → trạng thái và ngược lại', () => {
    expect(statusForProgress(0, 'doing')).toBe('todo');
    expect(statusForProgress(30, 'todo')).toBe('doing');
    expect(statusForProgress(30, 'paused')).toBe('paused');
    expect(statusForProgress(100, 'paused')).toBe('done');
    expect(progressForStatus('done', 30)).toBe(100);
    expect(progressForStatus('doing', 100)).toBe(90);
  });
});

describe('mẫu → kế hoạch → % cập nhật', () => {
  it('gợi ý mẫu theo loại công trình', () => {
    expect(guessTemplate({ kind: 'new_build', name: 'CT Nhà Tình' })).toBe('new_build');
    expect(guessTemplate({ kind: 'renovation', name: 'SC Nhà Bà Ba' })).toBe('renovation');
    expect(guessTemplate({ kind: 'small_repair', name: 'Nhà Cô Hai', scope_note: 'Sơn nước' })).toBe('paint');
    expect(guessTemplate({ kind: 'small_repair', name: 'Lắp cửa' })).toBe('free');
  });

  it('lập tiến độ từ mẫu Xây mới: việc nối tiếp nhau theo ngày làm việc, mốc ở ngày cuối việc trước', () => {
    const tpl = DEFAULT_TEMPLATES.find((x) => x.key === 'new_build')!;
    const built = buildFromTemplate(tpl.phases, '2026-11-16', SUN);
    expect(built.map((p) => p.name)).toEqual(['Chuẩn bị & móng', 'Phần thô', 'Điện nước (MEP)', 'Hoàn thiện', 'Bàn giao']);
    const [t1, t2, , , t5, mk] = built[0]!.tasks;
    expect(t1).toMatchObject({ start_date: '2026-11-16', end_date: '2026-11-17' }); // 2 ngày
    expect(t2).toMatchObject({ start_date: '2026-11-18', end_date: '2026-11-21' }); // 4 ngày: T4 → T7
    expect(mk).toMatchObject({ kind: 'milestone', start_date: t5!.end_date, end_date: t5!.end_date });
    const all = built.flatMap((p) => p.tasks);
    for (let i = 1; i < all.length; i++) expect(all[i]!.start_date >= all[i - 1]!.start_date).toBe(true);
    for (const x of all) { expect(isOff(x.start_date, SUN)).toBe(false); expect(isOff(x.end_date, SUN)).toBe(false); }
  });

  it('sửa % → % giai đoạn, % công trình và thanh Gantt cập nhật; quá hạn chưa xong tô đỏ', () => {
    const built = buildFromTemplate(DEFAULT_TEMPLATES.find((x) => x.key === 'renovation')!.phases, '2026-11-02', SUN);
    const phases = built.map((p, i) => ({ id: `p${i}`, name: p.name, position: p.position }));
    let tasks: TaskInput[] = built.flatMap((p, i) => p.tasks.map((x, j) => task({ ...x, id: `t${i}-${j}`, phase_id: `p${i}` })));
    const today = '2026-11-12';
    const before = planView(phases, tasks, SUN, today);
    expect(before.pct).toBe(0);
    expect(before.lateCount).toBeGreaterThan(0); // Khảo sát (02/11), Chốt PA… đã qua hạn mà 0%

    // Cập nhật % các việc của giai đoạn 1 = 100 → hết trễ ở giai đoạn 1
    tasks = tasks.map((x) => (x.phase_id === 'p0' ? { ...x, progress_pct: 100, status: statusForProgress(100, x.status) } : x));
    const after = planView(phases, tasks, SUN, today);
    expect(after.phases[0]!.pct).toBe(100);
    expect(after.phases[0]!.lateCount).toBe(0);
    expect(after.pct).toBeGreaterThan(before.pct);
    expect(summaryLine(after)).toBe(`Tiến độ ${after.pct}% · trễ ${after.lateCount} việc`);

    // Gantt: thanh bắt đầu đúng ngày, rộng theo số ngày; vạch hôm nay nằm trong khung
    const scale = ganttScale(tasks.flatMap((x) => [x.start_date, x.end_date]), today);
    expect(scale.from).toBe('2026-11-02'); // thứ Hai
    const t0 = tasks[0]!;
    const g = barGeometry(scale, t0.start_date!, t0.end_date!);
    expect(g.left).toBe(0);
    expect(g.width).toBeCloseTo((1 / scale.total) * 100);
    expect(scale.pos(today)).toBeGreaterThan(0);
    expect(scale.pos(today)).toBeLessThan(100);
  });

  it('lưu làm mẫu → dựng lại ra cùng số ngày', () => {
    const tpl = DEFAULT_TEMPLATES.find((x) => x.key === 'paint')!;
    const built = buildFromTemplate(tpl.phases, '2026-11-16', SUN);
    const tasks = built.flatMap((p) => p.tasks.map((x, j) => task({ ...x, id: `t${j}`, phase_id: 'p0' })));
    const view = planView([{ id: 'p0', name: built[0]!.name, position: 0 }], tasks, SUN, '2026-11-16');
    const again = planToTemplate(view, SUN);
    expect(again[0]!.tasks.filter((x) => !x.milestone).map((x) => x.days)).toEqual([3, 3, 3, 4]);
  });

  it('việc mới thêm cuối giai đoạn bắt đầu sau việc cuối', () => {
    expect(nextStartFor([{ end_date: '2026-11-14' }], [], '2026-11-01', SUN)).toBe('2026-11-16');
    expect(nextStartFor([], [], '2026-11-15', SUN)).toBe('2026-11-16');
  });

  it('báo cáo Zalo có tiến độ, việc trễ, sắp làm', () => {
    const tasks = [
      task({ id: 'a', name: 'Đổ móng', start_date: '2026-11-02', end_date: '2026-11-07', progress_pct: 50, status: 'doing' }),
      task({ id: 'b', name: 'Xây tường', start_date: '2026-11-14', end_date: '2026-11-20' }),
    ];
    const txt = zaloReport('CT Nhà Tình', planView([{ id: 'p1', name: 'Phần thô', position: 0 }], tasks, SUN, '2026-11-12'), '2026-11-12', '2026-12-31');
    expect(txt).toContain('BÁO CÁO TIẾN ĐỘ — CT Nhà Tình');
    expect(txt).toContain('Việc trễ (1)');
    expect(txt).toContain('- Đổ móng: 50% · trễ 4 ngày');
    expect(txt).toContain('14/11 Xây tường');
    expect(txt).toContain('- Phần thô:');
  });
});
