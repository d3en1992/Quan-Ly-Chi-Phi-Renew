// Khung app: đường dẫn, bắt đăng nhập, bắt đổi mật khẩu lần đầu, chặn theo quyền, chọn bố cục theo bề ngang
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { ErrorState, LoadingState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { LoginPage } from '@/features/auth/LoginPage';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { AccountsPage } from '@/features/accounts/AccountsPage';
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
import { CostAllocationPage } from '@/features/cost-allocation/CostAllocationPage';
import { EquipmentPage } from '@/features/equipment/EquipmentPage';
import { TrashPage } from '@/features/trash/TrashPage';
import { ExportPage } from '@/features/export/ExportPage';
import { RevenuePage } from '@/features/revenue/RevenuePage';
import { SettlementsPage } from '@/features/revenue/SettlementsPage';
import {
  BlockedPage,
  ComingSoonPage,
  NotFoundPage,
  PhoneCapturePage,
  PhoneHomePage,
  PhoneMorePage,
} from '@/features/placeholder/pages';
import { AuthProvider, useAuth } from './auth';
import { DesktopShell } from './DesktopShell';
import { PhoneShell } from './PhoneShell';
import { useLayoutMode } from './useLayoutMode';
import { YearProvider } from './year';
import {
  ALL_ITEMS,
  canSeeItem,
  firstVisiblePath,
  PHONE_CAPTURE,
  PHONE_HOME,
  PHONE_MORE_PATH,
  PROJECT_DETAIL_PATH,
  type NavItem,
} from './nav';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

/** Giai đoạn sẽ làm từng tab (hiện trên trang "Đang làm") */
const STAGE: Record<string, string> = {
  congtrinh: 'GĐ4', nhap: 'GĐ5', thongkecphd: 'GĐ3', chamcong: 'GĐ6', nhapung: 'GĐ7', congno: 'GĐ7',
  tytrong: 'GĐ8', thietbi: 'GĐ8', tiendo: 'GĐ12', danhba: 'GĐ4', doanhthu: 'GĐ7', loinhuan: 'GĐ3',
  quyettoan: 'GĐ7', dashboard: 'GĐ3', danhmuc: 'GĐ4', thungrac: 'GĐ8',
};

/** Trang đã làm xong (thay dần trang "Đang làm" ở các GĐ sau) */
const PAGES: Record<string, () => ReactNode> = {
  taikhoan: () => <AccountsPage />,
  congtrinh: () => <ProjectsRoute />,
  nhap: () => <ExpenseEntryPage />,
  chamcong: () => <TimesheetPage />,
  nhapung: () => <PaymentsPage />,
  congno: () => <PayablesPage />,
  doanhthu: () => <RevenuePage />,
  quyettoan: () => <SettlementsPage />,
  danhba: () => <ContactsPage />,
  danhmuc: () => <CatalogPage />,
  loinhuan: () => <ProfitPage />,
  dashboard: () => <DashboardPage />,
  thongkecphd: () => <ExpenseStatsPage />,
  tytrong: () => <CostAllocationPage />,
  thietbi: () => <EquipmentPage />,
  thungrac: () => <TrashPage />,
  xuatdulieu: () => <ExportPage />,
};

function Guard({ item, children }: { item: NavItem; children: ReactNode }) {
  const { access } = useAuth();
  if (!access || !canSeeItem(access.permissions, item)) return <BlockedPage />;
  return <>{children}</>;
}

function pageFor(item: NavItem) {
  const render = PAGES[item.key];
  return <Guard item={item}>{render ? render() : <ComingSoonPage item={item} stage={STAGE[item.key] ?? 'giai đoạn sau'} />}</Guard>;
}

function Shell() {
  const mode = useLayoutMode();
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
  if (mode === 'phone') return <Navigate to={PHONE_HOME.path} replace />;
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
        {ALL_ITEMS.map((item) => (
          <Route key={item.key} path={item.path} element={pageFor(item)} />
        ))}
        <Route path={PROJECT_DETAIL_PATH} element={pageFor(ALL_ITEMS.find((i) => i.key === 'congtrinh')!)} />
        <Route path={PHONE_HOME.path} element={<PhoneHomePage />} />
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
