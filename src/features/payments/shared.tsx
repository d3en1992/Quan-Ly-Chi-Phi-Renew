// Mảnh dùng chung của Chi Trả TP/NCC và Công Nợ Phải Trả: số liệu suy ra (công nợ theo cặp, theo NCC, theo hóa đơn),
// bảng trượt ghi / sửa MỘT phiếu chi (có "Trả cho công trình…" và tích từng hóa đơn — mục 4J), bảng hạng mục hợp đồng, ảnh phiếu chi.
import { useMemo, useState } from 'react';
import type { MyAccess } from '@/app/auth';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { ConfirmDialog } from '@/components/ui/confirm';
import { Segmented } from '@/components/ui/data';
import { Field, Input, MoneyInput, Select } from '@/components/ui/input';
import { Note } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import {
  contractItemsTotal, paidByInvoice, subcontractorPairPayables, subcontractPayables, sumOf, supplierPayables,
  type ContractItem, type PairPayable, type SubcontractPayable, type SupplierPayable,
} from '@/lib/calc';
import { formatDate, formatMoney } from '@/lib/format';
import type { ModuleKey } from '@/lib/permissions';
import type { Voucher } from '@/lib/voucher';
import { findByName } from '@/features/expenses/logic';
import { todayIso } from '@/features/reports/shared';
import {
  KIND_LABEL, useCreateParty, useCreatePayments, useDeletePayment, useUpdatePayment,
  type PayData, type Payment, type PaymentInput, type PaymentKind,
} from './api';

/** Được sửa / xóa dòng này không: Toàn quyền, hoặc Nhập + (dòng của mình / quyền sửa dòng người khác) — đúng RLS */
export function canEditRow(access: MyAccess, module: ModuleKey, createdBy: string | null | undefined): boolean {
  const lv = access.permissions[module];
  return lv === 'full' || (lv === 'add' && (createdBy === access.profile.id || access.special.edit_others));
}

export type PayCalc = {
  pairs: PairPayable[];
  pairOf: (subcontractorId: string, projectId: string) => PairPayable | undefined;
  contract: Map<string, SubcontractPayable>;
  supplier: Map<string, SupplierPayable>;
  /** Đã trả của từng hóa đơn mua nợ */
  paidInvoice: Map<string, number>;
};

export function usePayCalc(data: PayData | undefined): PayCalc | null {
  return useMemo(() => {
    if (!data) return null;
    const pairs = subcontractorPairPayables(data.subcontracts, data.payments);
    const byKey = new Map(pairs.map((p) => [p.key, p]));
    return {
      pairs,
      pairOf: (s, p) => byKey.get(`${s}|${p}`),
      contract: new Map(subcontractPayables(data.subcontracts, data.payments).map((r) => [r.subcontractId, r])),
      supplier: new Map(supplierPayables(data.credits, data.payments).map((r) => [r.supplierId, r])),
      paidInvoice: paidByInvoice(data.allocations),
    };
  }, [data]);
}

export function paymentVoucher(p: Payment, data: PayData, company: string): Voucher {
  const ncc = p.kind === 'supplier_payment';
  const party = data.partyName(p);
  return {
    title: 'PHIẾU CHI', company, date: p.date,
    rows: [
      [ncc ? 'Nhà cung cấp' : 'Thầu phụ', party],
      ['Loại', KIND_LABEL[p.kind] ?? p.kind],
      ['Công trình', p.project_id ? data.projectName(p.project_id) : 'Trả theo cục (chia vào hóa đơn cũ nhất trước)'],
      ['Nội dung', p.note ?? '—'],
      ['Người thực hiện', data.userName(p.created_by) || '—'],
    ],
    amountLabel: 'SỐ TIỀN CHI', amount: p.amount, signRight: 'Người nhận tiền',
    filename: `phieu-chi_${party}_${p.date}.png`,
  };
}

// ─── Bảng hạng mục hợp đồng (không bắt buộc) + Copy / Dán khối lượng (`copyKLCT` / `pasteKLCT`) ───
const KL_KEY = 'klct_clipboard';

