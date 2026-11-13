// Khung app: đường dẫn, bắt đăng nhập, bắt đổi mật khẩu lần đầu, chặn theo quyền, chọn bố cục theo bề ngang
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { ErrorState, LoadingState, PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { LoginPage } from '@/features/auth/LoginPage';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { AccountsTab } from '@/features/accounts/AccountsTab';
import { RolesTab } from '@/features/accounts/RolesTab';
import { ExpenseEntryPage } from '@/features/expenses/ExpenseEntryPage';
import { DashboardPage } from '@/features/reports/DashboardPage';
import { ExpenseStatsPage } from '@/features/reports/ExpenseStatsPage';
import { ProfitPage } from '@/features/reports/ProfitPage';
import { ProjectsRoute } from '@/features/projects/ProjectsPage';
import { CatalogPage } from '@/features/catalog/CatalogPage';
import { ContactsPage } from '@/features/contacts/ContactsPage';
import { TimesheetPage } from '@/features/timesheets/TimesheetPage';
import { PaymentsPage } from '@/features/payments/PaymentsPage';
import { PayablesPage } from '@/features/payments/PayablesPage';
import { CostAllocationPage, type AllocTab } from '@/features/cost-allocation/CostAllocationPage';
import { EquipmentPage } from '@/features/equipment/EquipmentPage';
import { SchedulePage } from '@/features/schedule/SchedulePage';
import { TrashPage } from '@/features/trash/TrashPage';
import { ExportPage } from '@/features/export/ExportPage';
import { RevenuePage } from '@/features/revenue/RevenuePage';
import { SettlementsPage } from '@/features/revenue/SettlementsPage';
import {
  BlockedPage,
  NotFoundPage,
  PhoneCapturePage,
  PhoneHomePage,
  PhoneMorePage,
} from '@/features/placeholder/pages';
import { AuthProvider, useAuth } from './auth';
import { DesktopShell } from './DesktopShell';
import { PhoneShell } from './PhoneShell';
import { useRealtimeRefresh } from './realtime';
import { TabbedPage, TabIndexRedirect } from './TabbedPage';
import { useLayoutMode } from './useLayoutMode';
import { YearProvider } from './year';
import {
  canSeeItem,
  firstVisiblePath,
  LEGACY_REDIRECTS,
  NAV_TABS,
  PHONE_CAPTURE,
  PHONE_HOME,
  PHONE_MORE_PATH,
  PROJECT_DETAIL_PATH,
  type NavItem,
} from './nav';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

/** Tab không có tab con */
const PAGES: Record<string, () => ReactNode> = {
  congtrinh: () => <ProjectsRoute />,
  chamcong: () => <TimesheetPage />,
  thietbi: () => <EquipmentPage />,
  dashboard: () => <DashboardPage />,
};

const ALLOC_SUB: Record<AllocTab, string> = { alloc: 'titrong', benchmark: 'dinhmuc', config: 'cauhinh' };

/** Trang của từng tab con (khóa tab con ở nav.ts) */
const SUB_PAGES: Record<string, (go: (subKey: string) => void) => ReactNode> = {
  nhap: () => <ExpenseEntryPage />,
  tracuu: () => <ExpenseStatsPage />,
  hdtp: () => <PayablesPage tab="contracts" />,
  ncc: () => <PayablesPage tab="suppliers" />,
  tattoan: () => <PayablesPage tab="closures" />,
  phieuchi: () => <PaymentsPage />,
  hdchinh: () => <RevenuePage tab="contracts" />,
  thutien: () => <RevenuePage tab="receipts" />,
  quyettoan: () => <SettlementsPage />,
  loinhuan: () => <ProfitPage />,
  tiendo: () => <SchedulePage />,
  titrong: (go) => <CostAllocationPage tab="alloc" onTabChange={(t) => go(ALLOC_SUB[t])} />,
  dinhmuc: (go) => <CostAllocationPage tab="benchmark" onTabChange={(t) => go(ALLOC_SUB[t])} />,
  cauhinh: (go) => <CostAllocationPage tab="config" onTabChange={(t) => go(ALLOC_SUB[t])} />,
  danhba: () => <ContactsPage />,
  danhmuc: () => <CatalogPage />,
  taikhoan: () => <><div className="hidden sm:block"><PageHeader title="Tài Khoản" sub="Tài khoản đăng nhập của mọi người" /></div><AccountsTab /></>,
  phanquyen: () => <><div className="hidden sm:block"><PageHeader title="Phân Quyền" sub="Quyền xem / nhập từng mục, xếp theo tab trên menu" /></div><RolesTab /></>,
  xuat: () => <ExportPage />,
  thungrac: () => <TrashPage />,
};

function Guard({ item, children }: { item: NavItem; children: ReactNode }) {
  const { access } = useAuth();
  if (!access || !canSeeItem(access.permissions, item)) return <BlockedPage />;
  return <>{children}</>;
}

function tabRoutes(item: NavItem) {
  if (!item.subs) {
    const render = PAGES[item.key];
    return [<Route key={item.key} path={item.path} element={<Guard item={item}>{render ? render() : <NotFoundPage />}</Guard>} />];
  }
  return [
    <Route key={item.key} path={item.path} element={<TabIndexRedirect item={item} />} />,
    <Route
      key={`${item.key}/sub`}
      path={`${item.path}/:sub`}
      element={<TabbedPage item={item} render={(k, go) => SUB_PAGES[k]?.(go) ?? <NotFoundPage />} />}
    />,
  ];
}

/** Đường dẫn cũ → mới, giữ ?query (link Zalo báo tiến độ có ?project=) */
function LegacyRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={to + search} replace />;
}

