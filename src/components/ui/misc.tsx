// Các mảnh giao diện nhỏ theo mẫu: thẻ, nhãn (pill), tiêu đề trang, subtab, ghi chú, trạng thái tải / trống / lỗi
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button, Icon } from './button';

export type Tone = 'good' | 'bad' | 'warn' | 'accent' | 'neutral';
const toneClass: Record<Tone, string> = {
  good: 'bg-good-soft text-good',
  bad: 'bg-bad-soft text-bad',
  warn: 'bg-warn-soft text-warn',
  accent: 'bg-accent-soft text-accent',
  neutral: 'bg-surface-2 text-muted',
};

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap',
        toneClass[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('min-w-0 rounded-[var(--r)] border border-line bg-surface', className)}>{children}</section>;
}

export function CardHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
      <h3 className="m-0 text-sm font-bold">{title}</h3>
      {sub ? <small className="text-muted">{sub}</small> : null}
      <div className="flex-1" />
      {actions}
    </header>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h2 className="m-0 text-[21px] font-bold tracking-[-.015em]">{title}</h2>
        {sub ? <p className="mt-0.5 mb-0 text-[13px] text-muted">{sub}</p> : null}
      </div>
      <div className="flex-1" />
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Tab con. Điện thoại: không xuống dòng (cuộn ngang trong dải tab), hiện nhãn ngắn `short` nếu có — tên đầy đủ vẫn ở aria-label. */
export function SubTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; short?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="no-scrollbar flex shrink-0 gap-0.5 overflow-x-auto border-b border-line sm:flex-wrap sm:gap-1 sm:overflow-visible">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          aria-selected={value === t.key}
          aria-label={t.short ? t.label : undefined}
          onClick={() => onChange(t.key)}
          className="-mb-px shrink-0 border-b-2 border-transparent px-2 py-2 text-[12.5px] font-semibold whitespace-nowrap text-muted aria-selected:border-accent aria-selected:text-accent sm:px-3 sm:text-[13px] sm:tracking-[.02em]"
        >
          {t.short ? (
            <>
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </>
          ) : (
            t.label
          )}
        </button>
      ))}
    </div>
  );
}

export function Note({ children, icon = 'info' }: { children: ReactNode; icon?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2.5 text-[12.5px] text-fg">
      <Icon name={icon} className="text-[18px] text-accent" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function LoadingState({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 p-8 text-[13px] text-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-1 p-8 text-center">
      <Icon name={icon} className="text-[32px] text-faint" />
      <b className="text-sm">{title}</b>
      {children ? <div className="text-[13px] text-muted">{children}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="grid justify-items-center gap-2 p-8 text-center">
      <Icon name="error" className="text-[32px] text-bad" />
      <b className="text-sm">Có lỗi khi tải dữ liệu</b>
      <div className="max-w-md text-[13px] break-words text-muted">{msg}</div>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          <Icon name="refresh" />
          Thử lại
        </Button>
      ) : null}
    </div>
  );
}
