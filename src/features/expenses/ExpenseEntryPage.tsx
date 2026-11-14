// Tab NHẬP CHI PHÍ (PAGES.nhap của mẫu): NHẬP NHANH (lưới kiểu Excel + hóa đơn trong ngày) · HÓA ĐƠN CHI TIẾT · CHỤP HÓA ĐƠN (AI đọc ảnh, features/scan).
// Điện thoại: màn Nhập tay (MP.nhap) ở PhoneEntry.tsx.
import { useCallback, useMemo, useState } from 'react';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Button, Icon } from '@/components/ui/button';
import { Money } from '@/components/ui/data';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, Pill, SubTabs } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { sumAmounts } from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { useCreateExpenses, useEntryExpenses, useLineHistory, type EntryExpense } from './api';
import { EditExpenseSheet } from './EditExpenseSheet';
import { InvoiceFields, useLineSuggestions } from './InvoiceForm';
import { blankInvoice, checkInvoice, type InvoiceDraft, type InvoiceField } from './invoice-model';
import { findDuplicates, historySuggest, isoToVn, type DupHit } from './logic';
import { PhoneEntry } from './PhoneEntry';
import { HasPhotoMark } from '@/features/scan/ReceiptPhoto';
import { ScanWorkspace } from '@/features/scan/ScanWorkspace';
import { QuickGrid } from './QuickGrid';
import type { ExpenseInput } from './schema';
import { DuplicateDialog, toDupCandidate, today, useLists, type Lists } from './shared';

type Tab = 'quick' | 'detail' | 'scan';
const TABS: { key: Tab; label: string }[] = [{ key: 'quick', label: 'NHẬP NHANH' }, { key: 'detail', label: 'HÓA ĐƠN CHI TIẾT' }, { key: 'scan', label: 'TRỢ LÝ AI' }];
const SOURCE_SHORT: Record<string, string> = { quick: 'Nhanh', detail: 'Chi tiết', scan: 'Ảnh', import: 'Excel' };

