// Tab THỐNG KÊ CP/HĐ (chỉ xem): tra cứu mọi khoản chi đã nhập — hóa đơn + dòng lương / HĐ mua lẻ từ chấm công
// (như `buildInvoices` app cũ). Lọc theo năm (ô chọn năm phía trên), tháng, công trình, loại, NCC, người mua.
import { ExportButton } from '@/features/export/ExportButton';
import { useMemo, useState } from 'react';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Button, Icon } from '@/components/ui/button';
import { FilterBar, FilterSelect, PhoneFilters, KpiStrip, MobileCard, MobileRow, Money, Pager, PhoneKpis, SearchBox, usePaged, type Option } from '@/components/ui/data';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, Pill } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { buildCostEntries, inYear, summarizeExpenses, type CostEntry } from '@/lib/calc';
import { formatDate, formatMoney, formatShortMoney } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { EditExpenseById } from '@/features/expenses/EditExpenseSheet';
import { useExpenseLines, type ReportData } from './api';
import { matchesSearch, ReportBody, useReport } from './shared';

const PAGE_SIZE = 50;
export const SOURCE_LABEL: Record<string, string> = { quick: 'Nhanh', detail: 'Chi tiết', scan: 'Ảnh', import: 'Excel', wage: 'Chấm công', retail: 'Chấm công' };
const SOURCE_OPTIONS: Option[] = [{ value: 'quick', label: 'Nhanh' }, { value: 'detail', label: 'Chi tiết' }, { value: 'scan', label: 'Ảnh' }, { value: 'import', label: 'Excel' }, { value: 'timesheet', label: 'Chấm công' }];
const PAID_OPTIONS: Option[] = [{ value: 'paid', label: 'Đã trả' }, { value: 'credit', label: 'Mua nợ' }];
const WAGE_TYPE = 'Nhân Công';
const RETAIL_TYPE = 'Hóa Đơn Lẻ';

export type Row = {
  entry: CostEntry; id: string; date: string | null; month: string; projectId: string; project: string; type: string; supplier: string;
  buyer: string; description: string; paid: boolean; source: string; enteredBy: string; amount: number;
};

export function buildRows(data: ReportData): Row[] {
  const weekStart = new Map(data.timesheetWeeks.map((w) => [w.id, w.week_start]));
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return buildCostEntries(data).map((c) => {
    const e = c.expense as ReportData['expenses'][number] | undefined;
    const ws = c.week_id ? weekStart.get(c.week_id) : undefined;
    const range = ws && c.date ? `${dm(ws)}–${dm(c.date)}` : '';
    const worker = c.worker_id ? data.workerName.get(c.worker_id) ?? '' : '';
    return {
      entry: c, id: c.id, date: c.date, month: c.date ? c.date.slice(5, 7) : '', projectId: c.project_id,
      project: data.projectById.get(c.project_id)?.name ?? '—',
      type: c.source === 'wage' ? WAGE_TYPE : c.source === 'retail' ? RETAIL_TYPE : (e?.expense_type_id && data.catalogName.get(e.expense_type_id)) || 'Chưa phân loại',
      supplier: (e?.supplier_id && data.supplierName.get(e.supplier_id)) || '',
      buyer: c.source === 'retail' ? worker : (e?.buyer_id && data.catalogName.get(e.buyer_id)) || '',
      description: c.source === 'wage' ? `Lương tuần ${range}` : c.source === 'retail' ? `HĐ mua lẻ – ${worker} (${range})` : [e?.description, e?.invoice_no ? `Số HĐ ${e.invoice_no}` : ''].filter(Boolean).join(' · '),
      paid: c.paid_at_purchase,
      source: e?.source ?? c.source,
      enteredBy: (e?.created_by && data.profileName.get(e.created_by)) || '',
      amount: c.amount,
    };
  });
}

