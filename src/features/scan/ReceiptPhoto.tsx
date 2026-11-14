// Xem lại ảnh đã lưu trong kho `receipts` (ảnh hóa đơn, ảnh phiếu chấm công): ảnh nhỏ bấm để phóng to, nút mở ảnh, dấu "có ảnh" ở danh sách.
// Link ảnh là link tạm (1 giờ) lấy qua useReceiptUrl — chỉ tải khi ảnh thật sự được hiện / được bấm.
import { useRef, useState } from 'react';
import { useAccess } from '@/app/auth';
import { Button, Icon } from '@/components/ui/button';
import { ImageViewer, ZoomableImage } from '@/components/ui/image-zoom';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { prepareImage, removeReceipt, uploadReceipt, useReceiptUrl } from './api';

/** Ảnh nhỏ trong bảng trượt: bấm vào mở toàn màn hình, phóng to được */
export function ReceiptPhoto({ path, alt = 'Ảnh hóa đơn', className }: { path: string | null | undefined; alt?: string; className?: string }) {
  const url = useReceiptUrl(path);
  if (!path) return null;
  return (
    <div className="grid gap-1.5" data-testid="receipt-photo">
      <span className="text-xs font-medium text-muted">{alt} đã lưu</span>
      {url.isPending ? <div className="grid h-28 place-items-center rounded-lg bg-surface-2 text-[12.5px] text-muted">Đang tải ảnh…</div>
        : url.isError || !url.data ? (
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
            <Icon name="broken_image" className="text-[18px]" />Không tải được ảnh (có thể đã bị xóa khỏi kho).
            <Button size="sm" variant="ghost" onClick={() => void url.refetch()}>Thử lại</Button>
          </div>
        ) : <ZoomableImage src={url.data} alt={alt} className={cn('max-h-[240px]', className)} />}
    </div>
  );
}

/** Nút mở ảnh toàn màn hình (Sổ chấm công: "Ảnh phiếu") — không có ảnh thì không hiện gì */
export function ReceiptPhotoButton({ path, label = 'Ảnh phiếu', alt = 'Ảnh phiếu chấm công', className }: { path: string | null | undefined; label?: string; alt?: string; className?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const url = useReceiptUrl(open ? path : null);
  if (!path) return null;
  if (open && url.isError) { setOpen(false); toast('Không tải được ảnh (có thể đã bị xóa khỏi kho).', 'error'); }
  return (
    <>
      <Button variant="ghost" className={className} data-testid="receipt-photo-button" disabled={open && url.isPending} onClick={() => setOpen(true)}>
        <Icon name="image" />{open && url.isPending ? 'Đang tải…' : label}
      </Button>
      {open && url.data ? <ImageViewer src={url.data} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Nút lưu ảnh cho chứng từ CŨ đã có dữ liệu (hóa đơn nhập tay, tuần chấm công nhập tay): chụp / chọn ảnh → thu nhỏ →
 * tải lên kho `receipts` → `onAttach(path)` gắn vào bản ghi. Gắn hỏng thì gỡ ảnh vừa tải. Đã có ảnh thì nút thành "Đổi ảnh".
 */
export function AttachReceiptButton({ date, hasPhoto, label, onAttach, className, block }: {
  /** Ngày chứng từ (YYYY-MM-DD) — để xếp thư mục năm trong kho */
  date: string; hasPhoto: boolean; label: string; onAttach: (path: string) => Promise<void>; className?: string;
  /** Nút rộng hết hàng (điện thoại) */
  block?: boolean;
}) {
  const access = useAccess();
  const toast = useToast();
  const cam = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const run = async (file: File | undefined) => {
    setMenu(false);
    if (!file) return;
    setBusy(true);
    let path = '';
    try {
      const img = await prepareImage(file);
      path = await uploadReceipt(access.profile.company_id, img.blob, date);
      await onAttach(path);
      toast(hasPhoto ? 'Đã đổi ảnh' : 'Đã lưu ảnh');
    } catch (e) {
      if (path) await removeReceipt(path);
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally { setBusy(false); }
  };
  return (
    <span className={cn('relative', block ? 'grid' : 'inline-flex')}>
      <Button variant="ghost" className={className} disabled={busy} data-testid="attach-receipt" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
        <Icon name={busy ? 'hourglass_top' : 'add_photo_alternate'} />{busy ? 'Đang lưu ảnh…' : hasPhoto ? 'Đổi ảnh' : label}
      </Button>
      {menu ? (
        <span className="absolute top-full left-0 z-30 mt-1 grid min-w-[150px] gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-lg">
          <button type="button" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-surface-2" onClick={() => cam.current?.click()}><Icon name="photo_camera" className="text-[18px]" />Chụp ảnh</button>
          <button type="button" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-surface-2" onClick={() => pick.current?.click()}><Icon name="upload" className="text-[18px]" />Chọn ảnh có sẵn</button>
        </span>
      ) : null}
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Chụp ảnh chứng từ" onChange={(e) => { void run(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={pick} type="file" accept="image/*" className="hidden" aria-label="Chọn ảnh chứng từ" data-testid="attach-receipt-file" onChange={(e) => { void run(e.target.files?.[0]); e.target.value = ''; }} />
    </span>
  );
}

/** Dấu nhỏ "có ảnh" cạnh một dòng trong danh sách */
export function HasPhotoMark({ path }: { path: string | null | undefined }) {
  return path ? <span className="ml-1 inline-flex align-middle text-accent" role="img" aria-label="Có ảnh" title="Có ảnh đã lưu — mở dòng để xem" data-testid="has-photo"><Icon name="image" className="text-[15px]" /></span> : null;
}
