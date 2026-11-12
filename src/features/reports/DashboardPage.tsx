// Tab DASHBOARD (chỉ xem): số tổng, chi theo tuần, cơ cấu chi, còn phải thu, chi nhiều nhất — trên một màn.
// Dải số tổng cộng từ CHÍNH các dòng của tab Lợi Nhuận → hai tab luôn cùng số.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLayoutMode } from '@/app/useLayoutMode';
import { HBar, HBarList, KpiStrip, Money, PhoneKpis, ProfitPill, Segmented } from '@/components/ui/data';
import { Icon } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/misc';
import { buildCostEntries, costBreakdown, dashboardTotals, lastCostDate, profitReport, subcontractDebtTotal, weeklyCosts, type WeekCost } from '@/lib/calc';
import { formatMoney, formatShortMoney } from '@/lib/format';
import type { ReportData } from './api';
import { ReportBody, todayIso, useReport } from './shared';

const MILLION = 1_000_000;

/** Mốc trục đứng "đẹp" (triệu đồng) phủ được giá trị lớn nhất */
function axisMax(maxMillions: number): number {
  if (maxMillions <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(maxMillions));
  for (const m of [1, 2, 4, 5, 8, 10]) if (m * pow >= maxMillions) return m * pow;
  return 10 * pow;
}

