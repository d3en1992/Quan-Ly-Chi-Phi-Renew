// Nút AI → HỢP ĐỒNG / DỰ TOÁN (KẾ HOẠCH 4G): AI đọc chủ đầu tư, địa chỉ, SĐT, giá trị, diện tích từng phần (Móng, Trệt, Lầu…)
// → gợi ý Khách hàng mới + Hợp đồng chính + bảng khối lượng sàn của công trình (Tỉ Trọng & Định Mức). Anh duyệt rồi mới lưu.
import { useMemo, useState } from 'react';
import type { ContractScan, FloorAreaScan } from '@shared/scan';
import { useAccess } from '@/app/auth';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { Checkbox, Field, Input, MoneyInput } from '@/components/ui/input';
import { Card, ErrorState, LoadingState, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { hasLevel } from '@/lib/permissions';
import { useSaveFloorAreas } from '@/features/cost-allocation/api';
import { useContacts, useSaveContact } from '@/features/contacts/api';
import { findByName } from '@/features/expenses/logic';
import { today, type Lists } from '@/features/expenses/shared';
import { useSaveContract } from '@/features/revenue/api';
import { contractCustomer } from './model';
import { UNSURE } from './shared';

type Props = { scan: ContractScan; lists: Lists; onDone: () => void; onRetake: () => void };

const areaText = (n: number) => (n ? String(n).replace('.', ',') : '');
const cell = 'h-[34px] w-full min-w-0 border-0 bg-transparent px-2 text-[13px] text-fg focus:outline-2 focus:outline-accent';

export function ScanContract({ scan, lists, onDone, onRetake }: Props) {
  const toast = useToast();
  const access = useAccess();
  const canSeeIds = access.special.see_contact_ids;
  const canEditProject = hasLevel(access.permissions, 'projects', 'add');
  const contacts = useContacts(canSeeIds);
  const saveContact = useSaveContact();
  const saveContract = useSaveContract();
  const saveAreas = useSaveFloorAreas();
  const [c, setC] = useState<ContractScan>(scan);
  const [project, setProject] = useState(() => findByName(scan.project_match, lists.projectOptions)?.name ?? '');
  const [areas, setAreas] = useState<FloorAreaScan[]>(scan.floor_areas);
  const [withContract, setWithContract] = useState(true);
  const [withAreas, setWithAreas] = useState(scan.floor_areas.length > 0 && canEditProject);
  const [addCustomer, setAddCustomer] = useState(true);
  const existing = useMemo(() => (contacts.data ? contractCustomer(c, contacts.data.customers) : undefined), [contacts.data, c]);
  const [busy, setBusy] = useState(false);
  const bad = (k: string) => (c.low_confidence.includes(k) ? UNSURE : undefined);
  const totalArea = Math.round(areas.reduce((s, a) => s + (a.area || 0), 0) * 100) / 100;

  if (contacts.isPending) return <Card><LoadingState label="Đang tải danh bạ…" /></Card>;
  if (contacts.isError) return <Card><ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} /></Card>;

  const doSave = async () => {
    const p = findByName(project, lists.projectOptions);
    if (!p) { toast('Chọn công trình (công trình mới thì tạo ở tab Công Trình trước).', 'error'); return; }
    if (withContract && c.value <= 0) { toast('Nhập giá trị hợp đồng.', 'error'); return; }
    if (withContract && !existing && addCustomer && !c.customer_name.trim()) { toast('Nhập tên gọi khách hàng.', 'error'); return; }
    if (!withContract && !withAreas && !(addCustomer && !existing)) { toast('Chưa chọn lưu gì.', 'error'); return; }
    setBusy(true);
    try {
      let name = existing?.name ?? c.customer_name.trim();
      if (!existing && addCustomer && name) {
        await saveContact.mutateAsync({
          kind: 'customer', id: null,
          fields: { name, full_name: c.customer_full_name.trim() || null, address: c.customer_address.trim() || null },
          priv: canSeeIds && c.customer_phone.trim() ? { phone: c.customer_phone.trim() } : null,
        });
        toast(`Đã thêm khách hàng “${name}”`);
      } else if (existing) name = existing.name;
      if (withContract) {
        await saveContract.mutateAsync({
          id: null, projectId: p.id, date: c.date || today(), value: c.value, extra: 0, variation: 0,
          description: c.description, customerName: c.customer_full_name || name, items: [],
        });
        toast(`Đã lưu hợp đồng chính cho ${p.name}`);
      }
      if (withAreas) {
        const rows = areas.filter((a) => a.name.trim() && a.area > 0).map((a) => ({ ten: a.name.trim(), dvt: 'm2', kl: a.area, heSo: 1, tinh: true }));
        await saveAreas.mutateAsync({ projectId: p.id, rows });
        toast(`Đã lưu ${rows.length} dòng diện tích sàn (${areaText(totalArea)} m²) cho ${p.name}`);
      }
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
        <Icon name="description" className="text-accent" />
        <h3 className="m-0 text-sm font-bold">{c.is_estimate ? 'Dự toán' : 'Hợp đồng'} — AI đọc xong</h3>
        {c.low_confidence.length ? <Pill tone="warn">{c.low_confidence.length} ô cần xem lại</Pill> : null}
      </header>
      <div className="grid gap-3 p-4" data-testid="scan-contract">
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px]">
          {existing ? <>Khách hàng đã có: <b>{existing.name}</b>{existing.full_name ? ` · ${existing.full_name}` : ''} <Pill tone="good">sẽ gắn vào</Pill></>
            : <Checkbox checked={addCustomer} onChange={setAddCustomer} label={<>Thêm <b>khách hàng mới</b> vào danh bạ{canSeeIds && c.customer_phone ? ' (kèm số điện thoại)' : ''}</>} />}
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Tên gọi khách hàng"><Input aria-label="Tên gọi khách hàng" value={c.customer_name} onChange={(e) => setC({ ...c, customer_name: e.target.value })} /></Field>
          <Field label="Họ tên đầy đủ"><Input aria-label="Họ tên đầy đủ" value={c.customer_full_name} onChange={(e) => setC({ ...c, customer_full_name: e.target.value })} /></Field>
          <Field label="Địa chỉ" className="sm:col-span-2"><Input aria-label="Địa chỉ" className={bad('customer_address')} value={c.customer_address} onChange={(e) => setC({ ...c, customer_address: e.target.value })} /></Field>
          {canSeeIds ? <Field label="Số điện thoại"><Input aria-label="Số điện thoại" className={bad('customer_phone')} value={c.customer_phone} onChange={(e) => setC({ ...c, customer_phone: e.target.value })} /></Field> : null}
          <Field label="Ngày ký"><Input type="date" aria-label="Ngày ký" className={bad('date')} value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} /></Field>
          <Field label="Công trình *" className="sm:col-span-2"><Combo aria-label="Công trình" value={project} onChange={setProject} items={lists.projectOptions} groupLabel="Công trình" className={project ? undefined : UNSURE} /></Field>
        </div>

        <div className="grid gap-2.5 rounded-lg border border-line p-3">
          <Checkbox checked={withContract} onChange={setWithContract} label={<b>Lưu hợp đồng chính</b>} />
          {withContract ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field label="Giá trị hợp đồng (đ) *"><MoneyInput aria-label="Giá trị hợp đồng" className={bad('value')} value={c.value} onChange={(v) => setC({ ...c, value: v })} /></Field>
              {c.unit_price ? <Field label="Đơn giá phần thô / m²"><MoneyInput aria-label="Đơn giá phần thô" value={c.unit_price} onChange={(v) => setC({ ...c, unit_price: v })} /></Field> : null}
              <Field label="Nội dung" className="sm:col-span-2"><Input aria-label="Nội dung hợp đồng" value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} /></Field>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2.5 rounded-lg border border-line p-3" data-testid="floor-areas">
          <div className="flex flex-wrap items-center gap-2">
            <Checkbox checked={withAreas} disabled={!canEditProject} onChange={setWithAreas} label={<b>Lưu diện tích sàn vào công trình</b>} />
            <span className="text-[12px] text-muted">{canEditProject ? 'thay bảng khối lượng sàn hiện có (Tỉ Trọng & Định Mức)' : 'cần quyền sửa Công Trình'}</span>
          </div>
          <div className="tbl rounded-lg border border-line">
            <table className="!w-full table-fixed [&_td]:border-r [&_td]:border-line [&_th]:border-r [&_th]:border-line [&_tr>*:last-child]:border-r-0" style={{ minWidth: 300 }}>
              <colgroup><col /><col style={{ width: 110 }} /><col style={{ width: 36 }} /></colgroup>
              <thead><tr><th>Phần (Móng, Trệt, Lầu…)</th><th className="!text-right">Diện tích m²</th><th /></tr></thead>
              <tbody>
                {areas.map((a, i) => (
                  <tr key={i}>
                    <td className="!p-0"><input aria-label={`Phần sàn ${i + 1}`} className={cell} value={a.name} onChange={(e) => setAreas((xs) => xs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} /></td>
                    <td className="!p-0"><input aria-label={`Diện tích ${i + 1}`} inputMode="decimal" className={`${cell} num text-right`} value={areaText(a.area)}
                      onChange={(e) => { const n = Number(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.')); setAreas((xs) => xs.map((x, k) => (k === i ? { ...x, area: Number.isFinite(n) ? n : 0 } : x))); }} /></td>
                    <td className="!p-0 text-center"><button type="button" aria-label={`Xóa phần ${i + 1}`} className="grid h-[34px] w-full place-items-center text-faint hover:text-bad" onClick={() => setAreas((xs) => xs.filter((_, k) => k !== i))}><Icon name="close" className="text-[17px]" /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold [&>td]:bg-surface-2"><td>Tổng</td><td className="num text-right" data-testid="floor-total">{areaText(totalArea)}</td><td /></tr></tfoot>
            </table>
          </div>
          <div><Button size="sm" onClick={() => setAreas((xs) => [...xs, { name: '', area: 0 }])}><Icon name="add" />Thêm phần</Button></div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onRetake}><Icon name="close" />Bỏ</Button>
          <Button variant="primary" data-testid="contract-save" disabled={busy} onClick={() => void doSave()}><Icon name="save" />{busy ? 'Đang lưu…' : 'Lưu'}</Button>
        </div>
      </div>
    </Card>
  );
}
