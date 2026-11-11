import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const base =
  'h-9 w-full min-w-0 rounded-[7px] border border-line bg-surface px-2.5 text-[13px] text-fg placeholder:text-faint focus:outline-2 focus:outline-accent disabled:bg-surface-2 disabled:text-muted';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, className)} {...props} />,
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(base, 'pr-7', className)} {...props} />,
);
Select.displayName = 'Select';

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
      {label}
    </label>
  );
}
