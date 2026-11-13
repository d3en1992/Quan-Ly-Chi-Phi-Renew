// Form thêm / sửa 1 người trong Danh Bạ (bảng trượt). Trường riêng tư (SĐT, CCCD, tài khoản) chỉ hiện khi có quyền "Xem SĐT, số CCCD".
import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { Button, Icon } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useSaveContact, type ContactKind, type ContactsData, type PrivateFields } from './api';

export const KIND_TITLE: Record<ContactKind, string> = { customer: 'khách hàng', worker: 'công nhân', employee: 'nhân viên', supplier: 'nhà cung cấp', subcontractor: 'thầu phụ' };

type Props = { open: boolean; onClose: () => void; kind: ContactKind; id: string | null; data: ContactsData; canSeeIds: boolean };
type Form = Record<string, string | boolean>;

const PRIV_KEYS = ['phone', 'id_number', 'date_of_birth', 'hometown', 'permanent_address', 'bank_name', 'bank_account', 'bank_holder'] as const;
const PRIV_BY_KIND: Record<ContactKind, readonly (typeof PRIV_KEYS)[number][]> = {
  customer: ['phone', 'id_number'], worker: PRIV_KEYS, employee: ['phone', 'id_number', 'date_of_birth', 'bank_name', 'bank_account', 'bank_holder'], supplier: [], subcontractor: ['phone'],
};
const PRIV_LABEL: Record<(typeof PRIV_KEYS)[number], string> = {
  phone: 'Số điện thoại', id_number: 'Số CCCD', date_of_birth: 'Ngày sinh', hometown: 'Quê quán', permanent_address: 'Nơi thường trú',
  bank_name: 'Ngân hàng', bank_account: 'Số tài khoản nhận lương', bank_holder: 'Chủ tài khoản',
};

function initial(kind: ContactKind, id: string | null, data: ContactsData): Form {
  const priv = (id && data.priv.get(id)) || ({} as Partial<PrivateFields>);
  const p = Object.fromEntries(PRIV_KEYS.map((k) => [k, (priv as Record<string, string | null>)[k] ?? '']));
  if (kind === 'customer') { const r = data.customers.find((x) => x.id === id); return { name: r?.name ?? '', full_name: r?.full_name ?? '', address: r?.address ?? '', email: r?.email ?? '', tax_code: r?.tax_code ?? '', note: r?.note ?? '', ...p }; }
  if (kind === 'worker') { const r = data.workers.find((x) => x.id === id); return { name: r?.name ?? '', role: r?.role ?? 'T', full_name: r?.full_name ?? '', note: r?.note ?? '', ...p }; }
  if (kind === 'employee') { const r = data.employees.find((x) => x.id === id); return { full_name: r?.full_name ?? '', title: r?.title ?? '', started_on: r?.started_on ?? '', note: r?.note ?? '', ...p }; }
  if (kind === 'supplier') { const r = data.suppliers.find((x) => x.id === id); return { name: r?.name ?? '', address: r?.address ?? '', phone: r?.phone ?? '', buys_on_credit: r?.buys_on_credit ?? false, note: r?.note ?? '' }; }
  const r = data.subcontractors.find((x) => x.id === id);
  return { name: r?.name ?? '', field: r?.field ?? '', contact_person: r?.contact_person ?? '', note: r?.note ?? '', ...p };
}

