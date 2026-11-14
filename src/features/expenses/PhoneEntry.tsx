// Điện thoại: màn NHẬP TAY một khoản chi (MP.nhap của mẫu) + các hóa đơn đã nhập trong ngày.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { MobileCard, MobileRow } from '@/components/ui/data';
import { HasPhotoMark } from '@/features/scan/ReceiptPhoto';
import { Checkbox, Input, MoneyInput } from '@/components/ui/input';
import { Card, EmptyState, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { sumAmounts } from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCreateExpenses, type EntryExpense } from './api';
import { blankInvoice, checkInvoice, type InvoiceDraft, type InvoiceField } from './invoice-model';
import { findByName, findDuplicates, historySuggest, isoToVn, type DupHit } from './logic';
import type { ExpenseInput } from './schema';
import { defaultPaid, DuplicateDialog, toDupCandidate, type Lists } from './shared';

const chip = 'rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-fg aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent';
const box = 'grid gap-1.5 rounded-[var(--r)] border border-line bg-surface px-3.5 py-2.5';
const label = 'text-[12px] font-medium text-muted';

/** 5 loại chi phí dùng nhiều nhất (để bấm nhanh), còn lại nằm sau "Khác…" */
export function topTypeIds(expenses: readonly EntryExpense[], limit = 5): string[] {
  const n = new Map<string, number>();
  for (const e of expenses) n.set(e.expense_type_id, (n.get(e.expense_type_id) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}

type Props = { lists: Lists; expenses: readonly EntryExpense[]; canAdd: boolean; today: string; onOpen: (e: EntryExpense) => void };

export function PhoneEntry({ lists, expenses, canAdd, today, onOpen }: Props) {
  const toast = useToast();
  const create = useCreateExpenses();
  const [draft, setDraft] = useState<InvoiceDraft>(() => blankInvoice(today, false));
  const [bad, setBad] = useState<InvoiceField[]>([]);
  const [otherType, setOtherType] = useState(false);
  const [dups, setDups] = useState<{ hits: DupHit[]; input: ExpenseInput } | null>(null);
  const set = <K extends keyof InvoiceDraft>(k: K, v: InvoiceDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const quickTypes = useMemo(() => {
    const top = topTypeIds(expenses).map((id) => lists.types.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
    return top.length ? top : lists.types.slice(0, 5);
  }, [expenses, lists.types]);
  const descriptions = useMemo(() => historySuggest(expenses.map((e) => ({ text: e.description, date: e.date }))).map((n) => ({ id: n, name: n })), [expenses]);
  const dayRows = useMemo(() => expenses.filter((e) => e.date === draft.date).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)), [expenses, draft.date]);
  const typeInQuick = quickTypes.some((t) => t.name === draft.type);
  const isBad = (f: InvoiceField) => bad.includes(f);

  const doSave = (input: ExpenseInput) => {
    create.mutate([input], {
      onSuccess: () => {
        toast(`Đã lưu chi phí · ${formatMoney(input.amount)} đ`);
        // Giữ ngày, công trình, loại, người mua cho khoản kế tiếp
        setDraft((d) => ({ ...blankInvoice(d.date, false), project: d.project, type: d.type, buyer: d.buyer }));
        setDups(null); setBad([]);
      },
      onError: (e) => { setDups(null); toast(`Chưa lưu được: ${e.message}`, 'error'); },
    });
  };
  const save = () => {
    if (create.isPending) return;
    const check = checkInvoice(draft, { ...lists, projects: lists.projectOptions }, 'quick');
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
    <>
      <div className="flex gap-2">
        <button type="button" className={chip} aria-pressed="true">Nhập tay</button>
        <Link to="/chup" className={chip} aria-pressed="false">Trợ lý AI</Link>
      </div>
      {canAdd ? (
        <>
          <div className={cn(box, isBad('amount') && 'border-bad')}>
            <span className={label}>Số tiền</span>
            <div className="flex items-baseline gap-1.5">
              <MoneyInput aria-label="Số tiền" className="!h-11 !border-0 !bg-transparent !px-0 !text-left !text-[26px] font-bold" value={draft.amount} onChange={(v) => set('amount', v)} />
              <small className="text-[14px] text-faint">đ</small>
            </div>
          </div>
          <div className={cn(box, isBad('type') && 'border-bad')}>
            <span className={label}>Loại chi phí</span>
            <div className="flex flex-wrap gap-1.5">
              {quickTypes.map((t) => (
                <button key={t.id} type="button" className={chip} aria-pressed={draft.type === t.name} onClick={() => { set('type', t.name); setOtherType(false); }}>{t.name}</button>
              ))}
              <button type="button" className={chip} aria-pressed={otherType || (!!draft.type && !typeInQuick)} onClick={() => { setOtherType(true); if (typeInQuick) set('type', ''); }}>Khác…</button>
            </div>
            {otherType || (draft.type && !typeInQuick) ? (
              <Combo aria-label="Loại chi phí khác" placeholder="Gõ để tìm loại chi phí" value={draft.type} onChange={(v) => set('type', v)} items={lists.types} groupLabel="Loại chi phí" onCreate={(t) => lists.create('expense_type', t)} />
            ) : null}
          </div>
          <div className={box}>
            <span className={label}>Công trình</span>
            <Combo aria-label="Công trình" placeholder="Chọn công trình" value={draft.project} onChange={(v) => set('project', v)} items={lists.projectOptions} groupLabel="Công trình" invalid={isBad('project') || undefined} />
          </div>
          <div className={box}>
            <span className={label}>Nội dung</span>
            <Combo aria-label="Nội dung" free value={draft.description} onChange={(v) => set('description', v)} items={descriptions} groupLabel="Nội dung đã nhập" maxLength={2000} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid min-w-0 gap-1.5"><span className={label}>Ngày</span><Input type="date" aria-label="Ngày" value={draft.date} aria-invalid={isBad('date') || undefined} onChange={(e) => set('date', e.target.value)} /></label>
            <label className="grid min-w-0 gap-1.5"><span className={label}>Người mua</span>
              <Combo aria-label="Người mua" value={draft.buyer} onChange={(v) => set('buyer', v)} items={lists.buyers} groupLabel="Người mua" onCreate={(t) => lists.create('person', t)} invalid={isBad('buyer') || undefined} />
            </label>
          </div>
          <div className={box}>
            <span className={label}>Nhà cung cấp</span>
            <Combo
              aria-label="Nhà cung cấp" value={draft.supplier} items={lists.suppliers} groupLabel="Nhà cung cấp" onCreate={(t) => lists.create('supplier', t)} invalid={isBad('supplier') || undefined}
              onChange={(v) => setDraft((d) => {
                const before = findByName(d.supplier, lists.suppliers)?.id, after = findByName(v, lists.suppliers)?.id;
                return { ...d, supplier: v, paid: before !== after ? defaultPaid(v, lists.suppliers) : d.paid };
              })}
            />
          </div>
          <div className={box}>
            <Checkbox checked={draft.paid} onChange={(v) => set('paid', v)} label="Đã thanh toán lúc mua" />
            <span className="text-[12px] text-muted">Bỏ tích nếu mua nợ, hóa đơn sẽ vào Công nợ NCC</span>
          </div>
          <button type="button" data-testid="phone-save" disabled={create.isPending} onClick={save}
            className="flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-[var(--r)] bg-accent text-[17px] font-bold text-white shadow-sm active:opacity-90 disabled:opacity-60 [&_.ms]:text-[22px]">
            <Icon name="save" />{create.isPending ? 'Đang lưu…' : 'Lưu chi phí'}
          </button>
        </>
      ) : <Card><EmptyState icon="lock" title="Tài khoản chỉ được xem">Cần quyền Nhập ở mục Nhập Chi Phí để thêm khoản chi.</EmptyState></Card>}

      <div className="mt-1 flex items-baseline justify-between text-[12.5px] text-muted">
        <b className="text-fg">Đã nhập ngày {isoToVn(draft.date)}</b>
        <span>{dayRows.length} hóa đơn · <span className="num">{formatMoney(sumAmounts(dayRows.map((r) => r.amount)))}</span> đ</span>
      </div>
      {dayRows.length === 0 ? <div className="rounded-[var(--r)] border border-dashed border-line px-3.5 py-4 text-center text-[12.5px] text-muted">Chưa có hóa đơn nào trong ngày này.</div> : null}
      {dayRows.map((e) => (
        <MobileCard key={e.id} onClick={() => onOpen(e)}>
          <MobileRow><b className="min-w-0 truncate">{lists.nameOf(e.expense_type_id) || 'Chưa phân loại'}</b><b className="num">{formatMoney(e.amount)}</b></MobileRow>
          <MobileRow meta><span className="min-w-0 truncate">{lists.nameOf(e.project_id)}</span><HasPhotoMark path={e.receipt_image_path} /></MobileRow>
          <MobileRow meta><span className="min-w-0 truncate">{e.description || lists.nameOf(e.supplier_id) || '—'}</span>{e.paid_at_purchase ? <Pill tone="good">Đã trả</Pill> : <Pill tone="warn">Mua nợ</Pill>}</MobileRow>
        </MobileCard>
      ))}
      <DuplicateDialog hits={dups?.hits ?? null} lists={lists} busy={create.isPending} onCancel={() => setDups(null)} onConfirm={() => { if (dups) doSave(dups.input); }} />
    </>
  );
}
