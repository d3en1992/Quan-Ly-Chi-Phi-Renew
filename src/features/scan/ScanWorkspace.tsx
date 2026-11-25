// Trợ lý AI (nút AI; trước là Chụp đa năng GĐ9) — dùng ở 3 chỗ: tab con CHỤP / AI (Nhập Chi Phí, máy tính), màn AI trên điện thoại (/chup),
// nút Chụp CCCD ở Danh Bạ. Các bước: 1. Chụp / chọn tệp / nói → 2. AI đọc → 3. Anh kiểm tra, sửa → 4. Lưu. Không bao giờ tự lưu.
// AI tự nhận: hóa đơn (chi tiết / nhanh / sổ cộng tiền), tiền ứng thầu phụ, thu tiền khách, hợp đồng / dự toán, hợp đồng thầu phụ,
// phiếu chấm công tuần (tên + công + mua lẻ → Sổ chấm công), LƯU THÔNG TIN: CCCD / danh thiếp → Danh Bạ, ảnh bảng hiệu → Danh Bạ › Cửa hàng.
import { docFromInput, type Doc } from '@/features/attachments/api';
import { useRef, useState } from 'react';
import type { ScanRequestKind, ScanResponse } from '@shared/scan';
import { useAccess } from '@/app/auth';
import { Icon } from '@/components/ui/button';
import { Card, ErrorState, LoadingState, Note } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { hasLevel } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useLists } from '@/features/expenses/shared';
import { askAssistant, audioToWav, prepareInput, type AiFile, type PreparedImage, type PreparedInput } from './api';
import { CaptureForm, type AudioClip } from './CaptureForm';
import { ImageDuplicateNotice } from './DuplicateNotice';
import type { Fingerprint } from './duplicates';
import { fingerprintInput, rememberFingerprint } from './fingerprint';
import type { Remember } from './shared';
import { ScanAdvance } from './ScanAdvance';
import { ScanContract } from './ScanContract';
import { ScanIdCard } from './ScanIdCard';
import { ScanInvoice } from './ScanInvoice';
import { ScanReceipt } from './ScanReceipt';
import { ScanShop } from './ScanShop';
import { ScanSubcontract } from './ScanSubcontract';
import { ScanTimesheet } from './ScanTimesheet';

type Props = {
  defaultKind?: ScanRequestKind; lockKind?: boolean; compact?: boolean; onSaved?: () => void;
  /** Tab Trợ lý AI trên máy tính / máy tính bảng: hiện bảng "AI làm được gì" (máy tính: cột phải, máy tính bảng: dưới khung nhập) */
  guide?: boolean;
};

const STEPS = ['1. Chụp / nói', '2. AI đọc', '3. Anh kiểm tra, sửa', '4. Lưu'];

/** Việc AI làm được + câu mẫu (bấm câu mẫu → điền vào lời nhắn, chọn sẵn loại) */
const GUIDE: { kind: Exclude<ScanRequestKind, 'auto' | 'id_card'>; icon: string; title: string; text: string; examples: string[] }[] = [
  { kind: 'invoice', icon: 'receipt_long', title: 'Hóa đơn', text: 'Chụp phiếu giao hàng, biên nhận, sổ cộng tiền → hóa đơn chi tiết (hoặc chuyển sang nhanh), lưu cả nhà cung cấp mới.', examples: ['hóa đơn copha công trình A Huynh', 'mua 10 bao xi măng 95 nghìn một bao công trình A Huynh'] },
  { kind: 'advance', icon: 'payments', title: 'Tiền ứng thầu phụ / trả NCC', text: 'Nói hoặc gửi ảnh chuyển khoản → phiếu chi tạm ứng thầu phụ, hoặc trả nợ nhà cung cấp.', examples: ['hôm nay ứng Hà điện nước 5 triệu công trình anh Huynh, chuyển khoản', 'trả sắt thép An Phú 50 triệu công trình anh Huynh'] },
  { kind: 'receipt', icon: 'savings', title: 'Thu tiền khách', text: 'Khách chuyển / đưa tiền → phiếu thu, ghi rõ chuyển khoản hay tiền mặt.', examples: ['hôm nay anh Huynh chuyển khoản 100 triệu'] },
  { kind: 'contract', icon: 'description', title: 'Hợp đồng / dự toán', text: 'Gửi PDF, ảnh hoặc Excel .xlsx → khách hàng mới, giá trị hợp đồng, diện tích móng / trệt / lầu.', examples: [] },
  { kind: 'timesheet', icon: 'calendar_month', title: 'Phiếu chấm công', text: 'Chụp phiếu chấm công tuần của cai → tên thợ, công CN – T7, tiền mua lẻ cộng cho cai; gợi ý sẵn công trình theo tổ thợ.', examples: ['chấm công công trình A Huynh'] },
  { kind: 'save_info', icon: 'contact_page', title: 'Lưu thông tin', text: 'Ảnh CCCD / danh thiếp + lời nói → lưu khách hàng, công nhân, thầu phụ, nhà cung cấp. Ảnh bảng hiệu cửa hàng → Danh Bạ › Cửa hàng (kèm ảnh mặt tiền, mặt hàng).', examples: ['lưu thông tin thầu phụ Đảng, số điện thoại 0909 123 456', 'cửa hàng này bán tôn lá đủ khổ, giá rẻ nhất Tân Phú'] },
  { kind: 'subcontract', icon: 'handshake', title: 'Hợp đồng thầu phụ', text: 'Gửi ảnh, PDF hoặc Excel hợp đồng / báo giá giao khoán → thầu phụ, công trình, giá trị, hạng mục; lưu kèm tệp.', examples: ['hợp đồng Hà điện nước công trình A Huynh 45 triệu'] },
];

