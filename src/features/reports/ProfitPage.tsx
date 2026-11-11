// Tab LỢI NHUẬN (chỉ xem). Số liệu = `profitReport` trong src/lib/calc (đã so 0 đồng với app cũ).
import { useMemo, useState } from 'react';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Button, Icon } from '@/components/ui/button';
import { FilterBar, FilterSelect, HBarList, KpiStrip, MobileCard, MobileRow, Money, PhoneKpis, ProfitPill, SearchBox, signedMoney } from '@/components/ui/data';
import { Card, CardHeader, EmptyState, Note, PageHeader, Pill } from '@/components/ui/misc';
import { percentOf, profitReport, sumProfitRows, type ProfitRow } from '@/lib/calc';
import { formatMoney, formatShortMoney } from '@/lib/format';
import type { ReportData } from './api';
import { KIND_LABEL, matchesSearch, ReportBody, STATUS_LABEL, useReport } from './shared';

function modeBadge(r: ProfitRow) {
  if (r.mode === 'ey') {
    return (
      <span title={`Năm hạch toán ${r.ey.year}: chiếm ${Math.round(r.ey.share * 100)}% tổng hóa đơn. Mọi cột là số TOÀN VÒNG ĐỜI công trình.`}>
        <Pill tone="accent">HT {r.ey.year} · {Math.round(r.ey.share * 100)}%</Pill>
      </span>
    );
  }
  if (r.mode === 'split') {
    return (
      <span title={`Không năm nào chiếm ≥ 80% hóa đơn. Các cột theo năm đang lọc; riêng LỢI NHUẬN là số toàn thời gian (riêng năm đang lọc: ${signedMoney(r.profitInYear ?? 0)}).`}>
        <Pill tone="warn">Nhiều năm</Pill>
      </span>
    );
  }
  return null;
}

