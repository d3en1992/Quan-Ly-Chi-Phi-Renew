// Danh Bạ › CỬA HÀNG: tìm theo tên, mặt hàng ("tôn lá", "chống thấm", "giàn giáo"), khu vực; thẻ có ảnh mặt tiền.
// Bấm thẻ → xem đủ: ảnh (phóng to), địa chỉ (mở bản đồ), SĐT (gọi), mặt hàng; nút Gửi Zalo (ảnh + chữ) / Copy / Tải ảnh cho thợ đi mua đồ.
// Thêm: tay (form) hoặc "Chụp bảng hiệu" (Trợ lý AI đọc tên, địa chỉ, SĐT, mặt hàng → anh kiểm tra rồi lưu).
import { useEffect, useMemo, useState } from 'react';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { FilterBar, FilterSelect, SearchBox } from '@/components/ui/data';
import { ZoomableImage } from '@/components/ui/image-zoom';
import { Card, EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { copyText } from '@/lib/clipboard';
import { hasLevel } from '@/lib/permissions';
import { matchesSearch } from '@/features/reports/shared';
import { prepareImage } from '@/features/scan/api';
import { useObjectUrl } from '@/features/scan/CaptureForm';
import { ScanWorkspace } from '@/features/scan/ScanWorkspace';
import { useContacts } from './api';
import { ShopFields, ShopPhotoPicker, type LinkDraft } from './ShopFields';
import { detailLines, mapsLink, shopShareText, useDeleteShop, useSaveShop, useShopPhotoUrl, useShops, type Shop, type ShopFieldsInput } from './shops-api';

export function ShopsPanel() {
  const access = useAccess();
  const toast = useToast();
  const mode = useLayoutMode();
  const canEdit = hasLevel(access.permissions, 'contacts', 'add');
  const canDelete = hasLevel(access.permissions, 'contacts', 'full');
  const q = useShops();
  const contacts = useContacts(access.special.see_contact_ids);
  const del = useDeleteShop();
  const [search, setSearch] = useState('');
  const [area, setArea] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [deleting, setDeleting] = useState<Shop | null>(null);

  const suppliers = contacts.data?.suppliers ?? [];
  const supplierName = (id: string | null) => (id ? suppliers.find((s) => s.id === id)?.name ?? '' : '');
  const areas = useMemo(() => [...new Set((q.data ?? []).map((s) => s.area?.trim()).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b, 'vi')), [q.data]);

  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => void q.refetch()} /></Card>;
  if (!q.data) return <Card><LoadingState label="Đang tải cửa hàng…" /></Card>;

  const list = q.data.filter((s) => (!area || s.area?.trim() === area) && matchesSearch(search, [s.name, s.address, s.area, s.phone, s.details, supplierName(s.supplier_id)].join(' ')));
  const viewShop = q.data.find((s) => s.id === viewing) ?? null;

  const doDelete = async () => {
    if (!deleting) return;
    try { await del.mutateAsync(deleting.id); toast(`Đã xóa: ${deleting.name}`); setViewing(null); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
    setDeleting(null);
  };

  return (
    <>
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm tên, mặt hàng (tôn lá, chống thấm…), khu vực…" className="basis-full sm:basis-auto sm:max-w-[420px]" />
        {areas.length ? <FilterSelect label="Khu vực" value={area} onChange={setArea} options={areas.map((a) => ({ value: a, label: a }))} selectClassName={mode === 'phone' ? 'max-w-[120px]' : undefined} /> : null}
        {canEdit ? (
          <>
            <Button onClick={() => setScanOpen(true)} aria-label="Chụp bảng hiệu cửa hàng"><Icon name="add_a_photo" />{mode === 'phone' ? 'Chụp' : 'Chụp bảng hiệu'}</Button>
            <Button variant="primary" onClick={() => setEditing({ id: null })} aria-label="Thêm cửa hàng"><Icon name="add_business" />{mode === 'phone' ? null : 'Thêm cửa hàng'}</Button>
          </>
        ) : null}
      </FilterBar>
      {list.length === 0 ? (
        <Card><EmptyState icon="storefront" title={q.data.length === 0 ? 'Chưa có cửa hàng nào' : 'Không có cửa hàng khớp'}>
          {q.data.length === 0 && canEdit ? 'Bấm "Chụp bảng hiệu": AI đọc tên, địa chỉ, SĐT, mặt hàng — anh kiểm tra rồi lưu.' : null}
        </EmptyState></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="shops-list">
          {list.map((s) => <ShopCard key={s.id} shop={s} supplier={supplierName(s.supplier_id)} onOpen={() => setViewing(s.id)} />)}
        </div>
      )}
      <Sheet open={!!viewShop} onOpenChange={(o) => { if (!o) setViewing(null); }} title={viewShop?.name ?? 'Cửa hàng'}
        footer={viewShop && canEdit ? (
          <>
            <Button variant="primary" className="flex-1" onClick={() => { setEditing({ id: viewShop.id }); setViewing(null); }}><Icon name="edit" />Sửa</Button>
            {canDelete ? <Button variant="ghost-danger" onClick={() => setDeleting(viewShop)}><Icon name="delete" />Xóa</Button> : null}
          </>
        ) : undefined}>
        {viewShop ? <ShopDetail shop={viewShop} supplier={supplierName(viewShop.supplier_id)} /> : null}
      </Sheet>
      {editing ? (
        <ShopForm key={editing.id ?? 'new'} shop={editing.id ? q.data.find((s) => s.id === editing.id) ?? null : null} suppliers={suppliers}
          onClose={() => setEditing(null)} />
      ) : null}
      <Sheet open={scanOpen} onOpenChange={setScanOpen} title="Chụp bảng hiệu cửa hàng" wide>
        {scanOpen ? <ScanWorkspace defaultKind="shop" lockKind compact onSaved={() => setScanOpen(false)} /> : null}
      </Sheet>
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }} title="Xóa cửa hàng?" danger busy={del.isPending} confirmLabel="Xóa"
        message={<>Xóa <b>{deleting?.name}</b>? Mục bị xóa vào Thùng Rác, khôi phục được. Nhà cung cấp đã nối (nếu có) vẫn giữ nguyên.</>} onConfirm={() => void doDelete()} />
    </>
  );
}

