// Tab CÔNG TRÌNH: thẻ công trình theo loại (CT / SC / SN-Khác) hoặc theo khách hàng, CÔNG TY ở cuối.
// Số trên thẻ = số tab Lợi Nhuận (cùng hàm profitReport, xem numbers.ts).
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Button, Icon } from '@/components/ui/button';
import { FilterBar, FilterSelect, HBar, KpiStrip, PhoneKpis, SearchBox, Segmented } from '@/components/ui/data';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, Pill } from '@/components/ui/misc';
import { projectIdsInYear, percentOf } from '@/lib/calc';
import { formatDate, formatShortMoney } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { matchesSearch, useReport } from '@/features/reports/shared';
import { useReportData } from '@/features/reports/api';
import { ProjectDetailPage } from './ProjectDetailPage';
import { ProjectFormSheet } from './ProjectFormSheet';
import { PROJECT_STATUS_OPTIONS, STATUS_LABEL, STATUS_TONE } from './labels';
import { useCustomersLite, useProjectsFull, type ProjectFull } from './api';
import { projectNumbers } from './numbers';
import { cn } from '@/lib/utils';

type Group = 'kind' | 'customer';
const KIND_GROUPS: { key: string; label: string }[] = [
  { key: 'new_build', label: 'Công trình (CT)' },
  { key: 'renovation', label: 'Sửa chữa, cải tạo (SC)' },
  { key: 'small_repair', label: 'Sửa nhỏ (SN) / Khác' },
];

const k2s = (k: number | null) => String(k ?? 1).replace('.', ',');

export function ProjectsRoute() {
  const { projectId } = useParams();
  return projectId ? <ProjectDetailPage projectId={projectId} /> : <ProjectsPage />;
}

function ProjectCard({ p, money, onOpen, customer, nums }: {
  p: ProjectFull; money: boolean; onOpen: () => void; customer: string;
  nums: { spent: number; supplierDebt: number; received: number; receivable: number; profit: number; contractValue: number; B: number };
}) {
  const pct = percentOf(nums.received, nums.contractValue);
  return (
    <button type="button" data-testid="project-card" data-project-id={p.id} onClick={onOpen}
      className="grid min-w-0 gap-2 rounded-[var(--r)] border border-line bg-surface p-3.5 text-left hover:border-accent">
      <div className="flex items-start justify-between gap-2">
        <b className="min-w-0 break-words text-[14px]" data-testid="project-name">{p.name}</b>
        <Pill tone={STATUS_TONE[p.status] ?? 'neutral'}>{STATUS_LABEL[p.status] ?? p.status}</Pill>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1"><Icon name="person" className="!text-[15px]" />{customer || p.owner_name || 'Chưa gắn khách'}</span>
        <span className="inline-flex items-center gap-1"><Icon name="event" className="!text-[15px]" />{formatDate(p.start_date)}</span>
        <span className="inline-flex items-center gap-1"><Icon name="tune" className="!text-[15px]" />k = {k2s(p.cost_weight_k)}</span>
      </div>
      {money ? (
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[12px] text-muted">
          <span>Đã thu</span><HBar percent={pct ?? 0} tone="good" /><span className="num">{pct ?? 0}%</span>
        </div>
      ) : null}
      <dl className={cn('m-0 grid gap-2', money ? 'grid-cols-2' : 'grid-cols-2')}>
        <div>
          <dt className="text-[11.5px] text-muted">Tổng đã chi</dt>
          <dd className="num m-0 font-bold" data-testid="card-spent">{formatShortMoney(nums.spent)}</dd>
          {nums.supplierDebt > 0 ? <dd className="m-0 text-[11px] text-faint">nợ NCC {formatShortMoney(nums.supplierDebt)}</dd> : null}
        </div>
        {money ? (
          <>
            <div><dt className="text-[11.5px] text-muted">Đã thu</dt><dd className="num m-0 font-bold" data-testid="card-received">{formatShortMoney(nums.received)}</dd></div>
            <div><dt className="text-[11.5px] text-muted">Còn phải thu</dt><dd className="num m-0 font-bold">{nums.receivable > 0 ? formatShortMoney(nums.receivable) : '0'}</dd></div>
            <div><dt className="text-[11.5px] text-muted">Lãi / lỗ</dt><dd data-testid="card-profit" className={cn('num m-0 font-bold', Math.round(nums.profit) >= 0 ? 'text-good' : 'text-bad')}>{formatShortMoney(nums.profit)}</dd></div>
          </>
        ) : (
          <div><dt className="text-[11.5px] text-muted">Thầu phụ đã ứng</dt><dd className="num m-0 font-bold">{formatShortMoney(nums.B)}</dd></div>
        )}
      </dl>
    </button>
  );
}

