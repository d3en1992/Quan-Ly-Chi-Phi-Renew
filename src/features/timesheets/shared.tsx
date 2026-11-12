// Mảnh dùng chung của tab Chấm Công: ô ngày công (1 / ½ / 0), nhãn T/P, bảng trượt phiếu lương, sao chép chữ.
import { useState } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { cycleDayUnit } from '@/lib/calc';
import { cn } from '@/lib/utils';

export const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

/** "5.5" → "5,5" */
export const c1 = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

export function dayText(v: number): string {
  if (v >= 1) return v === 1 ? '1' : c1(v);
  if (v === 0.5) return '½';
  if (v > 0) return c1(v);
  return '·';
}
export const dayTone = (v: number) => (v >= 1 ? 'bg-good-soft text-good' : v > 0 ? 'bg-warn-soft text-warn' : 'text-faint font-normal');

/** Ô ngày công: bấm đổi 1 → ½ → 0; gõ 1 / 5 (½) / 0; mũi tên trái phải để đi ô. */
export function DayCell({ value, onChange, disabled, label }: { value: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-day-cell
      disabled={disabled}
      className={cn('inline-block min-w-[30px] rounded-[5px] px-0 py-[3px] text-[13px] font-semibold focus:outline-2 focus:outline-accent disabled:cursor-default', dayTone(value))}
      onClick={() => onChange(cycleDayUnit(value))}
      onKeyDown={(e) => {
        const k = e.key;
        if (k === '1') onChange(1);
        else if (k === '5' || k === ',' || k === '.' || k.toLowerCase() === 'h') onChange(0.5);
        else if (k === '0' || k === 'Backspace' || k === 'Delete') onChange(0);
        else if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowUp' || k === 'ArrowDown') {
          const all = [...document.querySelectorAll<HTMLButtonElement>('[data-day-cell]:not(:disabled)')];
          const i = all.indexOf(e.currentTarget);
          const step = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : k === 'ArrowDown' ? 7 : -7;
          all[i + step]?.focus();
        } else return;
        e.preventDefault();
      }}
    >
      {dayText(value)}
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
