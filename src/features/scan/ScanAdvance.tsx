// Nút AI → TIỀN ỨNG / TRẢ TIỀN cho THẦU PHỤ hoặc NHÀ CUNG CẤP (giọng nói "ứng Hà điện nước 5 triệu CT A Nhật",
// "nhà cung cấp sắt thép An Phú ứng 50 triệu", hoặc ảnh chuyển khoản): điền sẵn phiếu chi.
// Thầu phụ → Tạm ứng TP / Thanh toán đợt TP. NCC → Trả nợ NCC (có công trình thì chia trong công trình đó, không thì chia hóa đơn cũ nhất trước).
// Người nhận chưa có trong danh mục → tích "Thêm … mới". Anh kiểm tra rồi mới lưu.
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
type Party = AdvanceScan['party'];

const PARTY_OPTS: { value: Party; label: string }[] = [{ value: 'subcontractor', label: 'Thầu phụ' }, { value: 'supplier', label: 'Nhà cung cấp' }];

export function ScanAdvance({ scan, onDone, onRetake }: Props) {
  const toast = useToast();
  const data = usePayData();
  const create = useCreatePayments();
  const createParty = useCreateParty();
  const [party, setParty] = useState<Party>(scan.party);
  const [name, setName] = useState((scan.party === 'supplier' ? scan.supplier_match : scan.subcontractor_match) || scan.subcontractor_text);
  const [project, setProject] = useState(scan.project_match);
  const [date, setDate] = useState(scan.date || today());
  const [amount, setAmount] = useState(scan.amount);
  const [payKind, setPayKind] = useState<'advance' | 'progress'>(scan.pay_kind);
  const [method, setMethod] = useState<PayMethod>(scan.method);
  const [note, setNote] = useState(scan.note);
  const [addNew, setAddNew] = useState(true);
  const [busy, setBusy] = useState(false);

  if (data.isPending) return <Card><LoadingState label="Đang tải danh sách thầu phụ, nhà cung cấp…" /></Card>;
  if (data.isError) return <Card><ErrorState error={data.error} onRetry={() => void data.refetch()} /></Card>;
  const d = data.data;
  const isSup = party === 'supplier';
  const who = isSup ? 'nhà cung cấp' : 'thầu phụ';
  const people = (isSup ? d.suppliers : d.subcontractors).filter((s) => !s.archived);
  const found = findByName(name, people);
  const isNew = !!name.trim() && !found;
  const proj = findByName(project, d.projectOptions);
  const unsure = (k: string) => (scan.low_confidence.includes(k) ? UNSURE : undefined);

  // Đổi Thầu phụ ↔ NCC: tên đang có mà khớp danh mục bên kia thì giữ, không thì lấy tên AI nghe được
  const switchParty = (p: Party) => {
    setParty(p);
    const other = (p === 'supplier' ? d.suppliers : d.subcontractors).filter((s) => !s.archived);
    const hit = findByName(name, other) ?? findByName(p === 'supplier' ? scan.supplier_match : scan.subcontractor_match, other);
    setName(hit?.name ?? scan.subcontractor_text);
  };

  const save = async () => {
    if (!isSup && !proj) { toast('Chọn công trình.', 'error'); return; }
    if (amount <= 0) { toast('Nhập số tiền.', 'error'); return; }
    if (!name.trim()) { toast(`Chọn ${who}.`, 'error'); return; }
    if (isNew && !addNew) { toast(`${isSup ? 'Nhà cung cấp' : 'Thầu phụ'} chưa có trong danh mục — tích "Thêm ${who} mới" hoặc chọn tên có sẵn.`, 'error'); return; }
    setBusy(true);
    try {
      let id = found?.id ?? null;
      if (!id) {
        const created = await createParty.mutateAsync({ table: isSup ? 'suppliers' : 'subcontractors', name });
        const fresh = await data.refetch();
        id = (isSup ? fresh.data?.suppliers : fresh.data?.subcontractors)?.find((s) => s.name === created)?.id ?? null;
        if (!id) throw new Error(`Đã thêm ${who} nhưng chưa tải lại được — thử lưu lại.`);
        toast(`Đã thêm ${who} “${created}”`);
      }
      await create.mutateAsync([isSup ? {
        // Trả nợ NCC: có công trình → chỉ chia cho hóa đơn của công trình đó; không → chia hóa đơn mua nợ cũ nhất trước
        kind: 'supplier_payment', date, amount, subcontractorId: null, subcontractId: null, supplierId: id,
        projectId: proj?.id ?? null, mode: proj ? 'project' : 'fifo', picks: [], note: methodNote(method, note),
      } : {
        kind: payKind, date, amount, subcontractorId: id, subcontractId: null, supplierId: null, projectId: proj!.id,
        mode: 'fifo', picks: [], note: methodNote(method, note),
      }]);
      const label = found?.name ?? name.trim().toUpperCase();
      toast(`Đã lưu ${isSup ? 'phiếu trả NCC' : payKind === 'advance' ? 'tạm ứng' : 'thanh toán'} ${formatMoney(amount)} cho ${label}${proj ? ` · ${proj.name}` : ''}`);
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
        <h3 className="m-0 text-sm font-bold">{isSup ? 'Trả tiền nhà cung cấp' : 'Tiền ứng thầu phụ'} — AI điền sẵn</h3>
        {scan.low_confidence.length ? <Pill tone="warn">{scan.low_confidence.length} ô cần xem lại</Pill> : null}
      </header>
      <div className="grid gap-3 p-4" data-testid="scan-advance">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="grid gap-1 text-xs font-medium text-muted sm:col-span-2"><span>Trả cho</span>
            <div data-testid="advance-party"><Segmented value={party} onChange={switchParty} options={PARTY_OPTS} /></div>
          </div>
          <Field label={`${isSup ? 'Nhà cung cấp' : 'Thầu phụ'} *`} className="sm:col-span-2">
            <Combo aria-label={isSup ? 'Nhà cung cấp' : 'Thầu phụ'} value={name} onChange={setName} items={people} groupLabel={isSup ? 'Nhà cung cấp' : 'Thầu phụ'} free
              className={found ? unsure(isSup ? 'supplier_match' : 'subcontractor_match') : UNSURE} />
          </Field>
          {isNew ? (
            <div className="sm:col-span-2 rounded-lg border border-accent/40 bg-accent-soft/50 p-2.5" data-testid="new-party">
              <Checkbox checked={addNew} onChange={setAddNew} label={<>Thêm {who} mới <b>{name.trim().toUpperCase()}</b> vào danh mục</>} />
              {scan.subcontractor_text && scan.subcontractor_text !== name ? <div className="mt-1 text-[12px] text-muted">AI nghe được: “{scan.subcontractor_text}”</div> : null}
            </div>
          ) : null}
          <Field label={isSup ? 'Công trình (không bắt buộc)' : 'Công trình *'} className="sm:col-span-2">
            <Combo aria-label="Công trình" value={project} onChange={setProject} items={d.projectOptions} groupLabel="Công trình" className={proj ? unsure('project_match') : isSup ? undefined : UNSURE} />
          </Field>
          {isSup ? (
            <p className="m-0 text-[12px] text-muted sm:col-span-2">
              {proj ? <>Tiền này trừ vào nợ hóa đơn của <b>{proj.name}</b> trước.</> : 'Không chọn công trình: trừ vào các hóa đơn mua nợ cũ nhất của NCC này.'}
            </p>
          ) : null}
          <Field label="Ngày"><Input type="date" aria-label="Ngày ứng" className={scan.date ? unsure('date') : UNSURE} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Số tiền (đ) *"><MoneyInput aria-label="Số tiền ứng" className={amount > 0 ? unsure('amount') : UNSURE} value={amount} onChange={setAmount} /></Field>
          {!isSup ? (
            <div className="grid gap-1 text-xs font-medium text-muted"><span>Loại phiếu</span>
              <div><Segmented value={payKind} onChange={setPayKind} options={[{ value: 'advance', label: 'Tạm ứng' }, { value: 'progress', label: 'Thanh toán đợt' }]} /></div>
            </div>
          ) : null}
          <div className="grid gap-1 text-xs font-medium text-muted"><span>Hình thức</span>
            <div className={method ? undefined : 'w-fit rounded-lg ring-2 ring-warn'}><Segmented value={method || ('' as 'transfer')} onChange={setMethod} options={METHOD_OPTS} /></div>
          </div>
          <Field label="Nội dung" className="sm:col-span-2"><Input aria-label="Nội dung phiếu chi" value={note} onChange={(e) => setNote(e.target.value)} placeholder={isSup ? 'Trả tiền sắt thép' : 'Ứng tiền điện nước'} /></Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onRetake}><Icon name="close" />Bỏ</Button>
          <Button variant="primary" data-testid="advance-save" disabled={busy} onClick={() => void save()}><Icon name="save" />{busy ? 'Đang lưu…' : 'Lưu phiếu chi'}</Button>
        </div>
      </div>
    </Card>
  );
}
