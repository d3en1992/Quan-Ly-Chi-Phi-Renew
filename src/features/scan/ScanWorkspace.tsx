// Chụp đa năng (GĐ9) — dùng ở 3 chỗ: tab con CHỤP HÓA ĐƠN (Nhập Chi Phí, máy tính), màn Chụp trên điện thoại (/chup),
// nút Chụp CCCD ở Danh Bạ. Các bước: 1. Chụp / chọn ảnh → 2. AI đọc → 3. Anh kiểm tra, sửa → 4. Lưu. Không bao giờ tự lưu.
import { useState } from 'react';
import type { ScanRequestKind, ScanResponse } from '@shared/scan';
import { useAccess } from '@/app/auth';
import { Icon } from '@/components/ui/button';
import { Card, ErrorState, LoadingState, Note } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { hasLevel } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useLists } from '@/features/expenses/shared';
import { prepareImage, scanDocument, type PreparedImage } from './api';
import { CaptureForm } from './CaptureForm';
import { ScanContract } from './ScanContract';
import { ScanIdCard } from './ScanIdCard';
import { ScanInvoice } from './ScanInvoice';

type Props = { defaultKind?: ScanRequestKind; lockKind?: boolean; compact?: boolean; onSaved?: () => void };

const STEPS = ['1. Chụp / chọn ảnh', '2. AI đọc', '3. Anh kiểm tra, sửa', '4. Lưu'];

export function ScanWorkspace({ defaultKind = 'auto', lockKind = false, compact = false, onSaved }: Props) {
  const access = useAccess();
  const toast = useToast();
  const { query, lists } = useLists();
  const perms = access.permissions;
  const allowedKinds: Record<ScanRequestKind, boolean> = {
    invoice: hasLevel(perms, 'expenses', 'add'),
    id_card: hasLevel(perms, 'contacts', 'add') && access.special.see_contact_ids,
    contract: hasLevel(perms, 'revenue', 'add'),
    auto: false,
  };
  allowedKinds.auto = allowedKinds.invoice || allowedKinds.id_card || allowedKinds.contract;
  const [kind, setKind] = useState<ScanRequestKind>(allowedKinds[defaultKind] ? defaultKind : 'auto');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ resp: ScanResponse; image: PreparedImage | null } | null>(null);

  const reset = () => { setResult(null); setFile(null); };
  const done = () => { reset(); setNote(''); onSaved?.(); };

  const read = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const image = await prepareImage(file);
      const resp = await scanDocument({ image, note, kind });
      if (resp.warning) toast(resp.warning);
      // CCCD: chỉ lưu chữ — bỏ ảnh khỏi bộ nhớ ngay khi AI đọc xong
      if (resp.kind === 'id_card') { setFile(null); setResult({ resp, image: null }); }
      else setResult({ resp, image });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!allowedKinds.auto) {
    return <Card><Note icon="lock">Tài khoản chưa có quyền Nhập ở Nhập Chi Phí / Danh Bạ / Doanh Thu nên không dùng được chức năng chụp.</Note></Card>;
  }
  const step = result ? 2 : busy ? 1 : 0;

  return (
    <div className="grid gap-3" data-testid="scan-workspace">
      <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0 text-[12.5px]" aria-label="Các bước">
        {STEPS.map((s, i) => (
          <li key={s} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1', i < step ? 'border-good/40 bg-good-soft text-good' : i === step ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-line text-muted')}>
            {i < step ? <Icon name="check" className="text-[15px]" /> : null}{s}
          </li>
        ))}
      </ol>
      {result?.resp.mode === 'mock' ? <Note icon="science">Đang chạy <b>giả lập</b> (chưa có key Gemini): kết quả là dữ liệu mẫu, không phải ảnh vừa chụp.</Note> : null}

      {!result ? (
        <Card className={cn('p-4', !compact && 'max-w-[560px]')}>
          <CaptureForm kind={kind} setKind={setKind} allowed={allowedKinds} note={note} setNote={setNote} file={file} setFile={setFile} busy={busy} onRead={() => void read()} lockKind={lockKind} />
        </Card>
      ) : result.resp.kind === 'invoice' ? (
        query.isPending ? <Card><LoadingState label="Đang tải danh mục…" /></Card>
          : !lists ? <Card><ErrorState error={query.error ?? 'Không tải được danh mục'} onRetry={() => void query.refetch()} /></Card>
          : allowedKinds.invoice ? <ScanInvoice scan={result.resp.invoice} image={result.image} lists={lists} compact={compact} onDone={done} onRetake={reset} />
          : <Card><Note icon="lock">Ảnh này là hóa đơn nhưng tài khoản không có quyền Nhập chi phí.</Note></Card>
      ) : result.resp.kind === 'id_card' ? (
        <ScanIdCard scan={result.resp.id_card} note={note} onDone={done} onRetake={reset} />
      ) : !lists ? (
        <Card><LoadingState label="Đang tải danh mục…" /></Card>
      ) : (
        <ScanContract scan={result.resp.contract} lists={lists} onDone={done} onRetake={reset} />
      )}
    </div>
  );
}
