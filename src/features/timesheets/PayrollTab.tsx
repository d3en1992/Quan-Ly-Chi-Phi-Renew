// TỔNG LƯƠNG & LỊCH SỬ (PAGES.chamcong sub 1): tổng lương tuần theo công nhân (mọi công trình), tick để cộng nhanh,
// tìm tên, xuất CSV, phiếu lương Zalo cho người đã tick; lịch sử tuần, bấm để mở lại tuần trong Sổ chấm công.
import { ExportButton } from '@/features/export/ExportButton';
import { useMemo, useState } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { FilterBar, FilterSelect, MobileCard, MobileRow, Money, Pager, SearchBox, usePaged } from '@/components/ui/data';
import { Card, CardHeader, EmptyState } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import {
  inYear, payslipData, payslipText, sumNetPay, weekEnd, weekHistory, weekLabel, weekRangeLabel, weeklyPayroll,
  type PayrollIndex, type PayrollRow, type YearFilter,
} from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { matchesSearch } from '@/features/reports/shared';
import type { TimesheetData } from './api';
import { cDay, PayslipSheet, RoleTag } from './shared';


type Props = {
  data: TimesheetData; ix: PayrollIndex; years: YearFilter; yearLabel: string; phone: boolean;
  onOpenWeek: (weekStart: string, projectId: string) => void;
};