function Shell() {
  const mode = useLayoutMode();
  useRealtimeRefresh();
  return mode === 'phone' ? <PhoneShell /> : <DesktopShell compact={mode === 'tablet'} />;
}

/** Bắt đăng nhập + đổi mật khẩu lần đầu trước khi vào app */
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, sessionLoading, access, accessLoading, accessError, signOut } = useAuth();
  const location = useLocation();
  if (sessionLoading || accessLoading) return <LoadingState label="Đang mở app…" />;
  if (!session) return <Navigate to="/dang-nhap" replace state={{ from: location.pathname }} />;
  if (accessError || !access)
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <div className="grid justify-items-center gap-2">
          <ErrorState error={accessError ?? 'Không đọc được quyền tài khoản'} />
          <Button onClick={() => void signOut()}>Đăng xuất</Button>
        </div>
      </div>
    );
  if (access.profile.must_change_password) return <ChangePasswordPage forced />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { access } = useAuth();
  const mode = useLayoutMode();
  if (!access) return null;
  // Điện thoại vào Tổng quan nếu được xem Công trình; không thì như máy tính: tab đầu tiên được xem
  if (mode === 'phone' && canSeeItem(access.permissions, PHONE_HOME)) return <Navigate to={PHONE_HOME.path} replace />;
  return <Navigate to={firstVisiblePath(access.permissions)} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/dang-nhap" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        {NAV_TABS.flatMap(tabRoutes)}
        <Route path={PROJECT_DETAIL_PATH} element={<Guard item={NAV_TABS.find((i) => i.key === 'congtrinh')!}><ProjectsRoute /></Guard>} />
        {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
          <Route key={from} path={from} element={<LegacyRedirect to={to} />} />
        ))}
        <Route path={PHONE_HOME.path} element={<Guard item={PHONE_HOME}><PhoneHomePage /></Guard>} />
        <Route path={PHONE_MORE_PATH} element={<PhoneMorePage />} />
        <Route path={PHONE_CAPTURE.path} element={<Guard item={PHONE_CAPTURE}><PhoneCapturePage /></Guard>} />
        <Route path="/doi-mat-khau" element={<ChangePasswordPage forced={false} />} />
        <Route path="/khong-co-quyen" element={<BlockedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <YearProvider>
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </YearProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
