// Trang "không có quyền", "không tìm thấy", và các màn riêng của điện thoại (Thêm, Tổng quan, Chụp)
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/button';
import { Card, EmptyState } from '@/components/ui/misc';
import { useAccess, useAuth } from '@/app/auth';
import { canSeeItem, canSeeModule, findSub, NAV_TABS, PHONE_HOME_SHORTCUTS, PHONE_MORE_KEYS, subPath, type NavItem } from '@/app/nav';
import { hasLevel } from '@/lib/permissions';
import { DashboardPage } from '@/features/reports/DashboardPage';

export function BlockedPage() {
  return (
    <Card>
      <EmptyState icon="lock" title="Không có quyền xem mục này">
        Nhờ Admin mở quyền ở Cài Đặt › Phân quyền.
      </EmptyState>
    </Card>
  );
}

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState icon="explore_off" title="Không tìm thấy trang">
        <Link to="/" className="text-accent">
          Về trang đầu
        </Link>
      </EmptyState>
    </Card>
  );
}

/** Điện thoại: lưới "Thêm" — các tab không nằm ở thanh dưới */
export function PhoneMorePage() {
  const access = useAccess();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const items = PHONE_MORE_KEYS.map((k) => NAV_TABS.find((i) => i.key === k)).filter(
    (i): i is NavItem => !!i && canSeeItem(access.permissions, i),
  );
  const tile =
    'flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface px-1.5 py-3.5 text-center text-xs font-medium';
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="phone-more">
      {items.map((i) => (
        <button key={i.key} type="button" className={tile} data-more={i.key} onClick={() => navigate(i.path)}>
          <Icon name={i.icon} className="text-[24px] text-accent" />
          {i.short ?? i.label}
        </button>
      ))}
      <button type="button" className={tile} onClick={() => void signOut()}>
        <Icon name="logout" className="text-[24px] text-accent" />
        Đăng xuất
      </button>
    </div>
  );
}

/** Điện thoại: Tổng quan = số liệu Dashboard (nếu có quyền xem) + lối tắt các việc hay làm */
export function PhoneHomePage() {
  const access = useAccess();
  const navigate = useNavigate();
  const canDashboard = hasLevel(access.permissions, 'dashboard', 'view');
  const shortcuts = PHONE_HOME_SHORTCUTS.flatMap((s) => {
    const f = findSub(s.sub);
    return f && canSeeModule(access.permissions, f.sub.module) ? [{ ...s, path: subPath(f.item, f.sub) }] : [];
  });
  return (
    <>
      {shortcuts.length ? (
        <div className="grid shrink-0 grid-cols-4 gap-1.5" data-testid="home-shortcuts">
          {shortcuts.map((i) => (
            <button key={i.sub} type="button" onClick={() => navigate(i.path)}
              className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-line bg-surface px-1 py-2 text-[11px] leading-tight font-medium active:bg-surface-2">
              <Icon name={i.icon} className="text-[21px] text-accent" />
              <span className="w-full truncate text-center">{i.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {canDashboard ? (
        <DashboardPage />
      ) : (
        <Card>
          <EmptyState icon="home" title={`Chào ${access.profile.display_name}`}>
            Chọn việc cần làm ở thanh dưới hoặc mục Thêm.
          </EmptyState>
        </Card>
      )}
    </>
  );
}

