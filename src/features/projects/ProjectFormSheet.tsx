// Form thêm / sửa công trình (bảng trượt). Quy tắc tên, loại, hệ số k như app cũ — xem logic.ts.
import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { Button, Icon } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { PROJECT_STATUS_OPTIONS } from './labels';
import { useCreateProject, useCustomersLite, useQuickAddCustomer, useUpdateProject, type ProjectFull } from './api';
import { detectKindCode, kindFromCode, NAME_MAX, normalizeNamePrefix, readK, scopeFromName, stripKindPrefix, suggestProjectName, totalFloorArea, type FloorArea } from './logic';

type Props = { open: boolean; onClose: () => void; project: ProjectFull | null; presetCustomerId?: string | null; onSaved?: (id: string) => void };

const emptyRows = (): FloorArea[] => Array.from({ length: 3 }, () => ({ ten: '', dvt: 'm2', kl: null }));

export function ProjectFormSheet({ open, onClose, project, presetCustomerId, onSaved }: Props) {
  const toast = useToast();
  const customers = useCustomersLite();
  const create = useCreateProject();
  const update = useUpdateProject();
  const quickAdd = useQuickAddCustomer();
  const isNew = !project;

  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('active');
  const [scope, setScope] = useState('');
  const [name, setName] = useState('');
  const [autoName, setAutoName] = useState(true);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [closed, setClosed] = useState('');
  const [k, setK] = useState('1');
  const [address, setAddress] = useState('');
  const [rows, setRows] = useState<FloorArea[]>(emptyRows());
  const [quick, setQuick] = useState<{ name: string; address: string } | null>(null);
  const [error, setError] = useState('');

  // Nạp lại form mỗi lần mở
  useEffect(() => {
    if (!open) return;
    setError('');
    setQuick(null);
    if (project) {
      setCustomerId(project.customer_id ?? '');
      setStatus(project.status);
      setScope(project.scope_note ?? scopeFromName(project.name));
      setName(project.name);
      setAutoName(false);
      setStart(project.start_date ?? '');
      setEnd(project.end_date ?? '');
      setClosed(project.closed_date ?? '');
      setK(String(project.cost_weight_k ?? 1).replace('.', ','));
      setAddress(project.address ?? '');
      setRows([]);
    } else {
      setCustomerId(presetCustomerId ?? '');
      setStatus('active');
      setScope('');
      setName('');
      setAutoName(true);
      setStart(new Date().toISOString().slice(0, 10));
      setEnd('');
      setClosed('');
      setK('1');
      setAddress('');
      setRows(emptyRows());
    }
    // Chỉ nạp lại khi mở form / đổi công trình — dữ liệu tự làm mới (máy khác vừa lưu) không xóa chữ đang gõ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id, presetCustomerId]);

  const customer = useMemo(() => customers.data?.find((c) => c.id === customerId) ?? null, [customers.data, customerId]);
  const suggestion = (nm: string) => suggestProjectName(nm, customer?.name, scope);

  // Chọn khách / gõ hạng mục -> tên tự điền (nếu chưa bị sửa tay)
  useEffect(() => {
    if (!open || !autoName) return;
    const s = suggestion(name);
    if (s) setName(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, scope, open]);

  // Địa chỉ tự lấy từ khách hàng khi còn trống (như `_ctApplyCustAddress`)
  useEffect(() => {
    if (open && isNew && customer?.address && !address.trim()) setAddress(customer.address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  const onNameTyped = (v: string) => {
    setName(v);
    const s = suggestion(v);
    setAutoName(!!s && stripKindPrefix(v) === stripKindPrefix(s));
  };

  const code = name.trim() ? detectKindCode(name) : '—';
  const busy = create.isPending || update.isPending;

  const save = async () => {
    setError('');
    const finalName = normalizeNamePrefix(name);
    if (!customerId) return setError('Vui lòng chọn Chủ đầu tư (hoặc bấm + Thêm nhanh).');
    if (!finalName) return setError('Vui lòng nhập tên công trình.');
    if (finalName.length > NAME_MAX && (isNew || finalName !== project?.name)) return setError(`Tên công trình tối đa ${NAME_MAX} ký tự (đang ${finalName.length}).`);
    if (status === 'completed' && !end) return setError('Vui lòng nhập Ngày kết thúc khi đánh dấu Hoàn thành.');
    if (status === 'closed' && !closed) return setError('Vui lòng nhập Ngày quyết toán.');
    const input = {
      name: finalName,
      kind: kindFromCode(detectKindCode(finalName)),
      status,
      customer_id: customerId,
      scope_note: scope.trim() || null,
      address: address.trim() || null,
      cost_weight_k: readK(k),
      floor_areas: isNew ? rows.filter((r) => r.ten.trim() || r.kl) : (project!.floor_areas as FloorArea[]),
      start_date: start || null,
      end_date: end || null,
      closed_date: closed || null,
      completed_date: status === 'completed' ? end || null : project?.completed_date ?? null,
    };
    try {
      if (isNew) {
        const id = await create.mutateAsync(input);
        toast(`Đã thêm: ${finalName}`);
        onSaved?.(id);
      } else {
        await update.mutateAsync({ id: project!.id, patch: input, oldName: project!.name });
        toast('Đã cập nhật công trình');
        onSaved?.(project!.id);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const addCustomer = async () => {
    if (!quick?.name.trim()) return;
    try {
      const id = await quickAdd.mutateAsync({ name: quick.name, address: quick.address.trim() || null });
      setCustomerId(id);
      setQuick(null);
      toast('Đã thêm khách hàng');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const setRow = (i: number, patch: Partial<FloorArea>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={isNew ? 'Thêm công trình' : 'Sửa công trình'}
      footer={
        <>
          <Button variant="primary" className="flex-1" disabled={busy} onClick={() => void save()}>
            <Icon name="save" />{isNew ? 'Lưu công trình' : 'Lưu thay đổi'}
          </Button>
          <Button onClick={onClose}>Hủy</Button>
        </>
      }
    >
      <Field label="Chủ đầu tư *">
        <div className="flex gap-1.5">
          <Select aria-label="Chủ đầu tư" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— Chọn khách hàng —</option>
            {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button onClick={() => setQuick(quick ? null : { name: '', address: '' })}><Icon name="add" />Thêm nhanh</Button>
        </div>
      </Field>
      {quick ? (
        <div className="grid gap-2 rounded-lg bg-surface-2 p-3">
          <Field label="Tên khách hàng mới *"><Input aria-label="Tên khách hàng mới" value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} placeholder="VD: Cô Sáu" /></Field>
          <Field label="Địa chỉ"><Input value={quick.address} onChange={(e) => setQuick({ ...quick, address: e.target.value })} /></Field>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={quickAdd.isPending || !quick.name.trim()} onClick={() => void addCustomer()}>Thêm khách</Button>
            <Button size="sm" onClick={() => setQuick(null)}>Hủy</Button>
          </div>
        </div>
      ) : null}
      <Field label="Trạng thái">
        <Select aria-label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
          {PROJECT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      <Field label="Hạng mục" hint="Gõ hạng mục: tên tự điền theo Loại Tên khách (Hạng mục)">
        <Input aria-label="Hạng mục" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="VD: Ốp gạch sân vườn, Làm mái che…" />
      </Field>
      <Field
        label="Tên công trình *"
        hint={
          <span className="flex justify-between gap-2">
            <span>
              Loại (tự nhận diện): <b>{code}</b>
              {!autoName ? (
                <button type="button" className="ml-2 text-accent" onClick={() => { setAutoName(true); const s = suggestion(name); if (s) setName(s); }}>
                  Gợi ý lại
                </button>
              ) : null}
            </span>
            <span className={name.length >= NAME_MAX ? 'font-semibold text-bad' : ''}>{name.length}/{NAME_MAX}</span>
          </span>
        }
      >
        <Input aria-label="Tên công trình" value={name} maxLength={Math.max(NAME_MAX, project?.name.length ?? 0)} onChange={(e) => onNameTyped(e.target.value)} placeholder="VD: SN Cô Sáu (Ốp gạch)" />
      </Field>
      {isNew ? (
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted">Khối lượng sàn (tùy chọn)</span>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_64px_84px] gap-1.5">
              <Input aria-label={`Hạng mục sàn ${i + 1}`} placeholder="Tên hạng mục" value={r.ten} onChange={(e) => setRow(i, { ten: e.target.value })} />
              <Input aria-label="ĐVT" value={r.dvt} onChange={(e) => setRow(i, { dvt: e.target.value })} />
              <Input aria-label="Khối lượng" inputMode="decimal" placeholder="KL" value={r.kl ?? ''} onChange={(e) => setRow(i, { kl: e.target.value === '' ? null : parseFloat(e.target.value.replace(',', '.')) || 0 })} />
            </div>
          ))}
          <div className="flex items-center justify-between text-[12.5px]">
            <Button size="sm" onClick={() => setRows((rs) => [...rs, { ten: '', dvt: 'm2', kl: null }])}><Icon name="add" />1 dòng</Button>
            <span className="text-muted">Tổng KL: <b className="num text-fg">{totalFloorArea(rows).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</b></span>
          </div>
        </div>
      ) : (
        <div className="text-[12.5px] text-muted">
          Khối lượng sàn: <b className="num text-fg">{totalFloorArea(project!.floor_areas as FloorArea[]).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</b> (bảng đầy đủ sửa ở tab Tỉ Trọng &amp; Định Mức)
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Ngày bắt đầu"><Input type="date" aria-label="Ngày bắt đầu" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Ngày kết thúc (tùy chọn)"><Input type="date" aria-label="Ngày kết thúc" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      {status === 'closed' || closed ? (
        <Field label="Ngày quyết toán"><Input type="date" aria-label="Ngày quyết toán" value={closed} onChange={(e) => setClosed(e.target.value)} /></Field>
      ) : null}
      <Field label="Hệ số k (chia chi phí chung)" hint="Mặc định 1; nhập 0 để công trình không gánh chi phí chung">
        <Input aria-label="Hệ số k" inputMode="decimal" value={k} onChange={(e) => setK(e.target.value)} />
      </Field>
      <Field label="Địa chỉ công trình"><Input aria-label="Địa chỉ công trình" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Tự điền từ địa chỉ khách hàng" /></Field>
      {error ? <div role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</div> : null}
    </Sheet>
  );
}