function WeekChart({ weeks }: { weeks: WeekCost[] }) {
  const W = 640, H = 200, pad = 40;
  const values = weeks.map((w) => w.amount / MILLION);
  const max = axisMax(Math.max(...values, 0));
  const bw = (W - pad - 10) / weeks.length;
  const gap = weeks.length > 20 ? 2 : 10;
  const labelEvery = weeks.length > 20 ? 4 : 1;
  return (
    <svg viewBox={`0 0 ${W} ${H + 28}`} role="img" aria-label={`Chi phí ${weeks.length} tuần gần nhất`} className="block h-auto w-full text-[10px] [&_text]:fill-[var(--muted)]">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = H - f * H + 6;
        return (
          <g key={f}>
            <line x1={pad} x2={W} y1={y} y2={y} stroke="var(--line-soft)" />
            <text x={pad - 6} y={y + 3} textAnchor="end">{Math.round(max * f).toLocaleString('vi-VN')}</text>
          </g>
        );
      })}
      {weeks.map((w, i) => {
        const h = (values[i]! / max) * H;
        const x = pad + 6 + i * bw;
        return (
          <g key={w.weekStart}>
            <rect x={x} y={H - h + 6} width={Math.max(1, bw - gap)} height={h} rx={weeks.length > 20 ? 1 : 3}
              fill={i === weeks.length - 1 ? 'var(--accent)' : 'var(--accent-soft)'} stroke="var(--accent)" strokeOpacity={0.35}>
              <title>{`Tuần ${w.week} (từ ${w.weekStart.slice(8)}/${w.weekStart.slice(5, 7)}): ${formatMoney(w.amount)} đ`}</title>
            </rect>
            {i % labelEvery === 0 ? <text x={x + (bw - gap) / 2} y={H + 22} textAnchor="middle">T{w.week}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

function Content({ data, years, yearLabel }: { data: ReportData; years: readonly number[]; yearLabel: string }) {
  const mode = useLayoutMode();
  const navigate = useNavigate();
  const [span, setSpan] = useState<'12' | '52'>('12');

  const calc = useMemo(() => {
    const report = profitReport(data, years, data.loadedAt);
    const costs = buildCostEntries(data);
    const companyIds = new Set(data.projects.filter((p) => p.is_company_overhead).map((p) => p.id));
    const last = lastCostDate(costs, years, todayIso(data.loadedAt));
    return {
      report, costs, last,
      totals: dashboardTotals(report.rows),
      subDebt: subcontractDebtTotal(data.subcontracts, data.payments, years),
      breakdown: costBreakdown(costs, data.payments, companyIds, (id) => (id ? data.catalogName.get(id) ?? '' : ''), years),
    };
  }, [data, years]);
  const weeks = useMemo(() => weeklyCosts(calc.costs, calc.last, mode === 'phone' ? 6 : Number(span)), [calc, span, mode]);
  const { totals: t, report } = calc;

  const topReceivable = [...report.rows].filter((r) => Math.round(r.revenue.receivable) > 0).sort((a, b) => b.revenue.receivable - a.revenue.receivable).slice(0, 5);
  const topSpent = [...report.rows].filter((r) => Math.round(r.spent) > 0).sort((a, b) => b.spent - a.spent).slice(0, 5);

  if (report.rows.length === 0 && calc.breakdown.length === 0) {
    return (
      <>
        <div className="hidden sm:block"><PageHeader title="Dashboard" sub={`Tổng quan ${yearLabel.toLowerCase()}`} /></div>
        <Card><EmptyState icon="dashboard" title="Chưa có số liệu">{yearLabel} chưa có thu, chi nào. Thử chọn năm khác ở ô chọn năm phía trên.</EmptyState></Card>
      </>
    );
  }

  if (mode === 'phone') {
    // Điện thoại: năm chọn ở đầu trang; số tổng gọn → chi 6 tuần → còn phải thu (chạm mở công trình) → cơ cấu chi
    const max = Math.max(...weeks.map((w) => w.amount), 1);
    return (
      <>
        <PhoneKpis
          items={[
            { label: 'Tổng đã chi', value: formatShortMoney(t.spent) },
            { label: 'Tổng đã thu', value: formatShortMoney(t.received) },
            { label: 'Còn phải thu', value: formatShortMoney(t.receivable), tone: t.receivable > 0 ? 'neg' : '' },
            { label: 'Còn phải trả TP', value: formatShortMoney(calc.subDebt) },
            { label: `Lãi tạm tính · ${t.profitable} lãi, ${t.losing} lỗ`, value: formatShortMoney(t.profit), tone: t.profit >= 0 ? 'pos' : 'neg', wide: true },
          ]}
        />
        <Card className="grid gap-1.5 px-3 py-2.5">
          <div className="text-[12px] font-semibold text-muted">Chi 6 tuần gần nhất (triệu)</div>
          {weeks.map((w) => (
            <div key={w.weekStart} className="flex items-center gap-2.5 text-[12.5px]">
              <span className="w-[54px] shrink-0 text-muted">Tuần {w.week}</span>
              <span className="min-w-0 flex-1"><HBar percent={(w.amount / max) * 100} /></span>
              <b className="num w-[48px] shrink-0 text-right">{Math.round(w.amount / MILLION).toLocaleString('vi-VN')}</b>
            </div>
          ))}
        </Card>
        {topReceivable.length ? (
          <Card>
            <CardHeader title="Còn phải thu nhiều nhất" />
            <div className="grid">
              {topReceivable.map((r) => (
                <button key={r.projectId} type="button" onClick={() => navigate(`/cong-trinh/${r.projectId}`)}
                  className="flex min-w-0 items-center gap-2 border-b border-line-soft px-3 py-2 text-left text-[13px] last:border-b-0 active:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <b className="num text-bad">{formatShortMoney(r.revenue.receivable)}</b>
                  <Icon name="chevron_right" className="text-[18px] text-faint" />
                </button>
              ))}
            </div>
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Cơ cấu chi theo loại" sub="triệu đồng" />
          <HBarList items={calc.breakdown.map((b) => ({ key: b.label, label: b.label, value: b.amount, display: Math.round(b.amount / MILLION).toLocaleString('vi-VN') }))} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" sub={`Tổng quan ${yearLabel.toLowerCase()}`} />
      <KpiStrip
        items={[
          { label: 'Tổng đã chi', value: formatShortMoney(t.spent), sub: `chi phí mọi HĐ ${formatShortMoney(t.totalCost)}` },
          { label: 'Tổng đã thu', value: formatShortMoney(t.received) },
          { label: 'Giá trị HĐ', value: formatShortMoney(t.contractValue) },
          { label: 'Còn phải thu', value: formatShortMoney(t.receivable), tone: t.receivable > 0 ? 'neg' : '' },
          { label: 'Còn phải trả thầu phụ', value: formatShortMoney(calc.subDebt) },
          { label: 'Lãi tạm tính', value: formatShortMoney(t.profit), sub: `${t.profitable} lãi · ${t.losing} lỗ`, tone: t.profit >= 0 ? 'pos' : 'neg' },
        ]}
      />
      <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Chi phí theo tuần"
            sub="triệu đồng"
            actions={<Segmented value={span} onChange={setSpan} options={[{ value: '12', label: '12 tuần' }, { value: '52', label: '52 tuần' }]} />}
          />
          <div className="p-3.5"><WeekChart weeks={weeks} /></div>
        </Card>
        <Card>
          <CardHeader title="Cơ cấu chi theo loại" sub="triệu đồng" />
          <HBarList items={calc.breakdown.map((b) => ({ key: b.label, label: b.label, value: b.amount, display: Math.round(b.amount / MILLION).toLocaleString('vi-VN') }))} />
        </Card>
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Còn phải thu nhiều nhất" />
          <div className="tbl">
            <table>
              <tbody>
                {topReceivable.map((r) => (
                  <tr key={r.projectId}>
                    <td className="whitespace-nowrap">{r.name}</td>
                    <td className="text-right text-bad"><Money value={r.revenue.receivable} /></td>
                  </tr>
                ))}
                {topReceivable.length === 0 ? <tr><td className="!py-6 text-center text-muted">Không còn khoản phải thu</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Top 5 chi nhiều nhất" />
          <div className="tbl">
            <table>
              <tbody>
                {topSpent.map((r) => (
                  <tr key={r.projectId}>
                    <td className="whitespace-nowrap">{r.name}</td>
                    <td className="text-right"><Money value={r.spent} /></td>
                    <td className="text-right"><ProfitPill value={r.profit} /></td>
                  </tr>
                ))}
                {topSpent.length === 0 ? <tr><td className="!py-6 text-center text-muted">Chưa có chi phí</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

export function DashboardPage() {
  const { query, years, yearLabel } = useReport();
  return <ReportBody query={query}>{(data) => <Content data={data} years={years} yearLabel={yearLabel} />}</ReportBody>;
}
