// Trang tạm cho các tab chưa làm, trang "không có quyền", và các màn riêng của điện thoại (Thêm, Tổng quan, Chụp)
import { Link, useNavigate } from 'react-router-dom';
import { Button, Icon } from '@/components/ui/button';
import { Card, EmptyState, PageHeader } from '@/components/ui/misc';
import { useAccess, useAuth } from '@/app/auth';
import { ALL_ITEMS, canSeeItem, PHONE_MORE_KEYS, PHONE_SHORT_LABEL, type NavItem } from '@/app/nav';

/** Tab chưa làm: tên đúng, trạng thái "Đang làm", ghi giai đoạn sẽ làm */
export function ComingSoonPage({ item, stage }: { item: NavItem; stage: string }) {
  return (
    <>
      <div className="hidden sm:block">
        <PageHeader title={item.label} sub="Tab này đang được làm lại" />
      </div>
      <Card>
        <EmptyState icon={item.icon} title="Đang làm">
          Tab <b>{item.label}</b> sẽ có ở {stage}. App cũ vẫn dùng bình thường trong lúc chờ.
        </EmptyState>
      </Card>
    </>
  );
}

export function BlockedPage() {
  return (
    <Card>
      <EmptyState icon="lock" title="Không có quyền xem mục này">
        Nhờ Admin mở quyền trong tab Tài Khoản &amp; Quyền.
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
  const items = PHONE_MORE_KEYS.map((k) => ALL_ITEMS.find((i) => i.key === k)).filter(
    (i): i is NavItem => !!i && canSeeItem(access.permissions, i),
  );
  const tile =
    'flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface px-1.5 py-3.5 text-center text-xs font-medium';
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="phone-more">
      {items.map((i) => (
        <button key={i.key} type="button" className={tile} data-more={i.key} onClick={() => navigate(i.path)}>
          <Icon name={i.icon} className="text-[24px] text-accent" />
          {PHONE_SHORT_LABEL[i.key] ?? i.label}
        </button>
      ))}
      <button type="button" className={tile} onClick={() => void signOut()}>
        <Icon name="logout" className="text-[24px] text-accent" />
        Đăng xuất
      </button>
    </div>
  );
}

/** Điện thoại: Tổng quan (số liệu làm ở GĐ3) */
export function PhoneHomePage() {
  const access = useAccess();
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {['Tổng đã chi', 'Tổng đã thu', 'Lãi tạm tính', 'Còn phải thu'].map((l) => (
          <div key={l} className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2.5">
            <small className="block text-[11.5px] text-muted">{l}</small>
            <b className="text-base text-faint">—</b>
          </div>
        ))}
      </div>
      <Card>
        <EmptyState icon="home" title={`Chào ${access.profile.display_name}`}>
          Số liệu tổng quan sẽ có ở GĐ3 (sau khi chuyển dữ liệu cũ sang).
        </EmptyState>
      </Card>
    </>
  );
}

/** Điện thoại: màn Chụp đa năng (GĐ9) */
export function PhoneCapturePage() {
  return (
    <Card>
      <EmptyState icon="photo_camera" title="Chụp hóa đơn, CCCD — đang làm">
        Tính năng chụp đa năng sẽ có ở GĐ9.
      </EmptyState>
      <div className="px-4 pb-4">
        <Button asChild className="w-full">
          <Link to="/nhap-chi-phi">Nhập tay</Link>
        </Button>
      </div>
    </Card>
  );
}