function Content({ data, years, yearLabel }: { data: ReportData; years: readonly number[]; yearLabel: string }) {
  const mode = useLayoutMode();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [compact, setCompact] = useState(false);

  const report = useMemo(() => profitReport(data, years, data.loadedAt), [data, years]);
  const rows = useMemo(() => {
    const list = report.rows.filter((r) => {
      const p = data.projectById.get(r.projectId);
      if (kind && p?.kind !== kind) return false;
      if (status && p?.status !== status) return false;
      return matchesSearch(search, r.name, p?.customer_id ? data.customerName.get(p.customer_id) : null, p?.owner_name);
    });
    return list.sort((a, b) => b.profit - a.profit);
  }, [report, data, kind, status, search]);

  const t = useMemo(() => sumProfitRows(rows), [rows]);
  const receivable = rows.reduce((s, r) => s + r.revenue.receivable, 0);
  const settlement = rows.reduce((s, r) => s + r.revenue.settlement, 0);
  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const losing = rows.filter((r) => Math.round(r.profit) < 0);
  const top = rows.filter((r) => Math.round(r.profit) > 0).slice(0, 3);
  const pct = (a: number, b: number) => { const p = percentOf(a, b); return p === null ? '' : `${p}% đã thu`; };
  const sub = (id: string) => {
    const p = data.projectById.get(id);
    const owner = (p?.customer_id && data.customerName.get(p.customer_id)) || p?.owner_name;
    return [p?.status ? STATUS_LABEL[p.status] : null, owner].filter(Boolean).join(' · ');
  };

  const header = (
    <div className="hidden sm:block">
      <PageHeader
        title="Lợi Nhuận"
        sub={`${yearLabel} · tính như app cũ: Lợi nhuận = Tổng đã thu − Tổng đã chi`}
        actions={
          <Button onClick={() => setCompact((v) => !v)}>
            <Icon name={compact ? 'visibility' : 'visibility_off'} />
            {compact ? 'Hiện đủ cột' : 'Thu gọn cột'}
          </Button>
        }
      />
    </div>
  );
  const filters = (
    <FilterBar>
      <FilterSelect label="Loại" value={kind} onChange={setKind} options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} />
      <FilterSelect label="Trạng thái" value={status} onChange={setStatus} options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
      <SearchBox value={search} onChange={setSearch} placeholder="Tìm công trình, chủ đầu tư…" />
    </FilterBar>
  );

  if (report.rows.length === 0) {
    return (
      <>
        {header}
        <Card><EmptyState icon="savings" title="Chưa có số liệu">{yearLabel} chưa có thu, chi nào. Thử chọn năm khác ở ô chọn năm phía trên.</EmptyState></Card>
      </>
    );
  }

  if (mode === 'phone') {
    return (
      <>
        <div className="text-[12.5px] text-muted">{yearLabel}</div>
        <PhoneKpis
          items={[
            { label: 'Tổng đã thu', value: formatShortMoney(t.received) },
            { label: 'Tổng đã chi', value: formatShortMoney(t.spent) },
            { label: 'Lợi nhuận', value: `${signedMoney(t.profit)} đ`, tone: t.profit >= 0 ? 'pos' : 'neg', wide: true },
          ]}
        />
        {filters}
        {rows.length === 0 ? <Card><EmptyState icon="search_off" title="Không có công trình nào khớp" /></Card> : null}
        {rows.map((r) => (
          <MobileCard key={r.projectId}>
            <MobileRow><b className="min-w-0 break-words">{r.name}</b></MobileRow>
            <MobileRow meta>
              <span>Chi {formatShortMoney(r.spent)} · Thu {formatShortMoney(r.received)}</span>
              <ProfitPill value={r.profit} />
            </MobileRow>
            {r.mode !== 'all' ? <MobileRow meta><span>{sub(r.projectId)}</span>{modeBadge(r)}</MobileRow> : null}
          </MobileCard>
        ))}
      </>
    );
  }

  return (
    <>
      {header}
      {filters}
      <KpiStrip
        items={[
          { label: 'Tổng đã thu', value: formatShortMoney(t.received), sub: 'doanh thu = tiền thực thu' },
          { label: 'Tổng đã chi', value: formatShortMoney(t.spent), sub: pct(t.spent, t.received) },
          { label: 'Lợi nhuận', value: formatShortMoney(t.profit), sub: pct(t.profit, t.received), tone: t.profit >= 0 ? 'pos' : 'neg' },
          { label: 'Còn phải thu', value: formatShortMoney(receivable), tone: receivable > 0 ? 'neg' : '' },
          { label: 'Công trình lãi / lỗ', value: `${rows.length - losing.length} / ${losing.length}` },
        ]}
      />
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Lãi cao nhất" />
          <HBarList tone="good" items={top.map((r) => ({ key: r.projectId, label: r.name, value: r.profit, display: formatShortMoney(r.profit) }))} />
        </Card>
        <Card>
          <CardHeader title="Đang lỗ" sub="thường là CT mới, chưa thu đợt sau" />
          <HBarList tone="bad" items={[...losing].reverse().slice(0, 5).map((r) => ({ key: r.projectId, label: r.name, value: r.profit, display: formatShortMoney(r.profit) }))} />
        </Card>
      </div>
      <Card>
        <div className="tbl">
          <table data-testid="profit-table">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 z-[1]" style={{ verticalAlign: 'bottom', minWidth: compact ? 220 : 300 }}>Công trình</th>
                <th colSpan={compact ? 1 : 3} className="!text-center">Doanh thu</th>
                <th colSpan={compact ? 1 : 4} className="!text-center">Chi phí (tiền đã chi)</th>
                <th rowSpan={2} className="!text-right" style={{ verticalAlign: 'bottom' }}>Lợi nhuận</th>
                {compact ? null : (
                  <th rowSpan={2} className="!text-right" style={{ verticalAlign: 'bottom' }} title="Tham khảo: tính cả hóa đơn mua nợ chưa trả">
                    Tổng chi phí<div className="font-normal">(mọi HĐ)</div>
                  </th>
                )}
              </tr>
              <tr>
                {compact ? null : <th className="!text-right" title="Chỉ để tham chiếu">X · HĐ gốc</th>}
                {compact ? null : <th className="!text-right" title="Chỉ để tham chiếu">Y · Quyết toán</th>}
                <th className="!text-right">Tổng đã thu</th>
                {compact ? null : <th className="!text-right" title="Hóa đơn đã thanh toán + tiền đã trả NCC mua nợ + nhân công">A · Hóa đơn</th>}
                {compact ? null : <th className="!text-right" title="Tiền đã chi cho thầu phụ">B · Thầu phụ</th>}
                {compact ? null : <th className="!text-right">C · CP chung</th>}
                <th className="!text-right">Tổng đã chi <span className="font-normal">(% thu)</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = percentOf(r.spent, r.received);
                return (
                  <tr key={r.projectId} data-project={r.projectId}>
                    <td className="sticky left-0 z-[1] bg-surface">
                      <div className="flex items-center gap-1.5 font-semibold whitespace-nowrap">{r.name} {modeBadge(r)}</div>
                      <div className="text-xs text-muted">{sub(r.projectId)}</div>
                    </td>
                    {compact ? null : <td className="text-right text-muted"><Money value={r.revenue.baseContract} /></td>}
                    {compact ? null : <td className="text-right text-muted"><Money value={r.revenue.settlement} signed /></td>}
                    <td className="text-right font-bold"><Money value={r.received} /></td>
                    {compact ? null : (
                      <td className="text-right">
                        <Money value={r.A} />
                        {Math.round(r.supplierPaid) ? <div className="text-[11px] text-muted" title={`Hóa đơn đã thanh toán: ${formatMoney(r.paidInvoices)} · Đã trả NCC mua nợ: ${formatMoney(r.supplierPaid)}`}>gồm trả NCC</div> : null}
                      </td>
                    )}
                    {compact ? null : <td className="text-right"><Money value={r.B} /></td>}
                    {compact ? null : <td className="text-right"><Money value={r.C} /></td>}
                    <td className="text-right whitespace-nowrap">
                      <b><Money value={r.spent} /></b>{' '}
                      {Math.round(r.spent) ? <Pill tone={r.spent > r.received ? 'bad' : 'neutral'}>{p === null ? '—' : `${p}%`}</Pill> : null}
                    </td>
                    <td className="text-right">{Math.round(r.profit) ? <ProfitPill value={r.profit} /> : <span className="text-faint">—</span>}</td>
                    {compact ? null : <td className="text-right text-muted"><Money value={r.totalCost} /></td>}
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr><td colSpan={compact ? 4 : 10} className="!py-8 text-center text-muted">Không có công trình / chủ đầu tư nào khớp</td></tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="font-bold [&>td]:border-t [&>td]:border-line [&>td]:bg-surface-2">
                <td className="sticky left-0 z-[1]">Tổng cộng ({rows.length} công trình)</td>
                {compact ? null : <td className="text-right"><Money value={t.baseContract} /></td>}
                {compact ? null : <td className="text-right"><Money value={settlement} signed /></td>}
                <td className="text-right" data-testid="total-received"><Money value={t.received} /></td>
                {compact ? null : <td className="text-right"><Money value={t.A} /></td>}
                {compact ? null : <td className="text-right"><Money value={t.B} /></td>}
                {compact ? null : <td className="text-right"><Money value={t.C} /></td>}
                <td className="text-right" data-testid="total-spent"><Money value={t.spent} /></td>
                <td className={`text-right ${t.profit >= 0 ? 'text-good' : 'text-bad'}`} data-testid="total-profit"><Money value={t.profit} signed /></td>
                {compact ? null : <td className="text-right"><Money value={totalCost} /></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <Note>
        <b>A · Hóa đơn</b> = hóa đơn đã thanh toán lúc mua + tiền đã trả cho NCC mua nợ (thay cho hóa đơn của NCC đó) + lương chấm công.{' '}
        <b>B</b> = tiền đã chi thầu phụ, không phải giá trị HĐ. <b>C</b> = chi phí CÔNG TY trong năm × (số ngày thi công × hệ số k) ÷ tổng của mọi công trình.
        X, Y chỉ để tham chiếu.
        {years.length ? <> Khi lọc năm: công trình có một năm chiếm ≥ 80% hóa đơn (<b>HT</b>) chỉ hiện ở năm đó với số cả vòng đời; công trình <b>Nhiều năm</b> hiện số theo năm, riêng lợi nhuận là số toàn thời gian.</> : null}
      </Note>
    </>
  );
}

export function ProfitPage() {
  const { query, years, yearLabel } = useReport();
  return <ReportBody query={query}>{(data) => <Content data={data} years={years} yearLabel={yearLabel} />}</ReportBody>;
}
