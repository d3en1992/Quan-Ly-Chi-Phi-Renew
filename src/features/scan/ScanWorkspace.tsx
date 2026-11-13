// Trợ lý AI (nút AI; trước là Chụp đa năng GĐ9) — dùng ở 3 chỗ: tab con CHỤP / AI (Nhập Chi Phí, máy tính), màn AI trên điện thoại (/chup),
// nút Chụp CCCD ở Danh Bạ. Các bước: 1. Chụp / chọn tệp / nói → 2. AI đọc → 3. Anh kiểm tra, sửa → 4. Lưu. Không bao giờ tự lưu.
// AI tự nhận: hóa đơn (chi tiết / nhanh / sổ cộng tiền), tiền ứng thầu phụ, thu tiền khách, hợp đồng / dự toán, danh sách vật tư cần mua.
import { useState } from 'react';
import type { ScanRequestKind, ScanResponse } from '@shared/scan';
import { useAccess } from '@/app/auth';
import { Icon } from '@/components/ui/button';
import { Card, ErrorState, LoadingState, Note } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { hasLevel } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useLists } from '@/features/expenses/shared';
import { askAssistant, audioToWav, prepareInput, type AiFile, type PreparedImage, type PreparedInput } from './api';
import { CaptureForm } from './CaptureForm';
import { ScanAdvance } from './ScanAdvance';
import { ScanContract } from './ScanContract';
import { ScanIdCard } from './ScanIdCard';
import { ScanInvoice } from './ScanInvoice';
import { ScanMaterials } from './ScanMaterials';
import { ScanReceipt } from './ScanReceipt';

type Props = { defaultKind?: ScanRequestKind; lockKind?: boolean; compact?: boolean; onSaved?: () => void };

const STEPS = ['1. Chụp / nói', '2. AI đọc', '3. Anh kiểm tra, sửa', '4. Lưu'];

