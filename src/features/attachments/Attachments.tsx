// Khối ảnh / tệp kèm chứng từ, dùng chung: phiếu chi, phiếu thu, hợp đồng chính, ảnh CCCD.
// AttachmentList = khối nằm trong form; AttachmentsButton = nút ảnh trong bảng, bấm mở bảng trượt; AttachmentsSheet = bảng trượt đó.
import { useRef, useState } from 'react';
import { useAccess } from '@/app/auth';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { ZoomableImage } from '@/components/ui/image-zoom';
import { Checkbox } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useObjectUrl } from '@/features/scan/CaptureForm';
import { useAddDoc, useDocUrl, useRemoveDoc, type AttachBucket, type AttachTarget, type Doc } from './api';

function DocItem({ bucket, path, alt, onRemove }: { bucket: AttachBucket; path: string; alt: string; onRemove?: () => void }) {
  const url = useDocUrl(bucket, path);
  const ext = path.split('.').pop();
  const remove = onRemove ? <Button size="sm" variant="ghost-danger" aria-label={`Gỡ ${alt}`} onClick={onRemove}><Icon name="delete" />Gỡ</Button> : null;
  if (url.isPending) return <div className="grid h-24 place-items-center rounded-lg bg-surface-2 text-[12.5px] text-muted">Đang tải…</div>;
  if (url.isError) return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
      <Icon name="broken_image" className="text-[18px]" />Không tải được tệp.<Button size="sm" variant="ghost" onClick={() => void url.refetch()}>Thử lại</Button>{remove}
    </div>
  );
  if (ext !== 'pdf' && ext !== 'xlsx') return (
    <div className="grid gap-1"><ZoomableImage src={url.data} alt={alt} className="max-h-[220px]" />{remove ? <div className="text-right">{remove}</div> : null}</div>
  );
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]" data-testid="doc-file">
      <Icon name={ext === 'pdf' ? 'picture_as_pdf' : 'table_view'} className="text-accent" />
      <a href={url.data} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 font-semibold text-accent">{ext === 'pdf' ? 'Mở tệp PDF' : 'Tải tệp Excel'}</a>
      {remove}
    </div>
  );
}

export type AttachProps = { target: AttachTarget; paths: readonly string[] | null | undefined; canEdit: boolean; label: string };

export function AttachmentList({ target, paths: raw, canEdit, label }: AttachProps) {
  const access = useAccess();
  const toast = useToast();
  const add = useAddDoc(), remove = useRemoveDoc();
  const input = useRef<HTMLInputElement>(null);
  const [drop, setDrop] = useState<string | null>(null);
  const paths = raw ?? [];
  const idCard = target.bucket === 'id-cards';
  const fail = (e: Error) => toast(e.message, 'error');
  if (!paths.length && !canEdit) return null;
  return (
    <div className="grid gap-2" data-testid="attachments">
      <span className="text-xs font-medium text-muted">{label}{paths.length ? ` (${paths.length})` : ''}</span>
      {paths.map((p, i) => <DocItem key={p} bucket={target.bucket} path={p} alt={`${label} ${i + 1}`} onRemove={canEdit ? () => setDrop(p) : undefined} />)}
      {canEdit ? (
        <div>
          <Button size="sm" disabled={add.isPending} data-testid="attach-add" onClick={() => input.current?.click()}>
            <Icon name="add_photo_alternate" />{add.isPending ? 'Đang lưu…' : idCard ? 'Thêm ảnh' : 'Thêm ảnh / tệp'}
          </Button>
          <input ref={input} type="file" accept={idCard ? 'image/*' : 'image/*,application/pdf,.pdf,.xlsx'} className="hidden" aria-label={`Chọn tệp: ${label}`} data-testid="attach-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) add.mutate({ target, file, companyId: access.profile.company_id }, { onSuccess: () => toast('Đã lưu ảnh / tệp'), onError: fail });
            }} />
        </div>
      ) : null}
      <ConfirmDialog open={!!drop} onOpenChange={(o) => { if (!o) setDrop(null); }} title="Gỡ ảnh / tệp?" danger busy={remove.isPending} confirmLabel="Gỡ"
        message="Ảnh / tệp sẽ bị gỡ hẳn, không vào Thùng rác."
        onConfirm={() => { if (drop) remove.mutate({ target, path: drop }, { onSuccess: () => { setDrop(null); toast('Đã gỡ'); }, onError: (e) => { setDrop(null); fail(e); } }); }} />
    </div>
  );
}

export function AttachmentsSheet({ onClose, ...p }: AttachProps & { onClose: () => void }) {
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }} title={p.label}>
      {!p.paths?.length && !p.canEdit ? <span className="text-[13px] text-muted">Chưa có ảnh / tệp.</span> : <AttachmentList {...p} />}
    </Sheet>
  );
}

/** Nút ảnh trong bảng — chưa có tệp thì ẩn. Bấm không mở dòng bên dưới. */
export function AttachmentsButton(p: AttachProps) {
  const [open, setOpen] = useState(false);
  if (!p.paths?.length && !open) return null;
  return (
    <span className="inline-flex" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Button size="icon" variant="ghost" aria-label={`Xem ${p.label.toLowerCase()}`} title={`Xem ${p.label.toLowerCase()}`} data-testid="attachments-button" onClick={() => setOpen(true)}>
        <Icon name="image" className="text-accent" />
      </Button>
      {open ? <AttachmentsSheet {...p} onClose={() => setOpen(false)} /> : null}
    </span>
  );
}

/** Màn Trợ lý AI: xem lại ảnh vừa gửi + tích "Lưu kèm" */
export function ScanDocPreview({ doc, keep, setKeep, label }: { doc: Doc | null; keep: boolean; setKeep: (v: boolean) => void; label: string }) {
  const url = useObjectUrl(doc?.ext === 'jpg' ? doc.blob : null);
  if (!doc) return null;
  return (
    <div className="grid gap-2" data-testid="scan-doc">
      {url ? <ZoomableImage src={url} alt="Ảnh vừa gửi" className="max-h-[220px]" /> : null}
      <Checkbox checked={keep} onChange={setKeep} label={label} />
    </div>
  );
}
