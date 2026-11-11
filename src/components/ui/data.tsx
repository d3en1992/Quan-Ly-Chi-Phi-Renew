// Mảnh giao diện dùng chung cho các màn có số liệu (chốt ở GĐ3, các giai đoạn sau chỉ dùng lại):
// dải số tổng (KpiStrip), thanh lọc (FilterBar + FilterSelect + SearchBox), thanh ngang (HBar),
// nhãn lãi / lỗ (ProfitPill), ô tiền (Money), phân trang (Pager), thẻ dòng trên điện thoại (MobileCard), cặp số lớn (PhoneKpis).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatMoney, formatShortMoney } from '@/lib/format';
import { Button, Icon } from './button';
import { Pill, type Tone } from './misc';

export type KpiTone = 'pos' | 'neg' | '';
export type Kpi = { label: string; value: ReactNode; sub?: ReactNode; tone?: KpiTone };

const toneText = (t?: KpiTone) => (t === 'pos' ? 'text-good' : t === 'neg' ? 'text-bad' : '');

/** Dải số tổng (.kpis của mẫu): máy tính dàn ngang, hẹp thì tự xuống hàng, điện thoại 2 cột */
export function KpiStrip({ items }: { items: (Kpi | null | false)[] }) {
  const list = items.filter(Boolean) as Kpi[];
  return (
    <div className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-[var(--r)] border border-line bg-line sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
      {list.map((k) => (
        <div key={k.label} className="min-w-0 bg-surface px-3.5 py-3">
          <small className="block truncate text-[11.5px] font-medium text-muted">{k.label}</small>
          <b className={cn('num block truncate text-[19px] leading-tight font-bold', toneText(k.tone))}>{k.value}</b>
          <span className="block min-h-[16px] truncate text-[11.5px] text-faint">{k.sub}</span>
        </div>
      ))}
    </div>
  );
}

/** Thanh lọc (.filters của mẫu) */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

export type Option = { value: string; label: string };