function ShopThumb({ path, className }: { path: string | null; className?: string }) {
  const url = useShopPhotoUrl(path);
  if (!path) return <div className={`grid place-items-center bg-surface-2 text-faint ${className ?? ''}`}><Icon name="storefront" className="text-[30px]" /></div>;
  return url.data ? <img src={url.data} alt="Mặt tiền" loading="lazy" className={`object-cover ${className ?? ''}`} />
    : <div className={`animate-pulse bg-surface-2 ${className ?? ''}`} />;
}

function ShopCard({ shop, supplier, onOpen }: { shop: Shop; supplier: string; onOpen: () => void }) {
  const lines = detailLines(shop.details);
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onOpen} className="grid w-full grid-cols-[96px_minmax(0,1fr)] gap-3 p-2.5 text-left hover:bg-surface-2/60" data-testid="shop-card">
        <ShopThumb path={shop.photo_path} className="h-24 w-24 rounded-lg" />
        <div className="grid min-w-0 content-start gap-1 text-[13px]">
          <b className="truncate text-[14px]">{shop.name}</b>
          {shop.area || shop.address ? <span className="line-clamp-1 text-muted"><Icon name="location_on" className="mr-0.5 align-[-3px] text-[15px]" />{shop.area || shop.address}</span> : null}
          {lines.length ? <span className="line-clamp-2 text-[12.5px] text-fg/80">{lines.join(' · ')}</span> : null}
          <div className="flex flex-wrap gap-1">
            {shop.phone ? <span className="num text-[12px] text-muted">{shop.phone}</span> : null}
            {supplier ? <Pill tone="accent">NCC: {supplier}</Pill> : null}
          </div>
        </div>
      </button>
    </Card>
  );
}

/** Tải ảnh về (blob) để gửi Zalo / lưu máy */
async function fetchBlob(url: string): Promise<Blob> {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Không tải được ảnh.');
  return r.blob();
}
const fileName = (name: string) => `${name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'cua-hang'}.jpg`;

