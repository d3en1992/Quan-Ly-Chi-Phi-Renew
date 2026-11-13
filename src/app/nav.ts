// Menu và đường dẫn của mọi tab — MỘT chỗ duy nhất. Menu máy tính, điện thoại, Ctrl K, chặn quyền, bảng Phân quyền
// đều đọc từ đây. Quyền gắn với MỤC DỮ LIỆU (module), không gắn với tab: mỗi tab con gắn đúng 1 mục quyền,
// tab chính hiện khi còn ít nhất 1 tab con được thấy. Chuyển tab con sang tab khác = dời 1 dòng.
// (Gộp 18 mục → 9 tab: tai-lieu/KE-HOACH-GOP-TAB.md)
import type { ModuleKey, PermissionMap } from '@/lib/permissions';
import { canSeeExport, canSeeTrash, hasLevel } from '@/lib/permissions';

export type NavModule = ModuleKey | 'trash' | 'export';

export type SubItem = {
  key: string;        // khóa tab con (duy nhất toàn app)
  slug: string;       // đoạn cuối đường dẫn: /<tab>/<slug>
  label: string;      // tên tab con
  short?: string;     // nhãn ngắn trên điện thoại
  hint: string;       // mô tả dưới tiêu đề trang
  module: NavModule;
  aka?: string;       // tên cũ / từ khóa cho Ctrl K (vd "công nợ")
};

export type NavItem = {
  key: string;        // khóa tab
  path: string;       // đường dẫn
  icon: string;       // Material Symbols
  label: string;      // tên tab
  short?: string;     // nhãn ngắn trên điện thoại (mục Thêm)
  module?: NavModule; // tab không có tab con
  subs?: SubItem[];   // tab có tab con
  phoneFirst?: string; // điện thoại: tab con mở mặc định (khóa)
};

export const NAV_TABS: NavItem[] = [
  { key: 'congtrinh', path: '/cong-trinh', icon: 'construction', label: 'Công Trình', module: 'projects' },
  {
    key: 'chiphi', path: '/chi-phi', icon: 'payments', label: 'Chi Phí',
    subs: [
      { key: 'nhap', slug: 'nhap', label: 'Nhập', hint: 'Nhập hóa đơn, chi phí nhanh hoặc chi tiết', module: 'expenses' },
      { key: 'tracuu', slug: 'tra-cuu', label: 'Tra cứu', hint: 'Tra cứu mọi khoản chi đã nhập (hóa đơn + lương chấm công)', module: 'expense_stats', aka: 'thống kê cp hđ' },
    ],
  },
  { key: 'chamcong', path: '/cham-cong', icon: 'calendar_month', label: 'Chấm Công', module: 'timesheets' },
  {
    key: 'thauphu', path: '/thau-phu', icon: 'engineering', label: 'Thầu Phụ & NCC', short: 'Thầu phụ & NCC',
    subs: [
      { key: 'hdtp', slug: 'hop-dong', label: 'Hợp đồng thầu phụ', short: 'HĐ thầu phụ', hint: 'Hợp đồng thầu phụ, đã trả, còn nợ', module: 'payables', aka: 'công nợ phải trả' },
      { key: 'ncc', slug: 'ncc', label: 'Nhà cung cấp', short: 'NCC', hint: 'Công nợ nhà cung cấp (hóa đơn mua nợ)', module: 'payables' },
      { key: 'tattoan', slug: 'tat-toan', label: 'Tất toán', hint: 'Chốt công nợ đã trả xong', module: 'payables' },
      { key: 'phieuchi', slug: 'phieu-chi', label: 'Phiếu chi', hint: 'Phiếu chi cho thầu phụ (tạm ứng, thanh toán đợt) và trả nợ nhà cung cấp', module: 'payments', aka: 'chi trả tp ncc' },
    ],
  },
  {
    key: 'thulai', path: '/thu-lai', icon: 'trending_up', label: 'Thu & Lãi', phoneFirst: 'thutien',
    subs: [
      { key: 'hdchinh', slug: 'hop-dong', label: 'Hợp đồng chính', short: 'HĐ chính', hint: 'Hợp đồng chính với khách hàng, mỗi công trình 1 hợp đồng', module: 'revenue', aka: 'doanh thu' },
      { key: 'thutien', slug: 'thu-tien', label: 'Thu tiền', hint: 'Phiếu thu và tiến độ thu theo công trình', module: 'revenue' },
      { key: 'quyettoan', slug: 'quyet-toan', label: 'Quyết toán', hint: 'Điều chỉnh giá trị hợp đồng khi quyết toán', module: 'settlements' },
      { key: 'loinhuan', slug: 'loi-nhuan', label: 'Lợi nhuận', hint: 'Lãi / lỗ từng công trình', module: 'profit', aka: 'lãi lỗ' },
    ],
  },
  {
    key: 'kehoach', path: '/ke-hoach', icon: 'view_timeline', label: 'Kế Hoạch',
    subs: [
      { key: 'tiendo', slug: 'tien-do', label: 'Tiến độ', hint: 'Kế hoạch thi công, việc trễ, báo cáo Zalo', module: 'schedule' },
      { key: 'titrong', slug: 'ti-trong', label: 'Tỉ trọng', hint: 'Chi phí mỗi công trình chia theo nhóm, loại, rổ', module: 'cost_allocation', aka: 'tỉ trọng định mức' },
      { key: 'dinhmuc', slug: 'dinh-muc', label: 'Định mức', hint: 'Định mức đã lưu, dùng để báo giá công trình mới', module: 'cost_allocation' },
      { key: 'cauhinh', slug: 'cau-hinh', label: 'Cấu hình rổ', short: 'Cấu hình', hint: 'Loại chi phí → nhóm, rổ; luật theo từ khóa', module: 'cost_allocation' },
    ],
  },
  { key: 'thietbi', path: '/thiet-bi', icon: 'build', label: 'Thiết Bị', module: 'equipment' },
  { key: 'dashboard', path: '/dashboard', icon: 'monitoring', label: 'Dashboard', module: 'dashboard' },
  {
    key: 'caidat', path: '/cai-dat', icon: 'settings', label: 'Cài Đặt',
    subs: [
      { key: 'danhba', slug: 'danh-ba', label: 'Danh bạ', hint: 'Khách hàng, thầu phụ, nhà cung cấp, công nhân, nhân viên', module: 'contacts' },
      { key: 'danhmuc', slug: 'danh-muc', label: 'Danh mục', hint: 'Danh sách dùng chung khi nhập liệu, thông tin công ty, sao lưu', module: 'catalog' },
      { key: 'taikhoan', slug: 'tai-khoan', label: 'Tài khoản', hint: 'Tài khoản đăng nhập', module: 'accounts' },
      { key: 'phanquyen', slug: 'phan-quyen', label: 'Phân quyền', hint: 'Vai trò và quyền xem / nhập từng mục', module: 'accounts', aka: 'vai trò quyền' },
      { key: 'xuat', slug: 'xuat', label: 'Xuất dữ liệu', short: 'Xuất', hint: 'Chọn loại dữ liệu, công trình, thời gian → file Excel có trình bày', module: 'export' },
      { key: 'thungrac', slug: 'thung-rac', label: 'Thùng rác', hint: 'Khôi phục dữ liệu đã xóa', module: 'trash' },
    ],
  },
];