function ProjectsPage() {
  const navigate = useNavigate();
  const access = useAccess();
  const mode = useLayoutMode();
  const money = hasLevel(access.permissions, 'revenue') || hasLevel(access.permissions, 'profit');
  const canAdd = hasLevel(access.permissions, 'projects', 'add');
  const { years, yearLabel } = useReport();
  const reportQ = useReportData();
  const projectsQ = useProjectsFull();
  const customersQ = useCustomersLite();

  const [group, setGroup] = useState<Group>('kind');
  const [status, setStatus] = useState('live');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const ready = reportQ.data && projectsQ.data && customersQ.data;
  const view = useMemo(() => {
    if (!reportQ.data || !projectsQ.data || !customersQ.data) return null;
    const data = reportQ.data;
    const customerName = new Map(customersQ.data.map((c) => [c.id, c.name]));
    const nums = projectNumbers(data, years, data.loadedAt);
    const inYear = projectIdsInYear(data.projects, years, data);
    const real = projectsQ.data.filter((p) => !p.is_company_overhead);
    const listed = real.filter((p) => {
      if (!inYear.has(p.id)) return false;
      if (status === 'live' ? !(p.status === 'active' || p.status === 'completed' || p.status === 'planning') : status && p.status !== status) return false;
      return matchesSearch(search, p.name, customerName.get(p.customer_id ?? ''), p.owner_name, p.address);
    });
    const rows = listed.map((p) => ({ p, n: nums.of(p), customer: customerName.get(p.customer_id ?? '') ?? '' }));
    const company = projectsQ.data.find((p) => p.is_company_overhead);
    return { rows, nums, company, customerCount: new Set(rows.map((r) => r.p.customer_id).filter(Boolean)).size, totalAll: real.length };
  }, [reportQ.data, projectsQ.data, customersQ.data, years, status, search]);

  if (reportQ.isError || projectsQ.isError || customersQ.isError) {
    return <Card><ErrorState error={reportQ.error ?? projectsQ.error ?? customersQ.error} onRetry={() => { void reportQ.refetch(); void projectsQ.refetch(); void customersQ.refetch(); }} /></Card>;
  }
  if (!ready || !view) return <Card><LoadingState label="Đang tải công trình…" /></Card>;

  const { rows, nums } = view;
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const active = rows.filter((r) => r.p.status === 'active').length;
  const totalSpent = sum((r) => r.n.spent);
  const totalReceived = sum((r) => r.n.received);
  const totalReceivable = sum((r) => r.n.revenue.receivable);
  const totalProfit = sum((r) => r.n.profit);

  const groups: [string, typeof rows][] = group === 'kind'
    ? KIND_GROUPS.map((g) => [g.label, rows.filter((r) => (r.p.kind ?? 'small_repair') === g.key)] as [string, typeof rows])
    : [...new Set(rows.map((r) => r.customer || 'Chưa gắn khách'))].sort((a, b) => a.localeCompare(b, 'vi')).map((c) => [c, rows.filter((r) => (r.customer || 'Chưa gắn khách') === c)] as [string, typeof rows]);

  const cardOf = (r: (typeof rows)[number]) => (
    <ProjectCard key={r.p.id} p={r.p} money={money} customer={r.customer} onOpen={() => navigate(`/cong-trinh/${r.p.id}`)}
      nums={{ spent: r.n.spent, supplierDebt: r.n.supplierDebt, received: r.n.received, receivable: r.n.revenue.receivable, profit: r.n.profit, contractValue: r.n.revenue.contractValue, B: r.n.B }} />
  );

  const company = view.company;
  const companyCard = company ? (
    <div className="grid min-w-0 gap-2 rounded-[var(--r)] border border-line bg-surface p-3.5" data-testid="company-card">
      <div className="flex items-start justify-between gap-2"><b className="text-[14px]">{company.name}</b><Pill>Chi phí chung</Pill></div>
      <div className="text-[12px] text-muted">Lương văn phòng, bảo hiểm, thuế phí, sửa máy…</div>
      <dl className="m-0 grid grid-cols-3 gap-2">
        <div><dt className="text-[11.5px] text-muted">Tổng chi {yearLabel.replace('Năm ', '')}</dt><dd className="num m-0 font-bold">{formatShortMoney(nums.report.overheadTotal)}</dd></div>
        <div><dt className="text-[11.5px] text-muted">Đã phân bổ</dt><dd className="num m-0 font-bold">{nums.report.overheadTotal > 0 ? '100%' : '—'}</dd></div>
        <div><dt className="text-[11.5px] text-muted">CT gánh</dt><dd className="num m-0 font-bold">{nums.overheadBearers}</dd></div>
      </dl>
    </div>
  ) : null;

  const filters = (
    <FilterBar>
      <FilterSelect label="Trạng thái" value={status} onChange={setStatus} allLabel="Tất cả" options={[{ value: 'live', label: 'Đang chạy + Hoàn thành' }, ...PROJECT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))]} />
      <SearchBox value={search} onChange={setSearch} placeholder="Tìm tên công trình, khách hàng…" />
      <span className="flex-1" />
      <Segmented<Group> value={group} onChange={setGroup} options={[{ value: 'kind', label: 'Theo loại' }, { value: 'customer', label: 'Theo khách hàng' }]} />
    </FilterBar>
  );

  const body = rows.length === 0 ? (
    <Card>
      <EmptyState icon="construction" title={view.totalAll === 0 ? 'Chưa có công trình nào' : 'Không có công trình nào khớp'}>
        {view.totalAll === 0 ? 'Bấm "Thêm công trình" để bắt đầu.' : `${yearLabel}: thử đổi năm ở ô chọn năm phía trên, hoặc đổi bộ lọc trạng thái.`}
      </EmptyState>
    </Card>
  ) : (
    groups.filter(([, list]) => list.length > 0).map(([label, list]) => (
      <section key={label} className="grid gap-2.5">
        <div className="flex items-baseline gap-2"><h3 className="m-0 text-sm font-bold">{label}</h3><span className="text-[12px] text-muted">{list.length} công trình</span></div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map(cardOf)}</div>
      </section>
    ))
  );

  const tail = companyCard ? (
    <section className="grid gap-2.5">
      <div className="flex items-baseline gap-2"><h3 className="m-0 text-sm font-bold">Công ty</h3><span className="text-[12px] text-muted">chi phí chung, phân bổ theo số ngày thi công × hệ số k</span></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{companyCard}</div>
    </section>
  ) : null;

  const addButton = canAdd ? <Button variant="primary" onClick={() => setAdding(true)}><Icon name="add" />Thêm công trình</Button> : null;

  return (
    <>
      {mode === 'phone' ? (
        <>
          <div className="flex items-center gap-2"><span className="flex-1 text-[12.5px] text-muted">{yearLabel} · {rows.length} công trình</span>{addButton}</div>
          <PhoneKpis items={[
            { label: 'Đang thi công', value: String(active) },
            { label: 'Tổng đã chi', value: formatShortMoney(totalSpent) },
            ...(money ? [{ label: 'Còn phải thu', value: formatShortMoney(totalReceivable), tone: 'neg' as const }, { label: 'Lãi tạm tính', value: formatShortMoney(totalProfit), tone: (totalProfit >= 0 ? 'pos' : 'neg') as 'pos' | 'neg' }] : []),
          ]} />
        </>
      ) : (
        <>
          <PageHeader title="Công Trình" sub={`${yearLabel} · ${rows.length} công trình · ${view.customerCount} khách hàng`} actions={addButton} />
          {filters}
          <KpiStrip items={[
            { label: 'Đang thi công', value: String(active), sub: 'công trình' },
            { label: 'Tổng đã chi', value: formatShortMoney(totalSpent), sub: 'gồm phân bổ chi phí chung' },
            money && { label: 'Tổng đã thu', value: formatShortMoney(totalReceived) },
            money && { label: 'Còn phải thu', value: formatShortMoney(totalReceivable), tone: 'neg' },
            money && { label: 'Lãi tạm tính', value: formatShortMoney(totalProfit), tone: totalProfit >= 0 ? 'pos' : 'neg' },
          ]} />
        </>
      )}
      {mode === 'phone' ? filters : null}
      {body}
      {tail}
      <ProjectFormSheet open={adding} onClose={() => setAdding(false)} project={null} onSaved={(id) => navigate(`/cong-trinh/${id}`)} />
    </>
  );
}
