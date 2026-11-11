// Bố cục điện thoại (<640px): đầu trang, nội dung dạng thẻ, nút nổi "Chụp", thanh dưới 5 nút
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Icon } from '@/components/ui/button';
import { hasLevel } from '@/lib/permissions';
import { useAccess } from './auth';
import { CommandPalette } from './CommandPalette';
import { findItemByPath, PHONE_CAPTURE, PHONE_HOME, PHONE_MORE_PATH } from './nav';
import { ReadOnlyBanner } from './ReadOnlyBanner';
import { useYears } from './year';

const BOTTOM = [
  { key: 'home', path: PHONE_HOME.path, icon: 'home', label: 'Tổng quan' },
  { key: 'ct', path: '/cong-trinh', icon: 'construction', label: 'Công trình' },
  { key: 'nhap', path: '/nhap-chi-phi', icon: 'add_card', label: 'Nhập' },
  { key: 'cc', path: '/cham-cong', icon: 'calendar_month', label: 'Chấm công' },
  { key: 'more', path: PHONE_MORE_PATH, icon: 'apps', label: 'Thêm' },
];
const MAIN_PATHS = BOTTOM.map((b) => b.path);

function activeBottomKey(pathname: string): string {
  if (pathname === PHONE_HOME.path) return 'home';
  if (pathname.startsWith('/cong-trinh')) return 'ct';
  if (pathname === '/nhap-chi-phi' || pathname === PHONE_CAPTURE.path) return 'nhap';
  if (pathname === '/cham-cong') return 'cc';
  return 'more';
}

export function PhoneShell() {
  const access = useAccess();
  const { label: yearText } = useYears();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  const item = findItemByPath(pathname);
  const title = pathname === PHONE_MORE_PATH ? 'Thêm' : pathname === '/doi-mat-khau' ? 'Đổi mật khẩu' : (item?.label ?? '');
  const sub =
    pathname === PHONE_MORE_PATH
      ? `${access.profile.display_name} · ${access.role.name}`
      : `Năm ${yearText} · ${access.profile.display_name}`;
  const isMain = MAIN_PATHS.includes(pathname);
  const backTo = pathname.startsWith('/cong-trinh/') ? '/cong-trinh' : pathname === PHONE_CAPTURE.path ? PHONE_HOME.path : PHONE_MORE_PATH;
  const canCapture = hasLevel(access.permissions, 'expenses', 'add');
  const showFab = canCapture && !['/nhap-chi-phi', PHONE_CAPTURE.path].includes(pathname);
  const current = activeBottomKey(pathname);

  return (
    <div data-layout="phone" className="flex h-dvh flex-col">
      <header className="flex items-center gap-2.5 border-b border-line bg-surface px-4 pt-[max(10px,env(safe-area-inset-top))] pb-3">
        {isMain ? null : (
          <Button size="icon" aria-label="Quay lại" onClick={() => navigate(backTo)}>
            <Icon name="arrow_back" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-lg font-bold">{title}</h1>
          <small className="block truncate text-xs font-medium text-muted">{sub}</small>
        </div>
        <Button size="icon" aria-label="Tìm" onClick={() => setSearchOpen(true)}>
          <Icon name="search" />
        </Button>
      </header>

      <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 pt-3.5 pb-28">
        <ReadOnlyBanner />
        <Outlet />
      </main>

      {showFab ? (
        <button
          type="button"
          onClick={() => navigate(PHONE_CAPTURE.path)}
          aria-label="Chụp hóa đơn, CCCD"
          className="fixed right-4 bottom-[calc(86px+env(safe-area-inset-bottom))] z-30 flex h-[52px] items-center gap-1.5 rounded-2xl bg-accent pr-[18px] pl-3.5 text-sm font-bold text-accent-fg shadow-card"
        >
          <Icon name="photo_camera" className="text-[24px]" />
          Chụp
        </button>
      ) : null}

      <nav
        aria-label="Thanh dưới"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface px-1 pt-1.5 pb-[calc(10px+env(safe-area-inset-bottom))]"
      >
        {BOTTOM.map((b) => (
          <NavLink
            key={b.key}
            to={b.path}
            data-bottom={b.key}
            aria-current={current === b.key ? 'page' : undefined}
            className="flex flex-col items-center gap-0.5 py-1 text-[10.5px] font-medium text-muted aria-[current=page]:font-bold aria-[current=page]:text-accent"
          >
            <Icon name={b.icon} className="text-[23px]" />
            {b.label}
          </NavLink>
        ))}
      </nav>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