/** Trang chi tiết công trình — quyền theo mục Công trình */
export const PROJECT_DETAIL_PATH = '/cong-trinh/:projectId';

/** Trang chỉ có trên điện thoại */
export const PHONE_HOME: NavItem = { key: 'home', path: '/tong-quan', icon: 'home', label: 'Tổng quan', module: 'projects' };
/** Nút AI (trước là Chụp): ảnh hóa đơn, ảnh chuyển khoản, giọng nói, PDF / Excel hợp đồng, danh sách vật tư — đường dẫn giữ /chup */
export const PHONE_CAPTURE: NavItem = { key: 'chupmenu', path: '/chup', icon: 'auto_awesome', label: 'Trợ lý AI', module: 'expenses' };
export const PHONE_MORE_PATH = '/them';

export function canSeeModule(perms: PermissionMap, module: NavModule): boolean {
  if (module === 'trash') return canSeeTrash(perms);
  if (module === 'export') return canSeeExport(perms);
  return hasLevel(perms, module, 'view');
}

export function visibleSubs(perms: PermissionMap, item: NavItem): SubItem[] {
  return (item.subs ?? []).filter((s) => canSeeModule(perms, s.module));
}

export function canSeeItem(perms: PermissionMap, item: NavItem): boolean {
  if (item.subs) return visibleSubs(perms, item).length > 0;
  return item.module ? canSeeModule(perms, item.module) : false;
}

/** Menu đã lọc theo quyền */
export function visibleTabs(perms: PermissionMap): NavItem[] {
  return NAV_TABS.filter((t) => canSeeItem(perms, t));
}

export function subPath(item: NavItem, sub: SubItem): string {
  return `${item.path}/${sub.slug}`;
}

/** Tab con mở khi bấm vào tab (đã lọc quyền). `remembered` = khóa tab con mở lần trước. */
export function defaultSub(perms: PermissionMap, item: NavItem, opts: { remembered?: string | null; phone?: boolean } = {}): SubItem | undefined {
  const subs = visibleSubs(perms, item);
  return (
    subs.find((s) => s.key === opts.remembered) ??
    (opts.phone ? subs.find((s) => s.key === item.phoneFirst) : undefined) ??
    subs[0]
  );
}