function AiGuide({ allowed, onPick }: { allowed: Record<ScanRequestKind, boolean>; onPick: (k: ScanRequestKind, text: string) => void }) {
  const items = GUIDE.filter((g) => allowed[g.kind]);
  return (
    <Card className="p-4" data-testid="ai-guide">
      <h3 className="m-0 mb-3 text-sm font-bold">AI làm được gì</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {items.map((g) => (
          <div key={g.kind} className="grid content-start gap-1.5 rounded-lg border border-line-soft bg-surface-2/60 p-3">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold"><Icon name={g.icon} className="text-[19px] text-accent" />{g.title}</div>
            <p className="m-0 text-[12.5px] leading-snug text-muted">{g.text}</p>
            {g.examples.map((ex) => (
              <button key={ex} type="button" onClick={() => onPick(g.kind, ex)} title="Bấm để điền vào lời nhắn"
                className="w-fit rounded-md border border-dashed border-line px-2 py-1 text-left text-[12px] text-fg hover:border-accent hover:text-accent">
                “{ex}”
              </button>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Hàm máy chủ thử nhiều model, tối đa ~110 giây; quá 125 giây coi như mất kết nối */
const WAIT_MS = 125_000;
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise((ok, fail) => {
    const t = window.setTimeout(() => fail(new Error('AI trả lời quá chậm — thử gửi lại.')), WAIT_MS);
    p.then(ok, fail).finally(() => window.clearTimeout(t));
  });
}

export function ScanWorkspace({ defaultKind = 'auto', lockKind = false, compact = false, onSaved, guide = false }: Props) {
  const access = useAccess();
  const toast = useToast();
  const { query, lists } = useLists();
  const perms = access.permissions;
  const allowedKinds: Record<ScanRequestKind, boolean> = {
    invoice: hasLevel(perms, 'expenses', 'add'),
    advance: hasLevel(perms, 'payments', 'add'),
    receipt: hasLevel(perms, 'revenue', 'add'),
    contract: hasLevel(perms, 'revenue', 'add'),
    subcontract: hasLevel(perms, 'payables', 'add'),
    timesheet: hasLevel(perms, 'timesheets', 'add'),
    id_card: hasLevel(perms, 'contacts', 'add') && access.special.see_contact_ids,
    shop: hasLevel(perms, 'contacts', 'add'),
    save_info: false,
    auto: false,
  };
  allowedKinds.save_info = allowedKinds.id_card || allowedKinds.shop;
  allowedKinds.auto = allowedKinds.invoice || allowedKinds.advance || allowedKinds.receipt || allowedKinds.contract || allowedKinds.subcontract || allowedKinds.timesheet || allowedKinds.save_info;
  const [kind, setKind] = useState<ScanRequestKind>(allowedKinds[defaultKind] ? defaultKind : 'auto');
  const [note, setNote] = useState('');
  const [input, setInput] = useState<PreparedInput | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ resp: ScanResponse; image: PreparedImage | null; doc: Doc | null; fp: Fingerprint | null; fileNote: string } | null>(null);
  const [fp, setFp] = useState<Fingerprint | null>(null);
  const [audio, setAudio] = useState<AudioClip | null>(null);
  /** Lần gửi đang chờ; bấm "Thôi chờ" thì tăng số → kết quả về muộn bị bỏ */
  const run = useRef(0);

  const reset = () => { setResult(null); setInput(null); setFp(null); setAudio(null); };
  const done = () => { reset(); setNote(''); onSaved?.(); };

  const pickFile = async (f: File) => {
    setPreparing(true);
    try { const p = await prepareInput(f); setInput(p); setFp(null); setFp(await fingerprintInput(p)); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); } finally { setPreparing(false); }
  };

  const cancel = () => { run.current++; setBusy(false); };

  /** Gửi ảnh / tệp + ghi âm + lời nhắn. Lỗi hoặc quá lâu thì mọi thứ còn nguyên để bấm gửi lại */
  const read = async (clip: AudioClip | null = audio) => {
    const id = ++run.current;
    setBusy(true);
    try {
      const files: AiFile[] = [];
      if (input?.kind === 'image') files.push({ mime: input.image.mime, base64: input.image.base64 });
      if (input?.kind === 'pdf') files.push(input.file);
      if (clip) {
        try { files.push(await audioToWav(clip.blob)); } catch { throw new Error('Không đọc được ghi âm — nghe lại thử, hoặc gõ chữ.'); }
      }
      const resp = await withTimeout(askAssistant({ files, text: input?.kind === 'sheet' ? input.text : '', note, kind }));
      if (run.current !== id) return;
      if (resp.warning) toast(resp.warning);
      setResult({ resp, image: input?.kind === 'image' ? input.image : null, doc: docFromInput(input), fp, fileNote: input && input.kind !== 'image' && !input.store ? input.fileNote : '' });
      // CCCD: bỏ ảnh khỏi ô chọn tệp ngay (ảnh chỉ còn ở màn kiểm tra, bấm Lưu mới lên kho riêng)
      if (resp.kind === 'id_card') setInput(null);
    } catch (e) {
      if (run.current !== id) return;
      toast(`${e instanceof Error ? e.message : String(e)}${clip ? ' Ghi âm vẫn còn — bấm Gửi lại.' : ''}`, 'error');
    } finally {
      if (run.current === id) setBusy(false);
    }
  };

  const onAudio = (blob: Blob, seconds: number) => {
    if (seconds < 1) { toast('Ghi âm ngắn quá — bấm mic, nói rồi bấm lần nữa.', 'error'); return; }
    const clip = { blob, seconds };
    setAudio(clip);
    void read(clip);
  };

  const remember: Remember = (table, id) => { void rememberFingerprint(result?.fp ?? null, table, id); };

  if (!allowedKinds.auto && !(lockKind && allowedKinds[defaultKind])) {
    return <Card><Note icon="lock">Tài khoản chưa có quyền Nhập ở Chi Phí / Phiếu chi / Doanh Thu / Chấm Công / Danh Bạ nên không dùng được trợ lý AI.</Note></Card>;
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

      {result?.fileNote ? <Note icon="warning"><span data-testid="file-not-stored">{result.fileNote} Phiếu vẫn lưu bình thường, chỉ không kèm tệp.</span></Note> : null}
      <ImageDuplicateNotice fp={result ? (result.resp.kind === 'id_card' || result.resp.kind === 'shop' ? null : result.fp) : fp} />

      {!result ? (
        <div className={cn('grid gap-3', guide && 'lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-start')}>
          <Card className={cn('p-4', !compact && !guide && 'max-w-[560px]')}>
            <CaptureForm
              kind={kind} setKind={setKind} allowed={allowedKinds} note={note} setNote={setNote}
              input={input} onPickFile={(f) => void pickFile(f)} onClearFile={() => { setInput(null); setFp(null); }} onAudio={onAudio}
              audio={audio} onClearAudio={() => setAudio(null)} onCancel={cancel}
              busy={busy || preparing} onRead={() => void read()} lockKind={lockKind}
            />
          </Card>
          {guide ? <AiGuide allowed={allowedKinds} onPick={(k, t) => { setKind(k); setNote(t); }} /> : null}
        </div>
      ) : r!.kind === 'invoice' ? (
        allowedKinds.invoice ? needLists(<ScanInvoice scan={r!.invoice} image={result.image} lists={lists!} compact={compact} remember={remember} onDone={done} onRetake={reset} />) : noAccess('hóa đơn')
      ) : r!.kind === 'advance' ? (
        allowedKinds.advance ? <ScanAdvance scan={r!.advance} doc={result.doc} remember={remember} onDone={done} onRetake={reset} /> : noAccess('tiền ứng thầu phụ / trả nhà cung cấp')
      ) : r!.kind === 'receipt' ? (
        allowedKinds.receipt ? <ScanReceipt scan={r!.receipt} doc={result.doc} remember={remember} onDone={done} onRetake={reset} /> : noAccess('phiếu thu tiền khách')
      ) : r!.kind === 'timesheet' ? (
        allowedKinds.timesheet ? <ScanTimesheet scan={r!.timesheet} image={result.image} compact={compact} remember={remember} onDone={done} onRetake={reset} /> : noAccess('phiếu chấm công')
      ) : r!.kind === 'subcontract' ? (
        allowedKinds.subcontract ? <ScanSubcontract scan={r!.subcontract} doc={result.doc} remember={remember} onDone={done} onRetake={reset} /> : noAccess('hợp đồng thầu phụ')
      ) : r!.kind === 'id_card' ? (
        allowedKinds.id_card ? <ScanIdCard scan={r!.id_card} doc={result.doc} note={note} onDone={done} onRetake={reset} /> : noAccess('CCCD / thông tin người (cần quyền Nhập Danh Bạ + Xem SĐT, số CCCD)')
      ) : r!.kind === 'shop' ? (
        allowedKinds.shop ? <ScanShop scan={r!.shop} image={result.image} onDone={done} onRetake={reset} /> : noAccess('bảng hiệu cửa hàng')
      ) : (
        allowedKinds.contract ? needLists(<ScanContract scan={r!.contract} doc={result.doc} remember={remember} lists={lists!} onDone={done} onRetake={reset} />) : noAccess('hợp đồng')
      )}
    </div>
  );
}
