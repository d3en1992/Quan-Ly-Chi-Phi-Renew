// Bước 3–4 của Chụp hóa đơn (PAGES.nhap ocrPage / MP.chup): form Hóa đơn chi tiết điền sẵn từ AI.
// Ô AI không chắc tô vàng · tự so tổng dòng với số tổng in trên hóa đơn · NCC mới → "Thêm nhà cung cấp mới" (tích sẵn) ·
// NCC có rồi mà thiếu địa chỉ / SĐT → hỏi bổ sung · nhãn "khác khu vực" · Đã TT · source = scan, gắn ảnh. KHÔNG tự lưu.
import { useMemo, useState } from 'react';
import type { InvoiceScan } from '@shared/scan';
import { useAccess } from '@/app/auth';
import { Button, Icon } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/input';
import { Card, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCreateExpenses, useEntryExpenses, useLineHistory } from '@/features/expenses/api';
import { InvoiceFields, useLineSuggestions } from '@/features/expenses/InvoiceForm';
import { blankLine, checkInvoice, invoiceDescription, invoiceTotal, type InvoiceDraft, type InvoiceField } from '@/features/expenses/invoice-model';
import { findDuplicates, historySuggest, type DupHit } from '@/features/expenses/logic';
import type { ExpenseInput } from '@/features/expenses/schema';
import { DuplicateDialog, toDupCandidate, today, type Lists } from '@/features/expenses/shared';
import { removeReceipt, uploadReceipt, useSupplierChange, type PreparedImage } from './api';
import { useObjectUrl } from './CaptureForm';
import { checkPrintedTotal, invoiceFromScan, supplierPlan } from './model';

type Props = { scan: InvoiceScan; image: PreparedImage | null; lists: Lists; compact?: boolean; onDone: () => void; onRetake: () => void };

