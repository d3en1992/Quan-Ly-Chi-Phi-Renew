# TỪ ĐIỂN — tiếng Việt ↔ tên trong code

Quy ước: bảng / cột `snake_case`, biến / hàm `camelCase`, component `PascalCase`, thư mục `kebab-case` (KẾ HOẠCH mục 4B).
Giao diện luôn tiếng Việt. Bảng này mở rộng dần ở các giai đoạn sau.

## Tab, đường dẫn, mục quyền

| Tab (giao diện) | Đường dẫn | Mục quyền (`module`) | Thư mục `src/features/` |
|---|---|---|---|
| Công Trình (+ Chi tiết CT) | `/cong-trinh`, `/cong-trinh/:projectId` | `projects` | `projects` |
| Nhập Chi Phí | `/nhap-chi-phi` | `expenses` | `expenses` |
| Thống Kê CP/HĐ | `/thong-ke-cp-hd` | `expense_stats` | `expense-stats` |
| Chấm Công (+ Tạm ứng lương) | `/cham-cong` | `timesheets` | `timesheets` |
| Chi Trả TP/NCC (app cũ: Ứng TP/NCC) | `/chi-tra` | `payments` | `payments` |
| Công Nợ Phải Trả (app cũ: Công Nợ TP/NCC) | `/cong-no` | `payables` | `payables` |
| Tỉ Trọng & Định Mức | `/ti-trong` | `cost_allocation` | `cost-allocation` |
| Theo Dõi TB | `/thiet-bi` | `equipment` | `equipment` |
| Tiến Độ | `/tien-do` | `schedule` | `schedule` |
| Danh Bạ | `/danh-ba` | `contacts` | `contacts` |
| Doanh Thu | `/doanh-thu` | `revenue` | `revenue` |
| Lợi Nhuận | `/loi-nhuan` | `profit` | `profit` |
| Quyết Toán | `/quyet-toan` | `settlements` | `settlements` |
| Dashboard | `/dashboard` | `dashboard` | `dashboard` |
| Danh Mục & Sao Lưu | `/danh-muc` | `catalog` | `catalog` |
| Tài Khoản & Quyền | `/tai-khoan` | `accounts` | `accounts` |
| Thùng Rác | `/thung-rac` | (thấy khi có quyền Nhập ở 1 mục) | `trash` |
| Tổng quan (điện thoại) | `/tong-quan` | `projects` | — |
| Chụp đa năng (điện thoại) | `/chup` | `expenses` | `capture` |
| Thêm (điện thoại) | `/them` | — | — |
| Đăng nhập / Đổi mật khẩu | `/dang-nhap`, `/doi-mat-khau` | — | `auth` |

## Tài khoản, quyền (GĐ1)

| Tiếng Việt | Trong code |
|---|---|
| Công ty | `companies`, `company_id`, `current_company_id()` |
| Tài khoản | `profiles` (`username`, `display_name`, `role_id`, `must_change_password`, `project_scope`, `is_locked`) |
| Tên đăng nhập | `username` → email ẩn `<username>@<slug>.qlcp` (`toLoginEmail`) |
| Tên hiển thị = Người TH | `display_name` / `createdBy` |
| Vai trò | `roles` (`is_admin`) |
| Quyền theo mục | `role_permissions` (`module`, `level`), danh sách mục `app_modules` |
| Ẩn / Xem / Nhập / Toàn quyền | `none` / `view` / `add` / `full` |
| Xem SĐT, CCCD | `see_contact_ids` |
| Sửa / xóa dòng người khác | `edit_others` |
| Xóa vĩnh viễn trong Thùng rác | `purge_trash` |
| Phạm vi công trình: tất cả / được giao | `project_scope`: `all` / `assigned`; bảng `profile_projects` |
| Bắt đổi mật khẩu lần đầu | `must_change_password`, `complete_password_change()` |
| Khóa tài khoản | `is_locked` + ban trong Supabase Auth (Edge Function `admin-users`) |
| Kiểm tra quyền | `has_permission(module, level)`, `has_special(flag)`, `get_my_access()` |
| Chọn năm (nhiều năm / Tất cả) | `YearSelection` (`'all'` hoặc `number[]`) |
| Máy tính / máy tính bảng / điện thoại | `LayoutMode`: `desktop` / `tablet` / `phone` |

## Nghiệp vụ (từ KẾ HOẠCH 4, 4B, 4L)

