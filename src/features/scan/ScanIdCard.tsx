// LƯU THÔNG TIN NGƯỜI (nút "Lưu thông tin" / Chụp CCCD ở Danh Bạ, KẾ HOẠCH 4G): AI đọc ảnh CCCD hoặc danh thiếp + lời nói
// ("Lưu thông tin thầu phụ Đảng, SĐT…") → họ tên, số CCCD, ngày sinh, quê quán, nơi thường trú, SĐT, ghi chú; tự chọn nhóm
// (khách hàng / công nhân / thầu phụ / nhà cung cấp / nhân viên) theo lời nhắn → tìm người trùng tên → gắn vào người đó hoặc tạo mới.
// Anh kiểm tra rồi bấm Lưu. CHỈ LƯU CHỮ: ảnh CCCD không bao giờ lên kho (màn cha xóa ảnh khỏi bộ nhớ ngay khi có kết quả).
import { useMemo, useState } from 'react';
import type { IdCardScan } from '@shared/scan';
import { Button, Icon } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Card, ErrorState, LoadingState, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useContacts, useSaveContact, type ContactsData } from '@/features/contacts/api';
import { contactNameFromSaid, guessContactKind, idCardCandidates, shortNameFromFull, type ContactKindForId } from './model';

const KIND_LABEL: Record<ContactKindForId, string> = {
  customer: 'Khách hàng', worker: 'Công nhân', subcontractor: 'Thầu phụ', supplier: 'Nhà cung cấp', employee: 'Nhân viên',
};
const REASON: Record<string, string> = { full_name: 'trùng họ tên', given_name: 'trùng tên gọi', short_name: 'đúng tên anh nói', ai: 'theo ghi chú' };
const ID_FIELDS: { key: keyof IdCardScan; label: string; type?: string }[] = [
  { key: 'full_name', label: 'Họ tên' }, { key: 'id_number', label: 'Số CCCD' }, { key: 'date_of_birth', label: 'Ngày sinh', type: 'date' },
  { key: 'gender', label: 'Giới tính' }, { key: 'hometown', label: 'Quê quán' }, { key: 'permanent_address', label: 'Nơi thường trú' },
  { key: 'id_issued_on', label: 'Ngày cấp', type: 'date' }, { key: 'id_issued_place', label: 'Nơi cấp' },
];
const CCCD_KEYS = ['id_number', 'date_of_birth', 'gender', 'hometown', 'permanent_address', 'id_issued_on', 'id_issued_place'] as const;

type Props = { scan: IdCardScan; note: string; onDone: () => void; onRetake: () => void };

