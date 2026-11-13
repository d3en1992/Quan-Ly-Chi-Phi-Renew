// 1 dòng tiến độ cho Chi tiết công trình: "Tiến độ 62% · trễ 1 việc · Xem tiến độ" (chưa lập → "Lập tiến độ")
import { Link } from 'react-router-dom';
import { todayIso } from '@/features/reports/shared';
import { calendarOf, projectSchedule, useSchedData } from './api';
import { planView, summaryLine } from './logic';

export function ScheduleLine({ projectId }: { projectId: string }) {
  const q = useSchedData();
  const link = `/ke-hoach/tien-do?project=${encodeURIComponent(projectId)}`;
  if (q.isLoading) return <span className="text-faint">Tiến độ: đang tải…</span>;
  if (!q.data) return <Link to={link} className="font-semibold text-accent">Xem tiến độ</Link>;
  const { plan, phases, tasks } = projectSchedule(q.data, projectId);
  if (!plan) return <span data-testid="ct-schedule-line">Chưa lập tiến độ · <Link to={link} className="font-semibold text-accent">Lập tiến độ</Link></span>;
  const v = planView(phases, tasks, calendarOf(plan), todayIso(), plan.deadline);
  return (
    <span data-testid="ct-schedule-line">
      <span className={v.lateCount ? 'font-semibold text-bad' : ''}>{summaryLine(v)}</span> · <Link to={link} className="font-semibold text-accent">Xem tiến độ</Link>
    </span>
  );
}