export function PayrollTab({ data, ix, years, yearLabel, phone, onOpenWeek }: Props) {
  const toast = useToast();
  const [week, setWeek] = useState('');
  const [project, setProject] = useState('');
  const [q, setQ] = useState('');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [slip, setSlip] = useState<string | null>(null);

  const weekOpts = useMemo(() => {
    const s = [...new Set(data.weeks.filter((w) => inYear(w.week_start, years)).map((w) => w.week_start))].sort().reverse();
    return s.map((w) => ({ value: w, label: weekRangeLabel(w) }));
  }, [data.weeks, years]);
  const projOpts = useMemo(() => {
    const ids = new Set(data.weeks.filter((w) => inYear(w.week_start, years)).map((w) => w.project_id));
    return data.projects.filter((p) => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((p) => ({ value: p.id, label: p.name }));
  }, [data.weeks, data.projects, years]);

  const rows = useMemo(() => {
    const all = weeklyPayroll(ix, { years, weekStart: week || null, projectId: project || null });
    return all
      .filter((r) => matchesSearch(q, data.workerName(r.workerId)))
      .sort((a, b) => data.workerName(a.workerId).localeCompare(data.workerName(b.workerId), 'vi'));
  }, [ix, years, week, project, q, data]);
  const history = useMemo(() => weekHistory(data.weeks, data.lines, data.advances, years, project || null).filter((h) => !week || h.weekStart === week), [data, years, project, week]);
  const hp = usePaged(history, 15, `${week}|${project}|${years.join(',')}`);

  const sel = rows.filter((r) => ticked.has(r.key));
  const toggle = (k: string) => setTicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const names = (r: PayrollRow) => r.projectIds.map((id) => data.projectName(id));

  const slipFor = (weekStart: string, workerIds: string[]) => {
    const to = weekEnd(weekStart);
    setSlip(workerIds.map((id) => payslipText(payslipData(ix, id, weekStart, to), data.workerName(id), data.projectName)).join('\n\n'));
  };
  const slipTicked = () => {
    if (!week) { toast('Chọn 1 tuần ở ô lọc Tuần trước — phiếu lương tính theo từng tuần', 'error'); return; }
    if (!sel.length) { toast('Tick chọn ít nhất 1 người trong bảng Tổng lương tuần', 'error'); return; }
    slipFor(week, sel.map((r) => r.workerId));
  };
  const slipWeek = (weekStart: string, projectId: string) => {
    const wk = data.weeks.find((w) => w.week_start === weekStart && w.project_id === projectId);
    const ids = data.lines.filter((l) => l.week_id === wk?.id).sort((a, b) => a.position - b.position).map((l) => l.worker_id);
    slipFor(weekStart, ids);
  };

  const grand = rows.reduce((s, r) => s + r.wageWithAllowance, 0);
  const filters = (
    <FilterBar>
      <FilterSelect label="Tuần" value={week} onChange={(v) => { setWeek(v); setTicked(new Set()); }} options={weekOpts} allLabel={`Tất cả tuần (${yearLabel})`} />
      <FilterSelect label="Công trình" value={project} onChange={setProject} options={projOpts} />
      <SearchBox value={q} onChange={setQ} placeholder="Tìm tên công nhân…" />
      <div className="flex-1" />
      <Button onClick={slipTicked}><Icon name="chat" />Phiếu lương Zalo</Button>
      <ExportButton datasets={['timesheet_weeks', 'timesheet_lines']} projectId={project || null} timesheet="grouped" />
    </FilterBar>
  );

  const tltBody = rows.length === 0 ? <EmptyState icon="payments" title="Chưa có dữ liệu chấm công">Đổi tuần, công trình hoặc năm trên thanh trên.</EmptyState> : phone ? (
    <div className="grid gap-2 p-2">
      {rows.map((r) => (
        <MobileCard key={r.key} onClick={() => toggle(r.key)}>
          <MobileRow>
            <span className="flex min-w-0 items-center gap-2"><input type="checkbox" readOnly checked={ticked.has(r.key)} aria-label={`Chọn ${data.workerName(r.workerId)}`} className="size-4 accent-[var(--accent)]" /><b className="truncate">{data.workerName(r.workerId)}</b><RoleTag role={r.role} /></span>
            <b className="num">{formatMoney(week ? r.netPay : r.wageWithAllowance)}</b>
          </MobileRow>
          <MobileRow meta><span>{cDay(r.dayUnits)} công · TB {formatMoney(r.avgDaily)}/ngày</span>{week && r.deduction ? <span>trừ {formatMoney(r.deduction)}</span> : null}</MobileRow>
          <MobileRow meta><span className="truncate">{names(r).join(' · ')}</span></MobileRow>
        </MobileCard>
      ))}
    </div>
  ) : (
    <div className="tbl tbl-tight">
      <table data-testid="tlt-table">
        <thead>
          <tr>
            <th className="w-8" /><th>Tên CN</th><th className="!text-center">T/P</th><th className="!text-right">TC</th><th className="!text-right">TC Lương</th><th className="!text-right">Lương TB/ngày</th>
            {week ? <><th className="!text-right">Trừ nợ</th><th className="!text-right">Thực lãnh</th></> : null}<th>Công trình</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="cursor-pointer" onClick={() => toggle(r.key)}>
              <td><input type="checkbox" readOnly checked={ticked.has(r.key)} aria-label={`Chọn ${data.workerName(r.workerId)}`} className="size-4 accent-[var(--accent)]" /></td>
              <td className="whitespace-nowrap"><b className="font-semibold">{data.workerName(r.workerId)}</b></td>
              <td className="text-center"><RoleTag role={r.role} /></td>
              <td className="num text-right">{cDay(r.dayUnits)}</td>
              <td className="text-right"><Money value={r.wageWithAllowance} /></td>
              <td className="text-right"><Money value={r.avgDaily} /></td>
              {week ? <><td className="text-right">{r.deduction ? <span className="num">−{formatMoney(r.deduction)}</span> : <span className="text-faint">—</span>}</td><td className="text-right"><b><Money value={r.netPay} /></b></td></> : null}
              <td className="max-w-[170px] truncate text-muted" title={names(r).join(', ')}>{names(r)[0] ?? '—'}{r.projectIds.length > 1 ? <small className="ml-1 rounded bg-surface-2 px-1">+{r.projectIds.length - 1}</small> : null}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold [&>td]:bg-surface-2">
            <td colSpan={4}>{rows.length} công nhân{sel.length ? ` · đã chọn ${sel.length} người` : ''}</td>
            <td className="num text-right" data-testid="tlt-total">{formatMoney(grand)}</td><td />
            {week ? <><td /><td className="num text-right" data-testid="tlt-selected">{sel.length ? formatMoney(sumNetPay(sel)) : formatMoney(sumNetPay(rows))}</td></> : null}<td />
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const histBody = history.length === 0 ? <EmptyState icon="history" title="Chưa có tuần nào" /> : phone ? (
    <div className="grid gap-2 p-2">
      {hp.slice.map((h) => (
        <MobileCard key={h.weekId} onClick={() => onOpenWeek(h.weekStart, h.projectId)}>
          <MobileRow><b className="num">{weekLabel(h.weekStart)}</b><b className="num">{formatMoney(h.netPay)}</b></MobileRow>
          <MobileRow meta><span className="truncate">{data.projectName(h.projectId)}</span><span>{h.workers} thợ · {cDay(h.dayUnits)} công</span></MobileRow>
        </MobileCard>
      ))}
    </div>
  ) : (
    <div className="tbl tbl-tight">
      <table data-testid="cc-history">
        <thead><tr><th>Tuần</th><th>Công trình</th><th className="!text-right">Thợ</th><th className="!text-right">Công</th><th className="!text-right">Thực lãnh</th><th /></tr></thead>
        <tbody>
          {hp.slice.map((h) => (
            <tr key={h.weekId} className="cursor-pointer" tabIndex={0} onClick={() => onOpenWeek(h.weekStart, h.projectId)} onKeyDown={(e) => { if (e.key === 'Enter') onOpenWeek(h.weekStart, h.projectId); }}>
              <td className="num whitespace-nowrap">{weekLabel(h.weekStart)}</td>
              <td className="max-w-[130px] truncate" title={data.projectName(h.projectId)}>{data.projectName(h.projectId)}</td>
              <td className="num text-right">{h.workers}</td>
              <td className="num text-right">{cDay(h.dayUnits)}</td>
              <td className="text-right"><Money value={h.netPay} /></td>
              <td><Button size="sm" variant="ghost" aria-label="Phiếu lương" onClick={(e) => { e.stopPropagation(); slipWeek(h.weekStart, h.projectId); }}><Icon name="chat" /></Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      {filters}
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Tổng lương tuần" sub="theo công nhân, mọi công trình" actions={<small className="text-muted">Tick để cộng nhanh{sel.length ? <> · <b className="num text-fg">{sel.length} người: {formatMoney(sumNetPay(sel))}</b></> : null}</small>} />
          {tltBody}
        </Card>
        <Card>
          <CardHeader title="Lịch sử chấm công" sub="bấm để mở lại tuần" />
          {histBody}
          {history.length > 15 ? <div className="border-t border-line-soft px-3 py-2"><Pager {...hp} /></div> : null}
        </Card>
      </div>
      <PayslipSheet text={slip} title="Phiếu lương" onClose={() => setSlip(null)} />
    </>
  );
}
