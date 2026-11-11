-- GĐ1 — Dữ liệu ban đầu: công ty, danh sách mục, 5 vai trò mặc định + bảng quyền
-- Đúng như giao diện mẫu (thiet-ke/giao-dien-mau.html: PERM_ROWS, PERM_EXTRA). Admin sửa lại trong app được.

insert into public.app_modules (key, label, sort_order) values
  ('projects',        'Công trình',                 10),
  ('expenses',        'Nhập chi phí, chụp hóa đơn', 20),
  ('expense_stats',   'Thống kê CP/HĐ',             30),
  ('timesheets',      'Chấm công, tạm ứng lương',   40),
  ('payments',        'Chi trả TP/NCC',             50),
  ('payables',        'Công nợ phải trả',           60),
  ('cost_allocation', 'Tỉ trọng & định mức',        70),
  ('equipment',       'Theo dõi thiết bị',          80),
  ('schedule',        'Tiến độ',                    90),
  ('contacts',        'Danh bạ',                   100),
  ('revenue',         'Doanh thu, thu tiền',       110),
  ('settlements',     'Quyết toán',                120),
  ('profit',          'Lợi nhuận, lãi/lỗ',         130),
  ('dashboard',       'Dashboard',                 140),
  ('catalog',         'Danh mục & sao lưu',        150),
  ('accounts',        'Tài khoản & quyền',         160);

insert into public.companies (id, name, short_name, slug)
values ('00000000-0000-0000-0000-000000000001', 'CÔNG TY NGUYỄN HỮU', 'Nguyễn Hữu', 'nguyenhuu');

insert into public.roles (id, company_id, name, description, is_admin, sort_order,
                          see_contact_ids, edit_others, purge_trash, default_project_scope) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'Admin',
   'Cao nhất: xem, sửa mọi thứ, quản lý tài khoản và quyền', true, 10, true, true, true, 'all'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', 'Giám đốc',
   'Mọi mục trừ Tài khoản & Quyền. Danh mục & sao lưu chỉ xem', false, 20, true, true, true, 'all'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000001', 'Quản lý',
   'Toàn quyền nhập liệu, doanh thu, quyết toán, công nợ. Lợi nhuận và Dashboard chỉ xem', false, 30, true, true, false, 'all'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000001', 'Kế toán',
   'Nhập chi phí, chấm công, chi trả. Không thấy doanh thu, lợi nhuận', false, 40, false, false, false, 'all'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-000000000001', 'Chỉ xem',
   'Chỉ xem công trình được giao, thống kê chi phí, tiến độ', false, 50, false, false, false, 'assigned');

-- Cột: Admin, Giám đốc, Quản lý, Kế toán, Chỉ xem (f = full, v = view, a = add, h = none)
with grid(module, a1, a2, a3, a4, a5) as (values
  ('projects',        'f','f','f','v','v'),
  ('expenses',        'f','f','f','a','h'),
  ('expense_stats',   'f','f','f','v','v'),
  ('timesheets',      'f','f','f','a','h'),
  ('payments',        'f','f','f','a','h'),
  ('payables',        'f','f','f','v','h'),
  ('cost_allocation', 'f','f','f','h','h'),
  ('equipment',       'f','f','f','h','h'),
  ('schedule',        'f','f','f','v','v'),
  ('contacts',        'f','f','f','v','h'),
  ('revenue',         'f','f','f','h','h'),
  ('settlements',     'f','f','f','h','h'),
  ('profit',          'f','f','v','h','h'),
  ('dashboard',       'f','f','v','h','h'),
  ('catalog',         'f','v','v','h','h'),
  ('accounts',        'f','h','h','h','h')
), cells(module, role_id, code) as (
  select module, '00000000-0000-0000-0000-0000000000a1'::uuid, a1 from grid union all
  select module, '00000000-0000-0000-0000-0000000000a2'::uuid, a2 from grid union all
  select module, '00000000-0000-0000-0000-0000000000a3'::uuid, a3 from grid union all
  select module, '00000000-0000-0000-0000-0000000000a4'::uuid, a4 from grid union all
  select module, '00000000-0000-0000-0000-0000000000a5'::uuid, a5 from grid
)
insert into public.role_permissions (role_id, module, level, company_id)
select role_id, module,
       case code when 'f' then 'full' when 'a' then 'add' when 'v' then 'view' else 'none' end,
       '00000000-0000-0000-0000-000000000001'
from cells;
