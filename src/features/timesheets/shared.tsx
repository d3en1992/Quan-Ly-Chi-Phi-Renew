// Mảnh dùng chung của tab Chấm Công: ô ngày công (1 / ½ / 0 / số lẻ gõ tay), nhãn T/P, bảng trượt phiếu lương, sao chép chữ.
import { useRef, useState } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { cycleDayUnit, parseDayUnit } from '@/lib/calc';
import { cn } from '@/lib/utils';

export const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

/** Số công kiểu Việt: 5.5 → "5,5", 1.25 → "1,25" (tối đa 2 số lẻ) */
export const cDay = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export function dayText(v: number): string {
  if (v >= 1) return v === 1 ? '1' : cDay(v);
  if (v === 0.5) return '½';
  if (v > 0) return cDay(v);
  return '·';
}
export const dayTone = (v: number) => (v >= 1 ? 'bg-good-soft text-good' : v > 0 ? 'bg-warn-soft text-warn' : 'text-faint font-normal');

const DAY_ERROR = 'Ô ngày công chỉ nhận số ≥ 0 (vd 1 · 0,5 · 1,3) — không nhận số âm hay chữ';

/**
 * Ô ngày công: bấm đổi 1 → ½ → 0; gõ số (chấm hoặc phẩy, số lẻ, không giới hạn trên) rồi Enter / Tab / mũi tên / bấm ra ngoài
 * để nhận; đúng chữ "5" một mình = nửa công; Esc bỏ; H = nửa công; Backspace / Delete khi chưa gõ = 0.
 */
export function DayCell({ value, onChange, disabled, label }: { value: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  const toast = useToast();
  const [buf, setBufState] = useState<string | null>(null);
  const bufRef = useRef<string | null>(null); // giữ bản mới nhất: mũi tên nhận rồi rời ô → onBlur không nhận lần 2
  const setBuf = (v: string | null) => { bufRef.current = v; setBufState(v); };
  const commit = (): boolean => {
    const cur = bufRef.current;
    if (cur === null) return true;
    const n = parseDayUnit(cur);
    setBuf(null);
    if (n === null) { toast(DAY_ERROR, 'error'); return false; }
    onChange(n);
    return true;
  };
  return (
    <button
      type="button"
      aria-label={label}
      data-day-cell
      disabled={disabled}
      className={cn('inline-block min-w-[34px] rounded-[5px] px-0.5 py-[3px] text-[13px] font-semibold focus:outline-2 focus:outline-accent disabled:cursor-default',
        buf !== null ? 'bg-surface text-fg outline-2 outline-accent' : dayTone(value))}
      onClick={() => { if (bufRef.current !== null) commit(); else onChange(cycleDayUnit(value)); }}
      onBlur={() => { commit(); }}
      onKeyDown={(e) => {
        const k = e.key;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (k === 'Enter') { commit(); }
        else if (k === 'Tab') { commit(); return; }
        else if (k === 'Escape') { if (bufRef.current === null) return; setBuf(null); }
        else if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowUp' || k === 'ArrowDown') {
          commit();
          const all = [...document.querySelectorAll<HTMLButtonElement>('[data-day-cell]:not(:disabled)')];
          const i = all.indexOf(e.currentTarget);
          const step = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : k === 'ArrowDown' ? 7 : -7;
          all[i + step]?.focus();
        } else if (k === 'Backspace') {
          if (bufRef.current === null) onChange(0); else setBuf(bufRef.current.slice(0, -1));
        } else if (k === 'Delete') { setBuf(null); onChange(0); }
        else if (bufRef.current === null && k.toLowerCase() === 'h') onChange(0.5);
        else if (k.length === 1 && k !== ' ') {
          // số, dấu chấm / phẩy / trừ hoặc chữ: gom vào ô; chữ / số âm sẽ bị báo lỗi khi nhận
          setBuf((bufRef.current ?? '') + k);
        } else return;
        e.preventDefault();
      }}
    >
      {buf !== null ? (buf || ' ') : dayText(value)}
    </button>
  );
}

export function RoleTag({ role }: { role: string | null | undefined }) {
  if (!role) return <span className="text-faint">—</span>;
  const tone = role === 'C' ? 'bg-accent-soft text-accent' : role === 'T' ? 'bg-good-soft text-good' : 'bg-surface-2 text-muted';
  return <span className={cn('inline-block min-w-[22px] rounded-md px-1.5 py-px text-center text-[11.5px] font-bold', tone)} title={role === 'C' ? 'Chính' : role === 'T' ? 'Thợ' : 'Phụ'}>{role}</span>;
}

/** Sao chép chữ; trình duyệt chặn clipboard thì dùng execCommand('copy') (`_ccCopyText`) */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* thử cách dưới */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

/** Bảng trượt hiện phiếu lương dạng chữ + nút sao chép (dán vào Zalo) */
export function PayslipSheet({ text, title, onClose }: { text: string | null; title: string; onClose: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(text ?? '');
  const [src, setSrc] = useState(text);
  if (src !== text) { setSrc(text); setValue(text ?? ''); } // phiếu mới → nạp lại ngay trong lần vẽ này
  const copy = async () => {
    const ok = await copyText(value);
    toast(ok ? 'Đã sao chép phiếu lương — dán vào Zalo' : 'Trình duyệt không cho sao chép tự động — bôi đen rồi sao chép tay', ok ? 'ok' : 'error');
  };
  return (
    <Sheet open={text !== null} onOpenChange={(o) => { if (!o) onClose(); }} title={title}
      footer={<><Button onClick={onClose}>Đóng</Button><div className="flex-1" /><Button variant="primary" onClick={() => void copy()}><Icon name="content_copy" />Sao chép</Button></>}>
      <textarea aria-label="Phiếu lương" data-testid="payslip-text" value={value} onChange={(e) => setValue(e.target.value)}
        className="num min-h-[60vh] w-full resize-y rounded-lg border border-line bg-surface-2 p-3 text-[13px] leading-relaxed text-fg focus:outline-2 focus:outline-accent" />
    </Sheet>
  );
}

/** Điện thoại (MP.cc): ô gõ số công một ngày — bàn phím số, nhận khi rời ô; sai thì báo lỗi và trả lại số cũ */
export function PhoneDayInput({ value, onChange, disabled, label }: { value: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  const toast = useToast();
  const shown = value ? cDay(value) : '';
  const [text, setText] = useState(shown);
  const [src, setSrc] = useState(value);
  if (src !== value) { setSrc(value); setText(shown); }
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      disabled={disabled}
      value={text}
      placeholder="0"
      className="num h-9 w-full min-w-0 rounded-lg border border-line bg-surface px-1 text-center text-[13px] text-fg focus:outline-2 focus:outline-accent"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = parseDayUnit(text);
        if (n === null) { toast(DAY_ERROR, 'error'); setText(shown); return; }
        if (n !== value) onChange(n); else setText(shown);
      }}
    />
  );
}
