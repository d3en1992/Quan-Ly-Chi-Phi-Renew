// Chụp hợp đồng (KẾ HOẠCH 4G): AI đọc chủ đầu tư, địa chỉ, SĐT, giá trị → gợi ý Khách hàng + Hợp đồng chính. Anh duyệt rồi mới lưu.
import { useMemo, useState } from 'react';
import type { ContractScan } from '@shared/scan';
import { useAccess } from '@/app/auth';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { Field, Input, MoneyInput } from '@/components/ui/input';
import { Card, ErrorState, LoadingState, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useContacts, useSaveContact } from '@/features/contacts/api';
import { findByName } from '@/features/expenses/logic';
import { today, type Lists } from '@/features/expenses/shared';
import { useSaveContract } from '@/features/revenue/api';
import { contractCustomer } from './model';

type Props = { scan: ContractScan; lists: Lists; onDone: () => void; onRetake: () => void };

export function ScanContract({ scan, lists, onDone, onRetake }: Props) {
  const toast = useToast();
  const access = useAccess();
  const canSeeIds = access.special.see_contact_ids;
  const contacts = useContacts(canSeeIds);
  const saveContact = useSaveContact();
  const saveContract = useSaveContract();
  const [c, setC] = useState<ContractScan>(scan);
  const [project, setProject] = useState(() => findByName(scan.project_match, lists.projectOptions)?.name ?? '');
  const existing = useMemo(() => (contacts.data ? contractCustomer(c, contacts.data.customers) : undefined), [contacts.data, c]);
  const [busy, setBusy] = useState(false);
  const bad = (k: string) => (c.low_confidence.includes(k) ? '!border-warn !bg-warn-soft' : undefined);

  if (contacts.isPending) return <Card><LoadingState label="Đang tải danh bạ…" /></Card>;
  if (contacts.isError) return <Card><ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} /></Card>;

  const doSave = async () => {
    const p = findByName(project, lists.projectOptions);
    if (!p) { toast('Chọn công trình cho hợp đồng.', 'error'); return; }
    if (c.value <= 0) { toast('Nhập giá trị hợp đồng.', 'error'); return; }
    if (!existing && !c.customer_name.trim()) { toast('Nhập tên gọi khách hàng.', 'error'); return; }
    setBusy(true);
    try {
      let name = existing?.name ?? c.customer_name.trim();
      if (!existing) {
        await saveContact.mutateAsync({
          kind: 'customer', id: null,
          fields: { name, full_name: c.customer_full_name.trim() || null, address: c.customer_address.trim() || null },
          priv: canSeeIds && c.customer_phone.trim() ? { phone: c.customer_phone.trim() } : null,
        });
        toast(`Đã thêm khách hàng “${name}”`);
      } else name = existing.name;
      await saveContract.mutateAsync({
        id: null, projectId: p.id, date: c.date || today(), value: c.value, extra: 0, variation: 0,
        description: c.description, customerName: c.customer_full_name || name, items: [],
      });
      toast(`Đã lưu hợp đồng chính cho ${p.name}`);
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
        <h3 className="m-0 text-sm font-bold">Hợp đồng — AI đọc xong</h3>
        {c.low_confidence.length ? <Pill tone="warn">{c.low_confidence.length} ô cần xem lại</Pill> : null}
      </header>
      <div className="grid gap-3 p-4" data-testid="scan-contract">
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px]">
          {existing ? <>Khách hàng đã có: <b>{existing.name}</b>{existing.full_name ? ` · ${existing.full_name}` : ''} <Pill tone="good">sẽ gắn vào</Pill></>
            : <>Chưa có trong danh bạ — lưu sẽ <b>thêm khách hàng mới</b>.</>}
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Tên gọi khách hàng"><Input aria-label="Tên gọi khách hàng" value={c.customer_name} onChange={(e) => setC({ ...c, customer_name: e.target.value })} /></Field>
          <Field label="Họ tên đầy đủ"><Input aria-label="Họ tên đầy đủ" value={c.customer_full_name} onChange={(e) => setC({ ...c, customer_full_name: e.target.value })} /></Field>
          <Field label="Địa chỉ" className="sm:col-span-2"><Input aria-label="Địa chỉ" className={bad('customer_address')} value={c.customer_address} onChange={(e) => setC({ ...c, customer_address: e.target.value })} /></Field>
          {canSeeIds ? <Field label="Số điện thoại"><Input aria-label="Số điện thoại" className={bad('customer_phone')} value={c.customer_phone} onChange={(e) => setC({ ...c, customer_phone: e.target.value })} /></Field> : null}
          <Field label="Ngày ký"><Input type="date" aria-label="Ngày ký" className={bad('date')} value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} /></Field>
          <Field label="Công trình *" className="sm:col-span-2"><Combo aria-label="Công trình" value={project} onChange={setProject} items={lists.projectOptions} groupLabel="Công trình" className={project ? undefined : '!border-warn !bg-warn-soft'} /></Field>
          <Field label="Giá trị hợp đồng (đ) *"><MoneyInput aria-label="Giá trị hợp đồng" className={bad('value')} value={c.value} onChange={(v) => setC({ ...c, value: v })} /></Field>
          <Field label="Nội dung" className="sm:col-span-2"><Input aria-label="Nội dung hợp đồng" value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onRetake}><Icon name="close" />Bỏ</Button>
          <Button variant="primary" data-testid="contract-save" disabled={busy} onClick={() => void doSave()}><Icon name="save" />{busy ? 'Đang lưu…' : 'Lưu khách hàng + hợp đồng'}</Button>
        </div>
      </div>
    </Card>
  );
}
