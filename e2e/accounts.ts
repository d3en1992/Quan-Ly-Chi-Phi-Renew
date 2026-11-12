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

// Menu bị ẩn theo ACCOUNTS[...].hide của giao diện mẫu (+ 'danhmuc' cho Kế toán theo bảng quyền mẫu)
export const MOCK_HIDE: Record<string, string[]> = {
  admin: [],
  giamdoc: ['taikhoan'],
  quanly: ['taikhoan'],
  ketoan: ['taikhoan', 'doanhthu', 'loinhuan', 'quyettoan', 'dashboard', 'tytrong', 'thietbi', 'danhmuc'],
  chixem: ['taikhoan', 'nhap', 'chamcong', 'nhapung', 'congno', 'tytrong', 'thietbi', 'danhmuc', 'danhba', 'doanhthu', 'loinhuan', 'quyettoan', 'dashboard', 'thungrac'],
};

export const ALL_NAV_KEYS = [
  'congtrinh', 'nhap', 'thongkecphd', 'chamcong', 'nhapung', 'congno', 'tytrong', 'thietbi', 'tiendo', 'danhba',
  'doanhthu', 'loinhuan', 'quyettoan', 'dashboard', 'xuatdulieu', 'danhmuc', 'taikhoan', 'thungrac',
];
