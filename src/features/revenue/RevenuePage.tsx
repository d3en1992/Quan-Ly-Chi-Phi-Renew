// Tab DOANH THU (PAGES.doanhthu / MP.doanhthu): HỢP ĐỒNG CHÍNH (form bên trái + danh sách, hạng mục, copy / dán khối lượng)
// và THU TIỀN (form phiếu thu, tiến độ thu theo công trình, sổ thu, ảnh phiếu thu). Phiếu thu tự động từ quyết toán chỉ xem.
import { useMemo, useState } from 'react';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { useYears } from '@/app/year';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { FilterSelect, HBar, MobileCard, MobileRow, Pager, SearchBox, Segmented, usePaged } from '@/components/ui/data';
import { Field, Input, MoneyInput, Select } from '@/components/ui/input';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, PageHeader, Pill } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { contractItemsTotal, inYearLoose, mainContractTotal, percentOf, projectRevenue, sumOf, toYearFilter, type ContractItem, type YearFilter } from '@/lib/calc';
import { formatDate, formatMoney, formatShortMoney } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { canEditRow, ItemsEditor } from '@/features/payments/shared';
import { matchesSearch, todayIso } from '@/features/reports/shared';
import {
  RECEIPT_KIND, useDeleteContract, useDeleteReceipt, useRevData, useSaveContract, useSaveReceipt,
  type MainContract, type Receipt, type ReceiptKind, type ReceiptMethod, type RevData,
} from './api';

export type RevenueTab = 'contracts' | 'receipts';
type Ctx = { data: RevData; years: YearFilter; phone: boolean; canAdd: boolean; company: string };
const Dash = () => <span className="text-faint">—</span>;
const pct = (a: number, b: number) => percentOf(a, b) ?? 0;
const SPLIT = 'grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]';

// ───────────────────────── HỢP ĐỒNG CHÍNH ─────────────────────────
type ContractDraft = { id: string | null; project: string; date: string; value: number; extra: number; variation: number; description: string; items: ContractItem[] };
const blankContract = (): ContractDraft => ({ id: null, project: '', date: todayIso(), value: 0, extra: 0, variation: 0, description: '', items: [] });
const draftOfContract = (c: MainContract): ContractDraft => ({
  id: c.id, project: c.project_id, date: c.date ?? todayIso(), value: c.value, extra: c.extra_value, variation: c.legacy_variation, description: c.description ?? '', items: c.items,
});

