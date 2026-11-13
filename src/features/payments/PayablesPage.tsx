// Tab CÔNG NỢ PHẢI TRẢ (PAGES.congno / MP.congno — công ty nợ thầu phụ, nhà cung cấp; mục 4L):
// HỢP ĐỒNG THẦU PHỤ (master–detail, trả nhanh) · NHÀ CUNG CẤP (sổ nợ theo NCC + Đối chiếu, mục 4J) · TẤT TOÁN.
import { Fragment, useMemo, useState } from 'react';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { useYears } from '@/app/year';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { ConfirmDialog } from '@/components/ui/confirm';
import { FilterBar, FilterSelect, HBar, KpiStrip, MiniList, MobileCard, MobileRow, SearchBox } from '@/components/ui/data';
import { Checkbox, Field, Input, MoneyInput, Select } from '@/components/ui/input';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, Note, PageHeader, Pill } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import {
  allocatedByPayment, contractItemsTotal, inYearLoose, PAYABLE_DONE_TOLERANCE, percentOf, subcontractTotal, sumOf, supplierStatement, toYearFilter,
  type ContractItem, type PairPayable, type YearFilter,
} from '@/lib/calc';
import { formatDate, formatMoney } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { copyText } from '@/lib/clipboard';
import { subcontractZaloText, supplierZaloText } from './zalo';
import { findByName } from '@/features/expenses/logic';
import { matchesSearch, todayIso } from '@/features/reports/shared';
import {
  MODE_LABEL, useClosePayable, useCreateParty, useCreatePayments, useDeleteSubcontract, usePayData, useSaveSubcontract, useUndoClosure,
  type Closure, type PayData, type Subcontract,
} from './api';
import { blankPayDraft, canEditRow, ItemsEditor, PaymentSheet, usePayCalc, type PayCalc, type PayDraft } from './shared';

export type PayablesTab = 'contracts' | 'suppliers' | 'closures';
type Ctx = { data: PayData; calc: PayCalc; years: YearFilter; phone: boolean; canAdd: boolean; canPay: boolean; company: string };

const pct = (a: number, b: number) => percentOf(a, b) ?? 0;
const Dash = () => <span className="text-faint">—</span>;
function Ratio({ paid, total }: { paid: number; total: number }) {
  const pc = pct(paid, total);
  return <div className="flex items-center gap-2"><div className="min-w-[60px] flex-1"><HBar percent={pc} tone={pc >= 100 ? 'good' : 'accent'} /></div><span className="num text-xs text-muted">{Math.round(pc)}%</span></div>;
}

// ───────────────────────── HỢP ĐỒNG THẦU PHỤ ─────────────────────────
type ContractDraft = { id: string | null; date: string; sub: string; project: string; value: number; variation: number; description: string; items: ContractItem[] };
const blankContract = (): ContractDraft => ({ id: null, date: todayIso(), sub: '', project: '', value: 0, variation: 0, description: '', items: [] });

