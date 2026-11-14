// Trợ lý AI (nút AI; trước là Chụp đa năng GĐ9) — dùng ở 3 chỗ: tab con CHỤP / AI (Nhập Chi Phí, máy tính), màn AI trên điện thoại (/chup),
// nút Chụp CCCD ở Danh Bạ. Các bước: 1. Chụp / chọn tệp / nói → 2. AI đọc → 3. Anh kiểm tra, sửa → 4. Lưu. Không bao giờ tự lưu.
// AI tự nhận: hóa đơn (chi tiết / nhanh / sổ cộng tiền), tiền ứng thầu phụ, thu tiền khách, hợp đồng / dự toán, danh sách vật tư cần mua,
// phiếu chấm công tuần (tên + công + mua lẻ → Sổ chấm công), LƯU THÔNG TIN: CCCD / danh thiếp → Danh Bạ, ảnh bảng hiệu → Danh Bạ › Cửa hàng.
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
import { ScanShop } from './ScanShop';
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
  { kind: 'material_list', icon: 'checklist', title: 'Vật tư cần mua', text: 'Ảnh tin nhắn Zalo của thợ, chữ cai ghi trên ván → bảng tên vật tư + số lượng để copy gửi cửa hàng.', examples: ['cốp pha anh Long đưa'] },
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
    material_list: hasLevel(perms, 'expenses', 'add') || hasLevel(perms, 'payments', 'add'),
    timesheet: hasLevel(perms, 'timesheets', 'add'),
    id_card: hasLevel(perms, 'contacts', 'add') && access.special.see_contact_ids,
    shop: hasLevel(perms, 'contacts', 'add'),
    save_info: false,
    auto: false,
  };
  allowedKinds.save_info = allowedKinds.id_card || allowedKinds.shop;
  allowedKinds.auto = allowedKinds.invoice || allowedKinds.advance || allowedKinds.receipt || allowedKinds.contract || allowedKinds.material_list || allowedKinds.timesheet || allowedKinds.save_info;
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

      {!result ? (
        <div className={cn('grid gap-3', guide && 'lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-start')}>
          <Card className={cn('p-4', !compact && !guide && 'max-w-[560px]')}>
            <CaptureForm
              kind={kind} setKind={setKind} allowed={allowedKinds} note={note} setNote={setNote}
              input={input} onPickFile={(f) => void pickFile(f)} onClearFile={() => setInput(null)} onAudio={(b, s) => void onAudio(b, s)}
              busy={busy || preparing} onRead={() => void read()} lockKind={lockKind}
            />
          </Card>
          {guide ? <AiGuide allowed={allowedKinds} onPick={(k, t) => { setKind(k); setNote(t); }} /> : null}
        </div>
      ) : r!.kind === 'invoice' ? (
        allowedKinds.invoice ? needLists(<ScanInvoice scan={r!.invoice} image={result.image} lists={lists!} compact={compact} onDone={done} onRetake={reset} />) : noAccess('hóa đơn')
      ) : r!.kind === 'advance' ? (
        allowedKinds.advance ? <ScanAdvance scan={r!.advance} onDone={done} onRetake={reset} /> : noAccess('tiền ứng thầu phụ / trả nhà cung cấp')
      ) : r!.kind === 'receipt' ? (
        allowedKinds.receipt ? <ScanReceipt scan={r!.receipt} onDone={done} onRetake={reset} /> : noAccess('phiếu thu tiền khách')
      ) : r!.kind === 'timesheet' ? (
        allowedKinds.timesheet ? <ScanTimesheet scan={r!.timesheet} image={result.image} compact={compact} onDone={done} onRetake={reset} /> : noAccess('phiếu chấm công')
      ) : r!.kind === 'material_list' ? (
        <ScanMaterials scan={r!.material_list} onDone={done} onRetake={reset} />
      ) : r!.kind === 'id_card' ? (
        allowedKinds.id_card ? <ScanIdCard scan={r!.id_card} note={note} onDone={done} onRetake={reset} /> : noAccess('CCCD / thông tin người (cần quyền Nhập Danh Bạ + Xem SĐT, số CCCD)')
      ) : r!.kind === 'shop' ? (
        allowedKinds.shop ? <ScanShop scan={r!.shop} image={result.image} onDone={done} onRetake={reset} /> : noAccess('bảng hiệu cửa hàng')
      ) : (
        allowedKinds.contract ? needLists(<ScanContract scan={r!.contract} lists={lists!} onDone={done} onRetake={reset} />) : noAccess('hợp đồng')
      )}
    </div>
  );
}
