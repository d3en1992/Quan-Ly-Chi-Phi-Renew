// Tài khoản test (chỉ trên Supabase trong máy). Mật khẩu test cố định, không phải mật khẩu thật.
export const E2E_PASSWORD = 'E2e-test-2026';

export const E2E_ACCOUNTS: {
  username: string;
  displayName: string;
  roleKey: 'admin' | 'director' | 'manager' | 'accountant' | 'viewer';
  mockRole: string; // khóa vai trò trong giao diện mẫu (ACCOUNTS)
  mustChange?: boolean;
}[] = [
  { username: 'e2e.admin', displayName: 'E2E ADMIN', roleKey: 'admin', mockRole: 'admin' },
  { username: 'e2e.gd', displayName: 'E2E GIÁM ĐỐC', roleKey: 'director', mockRole: 'giamdoc' },
  { username: 'e2e.ql', displayName: 'E2E QUẢN LÝ', roleKey: 'manager', mockRole: 'quanly' },
  { username: 'e2e.kt', displayName: 'E2E KẾ TOÁN', roleKey: 'accountant', mockRole: 'ketoan' },
  { username: 'e2e.cx', displayName: 'E2E CHỈ XEM', roleKey: 'viewer', mockRole: 'chixem' },
  { username: 'e2e.moi', displayName: 'E2E MỚI', roleKey: 'accountant', mockRole: 'ketoan', mustChange: true },
];

// Menu 9 tab (gộp 13/11/2026 — tai-lieu/KE-HOACH-GOP-TAB.md): tab bị ẩn theo bảng quyền mặc định
export const MOCK_HIDE: Record<string, string[]> = {
  admin: [],
  giamdoc: [],
  quanly: [],
  ketoan: ['thulai', 'thietbi', 'dashboard'],
  chixem: ['chamcong', 'thauphu', 'thulai', 'thietbi', 'dashboard'],
};

export const ALL_NAV_KEYS = ['congtrinh', 'chiphi', 'chamcong', 'thauphu', 'thulai', 'kehoach', 'thietbi', 'dashboard', 'caidat'];
