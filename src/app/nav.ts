// Menu và đường dẫn của mọi tab. Thứ tự, tên, icon theo giao diện mẫu (NAV) + đổi tên mục 4L.
import type { ModuleKey, PermissionMap } from '@/lib/permissions';
import { canSeeExport, canSeeTrash, hasLevel } from '@/lib/permissions';

export type NavItem = {
  key: string;        // khóa trang (trùng tên trong giao diện mẫu, để tra cứu)
  path: string;       // đường dẫn
  icon: string;       // Material Symbols
  label: string;      // tên tab
  module: ModuleKey | 'trash' | 'export';
  isNew?: boolean;    // gắn nhãn MỚI
};

export type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Chi phí',
    items: [
      { key: 'congtrinh', path: '/cong-trinh', icon: 'construction', label: 'Công Trình', module: 'projects' },
      { key: 'nhap', path: '/nhap-chi-phi', icon: 'payments', label: 'Nhập Chi Phí', module: 'expenses' },
      { key: 'thongkecphd', path: '/thong-ke-cp-hd', icon: 'receipt_long', label: 'Thống Kê CP/HĐ', module: 'expense_stats' },
      { key: 'chamcong', path: '/cham-cong', icon: 'calendar_month', label: 'Chấm Công', module: 'timesheets' },
      { key: 'nhapung', path: '/chi-tra', icon: 'account_balance_wallet', label: 'Chi Trả TP/NCC', module: 'payments' },
      { key: 'congno', path: '/cong-no', icon: 'credit_card', label: 'Công Nợ Phải Trả', module: 'payables' },
    ],
  },
  {
    title: 'Quản lý',
    items: [
      { key: 'tytrong', path: '/ti-trong', icon: 'pie_chart', label: 'Tỉ Trọng & Định Mức', module: 'cost_allocation' },
      { key: 'thietbi', path: '/thiet-bi', icon: 'build', label: 'Theo Dõi TB', module: 'equipment' },
      { key: 'tiendo', path: '/tien-do', icon: 'view_timeline', label: 'Tiến Độ', module: 'schedule', isNew: true },
      { key: 'danhba', path: '/danh-ba', icon: 'contacts', label: 'Danh Bạ', module: 'contacts', isNew: true },
    ],
  },
  {
    title: 'Doanh thu & lãi',
    items: [
      { key: 'doanhthu', path: '/doanh-thu', icon: 'attach_money', label: 'Doanh Thu', module: 'revenue' },
      { key: 'loinhuan', path: '/loi-nhuan', icon: 'trending_up', label: 'Lợi Nhuận', module: 'profit' },
      { key: 'quyettoan', path: '/quyet-toan', icon: 'fact_check', label: 'Quyết Toán', module: 'settlements' },
      { key: 'dashboard', path: '/dashboard', icon: 'monitoring', label: 'Dashboard', module: 'dashboard' },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { key: 'xuatdulieu', path: '/xuat-du-lieu', icon: 'download', label: 'Xuất Dữ Liệu', module: 'export', isNew: true },
      { key: 'danhmuc', path: '/danh-muc', icon: 'tune', label: 'Danh Mục & Sao Lưu', module: 'catalog' },
      { key: 'taikhoan', path: '/tai-khoan', icon: 'manage_accounts', label: 'Tài Khoản & Quyền', module: 'accounts' },
    ],
  },
];

export const TRASH_ITEM: NavItem = { key: 'thungrac', path: '/thung-rac', icon: 'delete', label: 'Thùng Rác', module: 'trash' };

/** Trang chi tiết công trình — quyền theo mục Công trình */
export const PROJECT_DETAIL_PATH = '/cong-trinh/:projectId';

/** Trang chỉ có trên điện thoại */
export const PHONE_HOME: NavItem = { key: 'home', path: '/tong-quan', icon: 'home', label: 'Tổng quan', module: 'projects' };
export const PHONE_CAPTURE: NavItem = { key: 'chupmenu', path: '/chup', icon: 'photo_camera', label: 'Chụp', module: 'expenses' };
export const PHONE_MORE_PATH = '/them';

export const ALL_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), TRASH_ITEM];

export function canSeeItem(perms: PermissionMap, item: NavItem): boolean {
  if (item.module === 'trash') return canSeeTrash(perms);
  if (item.module === 'export') return canSeeExport(perms);
  return hasLevel(perms, item.module, 'view');
}

/** Menu đã lọc theo quyền (nhóm trống thì bỏ) */
export function visibleGroups(perms: PermissionMap): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canSeeItem(perms, i)) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Trang mở đầu sau khi đăng nhập: mục đầu tiên được thấy */
export function firstVisiblePath(perms: PermissionMap): string {
  return visibleGroups(perms)[0]?.items[0]?.path ?? '/khong-co-quyen';
}

/** Mục "Thêm" trên điện thoại (thứ tự như MORE của mẫu) */
export const PHONE_MORE_KEYS = [
  'thongkecphd', 'nhapung', 'congno', 'tytrong', 'thietbi', 'tiendo', 'danhba',
  'doanhthu', 'loinhuan', 'quyettoan', 'dashboard', 'xuatdulieu', 'danhmuc', 'thungrac', 'taikhoan',
];
export const PHONE_SHORT_LABEL: Record<string, string> = {
  thongkecphd: 'Thống kê CP/HĐ', nhapung: 'Chi trả TP/NCC', congno: 'Công nợ phải trả', tytrong: 'Tỉ trọng',
  thietbi: 'Thiết bị', tiendo: 'Tiến độ', danhba: 'Danh bạ', doanhthu: 'Doanh thu', loinhuan: 'Lợi nhuận',
  quyettoan: 'Quyết toán', dashboard: 'Dashboard', xuatdulieu: 'Xuất dữ liệu', danhmuc: 'Danh mục', thungrac: 'Thùng rác', taikhoan: 'Tài khoản',
};

export function findItemByPath(pathname: string): NavItem | undefined {
  if (pathname.startsWith('/cong-trinh/')) return ALL_ITEMS.find((i) => i.key === 'congtrinh');
  return [...ALL_ITEMS, PHONE_HOME, PHONE_CAPTURE].find((i) => i.path === pathname);
}