| Tiếng Việt | Trong code |
|---|---|
| Công trình / CÔNG TY (chi phí chung) | `project` / `isCompanyOverhead` |
| Loại công trình CT / SC / SN | `kind`: `new_build` / `renovation` / `small_repair` |
| Hóa đơn chi phí, dòng vật tư | `expense`, `expenseLine` |
| Loại chi phí, Nhà cung cấp, Người mua, Người TH | `expenseType`, `supplier`, `buyer`, `createdBy` |
| Đã thanh toán lúc mua (Đã TT) | `paidAtPurchase` |
| Mua nợ (NCC) | `buysOnCredit` |
| Chấm công tuần, công, lương/ngày, thực lãnh | `timesheetWeek`, `dayUnits`, `dailyWage`, `netPay` |
| Tạm ứng lương (ứng công nhân), trả | `wageAdvance`, `repayment` |
| Phiếu chi TP / NCC: Tạm ứng · Thanh toán đợt · Trả nợ NCC | `payment` (`kind`: `advance` / `progress` / `supplier_payment`) |
| Công nợ phải trả | `payable` |
| Đã trả (app cũ: Đã ứng) | `paid` |
| HĐ chính, HĐ thầu phụ, quyết toán, tất toán | `mainContract`, `subcontract`, `settlement`, `payableClosure` |
| Thu tiền, còn phải thu | `receipt`, `receivable` |
| Phân bổ chi phí chung (C), hệ số k | `overheadAllocation`, `costWeightK` |
| Tỉ trọng, định mức, rổ | `costAllocation`, `costBenchmark`, `costBucket` |
| Thiết bị: tại CT / kho / giàn giáo | `equipment` (`location`: `project` / `warehouse` / `scaffold`) |
| Thầu phụ, công nhân, khách hàng, nhân viên | `subcontractor`, `worker`, `customer`, `employee` |
| Danh mục | `catalogItem` (`kind`: `expense_type` / `supplier` / `person` / `subcontractor` / `equipment_name`) |
| Thùng rác (xóa mềm) | `deleted_at`, `trash` |

## Bảng dữ liệu (GĐ2) — app cũ → kho mới

| App cũ | Bảng mới | Ghi chú |
|---|---|---|
| `projects_v1`, `cat_ct_years` | `projects` | `kind`, `status` (planning / active / completed / closed), `cost_weight_k`, `floor_areas`, `created_year`, `aliases`, `is_company_overhead` (= CÔNG TY) |
| `customers_v1` | `customers` (+ `contact_private`) | SĐT, CCCD nằm ở `contact_private` |
| `inv_v3`, `inv_v3.items` | `expenses`, `expense_lines` | `paid_at_purchase`, `buyer_id`, `source`: quick / detail / scan / import |
| `cc_v2`, `cc_v2.workers` | `timesheet_weeks`, `timesheet_lines` | `week_start` = Chủ nhật; `day_units` (7 ô CN..T7), `daily_wage`, `allowance` (phụ cấp), `retail_purchase` (HĐ mua lẻ), `debt_deduction` (trừ nợ), `legacy_loan` |
| `ung_v1` loại thầu phụ / NCC | `payments` | `kind`: advance / progress / supplier_payment; `allocation_mode`: fifo / project / manual |
| (mới) | `payment_allocations` | phiếu chi NCC ↔ hóa đơn, số tiền đã chia |
| `ung_v1` loại công nhân | `wage_advances` | `direction`: advance (ứng) / repay (trả); `counts_in_net_pay` |
| `ung_v1` có `autoSettle` | `payable_closures` | tất toán; `undone_at` = đã hoàn tác |
| `thu_v1` | `receipts` | `kind`: advance (tạm ứng) / stage (giai đoạn) / settlement (quyết toán) / other; `is_auto` |
| `hopdong_v1` | `main_contracts` | `value`, `extra_value` (giá trị phụ), `legacy_variation` (phát sinh cũ), `items` |
| `thauphu_v1` | `subcontracts` | |
| `quyettoan_v1` | `settlements` | `kind`: increase / decrease / replace; `amount` luôn dương; `is_final` = Chốt |
| `tb_v1` | `equipment` | `location`: project / warehouse (Kho thiết bị) / scaffold (Kho giàn giáo); `condition`: working / needs_maintenance / needs_repair |
| `tytrong_v1` | `cost_allocations` | `kind`: project / benchmark (định mức) / config (cấu hình rổ); `data` jsonb giữ tên trường cũ |
| `cat_items_v1`: loai / nguoi / tbteb | `catalog_items` | `kind`: expense_type / person / equipment_name / unit |
| `cat_items_v1`: ncc / tp / cn (+ `cat_cn_roles`) | `suppliers`, `subcontractors`, `workers` | `workers.role`: C / T / P |
| (mới) | `employees`, `schedule_templates`, `schedule_phases`, `schedule_tasks`, `schedule_notes` | Nhân viên; Tiến độ (GĐ12) |

| Tiếng Việt | Trong code |
|---|---|
| Lưu trữ (ẩn khỏi gợi ý, vẫn hiện tên ở bản ghi cũ) | `archived` |
| Phạm vi công trình trong RLS | `sees_all_projects()`, `my_project_ids()` |
| Được sửa dòng (Toàn quyền, hoặc Nhập + dòng của mình / quyền sửa dòng người khác) | `can_edit_row(modules, created_by)` |
| Có ít nhất 1 trong các mục đạt mức quyền | `has_any_permission(modules, level)` |
| SĐT / CCCD đã che | `list_contact_private_masked()` |

