// Tab QUYẾT TOÁN (PAGES.quyettoan / MP.quyettoan): tăng / giảm / thay thế tổng giá trị hợp đồng; mỗi công trình 01 bản (như app cũ).
// Tick "Ghi nhận phiếu thu tiền còn lại" → tự tạo / cập nhật phiếu thu tự động; "Chốt quyết toán cuối" → công trình sang Đã quyết toán.
import { ExportButton } from '@/features/export/ExportButton';
import { useMemo, useState } from 'react';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { useYears } from '@/app/year';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { MobileCard, MobileRow, SearchBox, Segmented, signedMoney } from '@/components/ui/data';
import { Checkbox, Field, Input, MoneyInput, Select } from '@/components/ui/input';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, Note, PageHeader, Pill } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { inYearLoose, projectRevenue, remainingAfterSettlement, settlementHistory, moneyDiff, toYearFilter } from '@/lib/calc';
import { formatDate, formatMoney } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { canEditRow } from '@/features/payments/shared';
import { matchesSearch, todayIso } from '@/features/reports/shared';
import { SETTLEMENT_KIND, useDeleteSettlement, useRevData, useSaveSettlement, type RevData, type Settlement, type SettlementKind } from './api';

type Draft = { id: string | null; project: string; date: string; kind: SettlementKind; amount: number; note: string; isFinal: boolean; wantReceipt: boolean };
const blank = (): Draft => ({ id: null, project: '', date: todayIso(), kind: 'increase', amount: 0, note: '', isFinal: true, wantReceipt: true });
const KIND_OPTS: { value: SettlementKind; label: string }[] = [{ value: 'increase', label: 'Tăng' }, { value: 'decrease', label: 'Giảm' }, { value: 'replace', label: 'Thay thế tổng' }];
const AMOUNT_LABEL: Record<SettlementKind, string> = {
  increase: 'Số tiền tăng thêm — để trống / 0 nếu đúng HĐ gốc', decrease: 'Số tiền giảm trừ *', replace: 'Tổng giá trị mới thay thế HĐ *',
};
const of = <T extends { project_id: string }>(rows: T[], id: string) => rows.filter((r) => r.project_id === id);
const autoReceiptOf = (data: RevData, settlementId: string | null) => (settlementId ? data.receipts.find((r) => r.is_auto && r.settlement_id === settlementId) : undefined);

