// 🎤 Nói để tìm — nhận giọng nói CÓ SẴN của trình duyệt (Chrome / Android: Web Speech API, tiếng Việt), miễn phí, không qua AI.
// Chữ hiện dần vào ô tìm trong lúc nói; nói sai thì sửa tay. Trình duyệt không hỗ trợ (Firefox, một số iPhone) → ẩn nút.
import { useCallback, useEffect, useRef, useState } from 'react';

type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecCtor = new () => Rec;

const ctor = (): RecCtor | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export function useSpeech(onText: (text: string, final: boolean) => void) {
  const supported = !!ctor();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => { rec.current?.stop(); }, []);
  const start = useCallback(() => {
    const C = ctor();
    if (!C) return;
    rec.current?.abort();
    const r = new C();
    r.lang = 'vi-VN';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let text = '';
      let final = true;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i]![0]!.transcript;
        if (!e.results[i]!.isFinal) final = false;
      }
      cb.current(text.trim(), final);
    };
    r.onerror = (e) => {
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Chưa cho phép dùng micro — bấm biểu tượng ổ khóa trên thanh địa chỉ để cho phép.'
        : e.error === 'no-speech' ? 'Không nghe thấy gì — bấm 🎤 rồi nói lại.'
        : e.error === 'network' ? 'Nhận giọng nói cần mạng — kiểm tra mạng rồi thử lại.'
        : e.error === 'aborted' ? null : 'Không nhận được giọng nói — thử lại hoặc gõ chữ.');
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setError(null);
    try { r.start(); setListening(true); } catch { setListening(false); }
  }, []);

  useEffect(() => () => rec.current?.abort(), []);
  return { supported, listening, error, start, stop };
}