/** Hóa đơn của một ngày, mới nhập đứng trên */
export function expensesOfDay(expenses: readonly EntryExpense[], date: string): EntryExpense[] {
  return expenses.filter((e) => e.date === date).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

/** "Hóa đơn trong ngày" dưới lưới: bấm một dòng → bảng trượt sửa */
function DayInvoices({ date, expenses, lists, onOpen }: { date: string; expenses: readonly EntryExpense[]; lists: Lists; onOpen: (e: EntryExpense) => void }) {
  const rows = useMemo(() => expensesOfDay(expenses, date), [expenses, date]);
  const total = sumAmounts(rows.map((r) => r.amount));
  return (
    <Card>
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <h3 className="m-0 text-sm font-bold">Hóa đơn trong ngày</h3>
        <small className="num text-muted" data-testid="day-date">{isoToVn(date)}</small>
        <div className="flex-1" />
        <small className="text-muted">Bấm một dòng để sửa</small>
      </header>
      {rows.length === 0 ? <EmptyState icon="receipt_long" title={`Ngày ${isoToVn(date)} chưa có hóa đơn nào`}>Lưu ở lưới phía trên thì hóa đơn hiện ở đây.</EmptyState> : (
        <div className="tbl">
          <table data-testid="day-table">
            <thead>
              <tr><th>Loại chi phí</th><th>Công trình</th><th>Nội dung</th><th>Người mua</th><th>Nhà cung cấp</th><th>Thanh toán</th><th>Nguồn</th><th className="!text-right">Số tiền</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="cursor-pointer" tabIndex={0} onClick={() => onOpen(e)} onKeyDown={(ev) => { if (ev.key === 'Enter') onOpen(e); }}>
                  <td className="whitespace-nowrap">{lists.nameOf(e.expense_type_id) || 'Chưa phân loại'}</td>
                  <td className="whitespace-nowrap">{lists.nameOf(e.project_id) || '—'}</td>
                  <td className="max-w-[300px] min-w-[150px] truncate text-muted" title={e.description}>{e.description}</td>
                  <td className="whitespace-nowrap">{lists.nameOf(e.buyer_id)}</td>
                  <td className="whitespace-nowrap">{lists.nameOf(e.supplier_id)}</td>
                  <td>{e.paid_at_purchase ? <Pill tone="good">Đã trả</Pill> : <Pill tone="warn">Mua nợ</Pill>}</td>
                  <td className="whitespace-nowrap text-muted">{SOURCE_SHORT[e.source] ?? e.source}<HasPhotoMark path={e.receipt_image_path} /></td>
                  <td className="text-right"><Money value={e.amount} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold [&>td]:bg-surface-2">
                <td colSpan={7}>Tổng <span data-testid="day-count">{rows.length}</span> hóa đơn</td>
                <td className="text-right" data-testid="day-total"><Money value={total} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Tab HÓA ĐƠN CHI TIẾT: nhiều dòng vật tư trong một hóa đơn */
function DetailInvoice({ lists, expenses, onSavedDate }: { lists: Lists; expenses: readonly EntryExpense[]; onSavedDate: (iso: string) => void }) {
  const toast = useToast();
  const create = useCreateExpenses();
  const lineHistory = useLineHistory(true);
  const suggestions = useLineSuggestions(lineHistory.data, lists);
  const descriptions = useMemo(() => historySuggest(expenses.map((e) => ({ text: e.description, date: e.date }))).map((n) => ({ id: n, name: n })), [expenses]);
  const [draft, setDraft] = useState<InvoiceDraft>(() => blankInvoice(today(), true));
  const [bad, setBad] = useState<InvoiceField[]>([]);
  const [dups, setDups] = useState<{ hits: DupHit[]; input: ExpenseInput } | null>(null);

  const doSave = (input: ExpenseInput) => {
    create.mutate([input], {
      onSuccess: () => {
        toast(`Đã lưu hóa đơn ${input.lines?.length ?? 0} dòng · ${formatMoney(input.amount)} đ`);
        // Giữ ngày + công trình + người mua cho hóa đơn kế (thường nhập liền một xấp cùng công trình)
        setDraft((d) => ({ ...blankInvoice(d.date, true), project: d.project, buyer: d.buyer }));
        setDups(null); setBad([]); onSavedDate(input.date);
      },
      onError: (e) => { setDups(null); toast(`Chưa lưu được: ${e.message}`, 'error'); },
    });
  };
  const save = () => {
    if (create.isPending) return;
    const check = checkInvoice(draft, { ...lists, projects: lists.projectOptions }, 'detail');
    if (!check.ok) { setBad(check.bad); toast(check.message, 'error'); return; }
    setBad([]);
    const i = check.input;
    const hits = findDuplicates(
      [{ id: null, date: i.date, projectId: i.projectId, typeId: i.typeId, buyerId: i.buyerId, supplierId: i.supplierId, amount: i.amount, description: i.description }],
      expenses.map(toDupCandidate),
    );
    if (hits.length) { setDups({ hits, input: i }); return; }
    doSave(i);
  };

  return (
    <Card>
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <h3 className="m-0 text-sm font-bold">Hóa đơn chi tiết</h3>
        <small className="text-muted">Nhiều dòng vật tư trong một hóa đơn</small>
        <div className="flex-1" />
      </header>
      <div className="grid gap-3 p-4" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } }}>
        <InvoiceFields draft={draft} setDraft={setDraft} lists={lists} suggestions={suggestions} descriptions={descriptions} bad={bad} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => { setDraft(blankInvoice(today(), true)); setBad([]); }}><Icon name="restart_alt" />Làm lại</Button>
          <Button variant="primary" data-testid="detail-save" disabled={create.isPending} onClick={save}><Icon name="save" />{create.isPending ? 'Đang lưu…' : 'Lưu hóa đơn'}</Button>
        </div>
      </div>
      <DuplicateDialog hits={dups?.hits ?? null} lists={lists} busy={create.isPending} onCancel={() => setDups(null)} onConfirm={() => { if (dups) doSave(dups.input); }} />
    </Card>
  );
}

export function ExpenseEntryPage() {
  const mode = useLayoutMode();
  const access = useAccess();
  const { query, lists } = useLists();
  const expensesQuery = useEntryExpenses();
  const [tab, setTab] = useState<Tab>('quick');
  const todayIso = today();
  const [activeDate, setActiveDate] = useState(todayIso);
  const [editing, setEditing] = useState<EntryExpense | null>(null);
  const onActiveDate = useCallback((iso: string) => setActiveDate(iso), []);
  const canAdd = hasLevel(access.permissions, 'expenses', 'add');
  const expenses = expensesQuery.data;

  const header = mode === 'phone' ? null : (
    <PageHeader title="Nhập Chi Phí" sub="Hóa đơn, vật tư, chi phí công trình" />
  );
  if (query.isPending || expensesQuery.isPending) return <>{header}<Card><LoadingState label="Đang tải danh mục…" /></Card></>;
  if (query.isError || expensesQuery.isError || !lists || !expenses) {
    return <>{header}<Card><ErrorState error={query.error ?? expensesQuery.error ?? 'Không tải được danh mục'} onRetry={() => { void query.refetch(); void expensesQuery.refetch(); }} /></Card></>;
  }
  const sheet = <EditExpenseSheet expense={editing} expenses={expenses} lists={lists} onClose={() => setEditing(null)} />;

  if (mode === 'phone') {
    return <><PhoneEntry lists={lists} expenses={expenses} canAdd={canAdd} today={todayIso} onOpen={setEditing} />{sheet}</>;
  }
  return (
    <>
      {header}
      <SubTabs tabs={TABS} value={tab} onChange={setTab} />
      {!canAdd ? <Card><EmptyState icon="lock" title="Tài khoản chỉ được xem">Bạn xem được hóa đơn trong ngày bên dưới; muốn nhập cần quyền Nhập ở mục Nhập Chi Phí.</EmptyState></Card> : null}
      {tab === 'quick' ? (
        <>
          {canAdd ? <QuickGrid lists={lists} expenses={expenses} today={todayIso} onActiveDate={onActiveDate} /> : null}
          <DayInvoices date={activeDate} expenses={expenses} lists={lists} onOpen={setEditing} />
        </>
      ) : tab === 'detail' ? (
        <>
          {canAdd ? <DetailInvoice lists={lists} expenses={expenses} onSavedDate={setActiveDate} /> : null}
          <DayInvoices date={activeDate} expenses={expenses} lists={lists} onOpen={setEditing} />
        </>
      ) : (
        canAdd ? <ScanWorkspace /> : null
      )}
      {sheet}
    </>
  );
}
