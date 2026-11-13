// Bố cục điện thoại (<640px): đầu trang (tên + chọn năm), nội dung dạng thẻ, nút tròn "Chụp", thanh dưới 5 nút
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Icon } from '@/components/ui/button';
import { hasLevel } from '@/lib/permissions';
import { useAccess } from './auth';
import { CommandPalette } from './CommandPalette';
import { findByPath, pathOfSub, PHONE_CAPTURE, PHONE_HOME, PHONE_MORE_PATH } from './nav';
import { ReadOnlyBanner } from './ReadOnlyBanner';
import { YearPicker } from './TopBarParts';

const BOTTOM = [
  { key: 'home', path: PHONE_HOME.path, icon: 'home', label: 'Tổng quan' },
  { key: 'ct', path: '/cong-trinh', icon: 'construction', label: 'Công trình' },
  { key: 'nhap', path: pathOfSub('nhap'), icon: 'add_card', label: 'Nhập' },
  { key: 'cc', path: '/cham-cong', icon: 'calendar_month', label: 'Chấm công' },
  { key: 'more', path: PHONE_MORE_PATH, icon: 'apps', label: 'Thêm' },
];
const MAIN_PATHS = BOTTOM.map((b) => b.path);

function activeBottomKey(pathname: string): string {
  if (pathname === PHONE_HOME.path) return 'home';
  if (pathname.startsWith('/cong-trinh')) return 'ct';
  if (pathname === pathOfSub('nhap') || pathname === PHONE_CAPTURE.path) return 'nhap';
  if (pathname === '/cham-cong') return 'cc';
  return 'more';
}

export function PhoneShell() {
  const access = useAccess();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  const found = findByPath(pathname);
  // Tab con "Nhập" ở thanh dưới: tiêu đề là "Nhập chi phí"; các tab con khác: tên tab (dải tab con nằm ngay dưới)
  const title = pathname === PHONE_MORE_PATH ? 'Thêm' : pathname === '/doi-mat-khau' ? 'Đổi mật khẩu'
    : found?.sub?.key === 'nhap' ? 'Nhập chi phí' : (found?.item.label ?? '');
  // Trang Thêm: tên + vai trò; trang khác: ô chọn năm ngay trên đầu (điện thoại trước đây không đổi được năm)
  const isMore = pathname === PHONE_MORE_PATH;
  const isMain = MAIN_PATHS.includes(pathname);
  const backTo = pathname.startsWith('/cong-trinh/') ? '/cong-trinh' : pathname === PHONE_CAPTURE.path ? PHONE_HOME.path : PHONE_MORE_PATH;
  const canCapture = (['expenses', 'payments', 'revenue'] as const).some((m) => hasLevel(access.permissions, m, 'add'));
  // Nút AI chỉ hiện ở màn xem số (che ít nhất); màn nhập / chấm công / danh bạ có nút riêng
  const showFab = canCapture && (pathname === PHONE_HOME.path || pathname === '/cong-trinh' || pathname === pathOfSub('tracuu'));
  const current = activeBottomKey(pathname);

  return (
    <div data-layout="phone" className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-3.5 pt-[max(8px,env(safe-area-inset-top))] pb-2">
        {isMain ? null : (
          <Button size="icon" aria-label="Quay lại" onClick={() => navigate(backTo)}>
            <Icon name="arrow_back" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-[17px] leading-tight font-bold">{title}</h1>
          {isMore ? <small className="block truncate text-xs font-medium text-muted">{access.profile.display_name} · {access.role.name}</small> : null}
        </div>
        {isMore ? null : <YearPicker compact tiny />}
        <Button size="icon" aria-label="Tìm" onClick={() => setSearchOpen(true)}>
          <Icon name="search" />
        </Button>
      </header>

      {/* [&>*]:shrink-0 — khung là cột co giãn có cuộn: không có dòng này thì nút / khối cao cố định (h-12…) bị bóp
          còn bằng chiều cao chữ khi trang dài (nút "Lưu chi phí" từng bị dẹp vì vậy) */}
      <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 pt-3 pb-24 [&>*]:shrink-0">
        <ReadOnlyBanner />
        <Outlet />
      </main>

      {showFab ? (
        <button
          type="button"
          onClick={() => navigate(PHONE_CAPTURE.path)}
          aria-label="Trợ lý AI"
          className="fixed right-3.5 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 grid size-[54px] place-items-center rounded-full bg-accent text-accent-fg shadow-card"
        >
          <span className="grid place-items-center leading-none"><Icon name="auto_awesome" className="text-[22px]" /><span className="text-[10px] font-bold">AI</span></span>
        </button>
      ) : null}

      <nav
        aria-label="Thanh dưới"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface px-1 pt-1 pb-[calc(6px+env(safe-area-inset-bottom))]"
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
