// Bố cục máy tính (≥1024: menu trái đầy đủ chữ) và máy tính bảng / Z Fold mở (640–1023: menu cột biểu tượng)
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAccess } from './auth';
import { CommandPalette, useCommandPaletteHotkey } from './CommandPalette';
import { canSeeItem, TRASH_ITEM, visibleGroups, type NavItem } from './nav';
import { AccountMenu, YearPicker } from './TopBarParts';
import { ReadOnlyBanner } from './ReadOnlyBanner';

function SideLink({ item, compact }: { item: NavItem; compact: boolean }) {
  const { pathname } = useLocation();
  const active = pathname === item.path || (item.key === 'congtrinh' && pathname.startsWith('/cong-trinh/'));
  return (
    <NavLink
      to={item.path}
      title={item.label}
      aria-label={compact ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      data-nav={item.key}
      className={cn(
        'flex items-center gap-2.5 rounded-[7px] text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-fg',
        compact ? 'w-11 justify-center py-[9px]' : 'w-full px-2.5 py-[7px]',
        active && 'bg-accent-soft font-semibold text-accent hover:bg-accent-soft hover:text-accent',
      )}
    >
      <Icon name={item.icon} className={compact ? 'text-[21px]' : 'text-[19px]'} />
      {compact ? null : (
        <>
          <span className="truncate">{item.label}</span>
          {item.isNew ? (
            <span className="ml-auto rounded-full bg-good-soft px-1.5 py-px text-[10px] font-bold text-good">MỚI</span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

export function DesktopShell({ compact }: { compact: boolean }) {
  const access = useAccess();
  const groups = visibleGroups(access.permissions);
  const [searchOpen, setSearchOpen] = useState(false);
  useCommandPaletteHotkey(setSearchOpen);
  const companyShort = access.company.short_name ?? access.company.name;

  return (
    <div
      data-layout={compact ? 'tablet' : 'desktop'}
      className={cn('grid h-dvh', compact ? 'grid-cols-[64px_minmax(0,1fr)]' : 'grid-cols-[236px_minmax(0,1fr)]')}
    >
      <aside
        aria-label="Menu chính"
        className={cn(
          'flex flex-col gap-0.5 overflow-y-auto border-r border-line bg-surface',
          compact ? 'items-center px-2 py-3' : 'px-2.5 py-3.5',
        )}
      >
        <div className={cn('flex items-center gap-2.5', compact ? 'pb-3' : 'px-2 pt-1 pb-3.5')}>
          <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-accent text-accent-fg">
            {access.company.logo_url ? <img src={access.company.logo_url} alt="" className="size-full object-cover" /> : <Icon name="foundation" />}
          </div>
          {compact ? null : (
            <div className="min-w-0">
              <b className="block text-sm leading-tight">{companyShort}</b>
              <small className="text-[11.5px] text-faint">Quản lý chi phí công trình</small>
            </div>
          )}
        </div>
        <nav className={cn('flex flex-col gap-0.5', compact && 'items-center')}>
          {groups.map((g) => (
            <div key={g.title} className={cn('flex flex-col gap-0.5', compact && 'items-center')}>
              {compact ? (
                <div className="mx-auto my-1.5 h-px w-8 bg-line-soft" aria-hidden="true" />
              ) : (
                <div className="px-2.5 pt-3 pb-1 text-[10.5px] font-semibold tracking-[.08em] text-faint uppercase">
                  {g.title}
                </div>
              )}
              {g.items.map((i) => (
                <SideLink key={i.key} item={i} compact={compact} />
              ))}
            </div>
          ))}
        </nav>
        <div className="flex-1" />
        {canSeeItem(access.permissions, TRASH_ITEM) ? <SideLink item={TRASH_ITEM} compact={compact} /> : null}
      </aside>

      <div className="flex min-w-0 flex-col overflow-hidden">
        <div
          className={cn(
            'flex items-center gap-3 border-b border-line bg-surface',
            compact ? 'px-4 py-2.5' : 'px-6 py-2.5',
          )}
        >
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex min-w-0 flex-[0_1_380px] items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-[7px] text-left text-[13px] text-faint"
          >
            <Icon name="search" />
            <span className="truncate">Tìm công trình, hóa đơn, công nhân…</span>
            {compact ? null : (
              <kbd className="ml-auto rounded border border-line bg-surface px-1.5 font-[inherit] text-[11px]">Ctrl K</kbd>
            )}
          </button>
          <div className="flex-1" />
          {compact ? null : (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-good">
              <i className="inline-block size-[7px] rounded-full bg-good" />
              Đã lưu
            </span>
          )}
          <YearPicker compact={compact} />
          <AccountMenu compact={compact} />
        </div>
        <main className={cn('flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto', compact ? 'px-4 pt-[18px] pb-8' : 'px-6 pt-[22px] pb-10')}>
          <ReadOnlyBanner />
          <Outlet />
        </main>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