function ContractsTab({ ctx }: { ctx: Ctx }) {
  const { data, years, phone, canAdd } = ctx;
  const toast = useToast();
  const access = useAccess();
  const save = useSaveContract(), del = useDeleteContract();
  const [draft, setDraft] = useState<ContractDraft>(blankContract);
  const [formOpen, setFormOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof ContractDraft>(k: K, v: ContractDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const existing = draft.id ? data.contracts.find((c) => c.id === draft.id) : undefined;
  const editable = !existing ? canAdd : canEditRow(access, 'revenue', existing.created_by);
  // Mỗi công trình 1 hợp đồng: chọn công trình đã có hợp đồng → nạp hợp đồng đó để sửa
  const pickProject = (id: string) => { const c = data.contractOf(id); setDraft(c ? draftOfContract(c) : { ...blankContract(), project: id, date: draft.date }); };
  const reset = () => { setDraft(blankContract()); setFormOpen(false); };
  const total = mainContractTotal({ value: draft.value, extra_value: draft.extra, legacy_variation: draft.variation });

  const rows = useMemo(() => data.contracts.filter((c) => inYearLoose(c.date, years))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')), [data, years]);

  const submit = () => {
    if (!draft.project) { toast('Chọn công trình!', 'error'); return; }
    save.mutate({ id: draft.id, projectId: draft.project, date: draft.date, value: draft.value, extra: draft.extra, variation: draft.variation, description: draft.description, customerName: data.ownerOf(draft.project), items: draft.items }, {
      onSuccess: () => { toast(`${draft.id ? 'Đã cập nhật' : 'Đã lưu'} hợp đồng · ${data.projectName(draft.project)}`); reset(); },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };

  const form = (
    <>
      <fieldset disabled={!editable} className="grid min-w-0 grid-cols-2 gap-3 p-4">
        <Field label="Công trình *" className="col-span-2">
          <Select aria-label="Công trình" value={draft.project} onChange={(e) => pickProject(e.target.value)}>
            <option value="">— Chọn công trình —</option>
            {data.projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}{data.contractOf(p.id) ? ' ✓' : ''}</option>)}
          </Select>
        </Field>
        <Field label="Ngày"><Input type="date" aria-label="Ngày hợp đồng" value={draft.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Chủ đầu tư"><Input aria-label="Chủ đầu tư" readOnly disabled value={draft.project ? data.ownerOf(draft.project) || '—' : ''} /></Field>
        <Field label="Giá trị HĐ chính"><MoneyInput aria-label="Giá trị HĐ chính" value={draft.value} onChange={(v) => set('value', v)} /></Field>
        <Field label="Giá trị HĐ phụ"><MoneyInput aria-label="Giá trị HĐ phụ" value={draft.extra} onChange={(v) => set('extra', v)} /></Field>
        <Field label="Phát sinh"><MoneyInput aria-label="Phát sinh" value={draft.variation} onChange={(v) => set('variation', v)} /></Field>
        <Field label="Nội dung" className="col-span-2"><Input aria-label="Nội dung hợp đồng" value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Thi công trọn gói phần thô + hoàn thiện" /></Field>
        <div className="col-span-2">
          <ItemsEditor items={draft.items} onChange={(v) => set('items', v)} disabled={!editable} />
          {draft.items.length && editable ? <Button size="sm" className="mt-1.5" onClick={() => set('value', contractItemsTotal(draft.items))}>Lấy tổng hạng mục làm Giá trị HĐ chính</Button> : null}
        </div>
        <div className="col-span-2 text-[13px] text-muted">Tổng hợp đồng: <b className="num text-fg" data-testid="hdc-total">{formatMoney(total)}</b> đ{draft.id ? <Pill tone="accent">Đang sửa hợp đồng đã có</Pill> : null}</div>
      </fieldset>
      {editable ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-4 py-3">
          {draft.id ? <Button variant="ghost-danger" onClick={() => setConfirm(true)}><Icon name="delete" />Xóa</Button> : null}
          <div className="flex-1" />
          <Button onClick={reset}>Hủy</Button>
          <Button variant="primary" data-testid="hdc-save" disabled={save.isPending} onClick={submit}><Icon name="save" />{save.isPending ? 'Đang lưu…' : 'Lưu hợp đồng'}</Button>
        </div>
      ) : null}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Xóa hợp đồng chính?" danger busy={del.isPending} confirmLabel="Xóa"
        message={<>Xóa hợp đồng {formatMoney(total)} của {data.projectName(draft.project)}. Phiếu thu đã ghi vẫn giữ nguyên. Hợp đồng vào Thùng rác.</>}
        onConfirm={() => { if (!draft.id) return; del.mutate(draft.id, { onSuccess: () => { setConfirm(false); toast('Đã xóa hợp đồng'); reset(); }, onError: (e) => { setConfirm(false); toast(`Chưa xóa được: ${e.message}`, 'error'); } }); }} />
    </>
  );
  const open = (c: MainContract) => { setDraft(draftOfContract(c)); setFormOpen(true); };

  const list = (
    <Card>
      <CardHeader title="Danh sách hợp đồng" sub={`${rows.length} hợp đồng`} />
      {rows.length === 0 ? <EmptyState icon="description" title="Chưa có hợp đồng chính trong kỳ này" /> : phone ? (
        <div className="grid gap-2 p-2">
          {rows.map((c) => (
            <MobileCard key={c.id} onClick={() => open(c)}>
              <MobileRow><b className="truncate">{data.projectName(c.project_id)}</b><b className="num">{formatShortMoney(mainContractTotal(c))}</b></MobileRow>
              <MobileRow meta><span className="truncate">{formatDate(c.date)} · {data.ownerOf(c.project_id) || '—'}</span></MobileRow>
            </MobileCard>
          ))}
        </div>
      ) : (
        <div className="tbl">
          <table data-testid="hdc-table">
            <thead><tr><th>Ngày</th><th>Công trình</th><th className="!text-right">HĐ chính</th><th className="!text-right">HĐ phụ</th><th className="!text-right">Tổng HĐ</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="cursor-pointer" tabIndex={0} onClick={() => open(c)} onKeyDown={(e) => { if (e.key === 'Enter') open(c); }}>
                  <td className="num whitespace-nowrap">{formatDate(c.date)}</td>
                  <td className="max-w-[280px] truncate">{data.projectName(c.project_id)}</td>
                  <td className="num text-right">{formatMoney(c.value)}</td>
                  <td className="num text-right">{c.extra_value ? formatMoney(c.extra_value) : <Dash />}</td>
                  <td className="num text-right"><b>{formatMoney(mainContractTotal(c))}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="font-bold [&>td]:bg-surface-2"><td /><td>Tổng</td><td /><td /><td className="num text-right">{formatMoney(sumOf(rows, mainContractTotal))}</td><td /></tr></tfoot>
          </table>
        </div>
      )}
    </Card>
  );

  if (phone) {
    return (
      <>
        {canAdd ? <Button variant="primary" size="lg" onClick={() => { setDraft(blankContract()); setFormOpen(true); }}><Icon name="add" />Hợp đồng mới</Button> : null}
        {list}
        <Sheet wide open={formOpen} onOpenChange={(o) => { if (!o) reset(); }} title="Hợp đồng chính"><div className="-m-4">{form}</div></Sheet>
      </>
    );
  }
  return (
    <div className={SPLIT}>
      <Card><CardHeader title="Hợp đồng chính" sub="mỗi công trình 1 hợp đồng" />{form}</Card>
      {list}
    </div>
  );
}

// ───────────────────────── THU TIỀN ─────────────────────────
type ReceiptDraft = { id: string | null; project: string; date: string; kind: ReceiptKind; amount: number; note: string; method: ReceiptMethod | null };
const blankReceipt = (project = ''): ReceiptDraft => ({ id: null, project, date: todayIso(), kind: 'stage', amount: 0, note: '', method: null });
const METHOD_OPTS: { value: ReceiptMethod; label: string }[] = [{ value: 'transfer', label: 'Chuyển khoản' }, { value: 'cash', label: 'Tiền mặt' }];
const METHOD_LABEL: Record<ReceiptMethod, string> = { transfer: 'CK', cash: 'Tiền mặt' };
const KIND_OPTS = (['advance', 'stage', 'settlement', 'other'] as const).map((k) => ({ value: k, label: RECEIPT_KIND[k]!.label }));

function ReceiptsTab({ ctx }: { ctx: Ctx }) {
  const { data, years, phone, canAdd } = ctx;
  const toast = useToast();
  const access = useAccess();
  const save = useSaveReceipt(), del = useDeleteReceipt();
  const [draft, setDraft] = useState<ReceiptDraft>(blankReceipt);
  const [formOpen, setFormOpen] = useState(false);
  const [project, setProject] = useState('');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof ReceiptDraft>(k: K, v: ReceiptDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const reset = () => { setDraft(blankReceipt()); setFormOpen(false); };

  const of = <T extends { project_id: string }>(rows: T[], id: string) => rows.filter((r) => r.project_id === id);
  // Còn phải thu của công trình SAU phiếu đang gõ (toàn vòng đời) — thay phiếu đang sửa bằng số mới rồi tính bằng công thức chung
  const after = useMemo(() => {
    if (!draft.project) return null;
    const others = of(data.receipts, draft.project).filter((r) => r.id !== draft.id);
    return projectRevenue(of(data.contracts, draft.project), [...others, { project_id: draft.project, date: draft.date, amount: draft.amount }], of(data.settlements, draft.project), []);
  }, [data, draft.project, draft.id, draft.date, draft.amount]);

  const progress = useMemo(() => data.projectOptions.map((p) => {
    const receipts = of(data.receipts, p.id);
    const rev = projectRevenue(of(data.contracts, p.id), receipts, of(data.settlements, p.id), years);
    return { p, rev, count: receipts.filter((r) => inYearLoose(r.date, years)).length };
  }).filter((r) => (r.rev.contractValue > 0 || r.rev.received > 0) && (!project || r.p.id === project))
    .sort((a, b) => b.rev.receivable - a.rev.receivable), [data, years, project]);
  const ledger = useMemo(() => data.receipts.filter((r) => inYearLoose(r.date, years) && (!project || r.project_id === project) && matchesSearch(q, data.projectName(r.project_id), r.note))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? '')), [data, years, project, q]);
  const paged = usePaged(ledger, 30, `${project}|${q}|${years.join()}`);

  const submit = () => {
    if (!draft.project) { toast('Chọn công trình!', 'error'); return; }
    if (draft.amount <= 0) { toast('Nhập số tiền > 0!', 'error'); return; }
    save.mutate({ id: draft.id, projectId: draft.project, date: draft.date, amount: draft.amount, kind: draft.kind, note: draft.note, method: draft.method }, {
      onSuccess: () => {
        toast(`${draft.id ? 'Đã cập nhật' : 'Đã lưu'} phiếu thu ${formatMoney(draft.amount)} · ${data.projectName(draft.project)}`);
        reset();
      },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };
  const open = (r: Receipt) => {
    if (r.is_auto) { toast('Phiếu thu tự động từ quyết toán: sửa / xóa ở tab Quyết Toán.', 'error'); return; }
    if (!canEditRow(access, 'revenue', r.created_by)) { toast('Phiếu do người khác nhập — bạn chỉ xem được.', 'error'); return; }
    setDraft({ id: r.id, project: r.project_id, date: r.date, kind: r.kind as ReceiptKind, amount: r.amount, note: r.note ?? '', method: r.method ?? null });
    setFormOpen(true);
    if (!phone) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const form = (
    <>
      <div className="grid min-w-0 grid-cols-2 gap-3 p-4">
        <Field label="Công trình *" className="col-span-2">
          <Select aria-label="Công trình" value={draft.project} onChange={(e) => set('project', e.target.value)}>
            <option value="">— Chọn công trình —</option>
            {data.projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Ngày"><Input type="date" aria-label="Ngày thu" value={draft.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <div className="col-span-2 grid gap-1 text-xs font-medium text-muted"><span>Loại thu</span><div><Segmented value={draft.kind} onChange={(k) => set('kind', k)} options={KIND_OPTS} /></div></div>
        <div className="col-span-2 grid gap-1 text-xs font-medium text-muted"><span>Hình thức</span><div><Segmented value={draft.method ?? ('' as ReceiptMethod)} onChange={(m) => set('method', m)} options={METHOD_OPTS} /></div></div>
        <Field label="Số tiền" className="col-span-2"><MoneyInput aria-label="Số tiền thu" value={draft.amount} onChange={(v) => set('amount', v)} /></Field>
        <Field label="Ghi chú" className="col-span-2"><Input aria-label="Ghi chú" value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder="Đợt 3 — xong sàn tầng 2" /></Field>
        {after ? <div className="col-span-2 text-[13px] text-muted">Còn phải thu công trình này sau phiếu: <b className={`num ${after.receivable < 0 ? 'text-warn' : 'text-fg'}`} data-testid="thu-after">{formatMoney(after.receivable)}</b>{after.receivable < 0 ? ' (thu vượt giá trị hợp đồng)' : ''}</div> : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-4 py-3">
        {draft.id ? <Button variant="ghost-danger" onClick={() => setConfirm(true)}><Icon name="delete" />Xóa</Button> : null}
        <div className="flex-1" />
        {draft.id ? <Button onClick={reset}>Hủy sửa</Button> : null}
        <Button variant="primary" data-testid="thu-save" disabled={save.isPending} onClick={submit}><Icon name="save" />{save.isPending ? 'Đang lưu…' : 'Lưu phiếu thu'}</Button>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Xóa phiếu thu?" danger busy={del.isPending} confirmLabel="Xóa"
        message={<>Xóa phiếu thu {formatMoney(draft.amount)} ngày {formatDate(draft.date)} của {data.projectName(draft.project)}. Phiếu vào Thùng rác.</>}
        onConfirm={() => { if (!draft.id) return; del.mutate({ id: draft.id, is_auto: false }, { onSuccess: () => { setConfirm(false); toast('Đã xóa phiếu thu'); reset(); }, onError: (e) => { setConfirm(false); toast(`Chưa xóa được: ${e.message}`, 'error'); } }); }} />
    </>
  );
  const kindPill = (r: Receipt) => <><Pill tone={RECEIPT_KIND[r.kind]?.tone ?? 'neutral'}>{RECEIPT_KIND[r.kind]?.label ?? r.kind}</Pill>{r.method ? <> <Pill>{METHOD_LABEL[r.method]}</Pill></> : null}{r.is_auto ? <> <Pill>Tự động</Pill></> : null}</>;
  const pick = (id: string) => { if (!canAdd) return; setDraft({ ...blankReceipt(id), date: draft.date }); setFormOpen(true); };

  if (phone) {
    return (
      <>
        {canAdd ? <Button variant="primary" size="lg" data-testid="thu-add" onClick={() => { setDraft(blankReceipt()); setFormOpen(true); }}><Icon name="add" />Phiếu thu mới</Button> : null}
        {progress.length === 0 ? <Card><EmptyState icon="attach_money" title="Chưa có hợp đồng / phiếu thu trong kỳ này" /></Card> : (
          <div className="grid gap-2">
            {progress.slice(0, 30).map(({ p, rev }) => (
              <MobileCard key={p.id} onClick={() => pick(p.id)}>
                <MobileRow><b className="truncate">{p.name}</b></MobileRow>
                <HBar percent={pct(rev.received, rev.contractValue)} tone="good" />
                <MobileRow meta><span>Đã thu {formatShortMoney(rev.received)} / {formatShortMoney(rev.contractValue)}</span>{rev.receivable > 0 ? <b className="num text-bad">còn {formatShortMoney(rev.receivable)}</b> : <Pill tone="good">Thu đủ</Pill>}</MobileRow>
              </MobileCard>
            ))}
          </div>
        )}
        <div className="text-xs font-semibold text-muted">Phiếu thu gần đây</div>
        <div className="grid gap-2">
          {ledger.slice(0, 20).map((r) => (
            <MobileCard key={r.id} onClick={() => open(r)}>
              <MobileRow><b className="num">{formatMoney(r.amount)}</b><span>{kindPill(r)}</span></MobileRow>
              <MobileRow meta><span className="truncate">{formatDate(r.date)} · {data.projectName(r.project_id)}{r.note ? ` · ${r.note}` : ''}</span></MobileRow>
            </MobileCard>
          ))}
        </div>
        <Sheet open={formOpen} onOpenChange={(o) => { if (!o) reset(); }} title={draft.id ? 'Sửa phiếu thu' : 'Phiếu thu mới'}><div className="-m-4">{form}</div></Sheet>
      </>
    );
  }

  return (
    <div className={SPLIT}>
      {canAdd ? <Card><CardHeader title={draft.id ? 'Sửa phiếu thu' : 'Phiếu thu'} />{form}</Card> : <div />}
      <div className="grid min-w-0 gap-4">
        <Card>
          <CardHeader title="Tiến độ thu theo công trình" actions={<FilterSelect label="Công trình" value={project} onChange={setProject} options={data.projectOptions.map((p) => ({ value: p.id, label: p.name }))} />} />
          {progress.length === 0 ? <EmptyState icon="attach_money" title="Chưa có hợp đồng / phiếu thu trong kỳ này" /> : (
            <div className="tbl max-h-[420px] overflow-y-auto">
              <table data-testid="thu-progress">
                <thead><tr><th>Công trình</th><th className="!text-right">Tổng giá trị HĐ</th><th className="!text-right">Đã thu</th><th className="!text-right">Còn phải thu</th><th style={{ width: 120 }}>% đã thu</th><th className="!text-right">Số đợt</th></tr></thead>
                <tbody>
                  {progress.map(({ p, rev, count }) => (
                    <tr key={p.id} data-project={p.id} className="cursor-pointer" tabIndex={0} onClick={() => pick(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') pick(p.id); }}>
                      <td className="max-w-[260px] truncate" title={p.name}>{p.name}</td>
                      <td className="num text-right">{formatMoney(rev.contractValue)}</td>
                      <td className="num text-right">{formatMoney(rev.received)}</td>
                      <td className={`num text-right ${rev.receivable > 0 ? 'text-bad' : ''}`}>{rev.receivable ? formatMoney(rev.receivable) : <Dash />}</td>
                      <td><div className="flex items-center gap-1.5"><div className="min-w-[50px] flex-1"><HBar percent={pct(rev.received, rev.contractValue)} tone="good" /></div><span className="num text-xs text-muted">{pct(rev.received, rev.contractValue)}%</span></div></td>
                      <td className="num text-right">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Sổ thu tiền" sub={`${ledger.length} phiếu · ${formatShortMoney(sumOf(ledger, (r) => r.amount))}`} actions={<SearchBox value={q} onChange={setQ} />} />
          {ledger.length === 0 ? <EmptyState icon="receipt_long" title="Chưa có phiếu thu trong kỳ này" /> : (
            <>
              <div className="tbl">
                <table data-testid="thu-ledger">
                  <thead><tr><th>Ngày</th><th>Công trình</th><th>Loại</th><th>Ghi chú</th><th className="!text-right">Số tiền</th></tr></thead>
                  <tbody>
                    {paged.slice.map((r) => (
                      <tr key={r.id} className="cursor-pointer" tabIndex={0} onClick={() => open(r)} onKeyDown={(e) => { if (e.key === 'Enter') open(r); }}>
                        <td className="num whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="max-w-[220px] truncate">{data.projectName(r.project_id)}</td>
                        <td className="whitespace-nowrap">{kindPill(r)}</td>
                        <td className="max-w-[200px] truncate text-muted" title={r.note ?? ''}>{r.note}</td>
                        <td className="num text-right whitespace-nowrap">{formatMoney(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager {...paged} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Tab con do khung Thu & Lãi chọn (HĐ chính / Thu tiền) */
export function RevenuePage({ tab }: { tab: RevenueTab }) {
  const phone = useLayoutMode() === 'phone';
  const access = useAccess();
  const { years: yearSel } = useYears();
  const years = useMemo(() => toYearFilter(yearSel), [yearSel]);
  const query = useRevData();
  const header = <PageHeader title={phone ? 'Doanh thu' : 'Doanh Thu'} sub="Hợp đồng chính và thu tiền" />;
  if (query.isPending) return <>{header}<Card><LoadingState label="Đang tải doanh thu…" /></Card></>;
  if (query.isError) return <>{header}<Card><ErrorState error={query.error} onRetry={() => void query.refetch()} /></Card></>;
  const ctx: Ctx = {
    data: query.data, years, phone, canAdd: hasLevel(access.permissions, 'revenue', 'add'),
    company: access.company.short_name || access.company.name,
  };
  return (
    <>
      {header}
      {tab === 'contracts' ? <ContractsTab ctx={ctx} /> : <ReceiptsTab ctx={ctx} />}
    </>
  );
}
