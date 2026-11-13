// Nút AI → THU TIỀN KHÁCH (giọng nói "anh Nhật đưa 100 triệu" hoặc ảnh chuyển khoản khách gửi): điền sẵn phiếu thu.
// Chưa rõ chuyển khoản hay tiền mặt → ô Hình thức viền vàng, phải chọn mới lưu. Anh kiểm tra rồi mới lưu.
import { useMemo, useState } from 'react';
import type { PayMethod, ReceiptScan } from '@shared/scan';
import { Segmented } from '@/components/ui/data';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { Field, Input, MoneyInput } from '@/components/ui/input';
import { Card, ErrorState, LoadingState, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { findByName } from '@/features/expenses/logic';
import { today } from '@/features/expenses/shared';
import { RECEIPT_KIND, useRevData, useSaveReceipt, type ReceiptKind } from '@/features/revenue/api';
import { METHOD_OPTS, UNSURE } from './shared';

type Props = { scan: ReceiptScan; onDone: () => void; onRetake: () => void };

const KIND_OPTS = (['advance', 'stage', 'settlement', 'other'] as const).map((k) => ({ value: k, label: RECEIPT_KIND[k]?.label ?? k }));

export function ScanReceipt({ scan, onDone, onRetake }: Props) {
  const toast = useToast();
  const data = useRevData();
  const save = useSaveReceipt();
  const [project, setProject] = useState(scan.project_match);
  const [date, setDate] = useState(scan.date || today());
  const [amount, setAmount] = useState(scan.amount);
  const [kind, setKind] = useState<ReceiptKind>(scan.receipt_kind);
  const [method, setMethod] = useState<PayMethod>(scan.method);
  const [note, setNote] = useState(scan.note);
  // Khách nói tên mà AI chưa khớp công trình → gợi ý các công trình có chủ đầu tư trùng tên
  const owners = useMemo(() => {
    if (!data.data || project) return [];
    const t = (scan.customer_match || scan.customer_text).toLowerCase();
    return t ? data.data.projectOptions.filter((p) => data.data.ownerOf(p.id).toLowerCase().includes(t.replace(/^(anh|chị|chú|cô|a|c)\s+/, ''))) : [];
  }, [data.data, project, scan.customer_match, scan.customer_text]);

  if (data.isPending) return <Card><LoadingState label="Đang tải công trình…" /></Card>;
  if (data.isError) return <Card><ErrorState error={data.error} onRetry={() => void data.refetch()} /></Card>;
  const d = data.data;
  const p = findByName(project, d.projectOptions);
  const unsure = (k: string) => (scan.low_confidence.includes(k) ? UNSURE : undefined);

  const submit = () => {
    if (!p) { toast('Chọn công trình.', 'error'); return; }
    if (amount <= 0) { toast('Nhập số tiền.', 'error'); return; }
    if (!method) { toast('Chọn chuyển khoản hay tiền mặt.', 'error'); return; }
    save.mutate({ id: null, projectId: p.id, date, amount, kind, note, method }, {
      onSuccess: () => { toast(`Đã lưu phiếu thu ${formatMoney(amount)} · ${p.name}`); onDone(); },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };

  return (
    <Card>
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <Icon name="savings" className="text-accent" />
        <h3 className="m-0 text-sm font-bold">Thu tiền khách — AI điền sẵn</h3>
        {scan.customer_text ? <Pill>Khách: {scan.customer_match || scan.customer_text}</Pill> : null}
      </header>
      <div className="grid gap-3 p-4" data-testid="scan-receipt">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Công trình *" className="sm:col-span-2">
            <Combo aria-label="Công trình" value={project} onChange={setProject} items={d.projectOptions} groupLabel="Công trình" className={p ? unsure('project_match') : UNSURE} />
          </Field>
          {owners.length ? (
            <div className="sm:col-span-2 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
              Công trình của khách này:
              {owners.slice(0, 4).map((o) => <Button key={o.id} size="sm" onClick={() => setProject(o.name)}>{o.name}</Button>)}
            </div>
          ) : null}
          {p ? <div className="sm:col-span-2 text-[12.5px] text-muted">Chủ đầu tư: <b className="text-fg">{d.ownerOf(p.id) || '—'}</b></div> : null}
          <Field label="Ngày"><Input type="date" aria-label="Ngày thu" className={scan.date ? unsure('date') : UNSURE} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Số tiền (đ) *"><MoneyInput aria-label="Số tiền thu" className={amount > 0 ? unsure('amount') : UNSURE} value={amount} onChange={setAmount} /></Field>
          <div className="grid gap-1 text-xs font-medium text-muted sm:col-span-2"><span>Hình thức *</span>
            <div className={method ? undefined : 'w-fit rounded-lg ring-2 ring-warn'} data-testid="receipt-method"><Segmented value={method || ('' as 'transfer')} onChange={setMethod} options={METHOD_OPTS} /></div>
          </div>
          <div className="grid gap-1 text-xs font-medium text-muted sm:col-span-2"><span>Loại thu</span><div><Segmented value={kind} onChange={setKind} options={KIND_OPTS} /></div></div>
          <Field label="Ghi chú" className="sm:col-span-2"><Input aria-label="Ghi chú phiếu thu" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Đợt 3 — xong sàn tầng 2" /></Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onRetake}><Icon name="close" />Bỏ</Button>
          <Button variant="primary" data-testid="receipt-save" disabled={save.isPending} onClick={submit}><Icon name="save" />{save.isPending ? 'Đang lưu…' : 'Lưu phiếu thu'}</Button>
        </div>
      </div>
    </Card>
  );
}
