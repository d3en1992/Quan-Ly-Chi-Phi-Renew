// Nút AI → HỢP ĐỒNG THẦU PHỤ (ảnh / PDF / Excel hợp đồng, báo giá giao khoán, hoặc lời nói): điền sẵn thầu phụ, công trình, giá trị, hạng mục.
// Thầu phụ chưa có trong danh mục → tích "Thêm thầu phụ mới". Tệp lưu kèm hợp đồng. Anh kiểm tra rồi mới lưu.
import { useState } from 'react';
import type { SubcontractScan } from '@shared/scan';
import { useAccess } from '@/app/auth';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { Checkbox, Field, Input, MoneyInput } from '@/components/ui/input';
import { Card, ErrorState, LoadingState, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { contractItemsTotal, subcontractTotal, type ContractItem } from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { removeDoc, uploadDoc, type Doc } from '@/features/attachments/api';
import { ScanDocPreview } from '@/features/attachments/Attachments';
import { findByName } from '@/features/expenses/logic';
import { today } from '@/features/expenses/shared';
import { useCreateParty, usePayData, useSaveSubcontract } from '@/features/payments/api';
import { ItemsEditor } from '@/features/payments/shared';
import { DataDuplicateNotice } from './DuplicateNotice';
import { UNSURE, type Remember } from './shared';

type Props = { scan: SubcontractScan; doc: Doc | null; remember: Remember; onDone: () => void; onRetake: () => void };

export function ScanSubcontract({ scan, doc, remember, onDone, onRetake }: Props) {
  const access = useAccess();
  const toast = useToast();
  const data = usePayData();
  const save = useSaveSubcontract();
  const createParty = useCreateParty();
  const [name, setName] = useState(scan.subcontractor_match || scan.subcontractor_text);
  const [addNew, setAddNew] = useState(true);
  const [project, setProject] = useState(scan.project_match);
  const [date, setDate] = useState(scan.date || today());
  const [items, setItems] = useState<ContractItem[]>(() => scan.items.map((i) => ({ name: i.name, donVi: i.unit, sl: i.quantity, donGia: i.unit_price })));
  const [value, setValue] = useState(() => scan.value || contractItemsTotal(items));
  const [description, setDescription] = useState(scan.description);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);

  if (data.isPending) return <Card><LoadingState label="Đang tải danh sách thầu phụ…" /></Card>;
  if (data.isError) return <Card><ErrorState error={data.error} onRetry={() => void data.refetch()} /></Card>;
  const d = data.data;
  const people = d.subcontractors.filter((s) => !s.archived);
  const found = findByName(name, people);
  const isNew = !!name.trim() && !found;
  const proj = findByName(project, d.projectOptions);
  const unsure = (k: string) => (scan.low_confidence.includes(k) ? UNSURE : undefined);
  const itemsTotal = contractItemsTotal(items);

  const submit = async () => {
    if (!name.trim()) { toast('Chọn thầu phụ.', 'error'); return; }
    if (isNew && !addNew) { toast('Thầu phụ chưa có trong danh mục — tích "Thêm thầu phụ mới" hoặc chọn tên có sẵn.', 'error'); return; }
    if (!proj) { toast('Chọn công trình.', 'error'); return; }
    if (value <= 0) { toast('Nhập giá trị hợp đồng.', 'error'); return; }
    setBusy(true);
    let path = '';
    try {
      let subId = found?.id;
      if (!subId) {
        const created = await createParty.mutateAsync({ table: 'subcontractors', name });
        subId = (await data.refetch()).data?.subcontractors.find((s) => s.name === created)?.id;
        if (!subId) throw new Error('Đã thêm thầu phụ nhưng chưa tải lại được — thử lưu lại.');
        toast(`Đã thêm thầu phụ “${created}”`);
      }
      if (doc && keep) path = await uploadDoc('documents', access.profile.company_id, doc);
      const id = await save.mutateAsync({ id: null, date, subcontractorId: subId, projectId: proj.id, value, variation: 0, description, items, attachmentPaths: path ? [path] : [] });
      remember('subcontracts', id);
      toast(`Đã lưu hợp đồng thầu phụ ${formatMoney(value)} · ${found?.name ?? name.trim().toUpperCase()} · ${proj.name}`);
      onDone();
    } catch (e) {
      if (path) await removeDoc('documents', path);
      toast(`Chưa lưu được: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <Icon name="handshake" className="text-accent" />
        <h3 className="m-0 text-sm font-bold">Hợp đồng thầu phụ — AI đọc xong</h3>
        {scan.low_confidence.length ? <Pill tone="warn">{scan.low_confidence.length} ô cần xem lại</Pill> : null}
      </header>
      <div className="grid gap-3 p-4" data-testid="scan-subcontract">
        <ScanDocPreview doc={doc} keep={keep} setKeep={setKeep} label="Lưu ảnh / tệp kèm hợp đồng thầu phụ" />
        <DataDuplicateNotice what="Hợp đồng" incoming={{ date, projectId: proj?.id ?? null, partyId: found?.id ?? null, amount: value, text: description }}
          saved={d.subcontracts.map((h) => ({ id: h.id, date: h.date, projectId: h.project_id, partyId: h.subcontractor_id, amount: subcontractTotal(h), text: h.description ?? '' }))}
          describe={(r) => [d.subcontractorName(r.partyId), d.projectName(r.projectId)].join(' · ')} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Thầu phụ *" className="sm:col-span-2">
            <Combo aria-label="Thầu phụ" value={name} onChange={setName} items={people} groupLabel="Thầu phụ" free className={found ? unsure('subcontractor_match') : UNSURE} />
          </Field>
          {isNew ? (
            <div className="rounded-lg border border-accent/40 bg-accent-soft/50 p-2.5 sm:col-span-2">
              <Checkbox checked={addNew} onChange={setAddNew} label={<>Thêm thầu phụ mới <b>{name.trim().toUpperCase()}</b> vào danh mục</>} />
            </div>
          ) : null}
          <Field label="Công trình *" className="sm:col-span-2">
            <Combo aria-label="Công trình" value={project} onChange={setProject} items={d.projectOptions} groupLabel="Công trình" className={proj ? unsure('project_match') : UNSURE} />
          </Field>
          <Field label="Ngày"><Input type="date" aria-label="Ngày hợp đồng" className={scan.date ? unsure('date') : UNSURE} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Giá trị hợp đồng (đ) *"><MoneyInput aria-label="Giá trị hợp đồng" className={value > 0 ? unsure('value') : UNSURE} value={value} onChange={setValue} /></Field>
          <Field label="Nội dung" className="sm:col-span-2"><Input aria-label="Nội dung hợp đồng" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Nhân công sơn nước…" /></Field>
          <div className="min-w-0 sm:col-span-2">
            <ItemsEditor items={items} onChange={setItems} />
            {items.length && itemsTotal !== value ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-warn">
                Tổng hạng mục {formatMoney(itemsTotal)} khác giá trị hợp đồng.<Button size="sm" onClick={() => setValue(itemsTotal)}>Lấy tổng hạng mục</Button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onRetake}><Icon name="close" />Bỏ</Button>
          <Button variant="primary" data-testid="subcontract-save" disabled={busy} onClick={() => void submit()}><Icon name="save" />{busy ? 'Đang lưu…' : 'Lưu hợp đồng thầu phụ'}</Button>
        </div>
      </div>
    </Card>
  );
}