export function ContactForm({ open, onClose, kind, id, data, canSeeIds }: Props) {
  const toast = useToast();
  const save = useSaveContact();
  const [f, setF] = useState<Form>({});
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setF(initial(kind, id, data)); setError(''); } }, [open, kind, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: string, label: string, props: { type?: string; placeholder?: string } = {}) => (
    <Field label={label} key={k}><Input aria-label={label} type={props.type} placeholder={props.placeholder} value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value)} /></Field>
  );

  const submit = async () => {
    setError('');
    const s = (k: string) => String(f[k] ?? '').trim();
    const nameField = kind === 'employee' ? 'full_name' : 'name';
    if (!s(nameField)) return setError(kind === 'employee' ? 'Vui lòng nhập họ tên.' : 'Vui lòng nhập tên.');
    let fields: Record<string, unknown>;
    if (kind === 'customer') fields = { name: s('name'), full_name: s('full_name') || null, address: s('address') || null, email: s('email') || null, tax_code: s('tax_code') || null, note: s('note') || null };
    else if (kind === 'worker') fields = { name: s('name'), role: s('role') || null, full_name: s('full_name') || null, note: s('note') || null };
    else if (kind === 'employee') fields = { full_name: s('full_name'), title: s('title') || null, started_on: s('started_on') || null, note: s('note') || null };
    else if (kind === 'supplier') fields = { name: s('name'), address: s('address') || null, phone: s('phone') || null, buys_on_credit: !!f.buys_on_credit, note: s('note') || null };
    else fields = { name: s('name'), field: s('field') || null, contact_person: s('contact_person') || null, note: s('note') || null };
    const priv = canSeeIds && PRIV_BY_KIND[kind].length ? Object.fromEntries(PRIV_BY_KIND[kind].map((k) => [k, s(k)])) : null;
    try {
      await save.mutateAsync({ kind, id, fields, priv });
      toast(id ? 'Đã cập nhật' : `Đã thêm ${KIND_TITLE[kind]}`);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={`${id ? 'Sửa' : 'Thêm'} ${KIND_TITLE[kind]}`}
      footer={<><Button variant="primary" className="flex-1" disabled={save.isPending} onClick={() => void submit()}><Icon name="save" />Lưu</Button><Button onClick={onClose}>Hủy</Button></>}>
      {kind === 'customer' ? <>{text('name', 'Tên gọi *', { placeholder: 'VD: A Huynh' })}{text('full_name', 'Họ tên đầy đủ')}{text('address', 'Địa chỉ')}{text('email', 'Email')}{text('tax_code', 'Mã số thuế')}</> : null}
      {kind === 'worker' ? (
        <>
          {text('name', 'Tên gọi (trong sổ chấm công) *', { placeholder: 'VD: HIỀN' })}
          <Field label="Loại (Cai / Thợ / Phụ)">
            <Select aria-label="Loại công nhân" value={String(f.role ?? 'T')} onChange={(e) => set('role', e.target.value)}>
              <option value="C">Cai (C)</option><option value="T">Thợ (T)</option><option value="P">Phụ (P)</option>
            </Select>
          </Field>
          {text('full_name', 'Họ tên theo CCCD')}
        </>
      ) : null}
      {kind === 'employee' ? <>{text('full_name', 'Họ tên *')}{text('title', 'Chức danh')}{text('started_on', 'Ngày vào làm', { type: 'date' })}</> : null}
      {kind === 'supplier' ? (
        <>
          {text('name', 'Tên nhà cung cấp *')}{text('address', 'Địa chỉ')}{text('phone', 'Số điện thoại cửa hàng')}
          <Checkbox checked={!!f.buys_on_credit} onChange={(v) => set('buys_on_credit', v)} label="Mua nợ (hóa đơn mới tự bỏ tích Đã TT)" />
        </>
      ) : null}
      {kind === 'subcontractor' ? <>{text('name', 'Tên thầu phụ *')}{text('field', 'Lĩnh vực')}{text('contact_person', 'Người liên hệ')}</> : null}
      {canSeeIds ? PRIV_BY_KIND[kind].map((k) => text(k, PRIV_LABEL[k], k === 'date_of_birth' ? { type: 'date' } : {})) : PRIV_BY_KIND[kind].length ? <div className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-muted">SĐT, CCCD, tài khoản nhận lương chỉ hiện và sửa được với tài khoản có quyền "Xem SĐT, số CCCD".</div> : null}
      {text('note', 'Ghi chú')}
      {error ? <div role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</div> : null}
    </Sheet>
  );
}
