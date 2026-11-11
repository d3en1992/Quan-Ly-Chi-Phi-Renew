// CHI TIẾT CÔNG TRÌNH: dải số, cấu thành A / B / C, 6 tab (Tổng hợp chi phí · Hóa đơn · Nhân công · Thầu phụ · Nhà cung cấp · Thu tiền).
// Mọi số lấy từ src/lib/calc (projectNumbers = cùng hàm với tab Lợi Nhuận).
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { Money, HBarList, KpiStrip, PhoneKpis, signedMoney } from '@/components/ui/data';
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from '@/components/ui/dropdown';
import { Field, Input } from '@/components/ui/input';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, Note, PageHeader, Pill, SubTabs } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { ALL_YEARS, collapseBreakdown, inYear, inYearLoose, percentOf, projectCostByType, projectDays, projectK, projectPayroll, projectSubcontracts, projectSuppliers, type YearFilter } from '@/lib/calc';
import { formatDate, formatMoney, formatShortMoney } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { buildRows, DetailSheet, PaidPill, SOURCE_LABEL, type Row } from '@/features/reports/ExpenseStatsPage';
import { useReportData, type ReportData } from '@/features/reports/api';
import { useReport } from '@/features/reports/shared';
import { useCustomersLite, useDeleteProject, useProjectsFull, useUpdateProject, type ProjectFull } from './api';
import { STATUS_LABEL } from './labels';
import { ProjectFormSheet } from './ProjectFormSheet';
import { projectNumbers } from './numbers';

type TabKey = 'summary' | 'invoices' | 'payroll' | 'subs' | 'suppliers' | 'receipts';
const RECEIPT_KIND: Record<string, string> = { advance: 'Tạm ứng', stage: 'Giai đoạn', settlement: 'Quyết toán', other: 'Khác' };

const receiptSchema = z.object({ id: z.string(), date: z.string(), amount: z.coerce.number(), kind: z.string(), note: z.string().nullable(), created_by: z.string().nullable() });

function useReceipts(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['project-receipts', projectId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('receipts').select('id,date,amount,kind,note,created_by').eq('project_id', projectId).is('deleted_at', null).order('date', { ascending: false });
      if (error) throw new Error(`Không đọc được phiếu thu: ${error.message}`);
      return z.array(receiptSchema).parse(data ?? []);
    },
  });
}

/** Hộp nhập 1 ngày (Hoàn thành / Quyết toán) */
function DateSheet({ open, title, label, onClose, onSubmit, busy }: { open: boolean; title: string; label: string; onClose: () => void; onSubmit: (date: string) => void; busy: boolean }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={title}
      footer={<><Button variant="primary" className="flex-1" disabled={busy || !date} onClick={() => onSubmit(date)}>Xác nhận</Button><Button onClick={onClose}>Hủy</Button></>}>
      <Field label={label}><Input type="date" aria-label={label} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
    </Sheet>
  );
}

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const reportQ = useReportData();
  const projectsQ = useProjectsFull();
  const customersQ = useCustomersLite();
  if (reportQ.isError || projectsQ.isError) return <Card><ErrorState error={reportQ.error ?? projectsQ.error} onRetry={() => { void reportQ.refetch(); void projectsQ.refetch(); }} /></Card>;
  if (!reportQ.data || !projectsQ.data) return <Card><LoadingState label="Đang tải công trình…" /></Card>;
  const project = projectsQ.data.find((p) => p.id === projectId);
  if (!project) return <Card><EmptyState icon="construction" title="Không tìm thấy công trình"><Link to="/cong-trinh" className="text-accent">Về danh sách công trình</Link></EmptyState></Card>;
  const customer = customersQ.data?.find((c) => c.id === project.customer_id)?.name ?? project.owner_name ?? '';
  return <Detail data={reportQ.data} project={project} customer={customer} />;
}