export function ScanInvoice({ scan, image, lists, compact = false, onDone, onRetake }: Props) {
  const toast = useToast();
  const access = useAccess();
  const create = useCreateExpenses();
  const supplierChange = useSupplierChange();
  const expenses = useEntryExpenses();
  const lineHistory = useLineHistory(true);
  const suggestions = useLineSuggestions(lineHistory.data, lists);
  const descriptions = useMemo(() => historySuggest((expenses.data ?? []).map((e) => ({ text: e.description, date: e.date }))).map((n) => ({ id: n, name: n })), [expenses.data]);
  const init = useMemo(() => invoiceFromScan(scan, { ...lists, projects: lists.projectOptions }, today()), [scan]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<InvoiceDraft>(init.draft);
  // Chuyển hóa đơn nhanh ↔ chi tiết: giữ lại các dòng vật tư để chuyển ngược không mất
  const [keptLines, setKeptLines] = useState<InvoiceDraft['lines']>(null);
  const toQuick = () => {
    setKeptLines(draft.lines);
    setDraft((d) => ({ ...d, amount: invoiceTotal(d), description: invoiceDescription(d), lines: null }));
  };
  const toDetail = () => setDraft((d) => ({ ...d, lines: keptLines?.length ? keptLines : [blankLine()] }));
  const [bad, setBad] = useState<InvoiceField[]>([]);
  const [dups, setDups] = useState<{ hits: DupHit[]; input: ExpenseInput } | null>(null);
  const [keepImage, setKeepImage] = useState(true);
  const [saving, setSaving] = useState(false);
  const photo = useObjectUrl(image?.blob ?? null);

  // NCC: mới / có sẵn thiếu thông tin — người dùng sửa được Tên / Địa chỉ / SĐT trước khi lưu
  const plan = supplierPlan(draft.supplier, scan, lists.suppliers);
  const [addNew, setAddNew] = useState(true);
  const [newInfo, setNewInfo] = useState({ address: scan.supplier_address, phone: (scan.supplier_phones?.length ? scan.supplier_phones : [scan.supplier_phone]).filter(Boolean).join(' - ') });
  const [fillMissing, setFillMissing] = useState(true);
  const [savingSupplier, setSavingSupplier] = useState(false);
  /** Lưu NCC mới / bổ sung thông tin NCC ngay (không cần lưu hóa đơn) */
  const saveSupplierNow = async () => {
    if (savingSupplier) return;
    setSavingSupplier(true);
    try {
      if (plan.kind === 'new') {
        const s = await supplierChange.mutateAsync({ kind: 'new', name: plan.name, address: newInfo.address, phone: newInfo.phone });
        setDraft((d) => ({ ...d, supplier: s.name }));
        toast(`Đã lưu nhà cung cấp “${s.name}”`);
      } else if (plan.kind === 'existing') {
        await supplierChange.mutateAsync({ kind: 'patch', id: plan.id, address: plan.missingAddress, phone: plan.missingPhone });
        setFillMissing(false);
        toast(`Đã bổ sung thông tin cho “${plan.name}”`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSavingSupplier(false);
    }
  };
  const total = checkPrintedTotal(draft, init.printedTotal);
  const unsureCount = init.unsureHead.length + init.unsureCells.length;

  const doSave = async (input: ExpenseInput) => {
    setSaving(true);
    let path: string | null = null;
    try {
      if (image && keepImage) path = await uploadReceipt(access.profile.company_id, image.blob, input.date);
      await create.mutateAsync([{ ...input, receiptImagePath: path }]);
      toast(`Đã lưu hóa đơn ${input.lines?.length ?? 0} dòng · ${formatMoney(input.amount)} đ${path ? ' · kèm ảnh' : ''}`);
      setDups(null);
      onDone();
    } catch (e) {
      if (path) await removeReceipt(path).catch(() => undefined);
      setDups(null);
      toast(`Chưa lưu được: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (saving) return;
    let suppliers = lists.suppliers;
    // 1) NCC mới / bổ sung thông tin NCC — làm trước để hóa đơn gắn được NCC
    try {
      if (plan.kind === 'new' && addNew) {
        const s = await supplierChange.mutateAsync({ kind: 'new', name: plan.name, address: newInfo.address, phone: newInfo.phone });
        suppliers = [...suppliers, s];
        setDraft((d) => ({ ...d, supplier: s.name }));
        toast(`Đã thêm nhà cung cấp “${s.name}”`);
      } else if (plan.kind === 'existing' && fillMissing && (plan.missingAddress || plan.missingPhone)) {
        await supplierChange.mutateAsync({ kind: 'patch', id: plan.id, address: plan.missingAddress, phone: plan.missingPhone });
        toast(`Đã bổ sung thông tin cho “${plan.name}”`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      return;
    }
    const d = plan.kind === 'new' && addNew ? { ...draft, supplier: plan.name } : draft;
    const check = checkInvoice(d, { ...lists, projects: lists.projectOptions, suppliers }, 'scan');
    if (!check.ok) {
      setBad(check.bad);
      toast(plan.kind === 'new' && !addNew && check.bad.includes('supplier') ? 'Nhà cung cấp chưa có trong danh mục — tích "Thêm nhà cung cấp mới" hoặc chọn NCC có sẵn.' : check.message, 'error');
      return;
    }
    setBad([]);
    const i = check.input;
    const hits = findDuplicates(
      [{ id: null, date: i.date, projectId: i.projectId, typeId: i.typeId, buyerId: i.buyerId, supplierId: i.supplierId, amount: i.amount, description: i.description }],
      (expenses.data ?? []).map(toDupCandidate),
    );
    if (hits.length) { setDups({ hits, input: i }); return; }
    await doSave(i);
  };

  return (
    <div className={cn('grid gap-3', !compact && 'lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start')} data-testid="scan-invoice">
      <Card className="grid gap-2.5 p-3">
        {photo ? <img src={photo} alt="Ảnh hóa đơn" className="max-h-[420px] w-full rounded-lg object-contain" /> : <div className="grid h-40 place-items-center rounded-lg bg-surface-2 text-muted">Không có ảnh</div>}
        <Checkbox checked={keepImage && !!image} disabled={!image} onChange={setKeepImage} label="Lưu ảnh kèm hóa đơn (để đối chiếu sau)" />
        <Button onClick={onRetake} className="justify-center"><Icon name="photo_camera" />Chụp lại / ảnh khác</Button>
      </Card>

      <Card>
        <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
          <h3 className="m-0 text-sm font-bold">Kết quả AI đọc</h3>
          {unsureCount ? <Pill tone="warn"><Icon name="warning" className="text-[14px]" />{unsureCount} ô cần xem lại</Pill> : <Pill tone="good">AI đọc rõ</Pill>}
          <div className="flex-1" />
          <small className="text-muted">Ô tô vàng = AI không chắc</small>
        </header>
        <div className="grid gap-3 p-4">
          {scan.is_summary ? (
            <div className="flex gap-2 rounded-lg border border-warn/50 bg-warn-soft p-3 text-[13px]" data-testid="summary-warning">
              <Icon name="warning" className="text-warn" />
              <span>Đây có thể là <b>SỔ CỘNG TIỀN</b> (bảng tổng hợp nhiều hóa đơn), không phải hóa đơn lẻ. AI vẫn ghi từng dòng ngày + số tiền ở dưới.
                Nếu các hóa đơn lẻ đã nhập rồi thì <b>đừng lưu</b> để khỏi tính chi phí 2 lần — anh xem ảnh rồi quyết định.</span>
            </div>
          ) : null}
          {plan.kind === 'new' ? (
            <div className="grid gap-2 rounded-lg border border-accent/40 bg-accent-soft/50 p-3" data-testid="new-supplier">
              <div className="flex flex-wrap items-center gap-2.5">
                <Checkbox checked={addNew} onChange={setAddNew} label="Thêm nhà cung cấp mới vào danh mục" />
                <span className="text-[12px] text-muted">AI không thấy tên này trong {lists.suppliers.length} nhà cung cấp hiện có</span>
              </div>
              {addNew ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Tên (AI đọc từ chữ in trên hóa đơn)" className="sm:col-span-2"><Input aria-label="Tên NCC mới" value={draft.supplier} onChange={(e) => setDraft((d) => ({ ...d, supplier: e.target.value }))} /></Field>
                  <Field label="Địa chỉ"><Input aria-label="Địa chỉ NCC mới" value={newInfo.address} onChange={(e) => setNewInfo((x) => ({ ...x, address: e.target.value }))} /></Field>
                  <Field label="Số điện thoại (tối đa 2 số)"><Input aria-label="SĐT NCC mới" className={scan.low_confidence.includes('supplier_phone') ? '!border-warn !bg-warn-soft' : undefined} value={newInfo.phone} onChange={(e) => setNewInfo((x) => ({ ...x, phone: e.target.value }))} /></Field>
                  <div className="sm:col-span-2 flex justify-end">
                    <Button size="sm" data-testid="supplier-save-now" disabled={savingSupplier} onClick={() => void saveSupplierNow()}><Icon name="add_business" />{savingSupplier ? 'Đang lưu…' : 'Lưu nhà cung cấp ngay'}</Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : plan.kind === 'existing' && (plan.missingAddress || plan.missingPhone) ? (
            <div className="grid gap-1.5 rounded-lg border border-line bg-surface-2 p-3 text-[12.5px]" data-testid="fill-supplier">
              <Checkbox checked={fillMissing} onChange={setFillMissing} label={<>Bổ sung cho <b>{plan.name}</b> (danh mục đang thiếu)</>} />
              {plan.missingAddress ? <span className="text-muted"><Icon name="location_on" className="text-[15px]" /> {plan.missingAddress}</span> : null}
              {plan.missingPhone ? <span className="text-muted"><Icon name="call" className="text-[15px]" /> {plan.missingPhone}</span> : null}
              {fillMissing ? <div><Button size="sm" disabled={savingSupplier} onClick={() => void saveSupplierNow()}><Icon name="save" />Bổ sung ngay</Button></div> : null}
            </div>
          ) : null}

          <InvoiceFields draft={draft} setDraft={setDraft} lists={lists} suggestions={suggestions} descriptions={descriptions} bad={bad} compact={compact} unsureHead={init.unsureHead} unsureCells={init.unsureCells}
            hideCopyPaste lineActions={<Button data-testid="to-quick" onClick={toQuick}><Icon name="bolt" />Chuyển thành hóa đơn nhanh</Button>} />
          {draft.lines ? null : (
            <div><Button data-testid="to-detail" onClick={toDetail}><Icon name="list" />Chuyển lại hóa đơn chi tiết</Button></div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-[13px]" data-testid="printed-total">
            {total.status === 'none' ? <span className="text-muted">Không thấy số tổng in trên hóa đơn để so.</span>
              : total.status === 'match' ? <><Icon name="check_circle" className="text-good" />Tổng các dòng <b>khớp</b> số tổng in trên hóa đơn <Pill tone="good">{formatMoney(total.printed)}</Pill></>
              : <><Icon name="error" className="text-warn" />Tổng các dòng <b>lệch</b> số in trên hóa đơn ({formatMoney(total.printed)}): <Pill tone="warn">{total.gap > 0 ? 'thiếu' : 'thừa'} {formatMoney(Math.abs(total.gap))}</Pill> — xem lại dòng tô vàng.</>}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={onRetake}><Icon name="close" />Bỏ</Button>
            <Button variant="primary" data-testid="scan-save" disabled={saving} onClick={() => void save()}><Icon name="save" />{saving ? 'Đang lưu…' : 'Lưu vào chi phí'}</Button>
          </div>
        </div>
      </Card>
      <DuplicateDialog hits={dups?.hits ?? null} lists={lists} busy={saving} onCancel={() => setDups(null)} onConfirm={() => { if (dups) void doSave(dups.input); }} />
    </div>
  );
}