/** Ghi chú cũ + dòng mới (không lặp dòng đã có) */
export function appendNote(old: string | null | undefined, lines: readonly string[]): string | null {
  const have = String(old ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const add = lines.map((l) => l.trim()).filter((l) => l && !have.some((h) => h.toLowerCase() === l.toLowerCase()));
  const all = [...have, ...add];
  return all.length ? all.join('\n') : null;
}

function existingRow(d: ContactsData, kind: ContactKindForId, id: string): { note: string | null; full?: string | null; address?: string | null; phone?: string | null; field?: string | null } | undefined {
  if (kind === 'worker') { const r = d.workers.find((x) => x.id === id); return r && { note: r.note, full: r.full_name }; }
  if (kind === 'customer') { const r = d.customers.find((x) => x.id === id); return r && { note: r.note, full: r.full_name, address: r.address }; }
  if (kind === 'employee') { const r = d.employees.find((x) => x.id === id); return r && { note: r.note, full: r.full_name }; }
  if (kind === 'subcontractor') { const r = d.subcontractors.find((x) => x.id === id); return r && { note: r.note, full: r.contact_person, field: r.field }; }
  const r = d.suppliers.find((x) => x.id === id); return r && { note: r.note, address: r.address, phone: r.phone };
}

export function ScanIdCard({ scan, note, onDone, onRetake }: Props) {
  const toast = useToast();
  const contacts = useContacts(true);
  const save = useSaveContact();
  const [card, setCard] = useState<IdCardScan>(scan);
  const [notes, setNotes] = useState(scan.note_lines.join('\n'));
  const [kind, setKind] = useState<ContactKindForId>(() => guessContactKind(scan.contact_kind, note));
  const [target, setTarget] = useState<string | null>(null); // id người được gắn; 'new' = tạo mới
  const [newName, setNewName] = useState<string | null>(null);
  const hasCccd = card.doc_type === 'cccd' || CCCD_KEYS.some((k) => String(card[k] ?? '').trim());

  const candidates = useMemo(() => {
    if (!contacts.data) return [];
    const d = contacts.data;
    return idCardCandidates(card, d, (id) => !!d.masked.get(id)?.id_number);
  }, [contacts.data, card]);
  const ofKind = candidates.filter((c) => c.kind === kind);
  const chosen = target ?? (ofKind.find((c) => !c.hasIdNumber)?.id ?? (ofKind[0]?.id || 'new'));
  const autoName = card.short_name.trim() ? contactNameFromSaid(card.short_name, kind) : shortNameFromFull(card.full_name, kind);
  const shortName = newName ?? autoName;

  if (contacts.isPending) return <Card><LoadingState label="Đang tải danh bạ…" /></Card>;
  if (contacts.isError) return <Card><ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} /></Card>;
  const data = contacts.data;

  const doSave = () => {
    const isNew = chosen === 'new';
    const s = (v: string) => v.trim();
    const noteLines = notes.split('\n').map((l) => l.replace(/^[\s\-–•*+·]+/, '').trim()).filter(Boolean);
    const phone = s(card.phone);
    const address = s(card.address);
    if (isNew && kind === 'employee' ? !s(card.full_name) : isNew && !s(shortName)) { toast(kind === 'employee' ? 'Chưa có họ tên.' : 'Nhập tên gọi trong danh bạ.', 'error'); return; }
    if (!isNew && !existingRow(data, kind, chosen)) { toast('Không tìm thấy người đã chọn — chọn lại.', 'error'); return; }
    const old = isNew ? undefined : existingRow(data, kind, chosen);
    const note2 = appendNote(old?.note, noteLines);
    const full = s(card.full_name) || null;
    // Thông tin riêng: chỉ gửi ô có chữ — lưu danh thiếp không xóa CCCD cũ, lưu CCCD không xóa SĐT cũ
    const priv: Record<string, string> = {};
    if (kind !== 'supplier') {
      for (const k of CCCD_KEYS) if (s(String(card[k] ?? ''))) priv[k] = s(String(card[k]));
      if (phone) priv.phone = phone;
    }
    let fields: Record<string, unknown>;
    if (kind === 'worker') fields = isNew ? { name: s(shortName).toUpperCase(), full_name: full, note: note2 } : { ...(old?.full ? {} : full ? { full_name: full } : {}), note: note2 };
    else if (kind === 'customer') fields = isNew ? { name: s(shortName), full_name: full, address: address || s(card.permanent_address) || null, note: note2 }
      : { ...(old?.full ? {} : full ? { full_name: full } : {}), ...(old?.address || !address ? {} : { address }), note: note2 };
    else if (kind === 'employee') fields = isNew ? { full_name: full, note: note2 } : { note: note2 };
    else if (kind === 'subcontractor') fields = isNew ? { name: s(shortName), field: s(card.field) || null, contact_person: full, note: note2 }
      : { ...(old?.full ? {} : full ? { contact_person: full } : {}), ...(old?.field || !s(card.field) ? {} : { field: s(card.field) }), note: note2 };
    else {
      // Nhà cung cấp: không có thông tin riêng → họ tên chủ / người liên hệ ghi vào ghi chú
      const supNote = appendNote(note2, [full ? `Liên hệ: ${full}` : '', s(card.field) ? `Bán: ${s(card.field)}` : ''].filter(Boolean));
      fields = isNew ? { name: s(shortName).toUpperCase(), address: address || null, phone: phone || null, note: supNote }
        : { ...(old?.address || !address ? {} : { address }), ...(old?.phone || !phone ? {} : { phone }), note: supNote };
    }
    // Thầu phụ cũng làm công nhân (đã nối sẵn): giữ nguyên nối, không đụng
    save.mutate({ kind, id: isNew ? null : chosen, fields, priv: Object.keys(priv).length ? (priv as never) : null }, {
      onSuccess: () => {
        const name = isNew ? (kind === 'employee' ? full : s(shortName)) : candidates.find((c) => c.id === chosen)?.name;
        toast(isNew ? `Đã thêm ${KIND_LABEL[kind].toLowerCase()} “${name}”` : `Đã cập nhật thông tin ${KIND_LABEL[kind].toLowerCase()} ${name ?? ''}`);
        onDone();
      },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };

  const lowCls = (k: string) => (card.low_confidence.includes(k) ? '!border-warn !bg-warn-soft' : undefined);
  const setF = (k: keyof IdCardScan, v: string) => setCard((c) => ({ ...c, [k]: v }));
  const contactFields = (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <Field label="Số điện thoại"><Input aria-label="Số điện thoại" inputMode="tel" value={card.phone} className={lowCls('phone')} onChange={(e) => setF('phone', e.target.value)} /></Field>
      {kind === 'subcontractor' || kind === 'supplier' ? (
        <Field label={kind === 'subcontractor' ? 'Lĩnh vực' : 'Mặt hàng chính'}><Input aria-label="Lĩnh vực" value={card.field} onChange={(e) => setF('field', e.target.value)} /></Field>
      ) : null}
      {kind === 'customer' || kind === 'supplier' ? (
        <Field label="Địa chỉ liên hệ" className="sm:col-span-2"><Input aria-label="Địa chỉ liên hệ" value={card.address} className={lowCls('address')} onChange={(e) => setF('address', e.target.value)} /></Field>
      ) : null}
      <Field label="Ghi chú (mỗi dòng 1 ý)" className="sm:col-span-2"><Textarea aria-label="Ghi chú danh bạ" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </div>
  );

  return (
    <Card>
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <h3 className="m-0 text-sm font-bold">Lưu thông tin — AI đọc xong</h3>
        {card.doc_type === 'business_card' ? <Pill>Danh thiếp</Pill> : card.doc_type === 'cccd' ? <Pill>CCCD</Pill> : null}
        {card.low_confidence.length ? <Pill tone="warn">{card.low_confidence.length} ô cần xem lại</Pill> : null}
        <div className="flex-1" />
        <small className="inline-flex items-center gap-1 text-muted"><Icon name="lock" className="text-[15px]" />Ảnh đã bị xóa — chỉ lưu chữ</small>
      </header>
      <div className="grid gap-3 p-4" data-testid="scan-idcard">
        <Field label="Lưu vào nhóm">
          <Select aria-label="Nhóm danh bạ" value={kind} onChange={(e) => { setKind(e.target.value as ContactKindForId); setTarget(null); setNewName(null); }}>
            {(Object.keys(KIND_LABEL) as ContactKindForId[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
        </Field>

        {hasCccd ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {ID_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} className={f.key === 'permanent_address' ? 'sm:col-span-2' : undefined}>
                <Input aria-label={f.label} type={f.type} value={String(card[f.key] ?? '')} className={lowCls(f.key)} onChange={(e) => setF(f.key, e.target.value)} />
              </Field>
            ))}
          </div>
        ) : (
          <Field label={kind === 'supplier' ? 'Người liên hệ' : 'Họ tên'}><Input aria-label="Họ tên" value={card.full_name} className={lowCls('full_name')} onChange={(e) => setF('full_name', e.target.value)} /></Field>
        )}
        {kind === 'supplier' && hasCccd ? <small className="text-[12px] text-muted">Nhà cung cấp không lưu số CCCD — chỉ lưu tên, địa chỉ, SĐT; họ tên ghi vào ghi chú.</small> : null}
        {contactFields}

        <div className="grid gap-1.5" role="radiogroup" aria-label="Gắn vào người">
          {ofKind.map((c) => (
            <label key={c.id} className="flex cursor-pointer flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
              <input type="radio" name="idcard-target" checked={chosen === c.id} onChange={() => setTarget(c.id)} className="accent-[var(--accent)]" />
              <span>Cập nhật <b>{c.name}</b>{c.fullName ? <span className="text-muted"> · {c.fullName}</span> : null}</span>
              <Pill tone="good">Khớp: {REASON[c.reason]}</Pill>
              {kind === 'supplier' ? null : c.hasIdNumber ? (hasCccd ? <Pill tone="warn">đã có CCCD — sẽ ghi đè</Pill> : <Pill>đã có CCCD</Pill>) : <Pill>chưa có CCCD</Pill>}
            </label>
          ))}
          <label className="flex cursor-pointer flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
            <input type="radio" name="idcard-target" checked={chosen === 'new'} onChange={() => setTarget('new')} className="accent-[var(--accent)]" />
            <span>Tạo {KIND_LABEL[kind].toLowerCase()} mới</span>
            {chosen === 'new' && kind !== 'employee' ? (
              <Input aria-label="Tên gọi trong danh bạ" className="!h-8 max-w-[220px]" value={shortName} onChange={(e) => setNewName(e.target.value)} />
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