function Detail({ data, project, customer }: { data: ReportData; project: ProjectFull; customer: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const access = useAccess();
  const mode = useLayoutMode();
  const { years, yearLabel } = useReport();
  const money = hasLevel(access.permissions, 'revenue') || hasLevel(access.permissions, 'profit');
  const canEdit = hasLevel(access.permissions, 'projects', 'add');
  const canDelete = hasLevel(access.permissions, 'projects', 'full');
  const [tab, setTab] = useState<TabKey>('summary');
  const [editing, setEditing] = useState(false);
  const [dateAction, setDateAction] = useState<'complete' | 'close' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const update = useUpdateProject();
  const del = useDeleteProject();
  const [open, setOpen] = useState<Row | null>(null);

  const nums = useMemo(() => projectNumbers(data, years, data.loadedAt), [data, years]);
  const n = nums.of(project);
  const row = nums.report.rows.find((r) => r.projectId === project.id);
  // Công trình hạch toán vào 1 năm (≥ 80%) hoặc chưa có dòng: số là TOÀN VÒNG ĐỜI → các tab con cũng xem toàn vòng đời
  const scope: YearFilter = row?.mode === 'split' ? years : ALL_YEARS;
  const typeName = (id: string | null | undefined) => (id ? data.catalogName.get(id) ?? '' : '');

  const byType = useMemo(() => collapseBreakdown(projectCostByType(project.id, data, scope, typeName), 8), [data, project.id, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const subs = useMemo(() => projectSubcontracts(project.id, data.subcontracts, data.payments, scope), [data, project.id, scope]);
  const subDebt = subs.reduce((s, r) => s + (r.debt > 0 ? r.debt : 0), 0);
  const days = projectDays(project, years, data.loadedAt);
  const k = projectK(project);
  const pct = percentOf(n.received, n.revenue.contractValue);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: 'TỔNG HỢP CHI PHÍ' }, { key: 'invoices', label: 'HÓA ĐƠN' }, { key: 'payroll', label: 'NHÂN CÔNG' },
    { key: 'subs', label: 'THẦU PHỤ' }, { key: 'suppliers', label: 'NHÀ CUNG CẤP' },
    ...(money ? [{ key: 'receipts' as TabKey, label: 'THU TIỀN' }] : []),
  ];

  const setStatus = async (kind: 'complete' | 'close', date: string) => {
    try {
      await update.mutateAsync(kind === 'complete'
        ? { id: project.id, patch: { status: 'completed', end_date: date, completed_date: date } }
        : { id: project.id, patch: { status: 'closed', closed_date: date } });
      toast(kind === 'complete' ? `Đã hoàn thành: ${project.name}` : `Đã quyết toán: ${project.name}`);
      setDateAction(null);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const doDelete = async () => {
    try { await del.mutateAsync(project.id); toast(`Đã xóa: ${project.name}`); navigate('/cong-trinh'); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); setDeleting(false); }
  };

  const actions = canEdit ? (
    <>
      <Button onClick={() => setEditing(true)}><Icon name="edit" />Sửa công trình</Button>
      <DropdownMenu>
        <DropdownTrigger asChild><Button aria-label="Thêm thao tác"><Icon name="more_horiz" />Khác</Button></DropdownTrigger>
        <DropdownContent>
          {project.status !== 'completed' && project.status !== 'closed' ? <DropdownItem onSelect={() => setDateAction('complete')}><Icon name="check_circle" />Hoàn thành</DropdownItem> : null}
          {project.status !== 'closed' ? <DropdownItem onSelect={() => setDateAction('close')}><Icon name="lock" />Quyết toán (đóng)</DropdownItem> : null}
          {canDelete ? <DropdownItem danger onSelect={() => setDeleting(true)}><Icon name="delete" />Xóa công trình</DropdownItem> : null}
        </DropdownContent>
      </DropdownMenu>
    </>
  ) : null;

  const sub = `Khách hàng: ${customer || '—'} · Bắt đầu ${formatDate(project.start_date)} · ${STATUS_LABEL[project.status] ?? project.status}`;
  const crumb = (
    <div className="flex items-center gap-1 text-[12.5px] text-muted">
      <Link to="/cong-trinh" className="text-accent">Công Trình</Link><Icon name="chevron_right" className="!text-[16px]" />Chi tiết
    </div>
  );

  const kpis = [
    money && { label: 'Giá trị hợp đồng', value: formatMoney(n.revenue.contractValue), sub: n.revenue.hasSettlement ? 'đã gồm quyết toán' : '' },
    money && { label: 'Đã thu', value: formatMoney(n.received), sub: pct === null ? '' : `${pct}%`, tone: 'pos' as const },
    money && { label: 'Còn phải thu', value: formatMoney(n.revenue.receivable), tone: (n.revenue.receivable > 0 ? 'neg' : '') as 'neg' | '' },
    { label: 'Tổng đã chi', value: formatMoney(n.spent), sub: money ? (percentOf(n.spent, n.received) === null ? 'A + B + C' : `${percentOf(n.spent, n.received)}% đã thu`) : 'A + B + C' },
    { label: 'Tổng chi phí (mọi HĐ)', value: formatMoney(n.totalCost), sub: n.supplierDebt > 0 ? `còn nợ NCC ${formatMoney(n.supplierDebt)}` : 'không nợ NCC' },
    { label: 'Thầu phụ còn phải trả', value: formatMoney(subDebt) },
    money && { label: 'Lãi / lỗ', value: signedMoney(n.profit), tone: (Math.round(n.profit) >= 0 ? 'pos' : 'neg') as 'pos' | 'neg' },
  ];

  return (
    <>
      {mode === 'phone' ? (
        <div className="grid gap-1">
          <b className="text-[16px] leading-tight break-words" data-testid="project-title">{project.name}</b>
          <span className="text-[12.5px] text-muted">{sub}</span>
          {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
        </div>
      ) : (
        <PageHeader title={project.name} sub={sub} actions={actions} />
      )}
      {mode !== 'phone' ? crumb : null}
      {mode === 'phone' ? (
        <PhoneKpis items={[
          ...(money ? [{ label: 'Đã thu', value: formatShortMoney(n.received), tone: 'pos' as const }, { label: 'Còn phải thu', value: formatShortMoney(n.revenue.receivable), tone: 'neg' as const }] : []),
          { label: 'Tổng đã chi', value: formatShortMoney(n.spent) },
          { label: 'Tổng chi (mọi HĐ)', value: formatShortMoney(n.totalCost) },
          ...(money ? [{ label: 'Lãi / lỗ', value: signedMoney(n.profit), tone: (Math.round(n.profit) >= 0 ? 'pos' : 'neg') as 'pos' | 'neg', wide: true }] : []),
        ]} />
      ) : <KpiStrip items={kpis} />}
      <Note icon="view_timeline">Tiến độ thi công sẽ hiện ở đây khi tab Tiến Độ có dữ liệu. <Link to="/tien-do" className="font-semibold text-accent">Xem tiến độ</Link> · {yearLabel}</Note>
      <SubTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'summary' ? (
        <div className="grid items-start gap-3.5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Chi theo loại chi phí (A)" sub={`${formatMoney(n.A)} đ`} />
            <HBarList items={byType.map((b) => ({ key: b.label, label: b.label, value: b.amount, display: formatMoney(b.amount) }))} empty="Chưa có chi phí" />
          </Card>
          <Card>
            <CardHeader title="Cấu thành tổng chi" />
            <div className="tbl">
              <table>
                <tbody>
                  <tr><td>A · Hóa đơn đã thanh toán + trả NCC + nhân công</td><td className="text-right"><Money value={n.A} /></td></tr>
                  <tr><td>B · Đã ứng thầu phụ</td><td className="text-right"><Money value={n.B} /></td></tr>
                  <tr><td>C · Phân bổ chi phí chung <span className="text-faint">({days} ngày × k {String(k).replace('.', ',')})</span></td><td className="text-right"><Money value={n.C} /></td></tr>
                </tbody>
                <tfoot>
                  <tr className="font-bold"><td>Tổng đã chi <span className="font-normal text-faint">(tính lãi / lỗ)</span></td><td className="num text-right" data-testid="detail-spent">{formatMoney(n.spent)}</td></tr>
                  <tr><td>+ Nợ nhà cung cấp chưa trả</td><td className="text-right"><Money value={n.supplierDebt} /></td></tr>
                  <tr><td>Tổng chi phí (mọi hóa đơn, tham khảo)</td><td className="num text-right">{formatMoney(n.totalCost)}</td></tr>
                </tfoot>
              </table>
            </div>
            {money ? (
              <div className="tbl border-t border-line">
                <table>
                  <tbody>
                    <tr className="text-muted"><td>X · Hợp đồng gốc (tham chiếu)</td><td className="text-right"><Money value={n.revenue.baseContract} /></td></tr>
                    <tr className="text-muted"><td>Y · Quyết toán (tham chiếu)</td><td className="text-right"><Money value={n.revenue.settlement} signed /></td></tr>
                    <tr><td>Tổng đã thu</td><td className="num text-right">{formatMoney(n.received)}</td></tr>
                  </tbody>
                  <tfoot>
                    <tr className="font-bold"><td>Lợi nhuận = Đã thu − Đã chi</td><td className={`num text-right ${Math.round(n.profit) >= 0 ? 'text-good' : 'text-bad'}`} data-testid="detail-profit">{signedMoney(n.profit)}</td></tr>
                  </tfoot>
                </table>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
      {tab === 'invoices' ? <InvoicesTab data={data} projectId={project.id} years={scope} onOpen={setOpen} /> : null}
      {tab === 'payroll' ? <PayrollTab data={data} projectId={project.id} years={scope} /> : null}
      {tab === 'subs' ? <SubsTab data={data} rows={subs} /> : null}
      {tab === 'suppliers' ? <SuppliersTab data={data} projectId={project.id} years={scope} /> : null}
      {tab === 'receipts' && money ? <ReceiptsTab projectId={project.id} data={data} years={scope} /> : null}

      <ProjectFormSheet open={editing} onClose={() => setEditing(false)} project={project} />
      <DateSheet open={dateAction === 'complete'} title="Hoàn thành công trình" label="Ngày hoàn thành" busy={update.isPending} onClose={() => setDateAction(null)} onSubmit={(d) => void setStatus('complete', d)} />
      <DateSheet open={dateAction === 'close'} title="Quyết toán công trình" label="Ngày quyết toán" busy={update.isPending} onClose={() => setDateAction(null)} onSubmit={(d) => void setStatus('close', d)} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Xóa công trình?" danger busy={del.isPending} confirmLabel="Xóa"
        message={<>Xóa công trình <b>{project.name}</b>? Chỉ xóa được khi công trình không còn dữ liệu (hóa đơn, chấm công, phiếu chi, thu…). Công trình bị xóa vào Thùng Rác.</>} onConfirm={() => void doDelete()} />
      <DetailSheet row={open} onClose={() => setOpen(null)} />
    </>
  );
}

function InvoicesTab({ data, projectId, years, onOpen }: { data: ReportData; projectId: string; years: YearFilter; onOpen: (r: Row) => void }) {
  const rows = useMemo(
    () => buildRows(data).filter((r) => r.projectId === projectId && (years.length === 0 || inYear(r.date, years))).sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1)),
    [data, projectId, years],
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (rows.length === 0) return <Card><EmptyState icon="receipt_long" title="Chưa có hóa đơn nào" /></Card>;
  return (
    <Card>
      <div className="tbl">
        <table data-testid="detail-invoices">
          <thead><tr><th>Ngày</th><th>Loại chi phí</th><th>Nội dung</th><th>Người mua</th><th>Nhà cung cấp</th><th>Thanh toán</th><th>Nguồn</th><th className="!text-right">Số tiền</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer" onClick={() => onOpen(r)}>
                <td className="num">{formatDate(r.date)}</td><td className="whitespace-nowrap">{r.type}</td>
                <td className="max-w-[260px] min-w-[140px] truncate text-muted" title={r.description}>{r.description}</td>
                <td className="whitespace-nowrap">{r.buyer}</td><td className="whitespace-nowrap">{r.supplier}</td>
                <td><PaidPill paid={r.paid} /></td><td className="whitespace-nowrap text-muted">{SOURCE_LABEL[r.source] ?? r.source}</td>
                <td className="text-right"><Money value={r.amount} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-bold [&>td]:border-t [&>td]:border-line [&>td]:bg-surface-2"><td colSpan={7}>Tổng {rows.length} hóa đơn</td><td className="num text-right">{formatMoney(total)}</td></tr></tfoot>
        </table>
      </div>
    </Card>
  );
}

function PayrollTab({ data, projectId, years }: { data: ReportData; projectId: string; years: YearFilter }) {
  const weeks = useMemo(() => projectPayroll(projectId, data, years), [data, projectId, years]);
  if (weeks.length === 0) return <Card><EmptyState icon="calendar_month" title="Chưa có chấm công" /></Card>;
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const sum = (f: (w: (typeof weeks)[number]) => number) => weeks.reduce((s, w) => s + f(w), 0);
  return (
    <Card>
      <div className="tbl">
        <table>
          <thead><tr><th>Tuần</th><th className="!text-right">Số thợ</th><th className="!text-right">Tổng công</th><th className="!text-right">Tổng lương</th><th className="!text-right">Phụ cấp + HĐ lẻ</th><th className="!text-right">Thực lãnh</th></tr></thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.weekStart}>
                <td className="whitespace-nowrap">CN {dm(w.weekStart)} – T7 {dm(w.weekEnd)}</td><td className="num text-right">{w.workers}</td>
                <td className="num text-right">{w.dayUnits.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</td>
                <td className="text-right"><Money value={w.wage} /></td><td className="text-right"><Money value={w.extras} /></td><td className="text-right"><Money value={w.netPay} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-bold [&>td]:border-t [&>td]:border-line [&>td]:bg-surface-2"><td>Tổng {weeks.length} tuần</td><td /><td className="num text-right">{sum((w) => w.dayUnits).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</td><td className="num text-right">{formatMoney(sum((w) => w.wage))}</td><td className="num text-right">{formatMoney(sum((w) => w.extras))}</td><td className="num text-right">{formatMoney(sum((w) => w.netPay))}</td></tr></tfoot>
        </table>
      </div>
    </Card>
  );
}

function SubsTab({ data, rows }: { data: ReportData; rows: ReturnType<typeof projectSubcontracts> }) {
  if (rows.length === 0) return <Card><EmptyState icon="engineering" title="Chưa có hợp đồng thầu phụ" /></Card>;
  return (
    <Card>
      <div className="tbl">
        <table>
          <thead><tr><th>Thầu phụ</th><th>Ngày HĐ</th><th className="!text-right">Giá trị HĐ</th><th className="!text-right">Đã trả</th><th className="!text-right">Còn phải trả</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold">{data.subcontractorName.get(r.subcontractorId) ?? '—'}</td><td className="num">{formatDate(r.date)}</td>
                <td className="text-right"><Money value={r.total} /></td><td className="text-right"><Money value={r.paid} /></td>
                <td className="text-right">{Math.round(r.debt) > 0 ? <Money value={r.debt} className="text-bad" /> : <Pill tone="good">Đã tất toán</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SuppliersTab({ data, projectId, years }: { data: ReportData; projectId: string; years: YearFilter }) {
  const rows = useMemo(() => projectSuppliers(projectId, data, years), [data, projectId, years]);
  if (rows.length === 0) return <Card><EmptyState icon="storefront" title="Chưa mua của nhà cung cấp nào" /></Card>;
  return (
    <Card>
      <div className="tbl">
        <table>
          <thead><tr><th>Nhà cung cấp</th><th className="!text-right">Số hóa đơn</th><th className="!text-right">Tổng mua</th><th className="!text-right">Đã ứng / trả</th><th className="!text-right">Còn nợ</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.supplierId ?? 'none'}>
                <td>{r.supplierId ? data.supplierName.get(r.supplierId) ?? '—' : 'Không ghi nhà cung cấp'}</td><td className="num text-right">{r.invoices}</td>
                <td className="text-right"><Money value={r.purchased} /></td><td className="text-right"><Money value={r.paid} /></td>
                <td className="text-right"><Money value={r.debt} className="text-bad" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReceiptsTab({ projectId, data, years }: { projectId: string; data: ReportData; years: YearFilter }) {
  const q0 = useReceipts(projectId, true);
  const q = { ...q0, data: q0.data?.filter((r) => inYearLoose(r.date, years)) ?? [] };
  if (q0.isPending) return <Card><LoadingState /></Card>;
  if (q0.isError) return <Card><ErrorState error={q0.error} onRetry={() => void q0.refetch()} /></Card>;
  if (q.data.length === 0) return <Card><EmptyState icon="attach_money" title="Chưa thu tiền lần nào" /></Card>;
  const total = q.data.reduce((s, r) => s + r.amount, 0);
  return (
    <Card>
      <div className="tbl">
        <table>
          <thead><tr><th>Ngày</th><th>Loại thu</th><th>Nội dung</th><th>Người TH</th><th className="!text-right">Số tiền</th></tr></thead>
          <tbody>
            {q.data.map((r) => (
              <tr key={r.id}>
                <td className="num">{formatDate(r.date)}</td><td><Pill tone={r.kind === 'advance' ? 'warn' : r.kind === 'settlement' ? 'accent' : 'good'}>{RECEIPT_KIND[r.kind] ?? r.kind}</Pill></td>
                <td className="text-muted">{r.note}</td><td>{(r.created_by && data.profileName.get(r.created_by)) || ''}</td><td className="text-right"><Money value={r.amount} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-bold [&>td]:border-t [&>td]:border-line [&>td]:bg-surface-2"><td colSpan={4}>Tổng {q.data.length} lần thu</td><td className="num text-right">{formatMoney(total)}</td></tr></tfoot>
        </table>
      </div>
    </Card>
  );
}
