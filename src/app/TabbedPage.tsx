// Khung tab có tab con (Chi Phí, Thầu Phụ & NCC, Thu & Lãi, Kế Hoạch, Cài Đặt).
// Đường dẫn /<tab>/<tab con>; chặn quyền theo TỪNG tab con; còn 1 tab con thì không hiện dải tab con.
// Mở /<tab> → tab con mở lần trước (nếu còn quyền) hoặc tab con đầu tiên được thấy.
import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { SubTabs } from '@/components/ui/misc';
import { BlockedPage, NotFoundPage } from '@/features/placeholder/pages';
import { useAccess } from './auth';
import { canSeeModule, defaultSub, subPath, visibleSubs, type NavItem } from './nav';
import { useLayoutMode } from './useLayoutMode';

const storeKey = (tabKey: string) => `qlcp.subtab.${tabKey}`;
function readSub(tabKey: string): string | null {
  try {
    return localStorage.getItem(storeKey(tabKey));
  } catch {
    return null;
  }
}
function writeSub(tabKey: string, subKey: string) {
  try {
    localStorage.setItem(storeKey(tabKey), subKey);
  } catch {
    /* trình duyệt chặn lưu: bỏ qua, lần sau mở tab con đầu tiên */
  }
}

/** /<tab> → chuyển tới tab con phù hợp (giữ ?query) */
export function TabIndexRedirect({ item }: { item: NavItem }) {
  const access = useAccess();
  const phone = useLayoutMode() === 'phone';
  const { search } = useLocation();
  const sub = defaultSub(access.permissions, item, { remembered: readSub(item.key), phone });
  if (!sub) return <BlockedPage />;
  return <Navigate to={subPath(item, sub) + search} replace />;
}

/** render(subKey, go): vẽ trang của tab con; go(subKey) = chuyển sang tab con khác trong cùng tab */
export function TabbedPage({ item, render }: { item: NavItem; render: (subKey: string, go: (subKey: string) => void) => ReactNode }) {
  const access = useAccess();
  const navigate = useNavigate();
  const { sub: slug } = useParams();
  const sub = item.subs?.find((s) => s.slug === slug);
  const allowed = !!sub && canSeeModule(access.permissions, sub.module);
  useEffect(() => {
    if (sub && allowed) writeSub(item.key, sub.key);
  }, [item.key, sub, allowed]);

  if (!sub) return <NotFoundPage />;
  if (!allowed) return <BlockedPage />;
  const subs = visibleSubs(access.permissions, item);
  const go = (key: string) => {
    const to = subs.find((s) => s.key === key);
    if (to) navigate(subPath(item, to));
  };
  return (
    <>
      {subs.length > 1 ? (
        <div data-testid="tab-subs">
          <SubTabs
            tabs={subs.map((s) => ({ key: s.key, label: s.label.toLocaleUpperCase('vi'), short: s.short?.toLocaleUpperCase('vi') }))}
            value={sub.key}
            onChange={go}
          />
        </div>
      ) : null}
      {render(sub.key, go)}
    </>
  );
}
