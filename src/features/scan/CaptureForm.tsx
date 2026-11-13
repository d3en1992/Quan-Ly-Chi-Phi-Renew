// Bước 1 của nút AI (trước là Chụp đa năng — MP.chupmenu): chụp / chọn ảnh, PDF, Excel; bấm mic để NÓI (ghi âm gửi thẳng cho AI);
// gõ lời nhắn; (không bắt buộc) chọn loại. AI tự nhận: hóa đơn, tiền ứng thầu phụ, thu tiền khách, hợp đồng / dự toán, vật tư cần mua.
import { useEffect, useRef, useState } from 'react';
import type { ScanRequestKind } from '@shared/scan';
import { Button, Icon } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ACCEPT_FILES, recordingSupported, type PreparedInput } from './api';

export const KIND_OPTIONS: { value: ScanRequestKind; label: string }[] = [
  { value: 'auto', label: 'AI tự nhận' }, { value: 'invoice', label: 'Hóa đơn' }, { value: 'advance', label: 'Tiền ứng' },
  { value: 'receipt', label: 'Thu tiền' }, { value: 'contract', label: 'Hợp đồng' }, { value: 'material_list', label: 'Vật tư cần mua' },
];
/** Nút Chụp CCCD ở Danh Bạ (lockKind) */
export const ID_CARD_OPTION = { value: 'id_card' as const, label: 'CCCD' };

/** Ghi âm tối đa 90 giây (WAV 16 kHz ≈ 2,9 MB) */
export const MAX_RECORD_SECONDS = 90;

type Props = {
  kind: ScanRequestKind;
  setKind: (k: ScanRequestKind) => void;
  /** Loại được phép theo quyền */
  allowed: Partial<Record<ScanRequestKind, boolean>>;
  note: string;
  setNote: (v: string) => void;
  /** Tệp đã chọn (ảnh / PDF / Excel) — xem trước */
  input: PreparedInput | null;
  /** Ảnh / tệp gốc vừa chọn (đang xử lý) */
  onPickFile: (f: File) => void;
  onClearFile: () => void;
  /** Ghi âm xong → gửi luôn cho AI */
  onAudio: (blob: Blob, seconds: number) => void;
  busy: boolean;
  onRead: () => void;
  /** Chỉ cho đúng 1 loại (nút Chụp CCCD ở Danh Bạ) */
  lockKind?: boolean;
};

