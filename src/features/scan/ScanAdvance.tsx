// Nút AI → TIỀN ỨNG THẦU PHỤ (giọng nói "ứng Hà điện nước 5 triệu CT A Nhật" hoặc ảnh chuyển khoản): điền sẵn phiếu chi
// Tạm ứng TP / Thanh toán đợt TP. Thầu phụ chưa có → tích "Thêm thầu phụ mới". Anh kiểm tra rồi mới lưu.
import { useState } from 'react';
import type { AdvanceScan, PayMethod } from '@shared/scan';
import { Segmented } from '@/components/ui/data';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { Checkbox, Field, Input, MoneyInput } from '@/components/ui/input';
import { Card, ErrorState, LoadingState, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { findByName } from '@/features/expenses/logic';
import { today } from '@/features/expenses/shared';
import { useCreateParty, useCreatePayments, usePayData } from '@/features/payments/api';
import { METHOD_OPTS, UNSURE, methodNote } from './shared';

type Props = { scan: AdvanceScan; onDone: () => void; onRetake: () => void };

export function ScanAdvance({ scan, onDone, onRetake }: Props) {
  const toast = useToast();
  const data = usePayData();
  const create = useCreatePayments();
  const createParty = useCreateParty();
  const [sub, setSub] = useState(scan.subcontractor_match || scan.subcontractor_text);
  const [project, setProject] = useState(scan.project_match);
  const [date, setDate] = useState(scan.date || today());
  const [amount, setAmount] = useState(scan.amount);
  const [payKind, setPayKind] = useState<'advance' | 'progress'>(scan.pay_kind);
  const [method, setMethod] = useState<PayMethod>(scan.method);
  const [note, setNote] = useState(scan.note);
  const [addNew, setAddNew] = useState(true);
  const [busy, setBusy] = useState(false);

  if (data.isPending) return <Card><LoadingState label="Đang tải danh sách thầu phụ…" /></Card>;
  if (data.isError) return <Card><ErrorState error={data.error} onRetry={() => void data.refetch()} /></Card>;
  const d = data.data;
  const subcontractors = d.subcontractors.filter((s) => !s.archived);
  const found = findByName(sub, subcontractors);
  const isNew = !!sub.trim() && !found;
  const unsure = (k: string) => (scan.low_confidence.includes(k) ? UNSURE : undefined);

  const save = async () => {
    const p = findByName(project, d.projectOptions);
    if (!p) { toast('Chọn công trình.', 'error'); return; }
    if (amount <= 0) { toast('Nhập số tiền.', 'error'); return; }
    if (!sub.trim()) { toast('Chọn thầu phụ.', 'error'); return; }
    if (isNew && !addNew) { toast('Thầu phụ chưa có trong danh mục — tích "Thêm thầu phụ mới" hoặc chọn thầu phụ có sẵn.', 'error'); return; }
    setBusy(true);
    try {
      let subId = found?.id ?? null;
      if (!subId) {
        const name = await createParty.mutateAsync({ table: 'subcontractors', name: sub });
        const fresh = await data.refetch();
        subId = fresh.data?.subcontractors.find((s) => s.name === name)?.id ?? null;
        if (!subId) throw new Error('Đã thêm thầu phụ nhưng chưa tải lại được — thử lưu lại.');
        toast(`Đã thêm thầu phụ “${name}”`);
      }
      await create.mutateAsync([{
        kind: payKind, date, amount, subcontractorId: subId, subcontractId: null, supplierId: null, projectId: p.id,
        mode: 'fifo', picks: [], note: methodNote(method, note),
      }]);
      toast(`Đã lưu ${payKind === 'advance' ? 'tạm ứng' : 'thanh toán'} ${formatMoney(amount)} cho ${found?.name ?? sub.toUpperCase()} · ${p.name}`);
      onDone();
    } catch (e) {
      toast(`Chưa lưu được: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <Icon name="payments" className="text-accent" />
        <h3 className="m-0 text-sm font-bold">Tiền ứng thầu phụ — AI điền sẵn</h3>
        {scan.low_confidence.length ? <Pill tone="warn">{scan.low_confidence.length} ô cần xem lại</Pill> : null}
      </header>
      <div className="grid gap-3 p-4" data-testid="scan-advance">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Thầu phụ *" className="sm:col-span-2">
            <Combo aria-label="Thầu phụ" value={sub} onChange={setSub} items={subcontractors} groupLabel="Thầu phụ" free className={found ? unsure('subcontractor_match') : UNSURE} />
          </Field>
          {isNew ? (
            <div className="sm:col-span-2 rounded-lg border border-accent/40 bg-accent-soft/50 p-2.5" data-testid="new-subcontractor">
              <Checkbox checked={addNew} onChange={setAddNew} label={<>Thêm thầu phụ mới <b>{sub.trim().toUpperCase()}</b> vào danh mục</>} />
              {scan.subcontractor_text && scan.subcontractor_text !== sub ? <div className="mt-1 text-[12px] text-muted">AI nghe được: “{scan.subcontractor_text}”</div> : null}
            </div>
          ) : null}
          <Field label="Công trình *" className="sm:col-span-2">
            <Combo aria-label="Công trình" value={project} onChange={setProject} items={d.projectOptions} groupLabel="Công trình" className={findByName(project, d.projectOptions) ? unsure('project_match') : UNSURE} />
          </Field>
          <Field label="Ngày"><Input type="date" aria-label="Ngày ứng" className={scan.date ? unsure('date') : UNSURE} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Số tiền (đ) *"><MoneyInput aria-label="Số tiền ứng" className={amount > 0 ? unsure('amount') : UNSURE} value={amount} onChange={setAmount} /></Field>
          <div className="grid gap-1 text-xs font-medium text-muted"><span>Loại phiếu</span>
            <div><Segmented value={payKind} onChange={setPayKind} options={[{ value: 'advance', label: 'Tạm ứng' }, { value: 'progress', label: 'Thanh toán đợt' }]} /></div>
          </div>
          <div className="grid gap-1 text-xs font-medium text-muted"><span>Hình thức</span>
            <div className={method ? undefined : 'w-fit rounded-lg ring-2 ring-warn'}><Segmented value={method || ('' as 'transfer')} onChange={setMethod} options={METHOD_OPTS} /></div>
          </div>
          <Field label="Nội dung" className="sm:col-span-2"><Input aria-label="Nội dung phiếu chi" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ứng tiền điện nước" /></Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onRetake}><Icon name="close" />Bỏ</Button>
          <Button variant="primary" data-testid="advance-save" disabled={busy} onClick={() => void save()}><Icon name="save" />{busy ? 'Đang lưu…' : 'Lưu phiếu chi'}</Button>
        </div>
      </div>
    </Card>
  );
}
