// Bố cục máy tính (≥1024: menu trái đầy đủ chữ) và máy tính bảng / Z Fold mở (640–1023: menu cột biểu tượng)
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAccess } from './auth';
import { CommandPalette, useCommandPaletteHotkey } from './CommandPalette';
import { visibleTabs, type NavItem } from './nav';
import { AccountMenu, YearPicker } from './TopBarParts';
import { ReadOnlyBanner } from './ReadOnlyBanner';

function SideLink({ item, compact }: { item: NavItem; compact: boolean }) {
  const { pathname } = useLocation();
  const active = pathname === item.path || pathname.startsWith(item.path + '/');
  return (
    <NavLink
      to={item.path}
      title={item.label}
      aria-label={compact ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      data-nav={item.key}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-[7px] text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-fg',
        compact ? 'w-11 justify-center py-[9px]' : 'w-full px-2 py-[7px]',
        active && 'bg-accent-soft font-semibold text-accent hover:bg-accent-soft hover:text-accent',
      )}
    >
      <Icon name={item.icon} className={cn('shrink-0', compact ? 'text-[21px]' : 'text-[19px]')} />
      {compact ? null : <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

export function DesktopShell({ compact }: { compact: boolean }) {
  const access = useAccess();
  const tabs = visibleTabs(access.permissions);
  // Cài Đặt nằm riêng ở cuối menu
  const main = tabs.filter((t) => t.key !== 'caidat');
  const settings = tabs.find((t) => t.key === 'caidat');
  const [searchOpen, setSearchOpen] = useState(false);
  useCommandPaletteHotkey(setSearchOpen);
  const companyShort = access.company.short_name ?? access.company.name;

  return (
    <div
      data-layout={compact ? 'tablet' : 'desktop'}
      className={cn('grid h-dvh', compact ? 'grid-cols-[64px_minmax(0,1fr)]' : 'grid-cols-[200px_minmax(0,1fr)]')}
    >
      <aside
        aria-label="Menu chính"
        className={cn(
          'flex flex-col gap-0.5 overflow-y-auto border-r border-line bg-surface',
          compact ? 'items-center px-2 py-3' : 'px-2 py-3.5',
        )}
      >
        <div className={cn('flex items-center', compact ? 'gap-2.5 pb-3' : 'gap-2 px-1.5 pt-1 pb-3.5')}>
          {/* Logo công ty (Danh mục) nếu có, không thì logo app mới (cùng ảnh với icon tab / icon cài app) */}
          <img src={access.company.logo_url || '/pwa-192x192.png'} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
          {compact ? null : (
            <div className="min-w-0">
              <b className="block truncate text-sm leading-tight" title={companyShort}>{companyShort}</b>
              <small className="block truncate text-[10.5px] text-faint" title="Quản lý chi phí công trình">Quản lý chi phí công trình</small>
            </div>
          )}
        </div>
        <nav className={cn('flex flex-col gap-0.5', compact && 'items-center')}>
          {main.map((i) => (
            <SideLink key={i.key} item={i} compact={compact} />
          ))}
        </nav>
        <div className="flex-1" />
        {settings ? <SideLink item={settings} compact={compact} /> : null}
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