function ShopDetail({ shop, supplier }: { shop: Shop; supplier: string }) {
  const toast = useToast();
  const url = useShopPhotoUrl(shop.photo_path);
  const [busy, setBusy] = useState(false);
  const lines = detailLines(shop.details);
  const text = shopShareText(shop);
  const tel = String(shop.phone ?? '').replace(/[^\d+]/g, '');

  const share = async () => {
    setBusy(true);
    try {
      const files = url.data ? [new File([await fetchBlob(url.data)], fileName(shop.name), { type: 'image/jpeg' })] : [];
      if (files.length && navigator.canShare?.({ files, text })) await navigator.share({ files, text, title: shop.name });
      else if (navigator.share) await navigator.share({ text, title: shop.name });
      else { await copyText(text); toast('Đã copy tên, địa chỉ, SĐT, mặt hàng — dán vào Zalo. Ảnh: bấm "Tải ảnh".'); }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) { await copyText(text); toast('Đã copy chữ để dán vào Zalo.'); }
    } finally { setBusy(false); }
  };
  const download = async () => {
    if (!url.data) return;
    setBusy(true);
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await fetchBlob(url.data));
      a.download = fileName(shop.name);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-3" data-testid="shop-detail">
      {shop.photo_path ? (url.data ? <ZoomableImage src={url.data} alt={`Mặt tiền ${shop.name}`} className="max-h-[300px]" />
        : <div className="grid h-40 place-items-center rounded-lg bg-surface-2 text-[12.5px] text-muted">{url.isError ? 'Không tải được ảnh.' : 'Đang tải ảnh…'}</div>) : null}
      <div className="grid gap-1.5 text-[13.5px]">
        {shop.address ? (
          <a href={mapsLink(shop.address, shop.name)} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 text-fg hover:text-accent">
            <Icon name="location_on" className="mt-0.5 text-[18px] text-accent" /><span>{shop.address}{shop.area ? <span className="text-muted"> · {shop.area}</span> : null}<span className="ml-1 text-[12px] text-accent">(bản đồ)</span></span>
          </a>
        ) : shop.area ? <span className="flex items-center gap-1.5"><Icon name="location_on" className="text-[18px] text-accent" />{shop.area}</span> : null}
        {shop.phone ? <a href={`tel:${tel}`} className="flex items-center gap-1.5 text-fg hover:text-accent"><Icon name="call" className="text-[18px] text-good" /><span className="num">{shop.phone}</span></a> : null}
        {supplier ? <span className="flex items-center gap-1.5"><Icon name="local_shipping" className="text-[18px] text-muted" />Nhà cung cấp: <b>{supplier}</b></span> : null}
      </div>
      {lines.length ? (
        <div className="grid gap-1 rounded-lg bg-surface-2/70 p-3">
          <span className="text-xs font-medium text-muted">Mặt hàng / ghi chú</span>
          <ul className="m-0 grid gap-1 pl-5 text-[13.5px]">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button variant="primary" disabled={busy} onClick={() => void share()} className="col-span-2 justify-center sm:col-span-1"><Icon name="share" />Gửi Zalo</Button>
        <Button disabled={busy} onClick={() => void copyText(text).then(() => toast('Đã copy — dán vào Zalo'))} className="justify-center"><Icon name="content_copy" />Copy chữ</Button>
        <Button disabled={busy || !url.data} onClick={() => void download()} className="justify-center"><Icon name="download" />Tải ảnh</Button>
      </div>
    </div>
  );
}

const toInput = (s: Shop | null): ShopFieldsInput => ({
  name: s?.name ?? '', address: s?.address ?? '', area: s?.area ?? '', phone: s?.phone ?? '', details: detailLines(s?.details).join('\n'),
});

function ShopForm({ shop, suppliers, onClose }: { shop: Shop | null; suppliers: readonly { id: string; name: string }[]; onClose: () => void }) {
  const access = useAccess();
  const toast = useToast();
  const save = useSaveShop();
  const [f, setF] = useState<ShopFieldsInput>(() => toInput(shop));
  const linked = shop?.supplier_id ? suppliers.find((s) => s.id === shop.supplier_id) : undefined;
  const [link, setLink] = useState<LinkDraft>({ mode: linked ? 'existing' : 'none', supplierName: linked?.name ?? '' });
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const oldUrl = useShopPhotoUrl(photo ? null : shop?.photo_path);
  const newUrl = useObjectUrl(photo);
  useEffect(() => { setError(''); }, [f]);

  const pick = async (file: File) => {
    setPreparing(true);
    try { setPhoto((await prepareImage(file)).blob); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); } finally { setPreparing(false); }
  };
  const submit = async () => {
    if (!f.name.trim()) return setError('Nhập tên cửa hàng.');
    const sup = link.mode === 'existing' ? suppliers.find((s) => s.name.toLowerCase() === link.supplierName.trim().toLowerCase()) : undefined;
    if (link.mode === 'existing' && !sup) return setError('Chọn nhà cung cấp trong danh sách (hoặc chọn "Không nối").');
    try {
      const r = await save.mutateAsync({
        id: shop?.id ?? null, fields: f, photo: photo ?? undefined, companyId: access.profile.company_id,
        link: link.mode === 'existing' ? { mode: 'existing', id: sup!.id } : { mode: link.mode },
      });
      toast(shop ? 'Đã cập nhật cửa hàng' : `Đã thêm cửa hàng${r.supplierCreated ? ` + nhà cung cấp ${r.supplierCreated}` : ''}`);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }} title={shop ? 'Sửa cửa hàng' : 'Thêm cửa hàng'}
      footer={<><Button variant="primary" className="flex-1" disabled={save.isPending || preparing} onClick={() => void submit()}><Icon name="save" />{save.isPending ? 'Đang lưu…' : 'Lưu'}</Button><Button onClick={onClose}>Hủy</Button></>}>
      <ShopPhotoPicker url={newUrl ?? oldUrl.data ?? null} onPick={(file) => void pick(file)} busy={preparing} />
      <ShopFields value={f} onChange={setF} suppliers={suppliers} link={link} setLink={setLink} />
      {error ? <div role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</div> : null}
    </Sheet>
  );
}
