// Tìm nhanh (Ctrl+K). GĐ1: tìm tab. Các GĐ sau thêm công trình, hóa đơn, công nhân.
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { stripVietnamese } from '@shared/username';
import { Icon } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAccess } from './auth';
import { allEntries, canSeeEntry, type NavEntry } from './nav';

const norm = (s: string) => stripVietnamese(s).toLowerCase();

export function useCommandPaletteHotkey(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const access = useAccess();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const items = useMemo(() => {
    // Có cả tab con ("Quyết toán", "Phiếu chi", "Định mức"…) để ai quen tên cũ gõ vẫn ra
    const visible = allEntries().filter((e) => canSeeEntry(access.permissions, e));
    const nq = norm(q.trim());
    return nq ? visible.filter((i) => norm(`${i.label} ${i.aka ?? ''}`).includes(nq)) : visible;
  }, [access.permissions, q]);

  const go = (item: NavEntry | undefined) => {
    if (!item) return;
    navigate(item.path);
    onOpenChange(false);
    setQ('');
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-32px)] max-w-lg -translate-x-1/2 overflow-hidden rounded-[var(--r)] border border-line bg-surface shadow-card">
          <Dialog.Title className="sr-only">Tìm nhanh</Dialog.Title>
          <Dialog.Description className="sr-only">Gõ tên tab để chuyển nhanh</Dialog.Description>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Icon name="search" className="text-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1));
                if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
                if (e.key === 'Enter') go(items[active]);
              }}
              placeholder="Tìm công trình, hóa đơn, công nhân…"
              className="h-12 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <ul className="m-0 max-h-[50vh] list-none overflow-auto p-1">
            {items.length === 0 ? <li className="p-4 text-center text-[13px] text-muted">Không thấy kết quả</li> : null}
            {items.map((i, idx) => (
              <li key={i.path}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => go(i)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px]',
                    idx === active ? 'bg-accent-soft text-accent' : 'text-fg',
                  )}
                >
                  <Icon name={i.icon} className="text-[19px]" />
                  {i.label}
                </button>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
