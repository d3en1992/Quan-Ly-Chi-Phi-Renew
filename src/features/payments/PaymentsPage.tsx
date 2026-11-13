// Tab CHI TRẢ TP/NCC (PAGES.nhapung / MP.ung, đổi tên từ "Ứng TP/NCC" — mục 4L): nhập nhiều phiếu chi một lần
// (Tạm ứng TP · Thanh toán đợt TP · Trả nợ NCC), hiện "còn nợ" ngay khi chọn đối tác, lịch sử phiếu chi, xuất ảnh phiếu, CSV.
import { useMemo, useState } from 'react';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { useYears } from '@/app/year';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { FilterBar, FilterSelect, MobileCard, MobileRow, Pager, SearchBox, Segmented, usePaged } from '@/components/ui/data';
import { Input, MoneyInput, Select } from '@/components/ui/input';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, Note, PageHeader, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { allocatedByPayment, inYearLoose, sumOf, toYearFilter } from '@/lib/calc';
import { formatDate, formatMoney, formatShortMoney } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { copyText } from '@/lib/clipboard';
import { findByName } from '@/features/expenses/logic';
import { matchesSearch, todayIso } from '@/features/reports/shared';
import { KIND_LABEL, MODE_LABEL, useCreateParty, useCreatePayments, usePayData, type PayData, type Payment, type PaymentInput, type PaymentKind } from './api';
import { autoSubcontractId, blankPayDraft, canEditRow, draftOfPayment, PaymentSheet, paymentZalo, usePayCalc, type PayCalc, type PayDraft } from './shared';

type Row = { date: string; party: string; project: string; amount: number; note: string };
const blankRow = (): Row => ({ date: '', party: '', project: '', amount: 0, note: '' });
const isBlank = (r: Row) => !r.party.trim() && !r.project && !r.amount && !r.note.trim();
const KINDS: { value: PaymentKind; label: string }[] = (['advance', 'progress', 'supplier_payment'] as const).map((k) => ({ value: k, label: KIND_LABEL[k]! }));

