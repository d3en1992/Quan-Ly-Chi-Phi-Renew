// Ô gõ có gợi ý ngay bên dưới (.ac của mẫu): gõ không dấu cũng tìm ra, có dòng "+ Tạo mới".
// `SuggestPanel` = khung danh sách (lưới nhập nhanh dùng trực tiếp); `Combo` = ô nhập hoàn chỉnh cho form.
import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { filterSuggestions, findByName } from '@/features/expenses/logic';

export type SuggestItem = { id: string; name: string };
export type AnchorRect = { left: number; top: number; bottom: number; width: number };

export const rectOf = (el: Element): AnchorRect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, bottom: r.bottom, width: r.width };
};

type PanelProps = {
  anchor: AnchorRect;
  header?: string;
  items: readonly SuggestItem[];
  /** Vị trí đang tô sáng; = items.length là dòng "+ Tạo mới" */
  active: number;
  createText?: string | null;
  onPick: (index: number) => void;
};

/** Danh sách gợi ý nổi ngay dưới ô đang gõ (thiếu chỗ thì nổi phía trên). Bấm chuột không làm ô mất focus. */
export function SuggestPanel({ anchor, header, items, active, createText, onPick }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.querySelector('[data-on="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  if (items.length === 0 && !createText) return null;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const below = vh - anchor.bottom;
  const up = below < 200 && anchor.top > below;
  const width = Math.min(Math.max(anchor.width + 4, 230), vw - 16);
  const style = {
    left: Math.max(8, Math.min(anchor.left - 2, vw - width - 8)),
    width,
    maxHeight: Math.max(120, Math.min(280, (up ? anchor.top : below) - 12)),
    ...(up ? { bottom: vh - anchor.top + 2 } : { top: anchor.bottom + 2 }),
  };
  const row = 'cursor-pointer truncate rounded-[5px] px-2.5 py-1.5 data-[on="1"]:bg-accent-soft data-[on="1"]:text-accent hover:bg-surface-2';
  return (
    <div ref={ref} role="listbox" data-testid="suggest" style={style}
      className="fixed z-[70] overflow-auto rounded-lg border border-line bg-surface p-1 text-[13px] font-normal text-fg shadow-card"
      onMouseDown={(e) => e.preventDefault()}>
      {header ? <small className="block px-2.5 py-1 text-[11px] text-faint">{header}</small> : null}
      {items.map((it, i) => (
        <div key={it.id} role="option" aria-selected={i === active} data-on={i === active ? '1' : '0'} className={row} title={it.name} onClick={() => onPick(i)}>{it.name}</div>
      ))}
      {createText ? (
        <div role="option" aria-selected={active === items.length} data-on={active === items.length ? '1' : '0'} className={cn(row, 'text-accent')} onClick={() => onPick(items.length)}>
          + Tạo mới “{createText}”
        </div>
      ) : null}
    </div>
  );
}

type ComboProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (text: string) => void;
  items: readonly SuggestItem[];
  /** Tên nhóm ghi ở đầu danh sách: "Loại chi phí" */
  groupLabel?: string;
  /** Có thì hiện dòng "+ Tạo mới"; trả về tên đã tạo (đã chuẩn hóa) */
  onCreate?: (text: string) => Promise<string | void> | void;
  /** true = gõ tự do (gợi ý từ lịch sử): không tô đỏ khi không có trong danh sách, chỉ gợi ý khi đã gõ */
  free?: boolean;
  invalid?: boolean;
};

const fieldClass = 'h-9 w-full min-w-0 rounded-[7px] border border-line bg-surface px-2.5 text-[13px] text-fg placeholder:text-faint focus:outline-2 focus:outline-accent disabled:bg-surface-2 disabled:text-muted';

/** Ô chọn có gợi ý cho form: mũi tên lên / xuống để chọn, Enter / Tab để điền, Esc để đóng. Rời ô thì tự sửa về đúng tên trong danh sách. */
export function Combo({ value, onChange, items, groupLabel, onCreate, free = false, invalid, className, onBlur, onFocus, onKeyDown, ...rest }: ComboProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<{ anchor: AnchorRect; active: number } | null>(null);
  const list = open ? filterSuggestions(value, items, free ? 12 : 25) : [];
  const hideFree = free && (!value.trim() || (list.length === 1 && list[0]!.name.trim().toLowerCase() === value.trim().toLowerCase()));
  const createText = onCreate && value.trim() && !findByName(value, items) ? value.trim() : null;
  const bad = invalid ?? (!free && !!value.trim() && !findByName(value, items));

  const show = (autoPick: boolean, text: string) => {
    if (!ref.current) return;
    const has = filterSuggestions(text, items, 1).length > 0;
    setOpen({ anchor: rectOf(ref.current), active: autoPick && text.trim() && has ? 0 : -1 });
  };
  const pick = (i: number) => {
    setOpen(null);
    const it = list[i];
    if (it) onChange(it.name);
    else if (createText && onCreate) void Promise.resolve(onCreate(createText)).then((name) => { if (name) onChange(name); });
  };

  return (
    <>
      <input
        ref={ref}
        {...rest}
        autoComplete="off"
        role="combobox"
        aria-expanded={!!open}
        aria-invalid={bad || undefined}
        value={value}
        className={cn(fieldClass, bad && 'border-bad bg-bad-soft', className)}
        onChange={(e) => { onChange(e.target.value); show(true, e.target.value); }}
        onFocus={(e) => { if (!free) show(false, value); onFocus?.(e); }}
        onBlur={(e) => {
          setOpen(null);
          if (!free) { const m = findByName(value, items); if (m && m.name !== value) onChange(m.name); }
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          const max = list.length + (createText ? 1 : 0);
          if (open && !hideFree && max > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen({ ...open, active: Math.min(max - 1, open.active + 1) }); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setOpen({ ...open, active: Math.max(-1, open.active - 1) }); return; }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(null); return; }
            if ((e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) && open.active >= 0) { if (e.key === 'Enter') e.preventDefault(); pick(open.active); if (e.key === 'Enter') return; }
            else if (e.key === 'Enter') { setOpen(null); }
          } else if (e.key === 'ArrowDown' && !open && !free) { e.preventDefault(); show(false, value); return; }
          onKeyDown?.(e);
        }}
      />
      {open && !hideFree ? (
        <SuggestPanel anchor={open.anchor} header={groupLabel ? `${groupLabel} · ${list.length} kết quả` : undefined} items={list} active={open.active} createText={createText} onPick={pick} />
      ) : null}
    </>
  );
}
