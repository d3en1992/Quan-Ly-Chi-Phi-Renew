// Tab CHẤM CÔNG (PAGES.chamcong / MP.cc của mẫu): SỔ CHẤM CÔNG · TỔNG LƯƠNG & LỊCH SỬ · TẠM ỨNG LƯƠNG.
import { ExportButton } from '@/features/export/ExportButton';
import { useMemo, useRef, useState } from 'react';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { ConfirmDialog } from '@/components/ui/confirm';
import { Card, ErrorState, LoadingState, PageHeader, SubTabs } from '@/components/ui/misc';
import { buildPayrollIndex, toYearFilter, weekStartOf } from '@/lib/calc';
import { hasLevel } from '@/lib/permissions';
import { todayIso } from '@/features/reports/shared';
import { useYears } from '@/app/year';
import { useTimesheetData } from './api';
import { AdvancesTab } from './AdvancesTab';
import { PayrollTab } from './PayrollTab';
import { WeekSheet } from './WeekSheet';

type Tab = 'sheet' | 'payroll' | 'advances';
const TABS: { key: Tab; label: string; short: string }[] = [{ key: 'sheet', label: 'SỔ CHẤM CÔNG', short: 'SỔ CHẤM CÔNG' }, { key: 'payroll', label: 'TỔNG LƯƠNG & LỊCH SỬ', short: 'TỔNG LƯƠNG' }, { key: 'advances', label: 'TẠM ỨNG LƯƠNG', short: 'TẠM ỨNG' }];
const PROJECT_KEY = 'qlcp-cc-project';

export function TimesheetPage() {
  const phone = useLayoutMode() === 'phone';
  const access = useAccess();
  const canAdd = hasLevel(access.permissions, 'timesheets', 'add');
  const { years: yearSel, label } = useYears();
  const years = useMemo(() => toYearFilter(yearSel), [yearSel]);
  const yearLabel = yearSel === 'all' ? 'Tất cả năm' : `Năm ${label}`;
  const query = useTimesheetData();
  const [tab, setTab] = useState<Tab>('sheet');
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayIso()));
  const [projectPick, setProjectPick] = useState<string>(() => { try { return localStorage.getItem(PROJECT_KEY) ?? ''; } catch { return ''; } });
  const dirtyRef = useRef(false);
  const data = query.data;
  const ix = useMemo(() => (data ? buildPayrollIndex(data.weeks, data.lines, data.advances) : null), [data]);

  // Công trình mặc định: lần chọn trước (nếu còn), không thì công trình đầu danh sách
  const projectId = data && (data.projects.some((p) => p.id === projectPick) ? projectPick : data.projectOptions[0]?.id) || '';
  const setProject = (id: string) => { setProjectPick(id); try { localStorage.setItem(PROJECT_KEY, id); } catch { /* bỏ qua */ } };
  const changeTab = (t: Tab) => { if (tab === 'sheet' && t !== 'sheet' && dirtyRef.current) setPendingTab(t); else setTab(t); };
  const tabs = <SubTabs tabs={TABS} value={tab} onChange={changeTab} />;
  const header = phone ? null : <PageHeader title="Chấm Công" sub="Sổ chấm công theo tuần, tổng lương, tạm ứng lương" actions={<ExportButton datasets={['timesheet_weeks', 'timesheet_lines', 'wage_advances']} />} />;

  if (query.isPending) return <>{header}{tabs}<Card><LoadingState label="Đang tải chấm công…" /></Card></>;
  if (query.isError || !data || !ix) return <>{header}{tabs}<Card><ErrorState error={query.error ?? 'Không tải được chấm công'} onRetry={() => void query.refetch()} /></Card></>;

  const confirmTab = (
    <ConfirmDialog open={!!pendingTab} onOpenChange={(o) => { if (!o) setPendingTab(null); }} title="Bỏ thay đổi chưa lưu?" danger confirmLabel="Bỏ thay đổi"
      message="Sổ chấm công còn thay đổi chưa lưu. Chuyển tab sẽ mất các thay đổi đó." onConfirm={() => { const t = pendingTab; setPendingTab(null); dirtyRef.current = false; if (t) setTab(t); }} />
  );

  if (tab === 'sheet') {
    return (
      <>
        {phone ? tabs : null}
        <WeekSheet data={data} ix={ix} weekStart={weekStart} projectId={projectId} canAdd={canAdd} phone={phone} tabs={tabs} dirtyRef={dirtyRef}
          onNavigate={(n) => { if (n.weekStart) setWeekStart(n.weekStart); if (n.projectId) setProject(n.projectId); }} />
        {confirmTab}
      </>
    );
  }
  return (
    <>
      {header}
      {tabs}
      {tab === 'payroll' ? (
        <PayrollTab data={data} ix={ix} years={years} yearLabel={yearLabel} phone={phone}
          onOpenWeek={(w, p) => { setWeekStart(w); setProject(p); setTab('sheet'); }} />
      ) : (
        <AdvancesTab data={data} ix={ix} years={years} yearLabel={yearLabel} phone={phone} canAdd={canAdd} />
      )}
      {confirmTab}
    </>
  );
}