export function SettlementsPage() {
  const phone = useLayoutMode() === 'phone';
  const access = useAccess();
  const toast = useToast();
  const canAdd = hasLevel(access.permissions, 'settlements', 'add');
  const { years: yearSel } = useYears();
  const years = useMemo(() => toYearFilter(yearSel), [yearSel]);
  const query = useRevData();
  const data = query.data;
  const save = useSaveSettlement(), del = useDeleteSettlement();
  const [draft, setDraft] = useState<Draft>(blank);
  const [formOpen, setFormOpen] = useState(false);
  const [q, setQ] = useState('');
  const [ask, setAsk] = useState<string[] | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Xem trước theo số đang gõ: thay bản đang sửa bằng bản giả định rồi tính bằng đúng công thức doanh thu (`_qtFin`)
  const preview = useMemo(() => {
    if (!data || !draft.project) return null;
    const contracts = of(data.contracts, draft.project), settlements = of(data.settlements, draft.project), receipts = of(data.receipts, draft.project);
    const orig = draft.id ? settlements.find((s) => s.id === draft.id) : undefined;
    const fake = { id: draft.id ?? '__moi__', project_id: draft.project, date: draft.date || todayIso(), kind: draft.kind, amount: draft.amount, created_at: orig?.created_at ?? new Date().toISOString() };
    const next = [...settlements.filter((s) => s.id !== draft.id), fake];
    const auto = autoReceiptOf(data, draft.id);
    const before = projectRevenue(contracts, receipts, settlements.filter((s) => s.id !== draft.id), []);
    const after = projectRevenue(contracts, receipts, next, []);
    return { before, after, auto, remaining: remainingAfterSettlement(contracts, receipts.filter((r) => r.id !== auto?.id), next), hasContract: contracts.length > 0 };
  }, [data, draft]);

  const rows = useMemo(() => {
    if (!data) return [];
    const hist = new Map<string, { before: number; delta: number }>();
    for (const pid of new Set(data.settlements.map((s) => s.project_id))) {
      for (const h of settlementHistory(of(data.contracts, pid), of(data.settlements, pid))) hist.set(h.id, h);
    }
    return data.settlements.filter((s) => inYearLoose(s.date, years) && matchesSearch(q, data.projectName(s.project_id), s.note))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .map((s) => ({ s, before: hist.get(s.id)?.before ?? 0, delta: hist.get(s.id)?.delta ?? 0, auto: autoReceiptOf(data, s.id) }));
  }, [data, years, q]);

  const header = <PageHeader title={phone ? 'Quyết toán' : 'Quyết Toán'} sub={phone ? `${rows.length} lần quyết toán` : 'Điều chỉnh giá trị hợp đồng khi quyết toán'} actions={<ExportButton datasets={['settlements']} />} />;
  if (query.isPending) return <>{header}<Card><LoadingState label="Đang tải quyết toán…" /></Card></>;
  if (query.isError || !data) return <>{header}<Card><ErrorState error={query.error} onRetry={() => void query.refetch()} /></Card></>;

  const load = (s: Settlement) => setDraft({
    id: s.id, project: s.project_id, date: s.date, kind: s.kind as SettlementKind, amount: s.amount, note: s.note ?? '', isFinal: s.is_final, wantReceipt: !!autoReceiptOf(data, s.id),
  });
  // QUY TẮC 1-1: chọn công trình đã có quyết toán → nạp bản hiện có (bản mới nhất) để sửa
  const pickProject = (id: string) => {
    const cur = of(data.settlements, id).sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
    if (cur) load(cur); else setDraft({ ...blank(), project: id, date: draft.date });
  };
  const reset = () => { setDraft(blank()); setFormOpen(false); };
  const existing = draft.id ? data.settlements.find((s) => s.id === draft.id) : undefined;
  const editable = canAdd && (!existing || canEditRow(access, 'settlements', existing.created_by));
  const project = data.projects.find((p) => p.id === draft.project);
  const dupes = draft.project ? of(data.settlements, draft.project).length : 0;

  const doSave = () => {
    if (!preview) return;
    setAsk(null);
    save.mutate({
      id: draft.id, projectId: draft.project, date: draft.date, kind: draft.kind, amount: draft.amount, note: draft.note, isFinal: draft.isFinal,
      receiptMode: draft.wantReceipt ? 'set' : preview.auto ? 'remove' : 'keep', receiptAmount: draft.wantReceipt ? preview.remaining : 0,
    }, {
      onSuccess: () => {
        const thu = draft.wantReceipt ? (preview.remaining > 0 ? ` · phiếu thu tự động ${formatMoney(preview.remaining)}` : ' · công trình đã thu đủ, không tạo phiếu thu') : preview.auto ? ' · đã gỡ phiếu thu tự động' : '';
        toast(`${draft.id ? 'Đã cập nhật quyết toán' : `Đã lưu quyết toán: ${data.projectName(draft.project)}`}${thu}`);
        reset();
      },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };
  const submit = () => {
    if (!draft.project || !preview) { toast('Chọn công trình!', 'error'); return; }
    if (!draft.date) { toast('Chọn ngày thực hiện!', 'error'); return; }
    if (draft.kind !== 'increase' && draft.amount <= 0) { toast('Nhập số tiền lớn hơn 0!', 'error'); return; }
    if (!draft.note.trim()) { toast('Nhập nội dung / lý do quyết toán!', 'error'); return; }
    if (preview.after.contractValue < 0) { toast('Doanh thu sau quyết toán bị âm — kiểm tra lại số tiền!', 'error'); return; }
    const warns: string[] = [];
    if (preview.after.receivable < 0) warns.push(`Đã thu vượt doanh thu sau quyết toán ${formatMoney(-preview.after.receivable)}.`);
    if (draft.isFinal && project?.status !== 'closed') warns.push(`Chốt quyết toán cuối → chuyển "${project?.name ?? ''}" sang trạng thái "Đã quyết toán".`);
    if (!draft.wantReceipt && preview.auto) warns.push(`Bỏ tick phiếu thu còn lại → phiếu thu tự động ${formatMoney(preview.auto.amount)} (ngày ${formatDate(preview.auto.date)}) sẽ bị xóa.`);
    if (warns.length) setAsk(warns); else doSave();
  };

  const receiptHint = !preview ? null : !draft.wantReceipt
    ? (preview.auto ? <span className="text-bad">Bỏ tick: phiếu thu tự động {formatMoney(preview.auto.amount)} sẽ bị xóa khi Lưu.</span> : null)
    : preview.remaining <= 0
      ? <span className="text-good">Công trình đã thu đủ{preview.remaining < 0 ? ` (đang thu vượt ${formatMoney(-preview.remaining)})` : ''} — sẽ không tạo phiếu thu.</span>
      : <span>→ {preview.auto ? (preview.auto.amount === preview.remaining ? 'Giữ' : `Cập nhật ${formatMoney(preview.auto.amount)} thành`) : 'Sẽ tạo'} phiếu thu <b className="num text-good" data-testid="qt-receipt">{formatMoney(preview.remaining)}</b> ngày {formatDate(draft.date)} — còn phải thu sau quyết toán, tính trên toàn bộ các năm.</span>;

  const form = (
    <>
      <fieldset disabled={!editable} className="grid min-w-0 grid-cols-2 gap-3 p-4">
        <Field label="Công trình *" className="col-span-2" hint={dupes > 1 ? `Công trình này đang có ${dupes} bản quyết toán (dữ liệu cũ) — bấm dòng trong lịch sử để sửa bản khác.` : undefined}>
          <Select aria-label="Công trình" value={draft.project} onChange={(e) => pickProject(e.target.value)}>
            <option value="">— Chọn công trình —</option>
            {data.projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status === 'closed' ? ' (đã QT)' : ''}</option>)}
          </Select>
        </Field>
        <Field label="Ngày"><Input type="date" aria-label="Ngày quyết toán" value={draft.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="HĐ hiện tại"><Input aria-label="HĐ hiện tại" readOnly disabled className="num text-right" value={preview ? formatMoney(preview.before.contractValue) : ''} /></Field>
        <div className="col-span-2 grid gap-1 text-xs font-medium text-muted"><span>Loại</span><div><Segmented value={draft.kind} onChange={(k) => set('kind', k)} options={KIND_OPTS} /></div></div>
        <Field label={AMOUNT_LABEL[draft.kind]} className="col-span-2"
          hint={preview ? <span>Doanh thu sau quyết toán: <b className="num text-fg" data-testid="qt-after">{formatMoney(preview.after.contractValue)}</b> ({signedMoney(moneyDiff(preview.after.contractValue, preview.before.contractValue))}) · còn phải thu <b className="num text-fg">{formatMoney(preview.after.receivable)}</b></span> : undefined}>
          <MoneyInput aria-label="Số tiền quyết toán" value={draft.amount} onChange={(v) => set('amount', v)} />
        </Field>
        <Field label="Nội dung *" className="col-span-2"><Input aria-label="Nội dung quyết toán" value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder="Quyết toán cuối cùng" /></Field>
        <div className="col-span-2 grid gap-1">
          <Checkbox checked={draft.wantReceipt} onChange={(v) => set('wantReceipt', v)} disabled={!editable} label="Ghi nhận phiếu thu tiền còn lại (tự động)" />
          {receiptHint ? <div className="pl-6 text-xs text-muted">{receiptHint}</div> : null}
          <Checkbox checked={draft.isFinal} onChange={(v) => set('isFinal', v)} disabled={!editable} label="Chốt quyết toán cuối (công trình sang “Đã quyết toán”)" />
        </div>
        {preview && !preview.hasContract ? <div className="col-span-2"><Note icon="warning">Công trình chưa có hợp đồng chính — HĐ gốc đang tính là 0.</Note></div> : null}
      </fieldset>
      {editable ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-4 py-3">
          {draft.id ? <Button variant="ghost-danger" onClick={() => setConfirmDel(true)}><Icon name="delete" />Xóa</Button> : null}
          <div className="flex-1" />
          <Button onClick={reset}>Hủy</Button>
          <Button variant="primary" data-testid="qt-save" disabled={save.isPending} onClick={submit}><Icon name="save" />{save.isPending ? 'Đang lưu…' : draft.id ? 'Cập nhật' : 'Lưu'}</Button>
        </div>
      ) : null}
    </>
  );
  const open = (s: Settlement) => { load(s); setFormOpen(true); if (!phone) window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const valueText = (s: Settlement) => `${s.kind === 'increase' ? '+' : s.kind === 'decrease' ? '−' : ''}${formatMoney(s.amount)}`;
  const kindPill = (s: Settlement) => <Pill tone={SETTLEMENT_KIND[s.kind]?.tone ?? 'accent'}>{SETTLEMENT_KIND[s.kind]?.label ?? s.kind}</Pill>;
  const dialogs = (
    <>
      <ConfirmDialog open={!!ask} onOpenChange={(o) => { if (!o) setAsk(null); }} title="Lưu quyết toán?" confirmLabel="Vẫn lưu" busy={save.isPending}
        message={<ul className="m-0 grid gap-1 pl-4">{(ask ?? []).map((w) => <li key={w}>{w}</li>)}</ul>} onConfirm={doSave} />
      <ConfirmDialog open={confirmDel} onOpenChange={setConfirmDel} title="Xóa quyết toán?" danger busy={del.isPending} confirmLabel="Xóa"
        message={<>Xóa quyết toán {existing ? valueText(existing) : ''} của {data.projectName(draft.project)}.{preview?.auto ? ` Phiếu thu tự động ${formatMoney(preview.auto.amount)} đi kèm cũng bị xóa.` : ''}{existing?.is_final ? ' Công trình vẫn giữ trạng thái "Đã quyết toán"; muốn mở lại hãy sửa ở tab Công Trình.' : ''}</>}
        onConfirm={() => { if (!draft.id) return; del.mutate(draft.id, { onSuccess: () => { setConfirmDel(false); toast('Đã xóa quyết toán'); reset(); }, onError: (e) => { setConfirmDel(false); toast(`Chưa xóa được: ${e.message}`, 'error'); } }); }} />
    </>
  );

  if (phone) {
    return (
      <>
        {header}
        {canAdd ? <Button variant="primary" size="lg" data-testid="qt-add" onClick={() => { setDraft(blank()); setFormOpen(true); }}><Icon name="add" />Thêm quyết toán</Button> : null}
        {rows.length === 0 ? <Card><EmptyState icon="fact_check" title="Chưa có quyết toán trong kỳ này" /></Card> : (
          <div className="grid gap-2">
            {rows.map(({ s }) => (
              <MobileCard key={s.id} onClick={() => open(s)}>
                <MobileRow><b className="truncate">{data.projectName(s.project_id)}</b>{kindPill(s)}</MobileRow>
                <MobileRow meta><span>{formatDate(s.date)}{s.is_final ? ' · đã chốt' : ''}</span><b className="num text-fg">{valueText(s)}</b></MobileRow>
              </MobileCard>
            ))}
          </div>
        )}
        <Sheet open={formOpen} onOpenChange={(o) => { if (!o) reset(); }} title={draft.id ? 'Sửa quyết toán' : 'Thêm quyết toán'}><div className="-m-4">{form}</div></Sheet>
        {dialogs}
      </>
    );
  }
  return (
    <>
      {header}
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <Card><CardHeader title={draft.id ? 'Sửa quyết toán' : 'Thêm quyết toán'} sub="mỗi công trình 1 bản" />{form}</Card>
        <Card>
          <CardHeader title="Lịch sử quyết toán" sub={`${rows.length} lần`} actions={<SearchBox value={q} onChange={setQ} />} />
          {rows.length === 0 ? <EmptyState icon="fact_check" title="Chưa có quyết toán trong kỳ này" /> : (
            <div className="tbl tbl-tight">
              <table data-testid="qt-history">
                <thead><tr><th>Ngày</th><th>Công trình</th><th>Loại</th><th className="!text-right">HĐ trước</th><th className="!text-right">Giá trị</th><th>Nội dung</th><th /></tr></thead>
                <tbody>
                  {rows.map(({ s, before, auto }) => (
                    <tr key={s.id} className="cursor-pointer" tabIndex={0} onClick={() => open(s)} onKeyDown={(e) => { if (e.key === 'Enter') open(s); }}>
                      <td className="num whitespace-nowrap">{formatDate(s.date)}</td>
                      <td className="max-w-[170px] truncate" title={data.projectName(s.project_id)}>{data.projectName(s.project_id)}</td>
                      <td>{kindPill(s)}</td>
                      <td className="num text-right text-muted">{before ? formatMoney(before) : <span className="text-faint">—</span>}</td>
                      <td className="num text-right"><b>{valueText(s)}</b></td>
                      <td className="max-w-[110px] truncate text-muted" title={s.note ?? ''}>{s.note}</td>
                      <td className="whitespace-nowrap">{s.is_final ? <Pill tone="good">Đã chốt</Pill> : null}{auto ? <> <Pill>Thu {formatMoney(auto.amount)}</Pill></> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <Note>Tăng / Giảm cộng trừ vào giá trị hợp đồng; Thay thế tổng = số nhập là tổng giá trị mới. Lợi nhuận vẫn tính theo tiền thực thu − thực chi; quyết toán chỉ đổi “Giá trị HĐ” và “Còn phải thu”.</Note>
      {dialogs}
    </>
  );
}
