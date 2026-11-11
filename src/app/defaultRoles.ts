// Bảng quyền mặc định — CHÉP từ migration 20261111000002 (= PERM_ROWS của giao diện mẫu).
// Chỉ dùng cho test; giá trị thật nằm trong kho, Admin sửa trong app.
// Cột: Admin, Giám đốc, Quản lý, Kế toán, Chỉ xem · f = Toàn quyền, a = Nhập, v = Xem, h = Ẩn
export const DEFAULT_ROLE_GRID: [string, string, string, string, string, string][] = [
  ['projects', 'f', 'f', 'f', 'v', 'v'],
  ['expenses', 'f', 'f', 'f', 'a', 'h'],
  ['expense_stats', 'f', 'f', 'f', 'v', 'v'],
  ['timesheets', 'f', 'f', 'f', 'a', 'h'],
  ['payments', 'f', 'f', 'f', 'a', 'h'],
  ['payables', 'f', 'f', 'f', 'v', 'h'],
  ['cost_allocation', 'f', 'f', 'f', 'h', 'h'],
  ['equipment', 'f', 'f', 'f', 'h', 'h'],
  ['schedule', 'f', 'f', 'f', 'v', 'v'],
  ['contacts', 'f', 'f', 'f', 'v', 'h'],
  ['revenue', 'f', 'f', 'f', 'h', 'h'],
  ['settlements', 'f', 'f', 'f', 'h', 'h'],
  ['profit', 'f', 'f', 'v', 'h', 'h'],
  ['dashboard', 'f', 'f', 'v', 'h', 'h'],
  ['catalog', 'f', 'v', 'v', 'h', 'h'],
  ['accounts', 'f', 'h', 'h', 'h', 'h'],
];
