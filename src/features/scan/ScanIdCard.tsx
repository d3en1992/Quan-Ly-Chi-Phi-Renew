// Chụp CCCD (MP.cccd, KẾ HOẠCH 4G): AI đọc họ tên, số CCCD, ngày sinh, giới tính, quê quán, nơi thường trú, ngày cấp →
// tìm người trùng tên trong Danh Bạ (công nhân / khách hàng / nhân viên) → gắn vào người đó hoặc tạo mới.
// CHỈ LƯU CHỮ: ảnh không bao giờ lên kho, đọc xong là bỏ (màn cha xóa ảnh khỏi bộ nhớ ngay khi có kết quả).
import { useMemo, useState } from 'react';
import type { IdCardScan } from '@shared/scan';
import { Button, Icon } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Card, ErrorState, LoadingState, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useContacts, useSaveContact } from '@/features/contacts/api';
import { guessContactKind, idCardCandidates, shortNameFromFull, type ContactKindForId } from './model';

const KIND_LABEL: Record<ContactKindForId, string> = { worker: 'Công nhân', customer: 'Khách hàng', employee: 'Nhân viên' };
const REASON: Record<string, string> = { full_name: 'trùng họ tên', given_name: 'trùng tên gọi', ai: 'theo ghi chú' };
const FIELDS: { key: keyof IdCardScan; label: string; type?: string }[] = [
  { key: 'full_name', label: 'Họ tên' }, { key: 'id_number', label: 'Số CCCD' }, { key: 'date_of_birth', label: 'Ngày sinh', type: 'date' },
  { key: 'gender', label: 'Giới tính' }, { key: 'hometown', label: 'Quê quán' }, { key: 'permanent_address', label: 'Nơi thường trú' },
  { key: 'id_issued_on', label: 'Ngày cấp', type: 'date' }, { key: 'id_issued_place', label: 'Nơi cấp' },
];

type Props = { scan: IdCardScan; note: string; onDone: () => void; onRetake: () => void };

export function ScanIdCard({ scan, note, onDone, onRetake }: Props) {
  const toast = useToast();
  const contacts = useContacts(true);
  const save = useSaveContact();
  const [card, setCard] = useState<IdCardScan>(scan);
  const [kind, setKind] = useState<ContactKindForId>(() => guessContactKind(scan.contact_kind, note));
  const [target, setTarget] = useState<string | null>(null); // id người được gắn; 'new' = tạo mới
  const [newName, setNewName] = useState('');

  const candidates = useMemo(() => {
    if (!contacts.data) return [];
    const d = contacts.data;
    return idCardCandidates(card, { workers: d.workers, customers: d.customers, employees: d.employees }, (id) => !!d.masked.get(id)?.id_number);
  }, [contacts.data, card]);
  const ofKind = candidates.filter((c) => c.kind === kind);
  const chosen = target ?? (ofKind.find((c) => !c.hasIdNumber)?.id ?? (ofKind[0]?.id || 'new'));
  const shortName = newName || shortNameFromFull(card.full_name, kind);

  if (contacts.isPending) return <Card><LoadingState label="Đang tải danh bạ…" /></Card>;
  if (contacts.isError) return <Card><ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} /></Card>;

  const doSave = () => {
    if (!card.full_name.trim()) { toast('Chưa có họ tên.', 'error'); return; }
    const priv = {
      id_number: card.id_number, date_of_birth: card.date_of_birth || null, gender: card.gender, hometown: card.hometown,
      permanent_address: card.permanent_address, id_issued_on: card.id_issued_on || null, id_issued_place: card.id_issued_place,
    } as Record<string, string | null>;
    const isNew = chosen === 'new';
    const existing = candidates.find((c) => c.id === chosen);
    const fields: Record<string, unknown> = kind === 'employee'
      ? (isNew ? { full_name: card.full_name } : {})
      : isNew ? { name: shortName.trim(), full_name: card.full_name } : (existing?.fullName ? {} : { full_name: card.full_name });
    if (isNew && kind !== 'employee' && !shortName.trim()) { toast('Nhập tên gọi trong danh bạ.', 'error'); return; }
    save.mutate({ kind, id: isNew ? null : chosen, fields, priv: priv as never }, {
      onSuccess: () => {
        toast(isNew ? `Đã thêm ${KIND_LABEL[kind].toLowerCase()} “${kind === 'employee' ? card.full_name : shortName}” kèm CCCD` : `Đã gắn CCCD vào ${existing?.name ?? ''}`);
        onDone();
      },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };

  return (
    <Card>
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <h3 className="m-0 text-sm font-bold">CCCD — AI đọc xong</h3>
        {card.low_confidence.length ? <Pill tone="warn">{card.low_confidence.length} ô cần xem lại</Pill> : null}
        <div className="flex-1" />
        <small className="inline-flex items-center gap-1 text-muted"><Icon name="lock" className="text-[15px]" />Ảnh đã bị xóa — chỉ lưu chữ</small>
      </header>
      <div className="grid gap-3 p-4" data-testid="scan-idcard">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} className={f.key === 'permanent_address' ? 'sm:col-span-2' : undefined}>
              <Input
                aria-label={f.label} type={f.type} value={String(card[f.key] ?? '')}
                className={card.low_confidence.includes(f.key) ? '!border-warn !bg-warn-soft' : undefined}
                onChange={(e) => setCard((c) => ({ ...c, [f.key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>

        <Field label="Lưu vào nhóm">
          <Select aria-label="Nhóm danh bạ" value={kind} onChange={(e) => { setKind(e.target.value as ContactKindForId); setTarget(null); }}>
            {(Object.keys(KIND_LABEL) as ContactKindForId[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
        </Field>

        <div className="grid gap-1.5" role="radiogroup" aria-label="Gắn vào người">
          {ofKind.map((c) => (
            <label key={c.id} className="flex cursor-pointer flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
              <input type="radio" name="idcard-target" checked={chosen === c.id} onChange={() => setTarget(c.id)} className="accent-[var(--accent)]" />
              <span>Gắn vào <b>{c.name}</b>{c.fullName ? <span className="text-muted"> · {c.fullName}</span> : null}</span>
              <Pill tone="good">Khớp: {REASON[c.reason]}</Pill>
              {c.hasIdNumber ? <Pill tone="warn">đã có CCCD — sẽ ghi đè</Pill> : <Pill>chưa có CCCD</Pill>}
            </label>
          ))}
          <label className="flex cursor-pointer flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
            <input type="radio" name="idcard-target" checked={chosen === 'new'} onChange={() => setTarget('new')} className="accent-[var(--accent)]" />
            <span>Tạo {KIND_LABEL[kind].toLowerCase()} mới</span>
            {chosen === 'new' && kind !== 'employee' ? (
              <Input aria-label="Tên gọi trong danh bạ" className="!h-8 max-w-[200px]" value={shortName} onChange={(e) => setNewName(e.target.value)} />
            ) : null}
            {ofKind.length === 0 ? <span className="text-[12px] text-muted">Không thấy ai trùng tên trong {KIND_LABEL[kind].toLowerCase()}</span> : null}
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onRetake}><Icon name="close" />Bỏ</Button>
          <Button variant="primary" data-testid="idcard-save" disabled={save.isPending} onClick={doSave}><Icon name="save" />{save.isPending ? 'Đang lưu…' : 'Lưu vào danh bạ'}</Button>
        </div>
      </div>
    </Card>
  );
}
