// Các ô của 1 cửa hàng (tên, địa chỉ, khu vực, SĐT, mặt hàng, nối nhà cung cấp, ảnh mặt tiền) — dùng chung cho
// form Thêm / Sửa cửa hàng (Danh Bạ › Cửa hàng) và màn kiểm tra sau khi Trợ lý AI đọc bảng hiệu (features/scan/ScanShop).
import { useRef } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { ZoomableImage } from '@/components/ui/image-zoom';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ShopFieldsInput } from './shops-api';

export type LinkDraft = { mode: 'none' | 'existing' | 'new'; supplierName: string };

const warnCls = '!border-warn !bg-warn-soft';

type Props = {
  value: ShopFieldsInput;
  onChange: (v: ShopFieldsInput) => void;
  /** Ô AI đọc không chắc: 'name' | 'address' | 'phone' | 'area' → tô vàng */
  low?: readonly string[];
  suppliers: readonly { id: string; name: string }[];
  link: LinkDraft;
  setLink: (l: LinkDraft) => void;
};

export function ShopFields({ value, onChange, low = [], suppliers, link, setLink }: Props) {
  const set = (k: keyof ShopFieldsInput, v: string) => onChange({ ...value, [k]: v });
  const warn = (k: string) => (low.includes(k) ? warnCls : undefined);
  const hint = (k: string) => (low.includes(k) ? 'Ảnh mờ / bị che — anh xem lại' : undefined);
  return (
    <div className="grid gap-2.5" data-testid="shop-fields">
      <Field label="Tên cửa hàng *" hint={hint('name')}><Input aria-label="Tên cửa hàng" value={value.name} className={warn('name')} onChange={(e) => set('name', e.target.value)} placeholder="VD: VLXD PHƯƠNG" /></Field>
      <Field label="Địa chỉ" hint={hint('address')}><Input aria-label="Địa chỉ cửa hàng" value={value.address} className={warn('address')} onChange={(e) => set('address', e.target.value)} /></Field>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Khu vực (quận / huyện, tỉnh)" hint={hint('area')}><Input aria-label="Khu vực" value={value.area} className={warn('area')} onChange={(e) => set('area', e.target.value)} placeholder="VD: Dĩ An, Bình Dương" /></Field>
        <Field label="Số điện thoại" hint={hint('phone')}><Input aria-label="SĐT cửa hàng" inputMode="tel" value={value.phone} className={warn('phone')} onChange={(e) => set('phone', e.target.value)} /></Field>
      </div>
      <Field label="Mặt hàng / ghi chú (mỗi dòng 1 ý)">
        <Textarea aria-label="Mặt hàng cửa hàng" rows={4} value={value.details} onChange={(e) => set('details', e.target.value)} placeholder={'Tôn lá đủ khổ 20 cm – 1 m\nGiá rẻ nhất khu Tân Phú'} />
      </Field>
      <div className="grid gap-2 rounded-lg border border-line-soft p-2.5">
        <Field label="Nối với Nhà cung cấp (theo dõi công nợ)">
          <Select aria-label="Nối nhà cung cấp" value={link.mode} onChange={(e) => setLink({ ...link, mode: e.target.value as LinkDraft['mode'] })}>
            <option value="none">Không nối — chỉ lưu ở Cửa hàng</option>
            <option value="new">Lưu luôn thành Nhà cung cấp mới (cùng tên)</option>
            <option value="existing">Nối với nhà cung cấp có sẵn</option>
          </Select>
        </Field>
        {link.mode === 'existing' ? (
          <Field label="Nhà cung cấp">
            <Combo aria-label="Chọn nhà cung cấp" value={link.supplierName} onChange={(v) => setLink({ ...link, supplierName: v })} items={suppliers} groupLabel="Nhà cung cấp" placeholder="Gõ tên để tìm" />
          </Field>
        ) : null}
        {link.mode === 'new' ? <small className="text-[12px] text-muted">Tạo nhà cung cấp <b>{value.name.trim().toUpperCase() || '…'}</b> (trùng tên có sẵn thì nối vào đó) — hiện ở cả Cửa hàng lẫn Nhà cung cấp.</small> : null}
      </div>
    </div>
  );
}

/** Ảnh mặt tiền: xem (bấm phóng to) + Chụp / Chọn ảnh khác */
export function ShopPhotoPicker({ url, onPick, busy }: { url: string | null; onPick: (f: File) => void; busy?: boolean }) {
  const cam = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-1.5" data-testid="shop-photo-picker">
      <span className="text-xs font-medium text-muted">Ảnh mặt tiền</span>
      {url ? <ZoomableImage src={url} alt="Ảnh mặt tiền cửa hàng" className="max-h-[220px]" />
        : <div className={cn('grid h-24 place-items-center rounded-lg border-2 border-dashed border-line bg-surface-2 text-[12.5px] text-muted')}>Chưa có ảnh</div>}
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={() => cam.current?.click()} className="justify-center"><Icon name="photo_camera" />Chụp</Button>
        <Button disabled={busy} onClick={() => pick.current?.click()} className="justify-center"><Icon name="upload" />{url ? 'Ảnh khác' : 'Chọn ảnh'}</Button>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Chụp ảnh cửa hàng" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
      <input ref={pick} type="file" accept="image/*" className="hidden" aria-label="Chọn ảnh cửa hàng" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
    </div>
  );
}
