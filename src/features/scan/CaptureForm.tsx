// Bước 1 của Chụp đa năng (MP.chupmenu): chụp / chọn ảnh, chọn loại giấy tờ, ghi chú cho AI (gõ hoặc bấm mic), bấm Đọc.
import { useEffect, useRef, useState } from 'react';
import type { ScanRequestKind } from '@shared/scan';
import { Button, Icon } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { speechSupported } from './api';

export const KIND_OPTIONS: { value: ScanRequestKind; label: string }[] = [
  { value: 'auto', label: 'AI tự nhận' }, { value: 'invoice', label: 'Hóa đơn' }, { value: 'id_card', label: 'CCCD' }, { value: 'contract', label: 'Hợp đồng' },
];

type Props = {
  kind: ScanRequestKind;
  setKind: (k: ScanRequestKind) => void;
  /** Loại được phép theo quyền */
  allowed: Record<ScanRequestKind, boolean>;
  note: string;
  setNote: (v: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
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

export function CaptureForm({ kind, setKind, allowed, note, setNote, file, setFile, busy, onRead, lockKind }: Props) {
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const url = useObjectUrl(file);
  const onPick = (f: File | undefined | null) => { if (f) setFile(f); };

  return (
    <div className="grid gap-3" data-testid="capture-form">
      <div
        className={cn('relative grid min-h-[200px] place-items-center overflow-hidden rounded-xl border-2 border-dashed border-line bg-surface-2 text-center text-[13px] text-muted', url && 'border-solid')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files[0]); }}
      >
        {url ? (
          <img src={url} alt="Ảnh vừa chọn" className="max-h-[320px] w-full object-contain" />
        ) : (
          <div className="grid gap-1 p-4">
            <Icon name="photo_camera" className="text-[34px] text-accent" />
            <span>Chụp ảnh hoặc chọn ảnh có sẵn</span>
            <span className="text-[12px] text-faint">Trên máy tính có thể kéo ảnh thả vào đây</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => camRef.current?.click()} className="justify-center"><Icon name="photo_camera" />{file ? 'Chụp lại' : 'Chụp'}</Button>
        <Button onClick={() => pickRef.current?.click()} className="justify-center"><Icon name="upload" />{file ? 'Chọn ảnh khác' : 'Chọn ảnh'}</Button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Chụp ảnh" onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={pickRef} type="file" accept="image/*" className="hidden" data-testid="scan-file" aria-label="Chọn ảnh" onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} />

      {lockKind ? null : (
        <div className="grid gap-1 text-xs font-medium text-muted">
          <span>Đây là</span>
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
        <span>Ghi chú cho AI (gõ hoặc bấm mic để nói)</span>
        <span className="flex gap-1.5">
          <Input aria-label="Ghi chú cho AI" value={note} maxLength={500} placeholder={kind === 'id_card' ? 'ví dụ: CCCD thợ Hiền' : 'ví dụ: hóa đơn copha, công trình A Huynh, Lam mua'} onChange={(e) => setNote(e.target.value)} />
          <VoiceButton onText={(t) => setNote(note ? `${note} ${t}` : t)} />
        </span>
      </label>
      <p className="m-0 text-[12px] text-muted">AI dùng ghi chú để chọn sẵn công trình, loại chi phí, người mua. Anh luôn kiểm tra lại trước khi lưu — app không tự lưu.</p>

      <Button variant="primary" size="lg" data-testid="scan-read" disabled={!file || busy || !allowed[kind]} onClick={onRead} className="justify-center">
        <Icon name={busy ? 'hourglass_top' : 'auto_awesome'} />{busy ? 'AI đang đọc…' : 'Đọc ảnh bằng AI'}
      </Button>
    </div>
  );
}

type Recognition = { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

/** Nút mic (Web Speech API, tiếng Việt). Trình duyệt không hỗ trợ → không hiện nút. */
export function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const rec = useRef<Recognition | null>(null);
  useEffect(() => () => rec.current?.stop(), []);
  if (!speechSupported()) return null;
  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    const w = window as unknown as Record<string, new () => Recognition>;
    const R = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!R) return;
    const r = new R();
    r.lang = 'vi-VN'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript?.trim(); if (t) onText(t); };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    setOn(true);
    r.start();
  };
  return (
    <Button size="icon" aria-label={on ? 'Dừng ghi âm' : 'Nói ghi chú'} aria-pressed={on} onClick={toggle} className={cn('shrink-0', on && '!border-bad !text-bad')}>
      <Icon name={on ? 'stop_circle' : 'mic'} />
    </Button>
  );
}
