// LƯU CỬA HÀNG (nút "Lưu thông tin" / "Chụp bảng hiệu" ở Danh Bạ › Cửa hàng): AI đọc ảnh mặt tiền → tên, địa chỉ, khu vực, SĐT,
// mặt hàng (kết hợp lời nói thành gạch đầu dòng; không nói thì lấy mặt hàng trên bảng hiệu). Ô mờ / khuất tô vàng để anh liếc sửa.
// Lưu kèm ảnh mặt tiền (kho shop-photos); tùy chọn lưu luôn thành Nhà cung cấp để theo dõi công nợ. Không bao giờ tự lưu.
import { useState } from 'react';
import type { ShopScan } from '@shared/scan';
import { useAccess } from '@/app/auth';
import { Button, Icon } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/input';
import { Card, ErrorState, LoadingState, Note, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useContacts } from '@/features/contacts/api';
import { ShopFields, type LinkDraft } from '@/features/contacts/ShopFields';
import { useSaveShop, type ShopFieldsInput } from '@/features/contacts/shops-api';
import { useObjectUrl } from './CaptureForm';
import type { PreparedImage } from './api';

type Props = { scan: ShopScan; image: PreparedImage | null; onDone: () => void; onRetake: () => void };

const LOW_LABEL: Record<string, string> = { phone: 'SĐT', address: 'địa chỉ', name: 'tên', area: 'khu vực' };

export function ScanShop({ scan, image, onDone, onRetake }: Props) {
  const access = useAccess();
  const toast = useToast();
  const contacts = useContacts(access.special.see_contact_ids);
  const save = useSaveShop();
  const [f, setF] = useState<ShopFieldsInput>({ name: scan.name, address: scan.address, area: scan.area, phone: scan.phones.join(' - '), details: scan.details.join('\n') });
  const [link, setLink] = useState<LinkDraft>({ mode: scan.supplier_match ? 'existing' : 'none', supplierName: scan.supplier_match });
  const [keepImage, setKeepImage] = useState(true);
  const [error, setError] = useState('');
  const url = useObjectUrl(image?.blob ?? null);

  if (contacts.isPending) return <Card><LoadingState label="Đang tải danh bạ…" /></Card>;
  if (contacts.isError) return <Card><ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} /></Card>;
  const suppliers = contacts.data.suppliers;

  const submit = async () => {
    setError('');
    if (!f.name.trim()) return setError('Nhập tên cửa hàng.');
    const sup = link.mode === 'existing' ? suppliers.find((s) => s.name.toLowerCase() === link.supplierName.trim().toLowerCase()) : undefined;
    if (link.mode === 'existing' && !sup) return setError('Chọn nhà cung cấp trong danh sách (hoặc chọn "Không nối").');
    try {
      const r = await save.mutateAsync({
        id: null, fields: f, photo: keepImage && image ? image.blob : undefined, companyId: access.profile.company_id,
        link: link.mode === 'existing' ? { mode: 'existing', id: sup!.id } : { mode: link.mode },
      });
      toast(`Đã lưu cửa hàng “${f.name.trim()}”${r.supplierCreated ? ` + nhà cung cấp ${r.supplierCreated}` : sup ? ` (nối NCC ${sup.name})` : ''}`);
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Card>
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <h3 className="m-0 text-sm font-bold">Cửa hàng — AI đọc xong</h3>
        {scan.low_confidence.length ? <Pill tone="warn">Xem lại: {scan.low_confidence.map((k) => LOW_LABEL[k] ?? k).join(', ')}</Pill> : null}
      </header>
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start" data-testid="scan-shop">
        {url ? (
          <div className="grid gap-1.5">
            <img src={url} alt="Ảnh mặt tiền vừa chụp" className="max-h-[300px] w-full rounded-lg bg-surface-2 object-contain" />
            <Checkbox checked={keepImage} onChange={setKeepImage} label="Lưu kèm ảnh mặt tiền vào hồ sơ cửa hàng" />
          </div>
        ) : <Note icon="image_not_supported">Không có ảnh — có thể thêm ảnh sau ở Danh Bạ › Cửa hàng.</Note>}
        <div className="grid gap-3">
          <ShopFields value={f} onChange={setF} low={scan.low_confidence} suppliers={suppliers} link={link} setLink={setLink} />
          {error ? <div role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</div> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={onRetake}><Icon name="close" />Bỏ</Button>
            <Button variant="primary" data-testid="shop-save" disabled={save.isPending} onClick={() => void submit()}><Icon name="save" />{save.isPending ? 'Đang lưu…' : 'Lưu cửa hàng'}</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
