// Bố cục điện thoại (<640px): đầu trang (tên + chọn năm), nội dung dạng thẻ, thanh dưới 5 nút — giữa là nút Trợ lý AI to, nhô lên
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Icon } from '@/components/ui/button';
import { AiBadge } from '@/components/ui/ai-badge';
import { useAccess } from './auth';
import { CommandPalette } from './CommandPalette';
import { canSeeItem, findByPath, pathOfSub, PHONE_CAPTURE, PHONE_HOME, PHONE_MORE_PATH } from './nav';
import { ReadOnlyBanner } from './ReadOnlyBanner';
import { YearPicker } from './TopBarParts';

// Nhập tay nằm trong mục Thêm (Chi Phí) + nút "Nhập tay" trên màn Trợ lý AI
const BOTTOM = [
  { key: 'home', path: PHONE_HOME.path, icon: 'home', label: 'Tổng quan' },
  { key: 'ct', path: '/cong-trinh', icon: 'construction', label: 'Công trình' },
  { key: 'ai', path: PHONE_CAPTURE.path, icon: 'auto_awesome', label: 'Trợ lý AI' },
  { key: 'cc', path: '/cham-cong', icon: 'calendar_month', label: 'Chấm công' },
  { key: 'more', path: PHONE_MORE_PATH, icon: 'apps', label: 'Thêm' },
];
const MAIN_PATHS = BOTTOM.map((b) => b.path);

function activeBottomKey(pathname: string): string {
  if (pathname === PHONE_HOME.path) return 'home';
  if (pathname.startsWith('/cong-trinh')) return 'ct';
  if (pathname === PHONE_CAPTURE.path) return 'ai';
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
  // Nhập tay mở từ màn AI → quay lại màn AI
  const backTo = pathname.startsWith('/cong-trinh/') ? '/cong-trinh' : pathname === pathOfSub('nhap') ? PHONE_CAPTURE.path : PHONE_MORE_PATH;
  const canAi = canSeeItem(access.permissions, PHONE_CAPTURE);
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


      <nav
        aria-label="Thanh dưới"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface px-1 pt-1 pb-[calc(6px+env(safe-area-inset-bottom))]"
      >
        {BOTTOM.map((b) => b.key === 'ai' ? (
          canAi ? (
            <NavLink
              key={b.key}
              to={b.path}
              data-bottom={b.key}
              aria-label="Trợ lý AI"
              aria-current={current === b.key ? 'page' : undefined}
              className="-mt-5 flex flex-col items-center gap-0.5 text-[10.5px] font-bold text-[#7c3aed] dark:text-[#a78bfa]"
            >
              <AiBadge size={52} className="rounded-full ring-4 ring-surface" />
              {b.label}
            </NavLink>
          ) : <span key={b.key} />
        ) : (
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