const uniqueOptions = (values: string[]): Option[] =>
  [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')).map((v) => ({ value: v, label: v }));

export function PaidPill({ paid }: { paid: boolean }) {
  return paid ? <Pill tone="good">Đã trả</Pill> : <Pill tone="warn">Mua nợ</Pill>;
}

export function DetailSheet({ row, onClose, onEdit }: { row: Row | null; onClose: () => void; onEdit?: (expenseId: string) => void }) {
  const expenseId = row?.entry.expense ? row.id : null;
  const lines = useExpenseLines(expenseId);
  return (
    <Sheet open={!!row} onOpenChange={(o) => { if (!o) onClose(); }} title="Chi tiết khoản chi"
      footer={expenseId && onEdit ? <Button variant="primary" data-testid="stats-edit" onClick={() => onEdit(expenseId)}><Icon name="edit" />Sửa hóa đơn</Button> : undefined}>
      {row ? (
        <>
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px] [&>dt]:text-muted">
            <dt>Ngày</dt><dd className="num">{formatDate(row.date)}</dd>
            <dt>Công trình</dt><dd>{row.project}</dd>
            <dt>Loại chi phí</dt><dd>{row.type}</dd>
            <dt>Nhà cung cấp</dt><dd>{row.supplier || '—'}</dd>
            <dt>Người mua</dt><dd>{row.buyer || '—'}</dd>
            <dt>Nội dung</dt><dd>{row.description || '—'}</dd>
            <dt>Thanh toán</dt><dd><PaidPill paid={row.paid} /></dd>
            <dt>Nguồn</dt><dd>{SOURCE_LABEL[row.source] ?? row.source}</dd>
            <dt>Người TH</dt><dd>{row.enteredBy || '—'}</dd>
            <dt>Số tiền</dt><dd className="num text-[15px] font-bold">{formatMoney(row.amount)} đ</dd>
          </dl>
          {expenseId ? (
            lines.isPending ? <LoadingState label="Đang tải dòng vật tư…" />
            : lines.isError ? <ErrorState error={lines.error} onRetry={() => void lines.refetch()} />
            : lines.data.length === 0 ? <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">Hóa đơn nhập nhanh, không có dòng vật tư. Ảnh hóa đơn (nếu chụp) sẽ hiện ở đây từ GĐ9.</div>
            : (
              <div className="tbl rounded-lg border border-line">
                <table>
                  <thead><tr><th>Vật tư</th><th className="!text-right">SL</th><th className="!text-right">Đơn giá</th><th className="!text-right">Thành tiền</th></tr></thead>
                  <tbody>
                    {lines.data.map((l) => (
                      <tr key={l.id}>
                        <td>{l.name}{l.note ? <div className="text-[11.5px] text-muted">{l.note}</div> : null}</td>
                        <td className="num text-right">{l.quantity === null ? '' : l.quantity.toLocaleString('vi-VN')} {l.unit}</td>
                        <td className="text-right">{l.unit_price === null ? '' : <Money value={l.unit_price} />}</td>
                        <td className="text-right"><Money value={l.amount} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">Dòng này tự sinh từ bảng chấm công của tuần, không nhập ở tab Nhập Chi Phí.</div>}
        </>
      ) : null}
    </Sheet>
  );
}

function Content({ data, years, yearLabel }: { data: ReportData; years: readonly number[]; yearLabel: string }) {
  const mode = useLayoutMode();
  const [month, setMonth] = useState('');
  const [project, setProject] = useState('');
  const [type, setType] = useState('');
  const [supplier, setSupplier] = useState('');
  const [buyer, setBuyer] = useState('');
  const [paid, setPaid] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const canEdit = hasLevel(useAccess().permissions, 'expenses', 'add');

  const all = useMemo(() => buildRows(data), [data]);
  const inScope = useMemo(
    () => all.filter((r) => inYear(r.date, years)).sort((a, b) => (a.date === b.date ? 0 : (a.date ?? '') < (b.date ?? '') ? 1 : -1)),
    [all, years],
  );
  const options = useMemo(() => ({
    projects: [...new Map(inScope.map((r) => [r.projectId, r.project]))].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    types: uniqueOptions(inScope.map((r) => r.type)),
    suppliers: uniqueOptions(inScope.map((r) => r.supplier)),
    buyers: uniqueOptions(inScope.map((r) => r.buyer)),
  }), [inScope]);
  const rows = useMemo(
    () => inScope.filter((r) =>
      (!month || r.month === month) && (!project || r.projectId === project) && (!type || r.type === type) &&
      (!supplier || r.supplier === supplier) && (!buyer || r.buyer === buyer) && (!paid || r.paid === (paid === 'paid')) &&
      (!source || (source === 'timesheet' ? !r.entry.expense : r.source === source)) && matchesSearch(search, r.description, r.project, r.supplier, r.type)),
    [inScope, month, project, type, supplier, buyer, paid, source, search],
  );
  const summary = useMemo(() => {
    const typeOf = new Map(rows.map((r) => [r.entry, r.type]));
    return summarizeExpenses(rows.map((r) => r.entry), (c) => typeOf.get(c) ?? '');
  }, [rows]);
  const topType = summary.topType;
  const paged = usePaged(rows, PAGE_SIZE, `${years.join()}|${month}|${project}|${type}|${supplier}|${buyer}|${paid}|${source}|${search}`);
  const scope = month ? `tháng ${Number(month)}` : yearLabel.toLowerCase();

  const filters = (
    <FilterBar>
      <FilterSelect label="Tháng" value={month} onChange={setMonth} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: String(i + 1) }))} />
      <FilterSelect label="Công trình" value={project} onChange={setProject} options={options.projects} />
      <FilterSelect label="Loại" value={type} onChange={setType} options={options.types} />
      <FilterSelect label="NCC" value={supplier} onChange={setSupplier} options={options.suppliers} />
      <FilterSelect label="Người mua" value={buyer} onChange={setBuyer} options={options.buyers} />
      <FilterSelect label="Thanh toán" value={paid} onChange={setPaid} options={PAID_OPTIONS} />
      <FilterSelect label="Nguồn" value={source} onChange={setSource} options={SOURCE_OPTIONS} />
      <SearchBox value={search} onChange={setSearch} placeholder="Tìm nội dung…" />
    </FilterBar>
  );
  const empty = inScope.length === 0
    ? <Card><EmptyState icon="receipt_long" title="Chưa có khoản chi nào">{yearLabel} chưa có hóa đơn hay chấm công. Thử chọn năm khác ở ô chọn năm phía trên.</EmptyState></Card>
    : rows.length === 0 ? <Card><EmptyState icon="search_off" title="Không có khoản chi nào khớp bộ lọc" /></Card> : null;

  if (mode === 'phone') {
    return (
      <>
        <PhoneFilters active={[month, project, type, supplier, buyer, paid, source].filter(Boolean).length}
          search={<SearchBox value={search} onChange={setSearch} placeholder="Tìm nội dung…" className="min-w-0" />}>
          <FilterSelect label="Tháng" value={month} onChange={setMonth} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: String(i + 1) }))} />
          <FilterSelect label="Thanh toán" value={paid} onChange={setPaid} options={PAID_OPTIONS} />
          <FilterSelect label="Công trình" value={project} onChange={setProject} options={options.projects} className="col-span-2" />
          <FilterSelect label="Loại" value={type} onChange={setType} options={options.types} />
          <FilterSelect label="Nguồn" value={source} onChange={setSource} options={SOURCE_OPTIONS} />
          <FilterSelect label="NCC" value={supplier} onChange={setSupplier} options={options.suppliers} className="col-span-2" />
          <FilterSelect label="Người mua" value={buyer} onChange={setBuyer} options={options.buyers} className="col-span-2" />
        </PhoneFilters>
        <PhoneKpis items={[{ label: `Tổng tiền · ${summary.count.toLocaleString('vi-VN')} khoản${month ? ` · T${Number(month)}` : ''}`, value: formatShortMoney(summary.total) }, { label: 'Mua nợ', value: formatShortMoney(summary.creditTotal), tone: summary.creditTotal > 0 ? 'neg' : '' }]} />
        {empty}
        {paged.slice.map((r) => (
          <MobileCard key={r.id} onClick={() => setOpen(r)}>
            <MobileRow><b className="min-w-0 truncate">{r.type}</b><b className="num">{formatMoney(r.amount)}</b></MobileRow>
            <MobileRow meta><span className="min-w-0 truncate">{years.length === 1 ? formatDate(r.date).slice(0, 5) : formatDate(r.date)} · {r.project}</span></MobileRow>
            <MobileRow meta><span className="min-w-0 truncate">{[r.supplier, r.buyer ? `mua: ${r.buyer}` : ''].filter(Boolean).join(' · ') || r.description}</span>{r.paid ? null : <PaidPill paid={false} />}</MobileRow>
          </MobileCard>
        ))}
        {rows.length > PAGE_SIZE ? <Pager {...paged} /> : null}
        <DetailSheet row={open} onClose={() => setOpen(null)} onEdit={canEdit ? (id) => { setOpen(null); setEditId(id); } : undefined} />
        <EditExpenseById id={editId} onClose={() => setEditId(null)} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Thống Kê CP/HĐ" sub="Tra cứu mọi khoản chi đã nhập (hóa đơn + lương chấm công)" actions={<ExportButton datasets={['expenses', 'expense_lines']} />} />
      {filters}
      <KpiStrip
        items={[
          { label: `Số khoản chi ${scope}`, value: summary.count.toLocaleString('vi-VN') },
          { label: 'Tổng tiền', value: formatMoney(summary.total), sub: 'đ' },
          { label: 'Mua nợ (chưa tích Đã TT)', value: formatShortMoney(summary.creditTotal) },
          { label: 'Nhập từ ảnh', value: summary.scanned.toLocaleString('vi-VN'), sub: 'hóa đơn' },
          { label: 'Loại chi nhiều nhất', value: topType ? topType.label : '—', sub: topType ? formatShortMoney(topType.amount) : '' },
        ]}
      />
      {empty ?? (
        <Card>
          <div className="tbl tbl-tight">
            <table data-testid="expense-table">
              <thead>
                <tr>
                  <th>Ngày</th><th>Loại chi phí</th><th>Công trình</th><th>Nội dung</th><th>Người mua</th><th>Nhà cung cấp</th>
                  <th>Thanh toán</th><th>Người TH</th><th>Nguồn</th><th className="!text-right">Số tiền</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((r) => (
                  <tr key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                    <td className="num">{formatDate(r.date)}</td>
                    <td className="max-w-[130px] truncate" title={r.type}>{r.type}</td>
                    <td className="max-w-[190px] truncate" title={r.project}>{r.project}</td>
                    <td className="max-w-[220px] min-w-[140px] truncate text-muted" title={r.description}>{r.description}</td>
                    <td className="whitespace-nowrap">{r.buyer}</td>
                    <td className="max-w-[150px] truncate" title={r.supplier}>{r.supplier}</td>
                    <td><PaidPill paid={r.paid} /></td>
                    <td className="whitespace-nowrap">{r.enteredBy}</td>
                    <td className="whitespace-nowrap text-muted">{SOURCE_LABEL[r.source] ?? r.source}</td>
                    <td className="text-right"><Money value={r.amount} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold [&>td]:border-t [&>td]:border-line [&>td]:bg-surface-2">
                  <td colSpan={9}>Tổng {rows.length.toLocaleString('vi-VN')} khoản chi đang lọc</td>
                  <td className="text-right" data-testid="expense-total"><Money value={summary.total} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
      {rows.length > 0 ? <Pager {...paged} /> : null}
      <DetailSheet row={open} onClose={() => setOpen(null)} onEdit={canEdit ? (id) => { setOpen(null); setEditId(id); } : undefined} />
      <EditExpenseById id={editId} onClose={() => setEditId(null)} />
    </>
  );
}

export function ExpenseStatsPage() {
  const { query, years, yearLabel } = useReport();
  return <ReportBody query={query}>{(data) => <Content data={data} years={years} yearLabel={yearLabel} />}</ReportBody>;
}
