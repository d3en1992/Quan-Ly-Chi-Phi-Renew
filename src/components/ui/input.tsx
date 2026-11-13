import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { parseMoneyDigits } from '@/lib/calc';

const base =
  'h-9 w-full min-w-0 rounded-[7px] border border-line bg-surface px-2.5 text-[13px] text-fg placeholder:text-faint focus:outline-2 focus:outline-accent disabled:bg-surface-2 disabled:text-muted';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, className)} {...props} />,
);
Input.displayName = 'Input';

/** Ô chữ nhiều dòng (lời nhắn cho AI, dán tin nhắn Zalo) */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(base, 'h-auto min-h-[72px] resize-y py-2 leading-snug', className)} {...props} />,
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(base, 'pr-7', className)} {...props} />,
);
Select.displayName = 'Select';

/** Ô tiền: chỉ nhận chữ số, tự thêm dấu chấm hàng nghìn (không nhận gõ tắt "1tr"). Giá trị = số đồng, trống = 0. */
export const MoneyInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number; onChange: (v: number) => void }>(
  ({ className, value, onChange, ...props }, ref) => (
    <input
      ref={ref}
      inputMode="numeric"
      autoComplete="off"
      className={cn(base, 'num text-right', className)}
      value={value ? formatMoney(value) : ''}
      onChange={(e) => onChange(parseMoneyDigits(e.target.value))}
      placeholder="0"
      {...props}
    />
  ),
);
MoneyInput.displayName = 'MoneyInput';

/** Ô có nhãn (giống .fl của mẫu) */
export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('grid min-w-0 content-start gap-1 text-xs font-medium text-muted', className)}>
      <span>{label}</span>
      {children}
      {hint ? <span className="text-[11.5px] font-normal text-faint">{hint}</span> : null}
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-fg">
      <input
        type="checkbox"
        className="size-4 accent-[var(--accent)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {/* Bọc chữ trong 1 khối: nhãn có chữ đậm / nhiều đoạn không bị tách thành nhiều cột khi xuống dòng */}
      <span className="min-w-0">{label}</span>
    </label>
  );
}