export function ScanWorkspace({ defaultKind = 'auto', lockKind = false, compact = false, onSaved }: Props) {
  const access = useAccess();
  const toast = useToast();
  const { query, lists } = useLists();
  const perms = access.permissions;
  const allowedKinds: Record<ScanRequestKind, boolean> = {
    invoice: hasLevel(perms, 'expenses', 'add'),
    advance: hasLevel(perms, 'payments', 'add'),
    receipt: hasLevel(perms, 'revenue', 'add'),
    contract: hasLevel(perms, 'revenue', 'add'),
    material_list: hasLevel(perms, 'expenses', 'add') || hasLevel(perms, 'payments', 'add'),
    id_card: hasLevel(perms, 'contacts', 'add') && access.special.see_contact_ids,
    auto: false,
  };
  allowedKinds.auto = allowedKinds.invoice || allowedKinds.advance || allowedKinds.receipt || allowedKinds.contract || allowedKinds.material_list;
  const [kind, setKind] = useState<ScanRequestKind>(allowedKinds[defaultKind] ? defaultKind : 'auto');
  const [note, setNote] = useState('');
  const [input, setInput] = useState<PreparedInput | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ resp: ScanResponse; image: PreparedImage | null } | null>(null);

  const reset = () => { setResult(null); setInput(null); };
  const done = () => { reset(); setNote(''); onSaved?.(); };

  const pickFile = async (f: File) => {
    setPreparing(true);
    try { setInput(await prepareInput(f)); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); } finally { setPreparing(false); }
  };

  const read = async (audio?: AiFile) => {
    setBusy(true);
    try {
      const files: AiFile[] = [];
      if (input?.kind === 'image') files.push({ mime: input.image.mime, base64: input.image.base64 });
      if (input?.kind === 'pdf') files.push(input.file);
      if (audio) files.push(audio);
      const resp = await askAssistant({ files, text: input?.kind === 'sheet' ? input.text : '', note, kind });
      if (resp.warning) toast(resp.warning);
      // CCCD: chỉ lưu chữ — bỏ ảnh khỏi bộ nhớ ngay khi AI đọc xong
      if (resp.kind === 'id_card') { setInput(null); setResult({ resp, image: null }); }
      else setResult({ resp, image: input?.kind === 'image' ? input.image : null });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onAudio = async (blob: Blob, seconds: number) => {
    if (seconds < 1) { toast('Ghi âm ngắn quá — bấm mic, nói rồi bấm lần nữa.', 'error'); return; }
    setBusy(true);
    let wav: AiFile;
    try { wav = await audioToWav(blob); } catch { setBusy(false); toast('Không đọc được ghi âm — thử lại, hoặc gõ chữ.', 'error'); return; }
    await read(wav);
  };

  if (!allowedKinds.auto && !(lockKind && allowedKinds[defaultKind])) {
    return <Card><Note icon="lock">Tài khoản chưa có quyền Nhập ở Chi Phí / Phiếu chi / Doanh Thu nên không dùng được trợ lý AI.</Note></Card>;
  }
  const step = result ? 2 : busy ? 1 : 0;
  const r = result?.resp;
  const noAccess = (what: string) => <Card><Note icon="lock">AI nhận ra đây là {what} nhưng tài khoản không có quyền nhập loại này.</Note></Card>;
  const needLists = (el: JSX.Element) => query.isPending ? <Card><LoadingState label="Đang tải danh mục…" /></Card>
    : !lists ? <Card><ErrorState error={query.error ?? 'Không tải được danh mục'} onRetry={() => void query.refetch()} /></Card> : el;

  return (
    <div className="grid gap-3" data-testid="scan-workspace">
      <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0 text-[12.5px]" aria-label="Các bước">
        {STEPS.map((s, i) => (
          <li key={s} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1', i < step ? 'border-good/40 bg-good-soft text-good' : i === step ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-line text-muted')}>
            {i < step ? <Icon name="check" className="text-[15px]" /> : null}{s}
          </li>
        ))}
      </ol>
      {r?.mode === 'mock' ? <Note icon="science">Đang chạy <b>giả lập</b> (chưa có key Gemini): kết quả là dữ liệu mẫu, không phải ảnh / lời vừa gửi.</Note> : null}
      {r?.transcript ? <Note icon="record_voice_over"><span data-testid="ai-transcript">AI nghe được: “{r.transcript}”</span></Note> : null}
      {r?.question ? <Note icon="help"><b data-testid="ai-question">{r.question}</b></Note> : null}

      {!result ? (
        <Card className={cn('p-4', !compact && 'max-w-[560px]')}>
          <CaptureForm
            kind={kind} setKind={setKind} allowed={allowedKinds} note={note} setNote={setNote}
            input={input} onPickFile={(f) => void pickFile(f)} onClearFile={() => setInput(null)} onAudio={(b, s) => void onAudio(b, s)}
            busy={busy || preparing} onRead={() => void read()} lockKind={lockKind}
          />
        </Card>
      ) : r!.kind === 'invoice' ? (
        allowedKinds.invoice ? needLists(<ScanInvoice scan={r!.invoice} image={result.image} lists={lists!} compact={compact} onDone={done} onRetake={reset} />) : noAccess('hóa đơn')
      ) : r!.kind === 'advance' ? (
        allowedKinds.advance ? <ScanAdvance scan={r!.advance} onDone={done} onRetake={reset} /> : noAccess('tiền ứng thầu phụ')
      ) : r!.kind === 'receipt' ? (
        allowedKinds.receipt ? <ScanReceipt scan={r!.receipt} onDone={done} onRetake={reset} /> : noAccess('phiếu thu tiền khách')
      ) : r!.kind === 'material_list' ? (
        <ScanMaterials scan={r!.material_list} onDone={done} onRetake={reset} />
      ) : r!.kind === 'id_card' ? (
        <ScanIdCard scan={r!.id_card} note={note} onDone={done} onRetake={reset} />
      ) : (
        allowedKinds.contract ? needLists(<ScanContract scan={r!.contract} lists={lists!} onDone={done} onRetake={reset} />) : noAccess('hợp đồng')
      )}
    </div>
  );
}