function ContractForm({ ctx, draft, setDraft, onDone }: { ctx: Ctx; draft: ContractDraft; setDraft: (d: ContractDraft) => void; onDone: () => void }) {
  const { data } = ctx;
  const toast = useToast();
  const save = useSaveSubcontract(), createParty = useCreateParty();
  const set = <K extends keyof ContractDraft>(k: K, v: ContractDraft[K]) => setDraft({ ...draft, [k]: v });
  const subs = data.subcontractors.filter((s) => !s.archived || findByName(draft.sub, [s]));
  const projects = [...data.projectOptions, ...data.projects.filter((p) => p.id === draft.project && !data.projectOptions.some((o) => o.id === p.id))];
  const submit = () => {
    const sub = findByName(draft.sub, data.subcontractors);
    if (!sub) { toast(draft.sub.trim() ? `"${draft.sub.trim()}" chưa có trong danh bạ thầu phụ — chọn "+ Tạo mới"` : 'Chọn thầu phụ!', 'error'); return; }
    if (!draft.project) { toast('Chọn công trình!', 'error'); return; }
    save.mutate({ id: draft.id, date: draft.date, subcontractorId: sub.id, projectId: draft.project, value: draft.value, variation: draft.variation, description: draft.description, items: draft.items }, {
      onSuccess: () => { toast(draft.id ? 'Đã cập nhật hợp đồng thầu phụ' : `Đã thêm hợp đồng thầu phụ · ${sub.name}`); onDone(); },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };
  return (
    <>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Ngày"><Input type="date" aria-label="Ngày hợp đồng" value={draft.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Thầu phụ *">
          <Combo aria-label="Thầu phụ" placeholder="Chọn / gõ tên thầu phụ…" value={draft.sub} onChange={(v) => set('sub', v)} items={subs} groupLabel="Thầu phụ"
            onCreate={(name) => createParty.mutateAsync({ table: 'subcontractors', name }).catch((e: Error) => { toast(e.message, 'error'); return ''; })} />
        </Field>
        <Field label="Công trình *" className="sm:col-span-2">
          <Select aria-label="Công trình" value={draft.project} onChange={(e) => set('project', e.target.value)}>
            <option value="">— Chọn công trình —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Giá trị HĐ"><MoneyInput aria-label="Giá trị HĐ" value={draft.value} onChange={(v) => set('value', v)} /></Field>
        <Field label="Phát sinh"><MoneyInput aria-label="Phát sinh" value={draft.variation} onChange={(v) => set('variation', v)} /></Field>
        <Field label="Nội dung" className="sm:col-span-2"><Input aria-label="Nội dung hợp đồng" value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Nhân công sơn nước…" /></Field>
        <div className="sm:col-span-2 lg:col-span-4">
          <ItemsEditor items={draft.items} onChange={(v) => set('items', v)} />
          {draft.items.length ? <Button size="sm" className="mt-1.5" onClick={() => set('value', contractItemsTotal(draft.items))}>Lấy tổng hạng mục làm Giá trị HĐ</Button> : null}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line-soft px-4 py-3">
        {draft.id ? <Button onClick={onDone}>Hủy sửa</Button> : null}
        <Button variant="primary" data-testid="hdtp-save" disabled={save.isPending} onClick={submit}><Icon name={draft.id ? 'save' : 'add'} />{save.isPending ? 'Đang lưu…' : draft.id ? 'Lưu hợp đồng' : 'Thêm hợp đồng'}</Button>
      </div>
    </>
  );
}

/** Phiếu chi tính cho hợp đồng này: gắn thẳng HĐ, hoặc chưa gắn HĐ nào nhưng cùng cặp thầu phụ × công trình */
const paymentsOf = (data: PayData, h: Subcontract) => data.payments
  .filter((p) => p.kind !== 'supplier_payment' && (p.subcontract_id === h.id || (!p.subcontract_id && p.subcontractor_id === h.subcontractor_id && p.project_id === h.project_id)))
  .sort((a, b) => a.date.localeCompare(b.date));

function ContractDetail({ ctx, h, debt, onEdit }: { ctx: Ctx; h: Subcontract; debt: number; onEdit: () => void }) {
  const { data, calc } = ctx;
  const toast = useToast();
  const access = useAccess();
  const pay = useCreatePayments(), del = useDeleteSubcontract();
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState(Math.max(0, debt));
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const list = paymentsOf(data, h);
  const editable = canEditRow(access, 'payables', h.created_by);
  const zalo = async () => {
    const c = calc.contract.get(h.id);
    const text = subcontractZaloText({
      subcontractor: data.subcontractorName(h.subcontractor_id), project: data.projectName(h.project_id), description: h.description, date: h.date,
      total: c?.total ?? subcontractTotal(h), paid: c?.paid ?? 0, debt: c?.debt ?? subcontractTotal(h), payments: list,
    });
    { const ok = await copyText(text); toast(ok ? 'Đã chép — dán vào Zalo' : 'Trình duyệt chặn chép, thử lại', ok ? 'ok' : 'error'); }
  };
  const submit = () => {
    if (amount <= 0) { toast('Nhập số tiền > 0!', 'error'); return; }
    pay.mutate([{ kind: 'advance', date, amount, note: note || 'Ứng thêm', mode: 'fifo', picks: [], supplierId: null, subcontractorId: h.subcontractor_id, projectId: h.project_id, subcontractId: h.id }], {
      onSuccess: () => { toast(`Đã ghi phiếu chi ${formatMoney(amount)} · ${data.subcontractorName(h.subcontractor_id)}`); setNote(''); },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };
  return (
    <div className="grid gap-4 bg-surface-2 p-3 md:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <div className="mb-1.5 text-xs font-semibold text-muted">Lịch sử trả</div>
        {list.length && ctx.phone ? (
          <MiniList testId="hdtp-history" items={list.map((p) => ({
            key: p.id, title: formatDate(p.date), value: formatMoney(p.amount),
            sub: <>{p.note}{!p.subcontract_id ? <span className="text-faint"> · chung cặp</span> : null}</>,
          }))} footer={list.length > 1 ? { label: `${list.length} lần trả`, value: formatMoney(sumOf(list, (p) => p.amount)) } : undefined} />
        ) : list.length ? (
          <table><thead><tr><th>Ngày</th><th>Nội dung</th><th className="!text-right">Số tiền</th></tr></thead>
            <tbody>{list.map((p) => <tr key={p.id}><td className="num whitespace-nowrap">{formatDate(p.date)}</td><td className="text-muted">{p.note}{!p.subcontract_id ? <small className="ml-1 text-faint">(chung cặp)</small> : null}</td><td className="num text-right">{formatMoney(p.amount)}</td></tr>)}</tbody></table>
        ) : <span className="text-[13px] text-muted">Chưa trả lần nào</span>}
        {h.items.length ? <div className="mt-2 text-xs text-muted">Hạng mục: {h.items.map((i) => `${i.name} (${String(i.sl).replace('.', ',')} ${i.donVi})`).join(' · ')}</div> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {editable ? <Button size="sm" onClick={onEdit}><Icon name="edit" />Sửa HĐ</Button> : null}
          <Button size="sm" data-testid="hdtp-zalo" onClick={() => void zalo()}><Icon name="chat" />Copy Zalo</Button>
          {editable ? <Button size="sm" variant="ghost-danger" onClick={() => setConfirm(true)}><Icon name="delete" />Xóa HĐ</Button> : null}
        </div>
      </div>
      {ctx.canPay ? (
        <div className="grid content-start gap-2 rounded-lg border border-line bg-surface p-3">
          <div className="text-xs font-semibold text-muted">Trả thêm</div>
          <Input type="date" aria-label="Ngày trả" value={date} onChange={(e) => setDate(e.target.value)} />
          <MoneyInput aria-label="Số tiền trả" value={amount} onChange={setAmount} />
          <Input aria-label="Nội dung trả" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nội dung (không bắt buộc)" />
          <Button variant="primary" data-testid="hdtp-pay" disabled={pay.isPending} onClick={submit}><Icon name="add" />Ghi nhận trả</Button>
        </div>
      ) : null}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Xóa hợp đồng thầu phụ?" danger busy={del.isPending} confirmLabel="Xóa"
        message={<>Xóa hợp đồng {formatMoney(subcontractTotal(h))} của {data.subcontractorName(h.subcontractor_id)}. Các phiếu chi đã ghi vẫn giữ nguyên. Hợp đồng vào Thùng rác.</>}
        onConfirm={() => del.mutate(h.id, { onSuccess: () => { setConfirm(false); toast('Đã xóa hợp đồng'); }, onError: (e) => { setConfirm(false); toast(`Chưa xóa được: ${e.message}`, 'error'); } })} />
    </div>
  );
}

function ContractsTab({ ctx }: { ctx: Ctx }) {
  const { data, calc, years, phone, canAdd } = ctx;
  const [project, setProject] = useState('');
  const [status, setStatus] = useState('debt');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContractDraft>(blankContract);
  const [formOpen, setFormOpen] = useState(false);
  const rows = useMemo(() => data.subcontracts
    .map((h) => ({ h, c: calc.contract.get(h.id) ?? { subcontractId: h.id, total: subcontractTotal(h), paid: 0, debt: subcontractTotal(h) } }))
    .filter(({ h, c }) => inYearLoose(h.date, years) && (!project || h.project_id === project) && (!status || (status === 'debt' ? c.debt > 0 : c.debt <= 0))
      && matchesSearch(q, data.subcontractorName(h.subcontractor_id), h.description, data.projectName(h.project_id)))
    .sort((a, b) => (b.h.date ?? '').localeCompare(a.h.date ?? '')), [data, calc, years, project, status, q]);
  const T = { total: sumOf(rows, (r) => r.c.total), paid: sumOf(rows, (r) => r.c.paid), debt: sumOf(rows, (r) => Math.max(0, r.c.debt)) };
  const edit = (h: Subcontract) => {
    setDraft({ id: h.id, date: h.date ?? todayIso(), sub: data.subcontractorName(h.subcontractor_id), project: h.project_id, value: h.value, variation: h.legacy_variation, description: h.description ?? '', items: h.items });
    setFormOpen(true);
    if (!phone) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const done = () => { setDraft(blankContract()); setFormOpen(false); };
  const debtCell = (debt: number) => (debt > 0 ? <b className="num text-bad">{formatMoney(debt)}</b> : debt < 0 ? <Pill tone="warn">Trả dư {formatMoney(-debt)}</Pill> : <Pill tone="good">Đã trả đủ</Pill>);

  return (
    <>
      {canAdd && !phone ? (
        <Card>
          <CardHeader title={draft.id ? 'Sửa HĐ thầu phụ' : 'Thêm HĐ thầu phụ'} />
          <ContractForm ctx={ctx} draft={draft} setDraft={setDraft} onDone={done} />
        </Card>
      ) : null}
      {canAdd && phone ? <Button variant="primary" size="lg" onClick={() => { setDraft(blankContract()); setFormOpen(true); }}><Icon name="add" />Thêm HĐ thầu phụ</Button> : null}
      <FilterBar>
        <FilterSelect label="Công trình" value={project} onChange={setProject} options={data.projects.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterSelect label="Trạng thái" value={status} onChange={setStatus} options={[{ value: 'debt', label: 'Còn nợ' }, { value: 'done', label: 'Đã trả đủ' }]} />
        <SearchBox value={q} onChange={setQ} placeholder="Tìm thầu phụ…" />
      </FilterBar>
      <KpiStrip items={[
        { label: 'Tổng giá trị HĐ', value: formatMoney(T.total), sub: `${rows.length} hợp đồng` },
        { label: 'Đã trả', value: formatMoney(T.paid), sub: `${Math.round(pct(T.paid, T.total))}%` },
        { label: 'Còn phải trả', value: <span data-testid="hdtp-debt-total">{formatMoney(T.debt)}</span>, tone: T.debt > 0 ? 'neg' : '' },
      ]} />
      <Card>
        {rows.length === 0 ? <EmptyState icon="handshake" title="Không có hợp đồng thầu phụ nào khớp bộ lọc" /> : phone ? (
          <div className="grid gap-2 p-2">
            {rows.map(({ h, c }) => (
              <Fragment key={h.id}>
                <MobileCard onClick={() => setOpen(open === h.id ? null : h.id)}>
                  <MobileRow><b className="truncate">{data.subcontractorName(h.subcontractor_id)}</b>{debtCell(c.debt)}</MobileRow>
                  <MobileRow meta><span className="truncate">{data.projectName(h.project_id)} · {h.description}</span></MobileRow>
                  <HBar percent={pct(c.paid, c.total)} tone={c.debt <= 0 ? 'good' : 'accent'} />
                  <MobileRow meta><span>Đã trả {formatMoney(c.paid)} / {formatMoney(c.total)}</span><span>{open === h.id ? 'Thu gọn' : 'Trả thêm'}</span></MobileRow>
                </MobileCard>
                {open === h.id ? <ContractDetail ctx={ctx} h={h} debt={c.debt} onEdit={() => edit(h)} /> : null}
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="tbl">
            <table data-testid="hdtp-table">
              <thead><tr><th style={{ width: 36 }} /><th>Ngày</th><th>Thầu phụ</th><th>Công trình</th><th>Nội dung</th><th className="!text-right">Giá trị HĐ</th><th className="!text-right">Đã trả</th><th style={{ width: 130 }}>Tỉ lệ trả</th><th className="!text-right">Còn phải trả</th></tr></thead>
              <tbody>
                {rows.map(({ h, c }) => (
                  <Fragment key={h.id}>
                    <tr className="cursor-pointer" tabIndex={0} aria-expanded={open === h.id} onClick={() => setOpen(open === h.id ? null : h.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(open === h.id ? null : h.id); }}>
                      <td><Icon name={open === h.id ? 'expand_more' : 'chevron_right'} className="text-faint" /></td>
                      <td className="num whitespace-nowrap">{formatDate(h.date)}</td>
                      <td className="whitespace-nowrap"><b className="font-semibold">{data.subcontractorName(h.subcontractor_id)}</b></td>
                      <td className="max-w-[240px] truncate">{data.projectName(h.project_id)}</td>
                      <td className="max-w-[220px] truncate text-muted" title={h.description ?? ''}>{h.description}</td>
                      <td className="num text-right">{formatMoney(c.total)}</td>
                      <td className="num text-right">{c.paid ? formatMoney(c.paid) : <Dash />}</td>
                      <td><Ratio paid={c.paid} total={c.total} /></td>
                      <td className="text-right whitespace-nowrap">{debtCell(c.debt)}</td>
                    </tr>
                    {open === h.id ? <tr><td colSpan={9} className="!p-0"><ContractDetail ctx={ctx} h={h} debt={c.debt} onEdit={() => edit(h)} /></td></tr> : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {phone ? (
        <Sheet wide open={formOpen} onOpenChange={(o) => { if (!o) done(); }} title={draft.id ? 'Sửa HĐ thầu phụ' : 'Thêm HĐ thầu phụ'}>
          <div className="-m-4"><ContractForm ctx={ctx} draft={draft} setDraft={setDraft} onDone={done} /></div>
        </Sheet>
      ) : null}
    </>
  );
}

// ───────────────────────── NHÀ CUNG CẤP ─────────────────────────
function StatementSheet({ ctx, supplierId, onClose, onPay }: { ctx: Ctx; supplierId: string; onClose: () => void; onPay: () => void }) {
  const { data, calc } = ctx;
  const name = data.supplierName(supplierId);
  const invoices = useMemo(() => data.credits.filter((c) => c.supplier_id === supplierId), [data, supplierId]);
  const payments = useMemo(() => data.payments.filter((p) => p.supplier_id === supplierId).sort((a, b) => a.date.localeCompare(b.date)), [data, supplierId]);
  const lines = useMemo(() => supplierStatement(invoices, data.allocations.filter((a) => payments.some((p) => p.id === a.payment_id))), [invoices, payments, data]);
  const allocated = useMemo(() => allocatedByPayment(data.allocations), [data]);
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const s = calc.supplier.get(supplierId);
  const toast = useToast();
  const zalo = async () => {
    const text = supplierZaloText({
      supplier: name, today: todayIso(), creditInvoices: s?.creditInvoices ?? 0, paid: s?.paid ?? 0, debt: s?.debt ?? 0,
      open: lines.filter((l) => l.remaining > 0).map((l) => ({ date: l.date, project: data.projectName(l.project_id), description: byId.get(l.id)?.description, remaining: l.remaining })),
    });
    { const ok = await copyText(text); toast(ok ? 'Đã chép — dán vào Zalo' : 'Trình duyệt chặn chép, thử lại', ok ? 'ok' : 'error'); }
  };
  return (
    <Sheet wide open onOpenChange={(o) => { if (!o) onClose(); }} title={`Đối chiếu · ${name}`}
      footer={<><Button data-testid="ncc-zalo" onClick={() => void zalo()}><Icon name="chat" />Copy Zalo</Button><div className="flex-1" />{ctx.canPay ? <Button variant="primary" onClick={onPay}><Icon name="payments" />Trả tiền</Button> : null}</>}>
      <div className="grid grid-cols-3 gap-2 text-[13px]">
        <div><div className="text-xs text-muted">Tổng mua nợ</div><b className="num" data-testid="dc-total">{formatMoney(s?.creditInvoices ?? 0)}</b></div>
        <div><div className="text-xs text-muted">Đã trả</div><b className="num" data-testid="dc-paid">{formatMoney(s?.paid ?? 0)}</b></div>
        <div><div className="text-xs text-muted">Còn nợ</div><b className={`num ${(s?.debt ?? 0) > 0 ? 'text-bad' : 'text-good'}`} data-testid="dc-debt">{formatMoney(s?.debt ?? 0)}</b></div>
      </div>
      <div className="text-xs font-semibold text-muted">Hóa đơn mua nợ theo ngày ({lines.length})</div>
      {lines.length === 0 ? <EmptyState icon="receipt_long" title="Chưa có hóa đơn mua nợ" /> : ctx.phone ? (
        <MiniList testId="dc-list" items={lines.map((l) => ({
          key: l.id, title: data.projectName(l.project_id),
          sub: <>{formatDate(l.date)}{byId.get(l.id)?.description ? ` · ${byId.get(l.id)?.description}` : ''}</>,
          value: l.remaining > 0 ? <span className="text-bad">{formatMoney(l.remaining)}</span> : <Pill tone="good">Đã trả</Pill>,
          valueSub: l.paid ? `${formatMoney(l.paid)} / ${formatMoney(l.amount)}` : formatMoney(l.amount),
        }))} />
      ) : (
        <div className="tbl">
          <table data-testid="dc-table">
            <thead><tr><th>Ngày</th><th>Công trình</th><th>Nội dung</th><th className="!text-right">Tiền hàng</th><th className="!text-right">Đã trả</th><th className="!text-right">Còn lại</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="num whitespace-nowrap">{formatDate(l.date)}</td>
                  <td className="max-w-[150px] truncate" title={data.projectName(l.project_id)}>{data.projectName(l.project_id)}</td>
                  <td className="max-w-[150px] truncate text-muted" title={byId.get(l.id)?.description ?? ''}>{byId.get(l.id)?.description}</td>
                  <td className="num text-right">{formatMoney(l.amount)}</td>
                  <td className="num text-right">{l.paid ? formatMoney(l.paid) : <Dash />}</td>
                  <td className="text-right">{l.remaining > 0 ? <b className="num text-bad">{formatMoney(l.remaining)}</b> : <Pill tone="good">Đã trả</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-xs font-semibold text-muted">Các lần trả tiền ({payments.length})</div>
      {payments.length === 0 ? <span className="text-[13px] text-muted">Chưa trả lần nào</span> : ctx.phone ? (
        <MiniList items={payments.map((p) => {
          const rest = p.amount - (allocated.get(p.id) ?? 0);
          return {
            key: p.id, title: formatDate(p.date), value: formatMoney(p.amount),
            sub: [p.allocation_mode === 'project' ? data.projectName(p.project_id) : MODE_LABEL[p.allocation_mode], p.note].filter(Boolean).join(' · '),
            valueSub: rest > 0 ? <span className="text-warn">chưa chia {formatMoney(rest)}</span> : undefined,
          };
        })} />
      ) : (
        <div className="tbl">
          <table>
            <thead><tr><th>Ngày</th><th>Cách chia</th><th>Nội dung</th><th className="!text-right">Số tiền</th><th className="!text-right">Chưa chia</th></tr></thead>
            <tbody>
              {payments.map((p) => {
                const rest = p.amount - (allocated.get(p.id) ?? 0);
                return (
                  <tr key={p.id}>
                    <td className="num whitespace-nowrap">{formatDate(p.date)}</td>
                    <td className="max-w-[170px] truncate">{p.allocation_mode === 'project' ? data.projectName(p.project_id) : MODE_LABEL[p.allocation_mode]}</td>
                    <td className="max-w-[150px] truncate text-muted">{p.note}</td>
                    <td className="num text-right">{formatMoney(p.amount)}</td>
                    <td className="num text-right">{rest > 0 ? <span className="text-warn">{formatMoney(rest)}</span> : <Dash />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Note>So bảng này với bảng kê NCC gửi. “Đã trả” của từng hóa đơn là phần tiền app đã chia (cũ nhất trước, trừ phiếu có chỉ định công trình / hóa đơn).</Note>
    </Sheet>
  );
}

function SuppliersTab({ ctx, onPay }: { ctx: Ctx; onPay: (supplierName: string) => void }) {
  const { data, calc, phone } = ctx;
  const [project, setProject] = useState('');
  const [status, setStatus] = useState('debt');
  const [q, setQ] = useState('');
  const [statement, setStatement] = useState<string | null>(null);
  const rows = useMemo(() => [...calc.supplier.values()].map((s) => {
    const inv = data.credits.filter((c) => c.supplier_id === s.supplierId);
    return { ...s, name: data.supplierName(s.supplierId), count: inv.length, projectIds: [...new Set(inv.map((c) => c.project_id))] };
  }).filter((r) => (!project || r.projectIds.includes(project)) && (!status || (status === 'debt' ? r.debt > 0 : r.debt <= 0)) && matchesSearch(q, r.name))
    .sort((a, b) => b.debt - a.debt || a.name.localeCompare(b.name, 'vi')), [calc, data, project, status, q]);
  const T = { buy: sumOf(rows, (r) => r.creditInvoices), paid: sumOf(rows, (r) => r.paid), debt: sumOf(rows, (r) => r.debt), count: sumOf(rows, (r) => r.count) };
  const where = (ids: string[]) => (ids.length === 0 ? '—' : ids.length === 1 ? data.projectName(ids[0]) : `${ids.length} công trình`);
  const debtCell = (debt: number) => (debt > 0 ? <b className="num text-bad">{formatMoney(debt)}</b> : debt < 0 ? <Pill tone="warn">Trả trước {formatMoney(-debt)}</Pill> : <Pill tone="good">Hết nợ</Pill>);
  return (
    <>
      <FilterBar>
        <FilterSelect label="Công trình" value={project} onChange={setProject} options={data.projects.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterSelect label="Trạng thái" value={status} onChange={setStatus} options={[{ value: 'debt', label: 'Còn nợ' }, { value: 'done', label: 'Hết nợ' }]} />
        <SearchBox value={q} onChange={setQ} placeholder="Tìm nhà cung cấp…" />
      </FilterBar>
      <KpiStrip items={[
        { label: 'Hóa đơn mua nợ', value: formatMoney(T.buy), sub: `${T.count} hóa đơn chưa tích “Đã TT”` },
        { label: 'Đã trả NCC', value: formatMoney(T.paid) },
        { label: 'Còn nợ NCC', value: <span data-testid="ncc-debt-total">{formatMoney(T.debt)}</span>, tone: T.debt > 0 ? 'neg' : '' },
      ]} />
      <Card>
        {rows.length === 0 ? <EmptyState icon="storefront" title="Không có nhà cung cấp nào khớp bộ lọc" /> : phone ? (
          <div className="grid gap-2 p-2">
            {rows.map((r) => (
              <MobileCard key={r.supplierId} onClick={() => setStatement(r.supplierId)}>
                <MobileRow><b className="truncate">{r.name}</b>{debtCell(r.debt)}</MobileRow>
                <MobileRow meta><span className="truncate">{where(r.projectIds)} · {r.count} hóa đơn</span></MobileRow>
                <HBar percent={pct(r.paid, r.creditInvoices)} tone={r.debt <= 0 ? 'good' : 'accent'} />
                <MobileRow meta><span>Đã trả {formatMoney(r.paid)} / {formatMoney(r.creditInvoices)}</span><span>Đối chiếu</span></MobileRow>
              </MobileCard>
            ))}
          </div>
        ) : (
          <div className="tbl">
            <table data-testid="ncc-table">
              <thead><tr><th>Nhà cung cấp</th><th>Công trình</th><th className="!text-right">HĐ mua nợ</th><th className="!text-right">Tổng mua nợ</th><th className="!text-right">Đã trả</th><th style={{ width: 130 }}>Tỉ lệ trả</th><th className="!text-right">Còn nợ</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.supplierId} className="cursor-pointer" tabIndex={0} onClick={() => setStatement(r.supplierId)} onKeyDown={(e) => { if (e.key === 'Enter') setStatement(r.supplierId); }}>
                    <td className="whitespace-nowrap"><b className="font-semibold">{r.name}</b></td>
                    <td className="max-w-[240px] truncate">{where(r.projectIds)}</td>
                    <td className="num text-right">{r.count}</td>
                    <td className="num text-right">{formatMoney(r.creditInvoices)}</td>
                    <td className="num text-right">{r.paid ? formatMoney(r.paid) : <Dash />}</td>
                    <td><Ratio paid={r.paid} total={r.creditInvoices} /></td>
                    <td className="text-right whitespace-nowrap">{debtCell(r.debt)}</td>
                    <td className="whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setStatement(r.supplierId); }}>Đối chiếu</Button>
                      {ctx.canPay ? <Button size="sm" onClick={(e) => { e.stopPropagation(); onPay(r.name); }}>Trả tiền</Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Note>Chỉ tính hóa đơn <b>chưa tích “Đã TT”</b>. Số nợ là nợ cộng dồn mọi năm (như sổ của NCC), không cắt theo năm đang chọn. Nợ về 0 thì NCC tự coi là đã tất toán.</Note>
      {statement ? <StatementSheet ctx={ctx} supplierId={statement} onClose={() => setStatement(null)} onPay={() => { const n = data.supplierName(statement); setStatement(null); onPay(n); }} /> : null}
    </>
  );
}

// ───────────────────────── TẤT TOÁN ─────────────────────────
function ClosuresTab({ ctx }: { ctx: Ctx }) {
  const { data, calc, years, phone, canAdd } = ctx;
  const toast = useToast();
  const close = useClosePayable(), undo = useUndoClosure();
  const [showDebt, setShowDebt] = useState(false);
  const [party, setParty] = useState('');
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<PairPayable | null>(null);
  const [date, setDate] = useState(todayIso());
  const [askUndo, setAskUndo] = useState<Closure | null>(null);

  const closedKeys = useMemo(() => new Set(data.closures.filter((c) => c.subcontractor_id).map((c) => `${c.subcontractor_id}|${c.project_id}`)), [data]);
  const waiting = useMemo(() => calc.pairs.filter((p) => p.contractCount > 0 && !closedKeys.has(p.key)
    && (showDebt ? true : p.paid > 0 && p.debt <= PAYABLE_DONE_TOLERANCE)
    && (data.subcontracts.some((h) => h.subcontractor_id === p.subcontractorId && h.project_id === p.projectId && inYearLoose(h.date, years))
      || data.payments.some((u) => u.subcontractor_id === p.subcontractorId && u.project_id === p.projectId && inYearLoose(u.date, years))))
    .sort((a, b) => a.debt - b.debt), [calc, closedKeys, showDebt, data, years]);
  const partyOf = (c: Closure) => (c.party_kind === 'supplier' ? data.supplierName(c.supplier_id) : data.subcontractorName(c.subcontractor_id));
  const done = useMemo(() => data.closures.filter((c) => inYearLoose(c.closed_on, years) && (!party || partyOf(c) === party) && matchesSearch(q, partyOf(c), data.projectName(c.project_id)))
    .sort((a, b) => b.closed_on.localeCompare(a.closed_on) || (b.created_at ?? '').localeCompare(a.created_at ?? '')), [data, years, party, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = useMemo(() => [...data.closures].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0] ?? null, [data]);
  const partyOpts = [...new Set(data.closures.map(partyOf))].sort((a, b) => a.localeCompare(b, 'vi')).map((n) => ({ value: n, label: n }));
  const cleared = [...calc.supplier.values()].filter((s) => s.paid > 0 && s.debt <= 0);
  const detail = (c: Closure) => (c.party_kind === 'supplier' ? 'Nhà cung cấp' : `HĐ thầu phụ${c.amount > 0 ? ` · phiếu chi ${formatMoney(c.amount)}` : ' · đóng sổ'}`);

  const confirmClose = () => {
    if (!pending) return;
    if (!date) { toast('Chọn ngày phiếu chi!', 'error'); return; }
    const amount = Math.max(0, pending.debt);
    close.mutate({ subcontractorId: pending.subcontractorId, projectId: pending.projectId, date, amount, by: '' }, {
      onSuccess: () => { toast(`Đã tất toán ${data.subcontractorName(pending.subcontractorId)}${amount ? ` — ${formatMoney(amount)}` : ''}`); setPending(null); },
      onError: (e) => toast(`Chưa tất toán được: ${e.message}`, 'error'),
    });
  };

  return (
    <>
      <Card>
        <CardHeader title="Chờ tất toán" sub={showDebt ? 'mọi cặp thầu phụ × công trình chưa đóng sổ' : 'đã trả đủ nhưng chưa đóng sổ'}
          actions={<Checkbox checked={showDebt} onChange={setShowDebt} label="Hiện cả khoản còn nợ" />} />
        {waiting.length === 0 ? <EmptyState icon="task_alt" title="Không có khoản nào chờ tất toán" /> : (
          <div className="tbl">
            <table data-testid="tt-waiting">
              <thead><tr><th>Đối tác</th><th>Công trình</th><th className="!text-right">Giá trị</th><th className="!text-right">Đã trả</th><th className="!text-right">Còn lại</th><th /></tr></thead>
              <tbody>
                {waiting.map((p) => (
                  <tr key={p.key}>
                    <td className="whitespace-nowrap"><b className="font-semibold">{data.subcontractorName(p.subcontractorId)}</b></td>
                    <td className="max-w-[260px] truncate">{data.projectName(p.projectId)}</td>
                    <td className="num text-right">{formatMoney(p.value)}</td>
                    <td className="num text-right">{formatMoney(p.paid)}</td>
                    <td className="num text-right">{p.debt > 0 ? <b className="text-bad">{formatMoney(p.debt)}</b> : p.debt < 0 ? <span className="text-warn">dư {formatMoney(-p.debt)}</span> : <Dash />}</td>
                    <td className="text-right">{canAdd ? <Button size="sm" variant="primary" onClick={() => { setPending(p); setDate(todayIso()); }}>Tất toán</Button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <FilterBar>
        <FilterSelect label="Đối tác" value={party} onChange={setParty} options={partyOpts} />
        <SearchBox value={q} onChange={setQ} />
        <div className="flex-1" />
        {canAdd ? <Button disabled={!last} data-testid="tt-undo" onClick={() => setAskUndo(last)}><Icon name="undo" />Hoàn tác lần tất toán gần nhất</Button> : null}
      </FilterBar>
      <Card>
        <CardHeader title="Đã tất toán" sub={`${done.length} lần`} />
        {done.length === 0 ? <EmptyState icon="history" title="Chưa có lần tất toán nào trong kỳ này" /> : phone ? (
          <div className="grid gap-2 p-2">
            {done.map((c) => (
              <MobileCard key={c.id}>
                <MobileRow><b className="truncate">{partyOf(c)}</b><b className="num">{formatMoney(c.amount)}</b></MobileRow>
                <MobileRow meta><span className="truncate">{formatDate(c.closed_on)} · {data.projectName(c.project_id)}</span><span>{c.closed_by_name || data.userName(c.created_by)}</span></MobileRow>
              </MobileCard>
            ))}
          </div>
        ) : (
          <div className="tbl">
            <table data-testid="tt-done">
              <thead><tr><th>Ngày TT</th><th>Đối tác</th><th>Công trình</th><th>Chi tiết</th><th className="!text-right">Tổng tiền</th></tr></thead>
              <tbody>
                {done.map((c) => (
                  <tr key={c.id}>
                    <td className="num whitespace-nowrap">{formatDate(c.closed_on)}</td>
                    <td className="whitespace-nowrap"><b className="font-semibold">{partyOf(c)}</b></td>
                    <td className="max-w-[260px] truncate">{data.projectName(c.project_id)}</td>
                    <td className="text-muted">{detail(c)}</td>
                    <td className="num text-right">{formatMoney(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Note>Nhà cung cấp không cần bấm Tất toán: nợ về 0 là tự coi như đã tất toán{cleared.length ? ` — hiện có ${cleared.length} NCC đã hết nợ (${cleared.slice(0, 4).map((s) => data.supplierName(s.supplierId)).join(', ')}${cleared.length > 4 ? '…' : ''})` : ''}.</Note>

      <Sheet open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }} title="Xác nhận tất toán"
        footer={<><Button onClick={() => setPending(null)}>Hủy</Button><div className="flex-1" /><Button variant="primary" data-testid="tt-ok" disabled={close.isPending} onClick={confirmClose}>{pending && pending.debt > 0 ? 'OK — Tạo phiếu chi' : 'OK — Đóng sổ'}</Button></>}>
        {pending ? (
          <>
            <p className="m-0 text-sm">{pending.debt > 0
              ? <>Tạo phiếu chi thanh toán nốt <b className="num text-bad">{formatMoney(pending.debt)}</b> cho <b>{data.subcontractorName(pending.subcontractorId)}</b>?</>
              : <>Đóng sổ công nợ với <b>{data.subcontractorName(pending.subcontractorId)}</b> (đã trả đủ, không tạo phiếu chi)?</>}</p>
            <div className="text-xs text-muted">Công trình: <b>{data.projectName(pending.projectId)}</b><br />Giá trị {formatMoney(pending.value)} · Đã trả {formatMoney(pending.paid)}</div>
            <Field label="Ngày phiếu chi"><Input type="date" aria-label="Ngày phiếu chi" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Note>Phiếu chi tự sinh nằm ở tab Chi Trả TP/NCC (chỉ xem). Hoàn tác được bằng nút “Hoàn tác lần tất toán gần nhất”.</Note>
          </>
        ) : null}
      </Sheet>
      <ConfirmDialog open={!!askUndo} onOpenChange={(o) => { if (!o) setAskUndo(null); }} title="Hoàn tác lần tất toán gần nhất?" danger busy={undo.isPending} confirmLabel="Hoàn tác"
        message={askUndo ? <>Hủy lần tất toán ngày {formatDate(askUndo.closed_on)} của {partyOf(askUndo)} ({formatMoney(askUndo.amount)}). Phiếu chi tự sinh vào Thùng rác, công nợ quay lại như trước.</> : null}
        onConfirm={() => { if (!askUndo) return; undo.mutate(askUndo.id, { onSuccess: () => { setAskUndo(null); toast('Đã hoàn tác lần tất toán'); }, onError: (e) => { setAskUndo(null); toast(`Chưa hoàn tác được: ${e.message}`, 'error'); } }); }} />
    </>
  );
}

/** Tab con do khung Thầu Phụ & NCC chọn (HĐ thầu phụ / Nhà cung cấp / Tất toán) */
export function PayablesPage({ tab }: { tab: PayablesTab }) {
  const phone = useLayoutMode() === 'phone';
  const access = useAccess();
  const { years: yearSel } = useYears();
  const years = useMemo(() => toYearFilter(yearSel), [yearSel]);
  const query = usePayData();
  const data = query.data;
  const calc = usePayCalc(data);
  const [pay, setPay] = useState<PayDraft | null>(null);
  const header = <PageHeader title={phone ? 'Công nợ phải trả' : 'Công Nợ Phải Trả'} sub="Công ty còn nợ thầu phụ, nhà cung cấp bao nhiêu" />;
  if (query.isPending) return <>{header}<Card><LoadingState label="Đang tải công nợ…" /></Card></>;
  if (query.isError || !data || !calc) return <>{header}<Card><ErrorState error={query.error} onRetry={() => void query.refetch()} /></Card></>;
  const ctx: Ctx = {
    data, calc, years, phone, canAdd: hasLevel(access.permissions, 'payables', 'add'), canPay: hasLevel(access.permissions, 'payments', 'add'),
    company: access.company.short_name || access.company.name,
  };
  return (
    <>
      {header}
      {tab === 'contracts' ? <ContractsTab ctx={ctx} /> : tab === 'suppliers'
        ? <SuppliersTab ctx={ctx} onPay={(name) => setPay(blankPayDraft({ kind: 'supplier_payment', party: name }))} />
        : <ClosuresTab ctx={ctx} />}
      {pay ? <PaymentSheet draft={pay} setDraft={setPay} data={data} calc={calc} onClose={() => setPay(null)} /> : null}
    </>
  );
}
