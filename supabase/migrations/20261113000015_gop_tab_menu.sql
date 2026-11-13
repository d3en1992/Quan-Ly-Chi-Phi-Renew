-- Gộp menu 18 mục → 9 tab (tai-lieu/KE-HOACH-GOP-TAB.md).
-- Chỉ đổi TÊN và THỨ TỰ các mục quyền cho khớp menu mới, để bảng Phân quyền xếp theo tab.
-- Không thêm / xóa mục quyền, không đổi mức quyền của vai trò nào, không đổi RLS.
update public.app_modules as m set label = v.label, sort_order = v.sort_order
from (values
  ('projects',        'Công trình',                          10),
  ('expenses',        'Nhập chi phí, chụp hóa đơn',          20),
  ('expense_stats',   'Tra cứu chi phí',                     30),
  ('timesheets',      'Chấm công, tạm ứng lương',            40),
  ('payables',        'Công nợ (HĐ thầu phụ, NCC, tất toán)', 50),
  ('payments',        'Phiếu chi',                           60),
  ('revenue',         'HĐ chính, thu tiền',                  70),
  ('settlements',     'Quyết toán',                          80),
  ('profit',          'Lợi nhuận',                           90),
  ('schedule',        'Tiến độ',                            100),
  ('cost_allocation', 'Tỉ trọng, định mức, cấu hình rổ',     110),
  ('equipment',       'Thiết bị',                           120),
  ('dashboard',       'Dashboard',                          130),
  ('contacts',        'Danh bạ',                            140),
  ('catalog',         'Danh mục & sao lưu',                 150),
  ('accounts',        'Tài khoản & phân quyền',             160)
) as v(key, label, sort_order)
where m.key = v.key;