export function ItemsEditor({ items, onChange, disabled }: { items: ContractItem[]; onChange: (v: ContractItem[]) => void; disabled?: boolean }) {
  const toast = useToast();
  const [askPaste, setAskPaste] = useState<ContractItem[] | null>(null);
  const set = (i: number, patch: Partial<ContractItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const copy = () => {
    const rows = items.filter((i) => i.name.trim() || i.sl || i.donGia);
    if (!rows.length) { toast('Không có dữ liệu để copy', 'error'); return; }
    try { localStorage.setItem(KL_KEY, JSON.stringify(rows.map((r) => ({ ten: r.name, donvi: r.donVi, khoiluong: r.sl, dongia: r.donGia })))); toast('Đã copy khối lượng chi tiết'); }
    catch { toast('Copy thất bại', 'error'); }
  };
  const paste = () => {
    let rows: ContractItem[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(KL_KEY) ?? '[]') as { ten?: string; donvi?: string; khoiluong?: number | string; dongia?: number | string }[];
      rows = raw.map((r) => ({ name: r.ten ?? '', donVi: r.donvi ?? '', sl: Number(r.khoiluong) || 0, donGia: Number(r.dongia) || 0 }));
    } catch { /* bộ nhớ hỏng → coi như chưa copy */ }
    if (!rows.length) { toast('Chưa có dữ liệu copy', 'error'); return; }
    if (items.some((i) => i.name.trim() || i.sl || i.donGia)) setAskPaste(rows);
    else { onChange(rows); toast('Đã dán khối lượng chi tiết'); }
  };
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Hạng mục trong hợp đồng (không bắt buộc)</span>
        <div className="flex-1" />
        {disabled ? null : (
          <>
            <Button size="sm" variant="ghost" onClick={copy}><Icon name="content_copy" />Copy KL</Button>
            <Button size="sm" variant="ghost" onClick={paste}><Icon name="content_paste" />Dán KL</Button>
            <Button size="sm" onClick={() => onChange([...items, { name: '', donVi: '', sl: 0, donGia: 0 }])}><Icon name="add" />Thêm dòng</Button>
          </>
        )}
      </div>
      {items.length ? (
        <div className="tbl">
          <table data-testid="items-table">
            <thead><tr><th>Hạng mục</th><th style={{ width: 70 }}>ĐVT</th><th style={{ width: 90 }} className="!text-right">Khối lượng</th><th style={{ width: 130 }} className="!text-right">Đơn giá</th><th className="!text-right">Thành tiền</th><th style={{ width: 36 }} /></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="!p-1"><Input aria-label={`Hạng mục ${i + 1}`} disabled={disabled} value={it.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
                  <td className="!p-1"><Input aria-label={`ĐVT ${i + 1}`} disabled={disabled} value={it.donVi} onChange={(e) => set(i, { donVi: e.target.value })} /></td>
                  <td className="!p-1"><Input aria-label={`Khối lượng ${i + 1}`} disabled={disabled} inputMode="decimal" className="num text-right" value={it.sl ? String(it.sl).replace('.', ',') : ''}
                    onChange={(e) => set(i, { sl: Number(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.')) || 0 })} /></td>
                  <td className="!p-1"><MoneyInput aria-label={`Đơn giá ${i + 1}`} disabled={disabled} value={it.donGia} onChange={(v) => set(i, { donGia: v })} /></td>
                  <td className="num text-right whitespace-nowrap">{formatMoney(contractItemsTotal([it]))}</td>
                  <td className="!p-1">{disabled ? null : <Button size="icon" variant="ghost-danger" aria-label={`Xóa hạng mục ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><Icon name="close" /></Button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="font-bold"><td colSpan={4}>Tổng hạng mục</td><td className="num text-right" data-testid="items-total">{formatMoney(contractItemsTotal(items))}</td><td /></tr></tfoot>
          </table>
        </div>
      ) : null}
      <ConfirmDialog open={!!askPaste} onOpenChange={(o) => { if (!o) setAskPaste(null); }} title="Ghi đè hạng mục?" confirmLabel="Ghi đè"
        message="Hợp đồng đang có hạng mục. Dán sẽ thay toàn bộ bằng dữ liệu đã copy."
        onConfirm={() => { if (askPaste) onChange(askPaste); setAskPaste(null); toast('Đã dán khối lượng chi tiết'); }} />
    </div>
  );
}

// ─── Bảng trượt ghi / sửa MỘT phiếu chi ───
export type PayDraft = {
  id: string | null; kind: PaymentKind; date: string; party: string; project: string; subcontractId: string; amount: number; note: string;
  mode: 'fifo' | 'project' | 'manual'; picks: string[];
};
export const blankPayDraft = (o: Partial<PayDraft> = {}): PayDraft => ({
  id: null, kind: 'advance', date: todayIso(), party: '', project: '', subcontractId: '', amount: 0, note: '', mode: 'fifo', picks: [], ...o,
});
export function draftOfPayment(p: Payment, data: PayData): PayDraft {
  return {
    id: p.id, kind: p.kind as PaymentKind, date: p.date, party: data.partyName(p), project: p.project_id ?? '', subcontractId: p.subcontract_id ?? '',
    amount: p.amount, note: p.note ?? '', mode: (p.kind === 'supplier_payment' ? p.allocation_mode : 'fifo') as PayDraft['mode'],
    picks: p.allocation_mode === 'manual' ? data.allocations.filter((a) => a.payment_id === p.id && a.expense_id).map((a) => a.expense_id!) : [],
  };
}

/** HĐ thầu phụ gắn cho phiếu: người dùng chọn, hoặc cặp chỉ có đúng 1 HĐ thì gắn luôn; nhiều HĐ thì để trống (chia cũ nhất trước) */
export function autoSubcontractId(data: PayData, subcontractorId: string, projectId: string, picked = ''): string | null {
  const list = data.subcontracts.filter((h) => h.subcontractor_id === subcontractorId && h.project_id === projectId);
  if (picked && list.some((h) => h.id === picked)) return picked;
  return list.length === 1 ? list[0]!.id : null;
}

export function PaymentSheet({ draft, setDraft, data, calc, readOnly, onClose }: {
  draft: PayDraft; setDraft: (d: PayDraft) => void; data: PayData; calc: PayCalc; readOnly?: boolean; onClose: () => void;
}) {
  const toast = useToast();
  const create = useCreatePayments(), update = useUpdatePayment(), del = useDeletePayment(), createParty = useCreateParty();
  const [confirmDel, setConfirmDel] = useState(false);
  const busy = create.isPending || update.isPending || del.isPending;
  const set = <K extends keyof PayDraft>(k: K, v: PayDraft[K]) => setDraft({ ...draft, [k]: v });
  const ncc = draft.kind === 'supplier_payment';
  const parties = (ncc ? data.suppliers : data.subcontractors).filter((p) => !p.archived || findByName(draft.party, [p]));
  const party = findByName(draft.party, ncc ? data.suppliers : data.subcontractors);
  const projectOpts = useMemo(() => {
    const ids = new Set(data.projectOptions.map((p) => p.id));
    const extra = data.projects.filter((p) => !ids.has(p.id) && (p.id === draft.project || (ncc && party && data.credits.some((c) => c.supplier_id === party.id && c.project_id === p.id))));
    return [...data.projectOptions, ...extra];
  }, [data, draft.project, ncc, party]);

  // Thầu phụ: còn phải trả ở công trình đang chọn (không tính chính phiếu đang sửa)
  const editing = draft.id ? data.payments.find((p) => p.id === draft.id) : undefined;
  const pair = !ncc && party && draft.project ? calc.pairOf(party.id, draft.project) : undefined;
  const pairDebt = pair ? pair.debt + (editing && editing.subcontractor_id === party?.id && editing.project_id === draft.project ? editing.amount : 0) : 0;
  const pairContracts = !ncc && party && draft.project ? data.subcontracts.filter((h) => h.subcontractor_id === party.id && h.project_id === draft.project) : [];
  // NCC: còn nợ + hóa đơn mua nợ chưa trả hết (cộng lại phần phiếu đang sửa đã chia)
  const supDebt = ncc && party ? (calc.supplier.get(party.id)?.debt ?? 0) + (editing?.supplier_id === party.id ? editing.amount : 0) : 0;
  const openInvoices = useMemo(() => {
    if (!ncc || !party) return [];
    const mine = new Map<string, number>();
    if (draft.id) for (const a of data.allocations) if (a.payment_id === draft.id && a.expense_id) mine.set(a.expense_id, (mine.get(a.expense_id) ?? 0) + a.amount);
    return data.credits.filter((c) => c.supplier_id === party.id)
      .map((c) => ({ ...c, remaining: c.amount - (calc.paidInvoice.get(c.id) ?? 0) + (mine.get(c.id) ?? 0) }))
      .filter((c) => c.remaining > 0 || draft.picks.includes(c.id))
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  }, [ncc, party, data, calc, draft.id, draft.picks]);
  const pickedTotal = sumOf(openInvoices.filter((c) => draft.picks.includes(c.id)), (c) => c.remaining);

  const submit = () => {
    if (!draft.date) { toast('Chọn ngày!', 'error'); return; }
    if (!party) { toast(draft.party.trim() ? `"${draft.party.trim()}" chưa có trong danh bạ — chọn "+ Tạo mới"` : `Chọn ${ncc ? 'nhà cung cấp' : 'thầu phụ'}!`, 'error'); return; }
    if (!ncc && !draft.project) { toast('Chọn công trình!', 'error'); return; }
    if (draft.amount <= 0) { toast('Nhập số tiền > 0!', 'error'); return; }
    const input: PaymentInput = {
      kind: draft.kind, date: draft.date, amount: draft.amount, note: draft.note, mode: ncc ? draft.mode : 'fifo', picks: ncc && draft.mode === 'manual' ? draft.picks : [],
      supplierId: ncc ? party.id : null, subcontractorId: ncc ? null : party.id, projectId: draft.project || null,
      subcontractId: ncc ? null : autoSubcontractId(data, party.id, draft.project, draft.subcontractId),
    };
    const opts = {
      onSuccess: () => { toast(`${draft.id ? 'Đã cập nhật' : 'Đã ghi'} phiếu chi ${formatMoney(draft.amount)} · ${party.name}`); onClose(); },
      onError: (e: Error) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    };
    if (draft.id) update.mutate({ ...input, id: draft.id }, opts); else create.mutate([input], opts);
  };

  return (
    <Sheet wide={ncc && draft.mode === 'manual'} open onOpenChange={(o) => { if (!o) onClose(); }} title={readOnly ? 'Phiếu chi' : draft.id ? 'Sửa phiếu chi' : 'Ghi phiếu chi'}
      footer={readOnly ? <Button onClick={onClose}>Đóng</Button> : (
        <>
          {draft.id ? <Button variant="danger" disabled={busy} onClick={() => setConfirmDel(true)}><Icon name="delete" />Xóa</Button> : null}
          <div className="flex-1" />
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" data-testid="pay-sheet-save" disabled={busy} onClick={submit}><Icon name="save" />{busy ? 'Đang lưu…' : 'Lưu phiếu chi'}</Button>
        </>
      )}>
      <fieldset disabled={readOnly} className="grid min-w-0 gap-3">
        {draft.id && ncc ? <div className="text-[13px] font-semibold">{KIND_LABEL.supplier_payment}</div> : (
          <Segmented value={draft.kind} onChange={(k) => setDraft({ ...draft, kind: k, party: (k === 'supplier_payment') === ncc ? draft.party : '', picks: [], mode: 'fifo' })}
            options={(draft.id ? ['advance', 'progress'] as const : ['advance', 'progress', 'supplier_payment'] as const).map((k) => ({ value: k, label: KIND_LABEL[k]! }))} />
        )}
        <Field label="Ngày"><Input type="date" aria-label="Ngày" value={draft.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label={ncc ? 'Nhà cung cấp *' : 'Thầu phụ *'}
          hint={party ? (ncc
            ? <span data-testid="pay-debt">Còn nợ {party.name}: <b className="num text-fg">{formatMoney(supDebt)}</b> đ{supDebt < 0 ? ' (đang trả trước)' : ''}</span>
            : draft.project ? <span data-testid="pay-debt">Còn phải trả {party.name} ở công trình này: <b className="num text-fg">{formatMoney(pairDebt)}</b> đ</span> : undefined) : undefined}>
          <Combo aria-label={ncc ? 'Nhà cung cấp' : 'Thầu phụ'} placeholder={ncc ? 'Chọn / gõ tên NCC…' : 'Chọn / gõ tên thầu phụ…'} value={draft.party} onChange={(v) => set('party', v)} items={parties}
            groupLabel={ncc ? 'Nhà cung cấp' : 'Thầu phụ'}
            onCreate={(name) => createParty.mutateAsync({ table: ncc ? 'suppliers' : 'subcontractors', name }).catch((e: Error) => { toast(e.message, 'error'); return ''; })} />
        </Field>
        {ncc ? (
          <>
            <Field label="Cách chia tiền" hint="Không chọn gì = trả một cục, app tự chia vào hóa đơn mua nợ cũ nhất trước, bất kể công trình.">
              <Select aria-label="Cách chia tiền" value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as PayDraft['mode'], picks: [] })}>
                <option value="fifo">Trả theo cục — cũ nhất trước</option>
                <option value="project">Trả cho công trình…</option>
                <option value="manual">Tích từng hóa đơn…</option>
              </Select>
            </Field>
            {draft.mode === 'project' ? (
              <Field label="Trả cho công trình *">
                <Select aria-label="Trả cho công trình" value={draft.project} onChange={(e) => set('project', e.target.value)}>
                  <option value="">— Chọn công trình —</option>
                  {projectOpts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
            ) : null}
            {draft.mode === 'manual' ? (
              <div className="grid gap-1.5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>Hóa đơn mua nợ chưa trả hết</span><div className="flex-1" />
                  <span>Đã tích: <b className="num text-fg" data-testid="pay-picked">{formatMoney(pickedTotal)}</b></span>
                  <Button size="sm" disabled={!pickedTotal} onClick={() => set('amount', pickedTotal)}>Lấy làm số tiền</Button>
                </div>
                {openInvoices.length === 0 ? <Note>{party ? 'NCC này không còn hóa đơn mua nợ nào chưa trả.' : 'Chọn nhà cung cấp trước.'}</Note> : (
                  <div className="tbl max-h-[280px] overflow-y-auto rounded-lg border border-line-soft">
                    <table>
                      <thead><tr><th style={{ width: 32 }} /><th>Ngày</th><th>Công trình</th><th>Nội dung</th><th className="!text-right">Còn lại</th></tr></thead>
                      <tbody>
                        {openInvoices.map((c) => {
                          const on = draft.picks.includes(c.id);
                          return (
                            <tr key={c.id} className="cursor-pointer" onClick={() => set('picks', on ? draft.picks.filter((x) => x !== c.id) : [...draft.picks, c.id])}>
                              <td><input type="checkbox" aria-label={`Tích hóa đơn ${formatDate(c.date)} ${formatMoney(c.remaining)}`} checked={on} readOnly /></td>
                              <td className="num whitespace-nowrap">{formatDate(c.date)}</td>
                              <td className="max-w-[160px] truncate">{data.projectName(c.project_id)}</td>
                              <td className="max-w-[180px] truncate text-muted">{c.description}</td>
                              <td className="num text-right">{formatMoney(c.remaining)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <Field label="Công trình *">
              <Select aria-label="Công trình" value={draft.project} onChange={(e) => setDraft({ ...draft, project: e.target.value, subcontractId: '' })}>
                <option value="">— Chọn công trình —</option>
                {projectOpts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            {pairContracts.length > 1 ? (
              <Field label="Hợp đồng thầu phụ" hint="Để trống: app tự tính cho hợp đồng cũ nhất còn nợ trước.">
                <Select aria-label="Hợp đồng thầu phụ" value={draft.subcontractId} onChange={(e) => set('subcontractId', e.target.value)}>
                  <option value="">— Tự chia (cũ nhất trước) —</option>
                  {pairContracts.map((h) => <option key={h.id} value={h.id}>{formatDate(h.date)} · {h.description ?? 'HĐ'} · {formatMoney(calc.contract.get(h.id)?.total ?? 0)}</option>)}
                </Select>
              </Field>
            ) : null}
          </>
        )}
        <Field label="Số tiền"><MoneyInput aria-label="Số tiền" value={draft.amount} onChange={(v) => set('amount', v)} /></Field>
        <Field label="Nội dung"><Input aria-label="Nội dung" value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder={ncc ? 'Trả tiền vật tư đợt…' : 'Ứng đợt 2, thanh toán đợt cuối…'} /></Field>
      </fieldset>
      <ConfirmDialog open={confirmDel} onOpenChange={setConfirmDel} title="Xóa phiếu chi?" danger busy={del.isPending} confirmLabel="Xóa"
        message={<>Xóa phiếu chi {formatMoney(draft.amount)} ngày {formatDate(draft.date)} của {draft.party}. Phiếu vào Thùng rác{ncc ? '; tiền các phiếu còn lại sẽ được chia lại' : ''}.</>}
        onConfirm={() => { if (!draft.id) return; del.mutate({ id: draft.id, kind: draft.kind }, { onSuccess: () => { toast('Đã xóa phiếu chi'); onClose(); }, onError: (e) => { setConfirmDel(false); toast(`Chưa xóa được: ${e.message}`, 'error'); } }); }} />
    </Sheet>
  );
}