/** Lưới nhập nhiều phiếu chi một lần (như bảng "Nhập tiền ứng" của app cũ) */
function EntryGrid({ data, calc }: { data: PayData; calc: PayCalc }) {
  const toast = useToast();
  const create = useCreatePayments(), createParty = useCreateParty();
  const [kind, setKind] = useState<PaymentKind>('advance');
  const [rows, setRows] = useState<Row[]>(() => [blankRow(), blankRow(), blankRow()]);
  const [focus, setFocus] = useState(0);
  const ncc = kind === 'supplier_payment';
  const parties = useMemo(() => (ncc ? data.suppliers : data.subcontractors).filter((p) => !p.archived), [ncc, data]);
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => {
    const next = rs.map((r, j) => (j === i ? { ...r, ...patch } : r));
    return i === next.length - 1 && !isBlank(next[i]!) ? [...next, blankRow()] : next;
  });
  const filled = rows.filter((r) => !isBlank(r));
  const total = sumOf(filled, (r) => r.amount);

  // Dòng "còn nợ" theo dòng đang đứng (`_ungRenderDebt`)
  const cur = rows[focus];
  const curParty = cur ? findByName(cur.party, parties) : undefined;
  let debtLine: string | null = null;
  if (curParty && ncc) {
    const d = calc.supplier.get(curParty.id)?.debt ?? 0;
    debtLine = `Còn nợ ${curParty.name}: ${formatMoney(d)} đ${d < 0 ? ' (đang trả trước)' : ''}`;
  } else if (curParty && cur?.project) {
    debtLine = `Còn phải trả ${curParty.name} ở ${data.projectName(cur.project)}: ${formatMoney(calc.pairOf(curParty.id, cur.project)?.debt ?? 0)} đ`;
  } else if (curParty) {
    debtLine = `Tổng còn phải trả ${curParty.name}: ${formatMoney(sumOf(calc.pairs.filter((p) => p.subcontractorId === curParty.id && p.debt > 0), (p) => p.debt))} đ`;
  }

  const save = () => {
    const inputs: PaymentInput[] = [];
    let lastDate = todayIso();
    for (const [i, r] of rows.entries()) {
      if (isBlank(r)) continue;
      const n = i + 1;
      const party = findByName(r.party, parties);
      if (!party) { toast(`Dòng ${n}: ${r.party.trim() ? `"${r.party.trim()}" chưa có trong danh bạ` : `chưa chọn ${ncc ? 'nhà cung cấp' : 'thầu phụ'}`}`, 'error'); setFocus(i); return; }
      if (!ncc && !r.project) { toast(`Dòng ${n}: chưa chọn công trình`, 'error'); setFocus(i); return; }
      if (r.amount <= 0) { toast(`Dòng ${n}: chưa nhập số tiền`, 'error'); setFocus(i); return; }
      lastDate = r.date || lastDate; // ngày trống = lấy ngày dòng trên (dòng đầu = hôm nay)
      inputs.push({
        kind, date: lastDate, amount: r.amount, note: r.note, picks: [], mode: ncc && r.project ? 'project' : 'fifo',
        supplierId: ncc ? party.id : null, subcontractorId: ncc ? null : party.id, projectId: r.project || null,
        subcontractId: ncc ? null : autoSubcontractId(data, party.id, r.project),
      });
    }
    if (!inputs.length) { toast('Chưa có dòng nào để lưu', 'error'); return; }
    create.mutate(inputs, {
      onSuccess: () => { toast(`Đã lưu ${inputs.length} phiếu chi · ${formatMoney(sumOf(inputs, (v) => v.amount))} đ`); setRows([blankRow(), blankRow(), blankRow()]); setFocus(0); },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };

  return (
    <Card>
      <CardHeader title="Nhập phiếu chi" sub="nhiều dòng một lần"
        actions={<><Segmented value={kind} onChange={(k) => { setKind(k); setRows([blankRow(), blankRow(), blankRow()]); setFocus(0); }} options={KINDS} /></>} />
      <div className="tbl">
        <table data-testid="pay-grid" style={{ tableLayout: 'fixed', minWidth: 960 }}>
          <colgroup><col style={{ width: 36 }} /><col style={{ width: 140 }} /><col style={{ width: 210 }} /><col style={{ width: 280 }} /><col style={{ width: 140 }} /><col /></colgroup>
          <thead><tr><th>#</th><th>Ngày</th><th>{ncc ? 'Nhà cung cấp *' : 'Thầu phụ *'}</th><th>{ncc ? 'Trả cho công trình (không bắt buộc)' : 'Công trình *'}</th><th className="!text-right">Số tiền</th><th>Nội dung</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} onFocus={() => setFocus(i)}>
                <td className="num text-faint">{i + 1}</td>
                <td className="!p-1"><Input type="date" aria-label={`Ngày dòng ${i + 1}`} value={r.date} onChange={(e) => set(i, { date: e.target.value })} /></td>
                <td className="!p-1">
                  <Combo aria-label={`Đối tác dòng ${i + 1}`} placeholder={ncc ? 'NCC…' : 'Thầu phụ…'} value={r.party} onChange={(v) => set(i, { party: v })} items={parties} groupLabel={ncc ? 'Nhà cung cấp' : 'Thầu phụ'}
                    onCreate={(name) => createParty.mutateAsync({ table: ncc ? 'suppliers' : 'subcontractors', name }).catch((e: Error) => { toast(e.message, 'error'); return ''; })} />
                </td>
                <td className="!p-1">
                  <Select aria-label={`Công trình dòng ${i + 1}`} value={r.project} onChange={(e) => set(i, { project: e.target.value })}>
                    <option value="">{ncc ? '— Trả theo cục (cũ nhất trước) —' : '— Chọn công trình —'}</option>
                    {data.projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </td>
                <td className="!p-1"><MoneyInput aria-label={`Số tiền dòng ${i + 1}`} value={r.amount} onChange={(v) => set(i, { amount: v })} /></td>
                <td className="!p-1"><Input aria-label={`Nội dung dòng ${i + 1}`} value={r.note} onChange={(e) => set(i, { note: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2.5 text-[13px]">
        <span className="min-w-0 flex-1 text-muted" data-testid="pay-grid-debt">{debtLine ?? (ncc ? 'Chọn NCC để xem còn nợ. Ngày để trống = ngày dòng trên (dòng đầu = hôm nay).' : 'Chọn thầu phụ + công trình để xem còn phải trả. Ngày để trống = ngày dòng trên.')}</span>
        {filled.length ? <span className="text-muted">Tổng <b className="num text-fg">{formatMoney(total)}</b></span> : null}
        <Button variant="primary" data-testid="pay-grid-save" disabled={create.isPending || !filled.length} onClick={save}><Icon name="save" />{create.isPending ? 'Đang lưu…' : `Lưu ${filled.length || ''} phiếu`}</Button>
      </div>
    </Card>
  );
}

export function PaymentsPage() {
  const phone = useLayoutMode() === 'phone';
  const access = useAccess();
  const toast = useToast();
  const canAdd = hasLevel(access.permissions, 'payments', 'add');
  const { years: yearSel } = useYears();
  const years = useMemo(() => toYearFilter(yearSel), [yearSel]);
  const query = usePayData();
  const data = query.data;
  const calc = usePayCalc(data);
  const [kind, setKind] = useState('');
  const [project, setProject] = useState('');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<PayDraft | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.payments
      .filter((p) => inYearLoose(p.date, years) && (!kind || (kind === 'tp' ? p.kind !== 'supplier_payment' : p.kind === kind)) && (!project || p.project_id === project
        || (p.kind === 'supplier_payment' && data.allocations.some((a) => a.payment_id === p.id && a.project_id === project)))
        && matchesSearch(q, data.partyName(p), p.note, data.projectName(p.project_id)))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }, [data, years, kind, project, q]);
  const allocated = useMemo(() => allocatedByPayment(data?.allocations ?? []), [data]);
  const paged = usePaged(rows, 50, `${kind}|${project}|${q}|${yearSel}`);
  const total = sumOf(rows, (r) => r.amount);

  if (query.isPending) return <><PageHeader title="Chi Trả TP/NCC" /><Card><LoadingState label="Đang tải phiếu chi…" /></Card></>;
  if (query.isError || !data || !calc) return <><PageHeader title="Chi Trả TP/NCC" /><Card><ErrorState error={query.error} onRetry={() => void query.refetch()} /></Card></>;

  const projOpts = data.projects.map((p) => ({ value: p.id, label: p.name }));
  const zalo = async (p: Payment) => { const ok = await copyText(paymentZalo(p, data)); toast(ok ? 'Đã chép — dán vào Zalo' : 'Trình duyệt chặn chép, thử lại', ok ? 'ok' : 'error'); };
  const open = (p: Payment) => setDraft(draftOfPayment(p, data));
  const where = (p: Payment) => {
    if (p.project_id) return data.projectName(p.project_id);
    if (p.kind !== 'supplier_payment') return '—';
    const ids = [...new Set(data.allocations.filter((a) => a.payment_id === p.id).map((a) => a.project_id))];
    return ids.length ? `Theo cục · ${ids.length} công trình` : 'Theo cục';
  };
  const editing = draft?.id ? data.payments.find((p) => p.id === draft.id) : undefined;
  const sheet = draft ? (
    <PaymentSheet draft={draft} setDraft={setDraft} data={data} calc={calc} onClose={() => setDraft(null)}
      readOnly={!!editing && (!!editing.closure_id || !canEditRow(access, 'payments', editing.created_by))} />
  ) : null;
  const filters = (
    <FilterBar>
      <FilterSelect label="Loại" value={kind} onChange={setKind} options={[{ value: 'tp', label: 'Thầu phụ' }, ...KINDS]} />
      <FilterSelect label="Công trình" value={project} onChange={setProject} options={projOpts} />
      <SearchBox value={q} onChange={setQ} placeholder="Tìm thầu phụ, NCC…" />
    </FilterBar>
  );

  if (phone) {
    return (
      <>
        <PageHeader title="Chi trả TP/NCC" sub={<span data-testid="pay-summary">{rows.length} phiếu · {formatShortMoney(total)}</span>} />
        {canAdd ? <Button variant="primary" size="lg" data-testid="pay-add" onClick={() => setDraft(blankPayDraft())}><Icon name="add" />Ghi phiếu chi</Button> : null}
        {filters}
        {rows.length === 0 ? <Card><EmptyState icon="account_balance_wallet" title="Chưa có phiếu chi trong kỳ này" /></Card> : (
          <div className="grid gap-2">
            {paged.slice.map((p) => (
              <MobileCard key={p.id} onClick={() => open(p)}>
                <MobileRow><b className="truncate">{data.partyName(p)}</b><b className="num">{formatMoney(p.amount)}</b></MobileRow>
                <MobileRow meta><span className="truncate">{formatDate(p.date)} · {where(p)}</span><Pill tone={p.kind === 'supplier_payment' ? 'neutral' : 'accent'}>{p.kind === 'supplier_payment' ? 'Nhà cung cấp' : 'Thầu phụ'}</Pill></MobileRow>
              </MobileCard>
            ))}
            <Pager {...paged} />
          </div>
        )}
        {sheet}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Chi Trả TP/NCC" sub="Phiếu chi cho thầu phụ (tạm ứng, thanh toán đợt) và trả nợ nhà cung cấp"
        actions={<>
          {canAdd ? <Button data-testid="pay-add" onClick={() => setDraft(blankPayDraft({ kind: 'supplier_payment', mode: 'manual' }))}><Icon name="checklist" />Trả NCC theo hóa đơn…</Button> : null}
        </>} />
      {canAdd ? <EntryGrid data={data} calc={calc} /> : null}
      {filters}
      <Card>
        <CardHeader title="Lịch sử phiếu chi" sub={<span data-testid="pay-summary">{rows.length} phiếu · {formatShortMoney(total)}</span>} />
        {rows.length === 0 ? <EmptyState icon="account_balance_wallet" title="Chưa có phiếu chi trong kỳ này" /> : (
          <>
            <div className="tbl">
              <table data-testid="pay-history">
                <thead><tr><th>Ngày</th><th>Loại</th><th>Thầu phụ / NCC</th><th>Công trình</th><th>Nội dung</th><th className="!text-right">Số tiền</th><th /></tr></thead>
                <tbody>
                  {paged.slice.map((p) => {
                    const ncc = p.kind === 'supplier_payment';
                    const rest = ncc ? p.amount - (allocated.get(p.id) ?? 0) : 0;
                    return (
                      <tr key={p.id} className="cursor-pointer" tabIndex={0} onClick={() => open(p)} onKeyDown={(e) => { if (e.key === 'Enter') open(p); }}>
                        <td className="num whitespace-nowrap">{formatDate(p.date)}</td>
                        <td className="whitespace-nowrap"><Pill tone={ncc ? 'neutral' : 'accent'}>{KIND_LABEL[p.kind] ?? p.kind}</Pill>{p.closure_id ? <> <Pill tone="good">Tất toán</Pill></> : null}</td>
                        <td className="whitespace-nowrap"><b className="font-semibold">{data.partyName(p)}</b></td>
                        <td className="max-w-[260px] truncate" title={ncc ? MODE_LABEL[p.allocation_mode] : undefined}>{where(p)}{rest > 0 ? <small className="ml-1 text-warn">chưa chia {formatMoney(rest)}</small> : null}</td>
                        <td className="max-w-[260px] truncate text-muted" title={p.note ?? ''}>{p.note}</td>
                        <td className="num text-right whitespace-nowrap">{formatMoney(p.amount)}</td>
                        <td><Button size="icon" variant="ghost" aria-label="Copy Zalo phiếu chi" title="Copy tin nhắn Zalo" onClick={(e) => { e.stopPropagation(); void zalo(p); }}><Icon name="chat" /></Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager {...paged} />
          </>
        )}
      </Card>
      <Note>Trả nợ NCC không cần chọn công trình: app tự chia vào hóa đơn mua nợ cũ nhất trước. Muốn trả riêng một công trình thì chọn ở cột “Trả cho công trình”; muốn tích từng hóa đơn thì bấm “Trả NCC theo hóa đơn…”.</Note>
      {sheet}
    </>
  );
}