/** Ô lọc có nhãn nhỏ bên trái (.f của mẫu). Giá trị '' = "Tất cả". */
export function FilterSelect({
  label, value, onChange, options, allLabel = 'Tất cả', className,
}: { label: string; value: string; onChange: (v: string) => void; options: Option[]; allLabel?: string | null; className?: string }) {
  return (
    <label className={cn('inline-flex h-9 max-w-full min-w-0 items-center gap-1.5 rounded-lg border border-line bg-surface pl-2.5 text-[13px]', className)}>
      <small className="shrink-0 text-[11.5px] text-muted">{label}</small>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full max-w-[220px] min-w-0 cursor-pointer truncate rounded-lg bg-transparent pr-1.5 font-medium text-fg focus:outline-none"
      >
        {allLabel !== null ? <option value="">{allLabel}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/** Ô tìm (.f.q của mẫu) */
export function SearchBox({ value, onChange, placeholder = 'Tìm…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className={cn('inline-flex h-9 min-w-[180px] flex-1 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[13px] sm:max-w-[320px]', className)}>
      <Icon name="search" className="text-[18px] text-faint" />
      <input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-fg placeholder:text-faint focus:outline-none"
      />
    </label>
  );
}

/** Thanh ngang tỉ lệ (.bar của mẫu) */
export function HBar({ percent, tone = 'accent' }: { percent: number; tone?: 'accent' | 'good' | 'bad' }) {
  const color = tone === 'good' ? 'bg-good' : tone === 'bad' ? 'bg-bad' : 'bg-accent';
  return (
    <div className="h-2 min-w-0 overflow-hidden rounded-full bg-surface-2">
      <i className={cn('block h-full rounded-full', color)} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

/** Danh sách "tên — thanh — số" (.hb của mẫu) */
export function HBarList({ items, tone, empty = 'Không có' }: { items: { key: string; label: string; value: number; display: ReactNode }[]; tone?: 'accent' | 'good' | 'bad'; empty?: string }) {
  if (items.length === 0) return <div className="px-4 py-6 text-center text-[13px] text-muted">{empty}</div>;
  const max = Math.max(...items.map((i) => Math.abs(i.value))) || 1;
  return (
    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] items-center gap-x-3 gap-y-2.5 px-4 py-3.5 text-[13px]">
      {items.map((i) => (
        <div key={i.key} className="contents">
          <span className="truncate" title={i.label}>{i.label}</span>
          <HBar percent={(Math.abs(i.value) / max) * 100} tone={tone} />
          <b className={cn('num text-right', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : '')}>{i.display}</b>
        </div>
      ))}
    </div>
  );
}

/** Nhãn "Lãi 120 tr" / "Lỗ −35 tr" (lnPill của mẫu) */
export function ProfitPill({ value }: { value: number }) {
  const n = Math.round(value);
  return <Pill tone={n >= 0 ? 'good' : 'bad'}>{(n >= 0 ? 'Lãi ' : 'Lỗ ') + formatShortMoney(n)}</Pill>;
}

/** "+1.234" / "−1.234" */
export function signedMoney(n: number): string {
  const r = Math.round(n);
  return (r > 0 ? '+' : r < 0 ? '−' : '') + formatMoney(Math.abs(r));
}

/** Ô số tiền trong bảng: 0 → gạch ngang mờ */
export function Money({ value, signed = false, className }: { value: number; signed?: boolean; className?: string }) {
  const r = Math.round(value);
  if (!r) return <span className="text-faint">—</span>;
  return <span className={cn('num', className)}>{signed ? signedMoney(r) : r < 0 ? '−' + formatMoney(-r) : formatMoney(r)}</span>;
}

/** Chia trang phía trình duyệt cho một danh sách đã lọc */
export function usePaged<T>(rows: readonly T[], pageSize: number, resetKey: unknown) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [resetKey]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = useMemo(() => rows.slice(current * pageSize, (current + 1) * pageSize), [rows, current, pageSize]);
  return { page: current, pages, setPage, slice, from: rows.length ? current * pageSize + 1 : 0, to: Math.min(rows.length, (current + 1) * pageSize), total: rows.length };
}

export function Pager({ from, to, total, page, pages, setPage }: { from: number; to: number; total: number; page: number; pages: number; setPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="num text-[12.5px] text-muted">{from}–{to} / {total}</span>
      <Button size="sm" aria-label="Trang trước" disabled={page <= 0} onClick={() => setPage(page - 1)}><Icon name="chevron_left" /></Button>
      <Button size="sm" aria-label="Trang sau" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><Icon name="chevron_right" /></Button>
    </div>
  );
}

/** Thẻ một dòng dữ liệu trên điện thoại (.mcard của mẫu) */
export function MobileCard({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <div
      className={cn('grid gap-1 rounded-[var(--r)] border border-line bg-surface px-3.5 py-3 text-[13px]', onClick && 'cursor-pointer active:bg-surface-2')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
    >
      {children}
    </div>
  );
}
export function MobileRow({ children, meta = false }: { children: ReactNode; meta?: boolean }) {
  return <div className={cn('flex min-w-0 items-center justify-between gap-3', meta && 'text-[12px] text-muted')}>{children}</div>;
}

/** Cặp số lớn đầu màn điện thoại (.pk của mẫu); `wide` = chiếm cả hàng */
export function PhoneKpis({ items }: { items: { label: string; value: ReactNode; tone?: KpiTone; wide?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((k) => (
        <div key={k.label} className={cn('min-w-0 rounded-[var(--r)] border border-line bg-surface px-3.5 py-2.5', k.wide && 'col-span-2')}>
          <small className="block text-[11.5px] text-muted">{k.label}</small>
          <b className={cn('num block truncate text-[18px] font-bold', toneText(k.tone))}>{k.value}</b>
        </div>
      ))}
    </div>
  );
}

/** Nút chọn một trong vài mục (.seg của mẫu) */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className="rounded-md px-2.5 py-1 text-xs font-semibold text-muted aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type { Tone };