/** Trang mở đầu sau khi đăng nhập: tab đầu tiên được thấy */
export function firstVisiblePath(perms: PermissionMap): string {
  const tab = visibleTabs(perms)[0];
  if (!tab) return '/khong-co-quyen';
  const sub = defaultSub(perms, tab);
  return sub ? subPath(tab, sub) : tab.path;
}

/** Mục "Thêm" trên điện thoại: các tab không nằm ở thanh dưới */
export const PHONE_MORE_KEYS = ['thauphu', 'thulai', 'kehoach', 'thietbi', 'caidat'];

/** Điện thoại: lối tắt đầu trang Tổng quan (việc hay xem nhất, không có ở thanh dưới) — trỏ thẳng tab con */
export const PHONE_HOME_SHORTCUTS: { tab: string; sub: string; label: string; icon: string }[] = [
  { tab: 'chiphi', sub: 'tracuu', label: 'Tra cứu chi', icon: 'receipt_long' },
  { tab: 'thauphu', sub: 'phieuchi', label: 'Phiếu chi', icon: 'account_balance_wallet' },
  { tab: 'thauphu', sub: 'hdtp', label: 'Công nợ', icon: 'credit_card' },
  { tab: 'thulai', sub: 'thutien', label: 'Thu tiền', icon: 'attach_money' },
];

/** Mọi tab + tab con dạng phẳng (Ctrl K, tìm theo đường dẫn) */
export type NavEntry = { item: NavItem; sub?: SubItem; path: string; label: string; icon: string; aka?: string };
export function allEntries(): NavEntry[] {
  return NAV_TABS.flatMap((item): NavEntry[] =>
    item.subs
      ? item.subs.map((sub) => ({ item, sub, path: subPath(item, sub), label: `${sub.label} · ${item.label}`, icon: item.icon, aka: sub.aka }))
      : [{ item, path: item.path, label: item.label, icon: item.icon }],
  );
}

export function canSeeEntry(perms: PermissionMap, e: NavEntry): boolean {
  return e.sub ? canSeeModule(perms, e.sub.module) : canSeeItem(perms, e.item);
}

/** Tìm tab (và tab con) theo đường dẫn, kể cả chi tiết công trình */
export function findByPath(pathname: string): { item: NavItem; sub?: SubItem } | undefined {
  const p = pathname.replace(/\/+$/, '') || '/';
  for (const item of [...NAV_TABS, PHONE_HOME, PHONE_CAPTURE]) {
    if (p === item.path) return { item };
    if (p.startsWith(item.path + '/')) {
      const slug = p.slice(item.path.length + 1).split('/')[0];
      const sub = item.subs?.find((s) => s.slug === slug);
      if (item.subs && !sub) continue;
      return { item, sub };
    }
  }
  return undefined;
}

/** Tìm tab con theo khóa */
export function findSub(subKey: string): { item: NavItem; sub: SubItem } | undefined {
  for (const item of NAV_TABS) {
    const sub = item.subs?.find((s) => s.key === subKey);
    if (sub) return { item, sub };
  }
  return undefined;
}

export function pathOfSub(subKey: string): string {
  const f = findSub(subKey);
  if (!f) throw new Error(`Không có tab con ${subKey}`);
  return subPath(f.item, f.sub);
}

/** Đường dẫn cũ (trước khi gộp tab) → mới. Giữ cho dấu trang, lối tắt PWA, link Zalo báo tiến độ. */
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/nhap-chi-phi': pathOfSub('nhap'),
  '/thong-ke-cp-hd': pathOfSub('tracuu'),
  '/chi-tra': pathOfSub('phieuchi'),
  '/cong-no': pathOfSub('hdtp'),
  '/doanh-thu': pathOfSub('hdchinh'),
  '/quyet-toan': pathOfSub('quyettoan'),
  '/loi-nhuan': pathOfSub('loinhuan'),
  '/tien-do': pathOfSub('tiendo'),
  '/ti-trong': pathOfSub('titrong'),
  '/danh-ba': pathOfSub('danhba'),
  '/danh-muc': pathOfSub('danhmuc'),
  '/tai-khoan': pathOfSub('taikhoan'),
  '/xuat-du-lieu': pathOfSub('xuat'),
  '/thung-rac': pathOfSub('thungrac'),
};

/** Bảng Phân quyền: nhóm các mục quyền theo tab (thứ tự như menu). Mục chưa nằm trong tab nào → nhóm "Khác". */
export function moduleGroups(): { title: string; modules: ModuleKey[] }[] {
  const out: { title: string; modules: ModuleKey[] }[] = [];
  for (const item of NAV_TABS) {
    const mods = (item.subs ? item.subs.map((s) => s.module) : [item.module]).filter(
      (m): m is ModuleKey => !!m && m !== 'trash' && m !== 'export',
    );
    const uniq = [...new Set(mods)];
    if (uniq.length) out.push({ title: item.label, modules: uniq });
  }
  return out;
}