/** Ảnh vừa chọn → link xem tạm (tự gỡ khi đổi ảnh) */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function CaptureForm({ kind, setKind, allowed, note, setNote, input, onPickFile, onClearFile, onAudio, busy, onRead, lockKind }: Props) {
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const url = useObjectUrl(input?.kind === 'image' ? input.image.blob : null);
  const pick = (f: File | undefined | null) => { if (f) onPickFile(f); };
  const canRead = !busy && !!allowed[kind] && (!!input || !!note.trim());

  return (
    <div className="grid gap-3" data-testid="capture-form">
      {!lockKind ? <Recorder disabled={busy || !allowed[kind]} onAudio={onAudio} /> : null}

      <div
        className={cn('relative grid min-h-[120px] place-items-center overflow-hidden rounded-xl border-2 border-dashed border-line bg-surface-2 text-center text-[13px] text-muted', input && 'border-solid')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
      >
        {url ? (
          <img src={url} alt="Ảnh vừa chọn" className="max-h-[320px] w-full object-contain" />
        ) : input ? (
          <div className="grid gap-1 p-4" data-testid="picked-file">
            <Icon name={input.kind === 'pdf' ? 'picture_as_pdf' : 'table_view'} className="text-[34px] text-accent" />
            <span className="break-all font-medium text-fg">{input.name}</span>
            <span className="text-[12px]">{input.kind === 'sheet' ? `Excel — đã đọc ${input.text.split('\n').length} dòng` : 'Tệp PDF'}</span>
          </div>
        ) : (
          <div className="grid gap-1 p-4">
            <Icon name="add_photo_alternate" className="text-[30px] text-accent" />
            <span>{lockKind ? 'Chụp hoặc chọn ảnh CCCD' : 'Chụp hóa đơn, ảnh chuyển khoản, tin nhắn Zalo… hoặc chọn PDF / Excel'}</span>
            <span className="text-[12px] text-faint">Trên máy tính có thể kéo tệp thả vào đây</span>
          </div>
        )}
        {input ? (
          <button type="button" aria-label="Bỏ tệp" onClick={onClearFile} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-surface/90 text-muted shadow hover:text-bad">
            <Icon name="close" className="text-[18px]" />
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => camRef.current?.click()} className="justify-center"><Icon name="photo_camera" />{input ? 'Chụp lại' : 'Chụp'}</Button>
        <Button onClick={() => pickRef.current?.click()} className="justify-center"><Icon name="upload" />{input ? 'Chọn tệp khác' : lockKind ? 'Chọn ảnh' : 'Ảnh / PDF / Excel'}</Button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Chụp ảnh" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={pickRef} type="file" accept={lockKind ? 'image/*' : ACCEPT_FILES} className="hidden" data-testid="scan-file" aria-label="Chọn tệp" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />

      {lockKind ? null : (
        <div className="grid gap-1 text-xs font-medium text-muted">
          <span>Loại (không bắt buộc — AI tự nhận)</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Loại giấy tờ">
            {KIND_OPTIONS.map((o) => (
              <button
                key={o.value} type="button" role="radio" aria-checked={kind === o.value} disabled={!allowed[o.value]}
                onClick={() => setKind(o.value)}
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-fg disabled:opacity-40 aria-checked:border-accent aria-checked:bg-accent-soft aria-checked:text-accent"
              >{o.label}</button>
            ))}
          </div>
        </div>
      )}

      <label className="grid gap-1 text-xs font-medium text-muted">
        <span>{lockKind ? 'Ghi chú cho AI' : 'Lời nhắn cho AI (gõ, hoặc dán tin nhắn Zalo)'}</span>
        <Textarea
          aria-label="Ghi chú cho AI" value={note} maxLength={4000} rows={lockKind ? 2 : 3}
          placeholder={lockKind ? 'ví dụ: CCCD thợ Hiền' : 'ví dụ: ứng Hà điện nước 5 triệu công trình A Huynh · hóa đơn copha CT A Huynh · cốp pha anh Long đưa'}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p className="m-0 text-[12px] text-muted">AI đọc rồi điền sẵn để anh kiểm tra — app không tự lưu.</p>

      <Button variant="primary" size="lg" data-testid="scan-read" disabled={!canRead} onClick={onRead} className="justify-center">
        <Icon name={busy ? 'hourglass_top' : 'auto_awesome'} />{busy ? 'AI đang đọc…' : 'Gửi cho AI'}
      </Button>
    </div>
  );
}

/** Nút mic lớn: bấm để nói, bấm lần nữa để dừng → gửi luôn. Trình duyệt không cho ghi âm → ẩn. */
function Recorder({ disabled, onAudio }: { disabled: boolean; onAudio: (blob: Blob, seconds: number) => void }) {
  const [sec, setSec] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; started: number; timer: number } | null>(null);
  useEffect(() => () => stopAll(true), []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopAll(cancel = false) {
    const r = rec.current;
    if (!r) return;
    window.clearInterval(r.timer);
    if (cancel) r.mr.ondataavailable = null;
    if (r.mr.state !== 'inactive') r.mr.stop();
    r.stream.getTracks().forEach((t) => t.stop());
    rec.current = null;
    setSec(null);
  }

  if (!recordingSupported()) return null;

  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const started = Date.now();
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        const seconds = Math.round((Date.now() - started) / 1000);
        if (chunks.length && mr.ondataavailable) onAudio(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), seconds);
      };
      const timer = window.setInterval(() => {
        const s = Math.round((Date.now() - started) / 1000);
        setSec(s);
        if (s >= MAX_RECORD_SECONDS) stopAll();
      }, 250);
      rec.current = { mr, stream, started, timer };
      setSec(0);
      mr.start();
    } catch {
      setErr('Không mở được micro — anh cho phép trình duyệt dùng micro rồi thử lại.');
    }
  };

  const on = sec !== null;
  return (
    <div className="grid justify-items-center gap-1.5 rounded-xl bg-accent-soft/40 p-3 text-center" data-testid="recorder">
      <button
        type="button" disabled={disabled && !on} onClick={() => (on ? stopAll() : void start())}
        aria-label={on ? 'Dừng nói và gửi cho AI' : 'Bấm để nói'} aria-pressed={on}
        className={cn('grid h-16 w-16 place-items-center rounded-full text-white shadow-md transition disabled:opacity-40', on ? 'animate-pulse bg-bad' : 'bg-accent')}
      >
        <Icon name={on ? 'stop' : 'mic'} className="text-[32px]" />
      </button>
      <span className="text-[13px] font-medium">{on ? `Đang nghe… ${sec}s — bấm lần nữa để gửi` : 'Bấm để nói'}</span>
      {!on ? <span className="text-[12px] text-muted">vd: “Hôm nay ứng Hà điện nước 5 triệu công trình nhà anh Nhật, chuyển khoản”</span> : null}
      {err ? <span className="text-[12px] text-bad">{err}</span> : null}
    </div>
  );
}
