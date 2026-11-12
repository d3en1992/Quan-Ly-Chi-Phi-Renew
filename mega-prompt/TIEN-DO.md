TRẠNG THÁI: ĐANG CHẠY
Nhịp tim: 12/11/2026 07:35 — GD06 xong: typecheck / 146 Vitest / build / 59 Playwright xanh
Đang làm: (GD06 xong — chờ GD07)

# Tiến độ làm lại app

| GĐ | Nội dung | Model | Trạng thái | Ghi chú |
|---|---|---|---|---|
| GD01 | Khung app, đăng nhập, quyền, bố cục 3 khổ | Opus | **Xong** 11/11 | typecheck / 24 Vitest / build / 14 Playwright xanh. Ảnh: `anh-chup/GD01/` |
| GD02 | Kho dữ liệu + chuyển dữ liệu cũ ⭐ | Fable | **Xong** 11/11 | Khớp hết với snapshot 02/11 (bản tạm). typecheck / 40 Vitest / build / 19 Playwright xanh. Báo cáo: `du-lieu/bao-cao-chuyen-du-lieu.md` |
| GD03 | Công thức + báo cáo khớp số ⭐⭐ | Fable | **Xong** 11/11 | So với app cũ **lệch 0 đồng** (36 công trình × 2024, 2025, 2026, Tất cả). typecheck / 75 Vitest / build / 27 Playwright xanh. Ảnh: `anh-chup/GD03/` |
| GD04 | Công Trình, Chi tiết CT, Danh Bạ, Danh Mục | Sonnet (medium) | **Xong** 11/11 | typecheck / 96 Vitest / build / Playwright xanh (gd04: 3 file spec). Ảnh: `anh-chup/GD04/` |
| GD05 | Nhập Chi Phí (lưới Excel, chi tiết) | Fable (medium) | **Xong** 12/11 | typecheck / 126 Vitest / build / 54 Playwright xanh (gd05: 8 test). Ảnh: `anh-chup/GD05/` |
| GD06 | Chấm Công + Tạm ứng lương | Opus (medium) | **Xong** 12/11 | typecheck / 146 Vitest / build / 59 Playwright xanh (gd06: 5 test). So với app cũ lệch 0 (124 tuần × mọi người). Ảnh: `anh-chup/GD06/` |
| GD07 | Chi Trả, Công Nợ Phải Trả, Doanh Thu, Quyết Toán | Fable (medium) | Chưa | |
| GD10 | Điện thoại, máy tính bảng, PWA, bản thử online | Sonnet (medium) | Chưa | |
| GD08 | Thiết bị, Tỉ trọng, Thùng rác | Opus (medium) | Chưa | |
| GD09 | Chụp đa năng + Xuất Excel | Sonnet (high) | Chưa | |
| GD12 | Tiến Độ phần 1 | Sonnet (medium) | Chưa | |
| GD99 | Kiểm tra cuối + báo cáo sáng | Sonnet (medium) | Chưa | |

## GD01 — đã có gì (cho GĐ sau)
- Khung: `src/app/` (App.tsx = đường dẫn + chặn quyền; `nav.ts` = menu đủ mọi tab; DesktopShell / PhoneShell). Tab chưa làm hiện trang "Đang làm"; thêm trang thật vào `PAGES` trong `App.tsx`.
- Kho: migration `20261111000001_tai_khoan_va_quyen.sql` (companies, app_modules, roles, role_permissions, profiles, profile_projects, `has_permission`, `has_special`, `current_company_id`, `get_my_access`, RLS) và `…000002_du_lieu_quyen_ban_dau.sql` (công ty `nguyenhuu`, 16 mục, 5 vai trò + bảng quyền như mẫu).
- Edge Function `admin-users` (create / reset_password / set_locked), chỉ Admin gọi được.
- `profile_projects.project_id` **chưa có khóa ngoại** — GĐ2 thêm FK tới `projects` khi tạo bảng.
- Id cố định: công ty `00000000-0000-0000-0000-000000000001`; vai trò Admin…Chỉ xem = `…0000a1` … `…0000a5`.

## GD02 — đã có gì (cho GĐ sau)
- **Bảng:** migration `20261111000003_bang_nghiep_vu.sql` — customers, employees, workers, subcontractors, suppliers, contact_private, catalog_items, projects, expenses, expense_lines, timesheet_weeks, timesheet_lines, wage_advances, main_contracts, subcontracts, settlements, receipts, payable_closures, payments, payment_allocations, equipment, cost_allocations, schedule_templates / phases / tasks / notes. Kiểu TypeScript: `src/types/db.ts` (`npm run gen:types`); `supabase` trong `src/lib/supabase.ts` đã có kiểu `Database`.
- **Chuyển dữ liệu:** `npm run migrate:legacy` (= `scripts/migrate-legacy.ts` + `scripts/compare-counts.ts`). Lõi là hàm thuần `scripts/legacy/transform.ts` (có 16 test). Chạy lại bao nhiêu lần cũng ra cùng mã băm.
- **Id:** giữ NGUYÊN id UUID của app cũ (công trình, hóa đơn, tuần chấm công, phiếu ứng, phiếu thu…) → `so-chuan.json` (có `id` công trình) và khóa trong jsonb tỉ trọng vẫn khớp. Công trình CÔNG TY: `is_company_overhead = true` (tìm theo cờ, không theo id).
- **Công thức cho GĐ3 (đã thử, lệch 0 trên 108 ô công trình × năm):**
  - A phần hóa đơn = Σ `expenses.amount` có `paid_at_purchase = true`, lọc năm theo `expenses.date`.
  - A phần trả NCC = Σ `payment_allocations.amount` theo `payment_allocations.project_id`, lọc năm theo **ngày của phiếu chi** (`payments.date`), KHÔNG theo ngày hóa đơn. Dòng có `expense_id = null` là phần trả dư, vẫn phải cộng.
  - B = Σ `payments.amount` có `kind in (advance, progress)` theo `project_id`. Đã thu = Σ `receipts.amount`.
  - Lương chấm công không lưu thành hóa đơn: tính từ `timesheet_lines` (Σ `day_units` × `daily_wage` + `allowance`; HĐ mua lẻ = `retail_purchase` > 0), ngày = `week_start` + 6.
  - `projects.cost_weight_k` null = mặc định 1 (như `getProjectK`). `expenses.source = 'import'` (cũ: `excel_invQ`) tương đương 'manual' trong `tongHoaDonTheoNguon` của so-chuan.
  - Quyết toán: `settlements.amount` luôn dương, dấu nằm ở `kind` (increase / decrease / replace). HĐ gốc = `value + extra_value + legacy_variation`.
- **RLS:** mỗi bảng 4 chính sách (đọc / thêm / sửa / xóa hẳn) + lọc theo phạm vi công trình của tài khoản. Bảng tra cứu (danh mục, NCC, thầu phụ) ai trong công ty cũng đọc được. Test: `e2e/gd02-rls.spec.ts`.

## GD03 — đã có gì (cho GĐ sau)
- **Dữ liệu đang dùng:** `du-lieu/snapshot.json` = `du-lieu-xu-ly/file-import-chuan-hoa/cpct_snapshot_2026-11-03_14-25.json` (anh Tình chỉ định; có 4 lô nhập NHÁP 2024–2025: 277 hóa đơn, 123 phiếu ứng, 7 phiếu thu, 13 HĐ thầu phụ, 4 HĐ chính).
- **Số chuẩn:** `npm run so-chuan` (= `scripts/legacy/xuat-so-chuan-node.mjs`) nạp NGUYÊN code `../ban-dang-dung/js` vào hộp cát `node:vm` (document / mạng là đồ giả, không đụng Firebase), đổ snapshot vào `_mem`, chạy đúng `mega-prompt/xuat-so-chuan.js` → `du-lieu/so-chuan.json`. Xem bằng mắt ADMIN (thấy dữ liệu nháp). Đổi snapshot thì chạy lại: `npm run migrate:legacy` → `npm run so-chuan` → `npm test`.
- **Công thức** `src/lib/calc/` (import từ `@/lib/calc`): `year.ts` (`inYear` = thiếu ngày thì loại; `inYearLoose` = thiếu ngày thì hiện mọi năm, dùng cho thu / HĐ / quyết toán / phiếu chi / hóa đơn trong lãi-lỗ), `timesheet.ts`, `overhead.ts` (ngày tính theo giờ VN cố định +07; chọn NHIỀU năm thì số ngày = cả vòng đời như app cũ; công trình chưa kết thúc tính tới "bây giờ" nên C đổi theo giờ xem), `revenue.ts`, `profit.ts` (`profitReport` = bảng tab Lợi Nhuận kèm quy tắc năm hạch toán 80%; `projectProfit` = `lnTinhCongTrinh`), `payables.ts` (chia tiền trả NCC cũ nhất trước; công nợ NCC; đã trả từng HĐ thầu phụ như `_hdtpUngAlloc`), `stats.ts` (chi theo tuần, cơ cấu chi, tổng danh sách).
- **Đọc dữ liệu:** `src/features/reports/api.ts` → `useReportData()` tải mọi năm 1 lần (bản ghi còn sống, Zod kiểm tra, giữ 1 phút), 3 màn dùng chung; lọc năm bằng ô chọn năm trên thanh trên (`useReport()` trong `shared.tsx`).
- **Component dùng chung đã chốt** (GĐ sau chỉ dùng lại): `src/components/ui/data.tsx` — `KpiStrip` (dải số tổng), `FilterBar` + `FilterSelect` + `SearchBox` (thanh lọc), `HBar` / `HBarList`, `ProfitPill`, `Money` + `signedMoney`, `usePaged` + `Pager`, `MobileCard` + `MobileRow`, `PhoneKpis`, `Segmented`; cùng `misc.tsx` (Card, CardHeader, PageHeader, SubTabs, Pill, Note, Loading / Empty / ErrorState), `sheet.tsx` (bảng trượt), `confirm.tsx` (hộp xác nhận xóa), `toast.tsx`, `input.tsx` (Input, Select, Field, Checkbox), bảng `.tbl`. **Chưa có** (làm ở GĐ4–GĐ5 lúc có form nhập đầu tiên): ô tiền tự thêm dấu chấm, ô ngày, ô chọn công trình, ô chọn danh mục có gợi ý + "Tạo mới".

## GD04 — đã có gì (cho GĐ sau)
- **Công Trình** `src/features/projects/`: `ProjectsPage.tsx` (thẻ theo loại CT / SC / SN-Khác hoặc theo khách hàng, CÔNG TY cuối; dải số; lọc trạng thái + tìm), `ProjectDetailPage.tsx` (dải số + cấu thành A/B/C + 6 tab), `ProjectFormSheet.tsx` (thêm / sửa; chủ đầu tư bắt buộc + "Thêm nhanh"; tên gợi ý ≤ 45 ký tự, hạng mục trong ngoặc; hệ số k; ngày; khối lượng sàn; địa chỉ), `logic.ts` (nhận loại theo tiền tố tên, gợi ý tên — chép app cũ, có test), `api.ts` (đọc / ghi + `projectUsageCount` cho điều kiện xóa), `numbers.ts` (`projectNumbers` = cùng `profitReport` của tab Lợi Nhuận → số thẻ = số Lợi Nhuận). Hoàn thành / Quyết toán / Xóa nằm ở menu "Khác" trên trang Chi tiết. Đổi tên: tên cũ được nhớ trong `projects.aliases`.
- **Công thức mới** `src/lib/calc/projectDetail.ts` (có test, kể cả test trên dữ liệu thật: Σ chi theo loại = A của Lợi Nhuận cho mọi công trình × 2024 / 2025 / 2026 / Tất cả): `projectCostByType`, `projectPayroll`, `projectSubcontracts`, `projectSuppliers`, `subcontractorStandings`, `collapseBreakdown`. `ReportData` thêm `subcontractorName`. `ExpenseStatsPage` xuất `buildRows / PaidPill / DetailSheet / SOURCE_LABEL` để tab Hóa đơn của Chi tiết dùng lại.
- **Danh Bạ** `src/features/contacts/` (5 nhóm; thêm / sửa / xóa mềm; SĐT, CCCD che theo `see_contact_ids` bằng `list_contact_private_masked()`; người không có quyền không sửa được trường riêng tư; bật / tắt Mua nợ của NCC). Nút **Chụp CCCD để sẵn (khóa) — làm ở GĐ9**.
- **Danh Mục & Sao Lưu** `src/features/catalog/` + migration `20261111000004_danh_muc_sao_luu.sql`: danh mục 5 nhóm (thêm / đổi tên / xóa mềm, chặn xóa mục đang dùng, chuẩn hóa tên như app cũ), thông tin công ty (tên, tên ngắn, logo; logo lưu dạng ảnh nhỏ 128 px trong `companies.logo_url`, hiện ở menu trái), sao lưu: bảng `backups` + hàm `create_backup / export_company_snapshot / get_backup_data / restore_backup` (chỉ Admin; khôi phục chạy trong 1 giao dịch và tự lưu bản "trước khi khôi phục"). `scripts/backup-nightly.ts` (`npm run backup:nightly`, thử bằng `-- --local`) + mẫu `scripts/mau-github-action-sao-luu.yml` (CHƯA bật, hướng dẫn ở đầu file). `stamp_row` biết cờ `app.restoring` để giữ nguyên Người TH / ngày khi khôi phục.

## GD05 — đã có gì (cho GĐ sau)
- **Tab Nhập Chi Phí** `src/features/expenses/`: `ExpenseEntryPage.tsx` (3 tab con: NHẬP NHANH · HÓA ĐƠN CHI TIẾT · CHỤP HÓA ĐƠN = chỗ trống chờ GĐ9; dưới là "Hóa đơn trong ngày" theo ngày của dòng đang đứng), `QuickGrid.tsx` + `grid-model.ts` (lưới kiểu Excel: Enter / Tab / mũi tên / Shift chọn vùng / Ctrl+C, V, D, S / Delete / Space; gợi ý ngay dưới ô, "+ Tạo mới"; NCC Mua nợ tự bỏ tích Đã TT), `InvoiceForm.tsx` + `invoice-model.ts` (form một hóa đơn có / không có dòng vật tư, nội dung tự ghép, "Mua tại" + nhãn "khác khu vực"), `EditExpenseSheet.tsx` (bảng trượt sửa / xóa mềm; `EditExpenseById` để màn khác mở theo id), `PhoneEntry.tsx` (điện thoại: Nhập tay), `logic.ts` (gợi ý không dấu, dán TSV, ngày, cảnh báo trùng, đoán quận / huyện), `api.ts` (`useLookups`, `useEntryExpenses`, `useCreateExpenses`, `useUpdateExpense`, `useDeleteExpense`, `useCreateLookup`).
- **Công thức** `src/lib/calc/expense.ts`: `parseMoneyDigits` (ô tiền chỉ nhận số, KHÔNG nhận "1tr"), `parsePastedMoney` (tiền dán từ Excel), `lineAmount` (SL × đơn giá − chiết khấu), `sumAmounts`.
- **Component dùng chung mới:** `components/ui/combo.tsx` (`Combo` = ô chọn có gợi ý + "Tạo mới"; `SuggestPanel`), `MoneyInput` trong `input.tsx`, `Sheet` thêm `wide`.
- **Thống Kê CP/HĐ:** thêm lọc Thanh toán (Đã trả / Mua nợ) và Nguồn (Nhanh / Chi tiết / Ảnh / Excel / Chấm công); mở dòng có nút "Sửa hóa đơn" (người có quyền Nhập).
- Lưu / sửa / xóa hóa đơn tự làm mới số của Lợi Nhuận, Dashboard, Thống Kê (cùng `REPORT_DATA_KEY`).

## GD06 — đã có gì (cho GĐ sau)
- **Tab Chấm Công** `src/features/timesheets/`: `TimesheetPage.tsx` (3 tab con), `WeekSheet.tsx` (SỔ CHẤM CÔNG máy tính + điện thoại MP.cc: tuần CN→T7 lùi / tiến / chọn ngày, chọn công trình, thêm thợ gợi ý từ Danh Bạ + "Tạo mới", ô ngày bấm 1→½→0 hoặc gõ 1 / 5 / 0, Lương/ngày, Phụ cấp, HĐ mua lẻ, Nội dung, Trừ nợ, Thực lãnh, dòng tổng, Copy / Dán tuần (nhớ trong máy), Phiếu lương Zalo, Lưu tuần, Xóa tuần; hỏi trước khi bỏ thay đổi chưa lưu), `PayrollTab.tsx` (Tổng lương tuần tick cộng nhanh + CSV + phiếu lương người đã tick; Lịch sử tuần bấm mở lại), `AdvancesTab.tsx` (sổ Tạm ứng lương theo tháng / cả kỳ, ghi / sửa / xóa mềm phiếu ứng / trả, lịch sử từng người), `sheet-model.ts` (bảng nháp, kiểm tra trước khi lưu, copy / dán — có test), `api.ts`.
- **Công thức** `src/lib/calc/payroll.ts`: `calcSheetRow`, `sheetTotals`, `debtBefore` / `debtUpTo` / `currentDebt`, `ledgerRows`, `workerLedger`, `weeklyPayroll` (= `renderCCTLT`), `weekHistory`, `payslipData` + `payslipText` (= `ccPayslipData` / `ccPayslipText`), `netPayLedgerAdj`, nhãn tuần. Chi phí lương vào A theo thứ Bảy vẫn là `timesheetCostEntries` (GĐ3) — có thêm test tuần vắt năm ở mức lợi nhuận.
- **Kho:** migration `20261112000005_cham_cong.sql`: cột `wage_advances.source_week_id` + hàm `save_timesheet_week(project, week_start, lines jsonb)` (1 giao dịch: ghi tuần, ghi / sửa dòng theo công nhân, xóa mềm dòng bị bỏ, đồng bộ dòng "Trả" của cột Trừ nợ) và `delete_timesheet_week(id)` (xóa mềm tuần + dòng + dòng "Trả" của tuần). Cả hai chạy bằng quyền người gọi (RLS vẫn kiểm tra).
- **So số:** `npm run so-chuan` giờ xuất thêm `chamCong` (phiếu lương từng người × từng tuần + nợ còn lại, tính bằng code app cũ). Test `payroll.test.ts` so 124 tuần × mọi người: công, lương, phụ cấp, HĐ lẻ, ứng, trả, thực lãnh, nợ — lệch 0; nợ hiện tại từng công nhân — lệch 0.
- GĐ8 (Thùng rác): khôi phục một tuần chấm công phải khôi phục cả dòng (`timesheet_lines` cùng `deleted_at`) và dòng "Trả" có `source_week_id` = tuần đó.
## Kết quả so số với app cũ
- GD06 (12/11): Tổng lương tuần / phiếu lương / nợ công nhân so với ccPayslipData + ccWorkerDebtUpTo của app cũ chạy trên snapshot 03/11: **lệch 0** ở 124 tuần (3 tuần đầu / giữa / cuối so riêng tổng TC Lương + Thực lãnh).
- GD03 (11/11, snapshot 03/11 14:25 + so-chuan xuất bằng code app cũ chạy trong Node): **lệch 0 đồng** ở A, A phần hóa đơn, A phần trả NCC, B, C, Tổng đã chi, Tổng đã thu, Lợi nhuận, HĐ gốc, Quyết toán, Giá trị HĐ, Còn phải thu của 36 công trình × 4 mốc (2024, 2025, 2026, Tất cả) = 1.728 ô; chi phí chung CÔNG TY + bảng phân bổ (trọng số, tiền) khớp; số hóa đơn và tổng theo nguồn khớp (1.527 dòng). Tổng trên màn Lợi Nhuận (Tất cả năm) khớp so-chuan (Playwright).
- GD02 (11/11, snapshot tạm 02/11/2026): số bản ghi 11/11 kho khớp; 15 tổng tiền lệch 0; A / B / Đã thu từng công trình × từng năm lệch 0 (108 ô). Chưa có `so-chuan.json` nên chưa so với số xuất từ app cũ → GĐ3.

## Quyết định AI tự chọn
- GD01: **Kế toán không thấy "Danh Mục & Sao Lưu"**. Giao diện mẫu mâu thuẫn: `ACCOUNTS.ketoan.hide` không ẩn Danh mục, nhưng bảng quyền mẫu (`PERM_ROWS`) ghi Danh mục = Ẩn. Chọn theo bảng quyền (an toàn hơn); Admin bật lại 1 ô là xong.
- GD01: **Thùng Rác** không có dòng riêng trong bảng quyền mẫu → hiện khi tài khoản được **Nhập** ở ít nhất 1 mục (Kế toán thấy, Chỉ xem không thấy — khớp mẫu). Quyền khôi phục / xóa hẳn làm ở GĐ8 (`purge_trash`).
- GD01: Phạm vi công trình trong bảng quyền là **mặc định của vai trò** khi tạo tài khoản; phạm vi thật nằm ở từng tài khoản (`profiles.project_scope`). Chọn công trình cụ thể để giao làm sau khi có bảng `projects` (GĐ2–GĐ4).
- GD01: Admin luôn toàn quyền (trigger chặn sửa quyền / xóa vai trò Admin, không tạo thêm vai trò Admin). Admin không tự khóa / tự đổi vai trò của mình.
- GD01: Đổi quyền → menu người dùng vai trò đó tự đổi trong ≤ 1 phút (app tự hỏi lại quyền mỗi 60 giây và khi quay lại cửa sổ); RLS trong kho có hiệu lực ngay.
- GD01: Mật khẩu tối thiểu 8 ký tự, có chữ và số. Mật khẩu tạm dạng `K7mq-42xa`. Tắt đăng ký tự do (chỉ Admin tạo tài khoản).
- GD01: Không làm bước "cất code cũ sang nhánh `luu-tru-vanilla`" và "thay `main`" của KẾ HOẠCH mục GĐ1 — prompt GD01 chỉ cho làm trên `dev`, không đụng `main`. `main` trên GitHub vẫn là code cũ.

- GD02: **Giữ nguyên id cũ** (UUID) làm id mới thay vì sinh id mới + cột tham chiếu — để so-chuan.json và dữ liệu tỉ trọng khớp, chạy lại ra cùng kết quả.
- GD02: **Bản xóa mềm → Thùng rác** (`deleted_at`). **Mọi bia mộ** (88 thiết bị + 1 phiếu ứng đã xóa vĩnh viễn) bỏ hết, kể cả bia mộ chưa quá 90 ngày — vì đã xóa vĩnh viễn thì không nên sống lại.
- GD02: **Danh mục gộp theo tên** (app cũ so khớp theo tên). Mục đã xóa ở app cũ mà không bản ghi nào dùng → bỏ (153 mục); nếu còn bản ghi dùng → giữ, đánh dấu `archived` (snapshot này không có mục nào như vậy).
- GD02: **SĐT, CCCD, tài khoản nhận lương** của khách hàng / công nhân / nhân viên / thầu phụ nằm ở bảng riêng `contact_private` (không nằm thẳng trong `workers`, `customers` như prompt ghi), vì RLS chỉ chặn được theo dòng. Người không có quyền “Xem SĐT, số CCCD” gọi `list_contact_private_masked()` để lấy bản đã che. SĐT cửa hàng của NCC vẫn ở `suppliers.phone` (in trên hóa đơn, Kế toán cần ghi khi chụp HĐ).
- GD02: Tên trong kho theo tiếng Anh (mục 4B): `receipts.kind` = advance / stage / settlement / other (kế hoạch ghi tamung / giaidoan / quyettoan / khac); `equipment.condition` = working / needs_maintenance / needs_repair; `expenses.source` thêm `import` cho hóa đơn nhập Excel cũ.
- GD02: **Ứng thầu phụ**: gắn HĐ thầu phụ khi phiếu có `hdtpId` hoặc cặp thầu phụ + công trình chỉ có 1 HĐ; 21 phiếu thuộc cặp có nhiều HĐ để `subcontract_id` trống — GĐ7 chia cũ nhất trước lúc xem như `_hdtpUngAlloc`. Mọi phiếu ứng TP cũ là `kind = advance` (app cũ không phân biệt tạm ứng / thanh toán đợt).
- GD02: **Phiếu chi NCC cũ** `allocation_mode = 'project'` (chỉ chia trong công trình cũ). 1 phiếu trả dư 2.000 đ so với hóa đơn mua nợ → 1 dòng chia không gắn hóa đơn, vẫn tính cho công trình đó để lãi / lỗ khớp app cũ.
- GD02: **Tất toán** cũ (11 lần, theo `settleId`) → `payable_closures`; lần đã hủy thì có `undone_at` + `deleted_at`.
- GD02: Trường cũ không chuyển: `deviceId`, `deletedBy`, `_ts`, `footerCkStr` (toàn rỗng), `debtBefore` trong chấm công (code cũ không còn đọc, nợ tính động), `settledBy` (chỉ dùng khi phiếu tất toán thiếu Người TH), `tb_v1.nguoi` (toàn rỗng).
- GD02: RLS **Kế toán được thêm NCC / danh mục mới** ngay lúc nhập chi phí (chỉ thêm; sửa mục người khác cần quyền Danh mục / Danh bạ). **Tất toán** cần quyền Công nợ ≥ Nhập (mặc định Kế toán chỉ Xem — app cũ cho Kế toán tất toán; Admin bật 1 ô là được).
- GD02: **Không chạy `supabase db reset`** để khỏi đổi mật khẩu tạm của tinh / chay / lam trên máy; migration mới áp bằng `npx supabase migration up`. `npm run db:reset` giờ = reset + tạo tài khoản + chuyển dữ liệu.

- GD03: **Tự xuất `so-chuan.json` bằng code app cũ chạy trong Node** thay vì chờ anh dán script vào Console (anh bảo dùng snapshot 03/11 14:25, không có file so-chuan đi kèm). Cùng code, cùng dữ liệu nên số như nhau; anh vẫn có thể xuất tay để đối chứng.
- GD03: **Bản ghi `draftHide`** (2 hóa đơn CH TRƯỜNG HẢI "Cáp điện" 7.863.000 và 32.895.000 bị lô nhập nháp thay thế — admin app cũ không còn thấy) → chuyển vào **Thùng rác** thay vì coi là còn sống, để số khớp cái admin đang thấy. Khôi phục được.
- GD03: Danh sách **NCC Mua nợ** giờ là 22 (9 của KẾ HOẠCH + 13 NCC có phiếu ứng trong lô nhập 2024–2025). Quy tắc không đổi ("NCC từng có phiếu ứng"); `compare-counts` chỉ báo lỗi khi THIẾU NCC của KẾ HOẠCH.
- GD03: **Dashboard** theo giao diện mẫu (không chép dashboard app cũ): dải số tổng cộng từ chính các dòng tab Lợi Nhuận nên 2 tab luôn cùng số; "Còn phải trả thầu phụ" = Σ HĐ thầu phụ còn nợ > 0; cơ cấu chi gộp mọi chi phí của CÔNG TY thành "Chi phí chung".
- GD03: **Thống Kê CP/HĐ** hiện cả dòng lương / HĐ mua lẻ sinh từ chấm công (như danh sách hóa đơn app cũ), nguồn ghi "Chấm công". Chưa có nút Xuất Excel (GĐ9). Bấm dòng mở bảng trượt xem dòng vật tư; ảnh hóa đơn để GĐ9.
- GD03: Bảng Lợi Nhuận mặc định xếp theo lợi nhuận cao → thấp (theo mẫu); chưa làm bấm tiêu đề để xếp và bấm số để nhảy sang tab chi tiết (các tab đích chưa có).

- GD04: **Khối sao lưu** lưu bản sao trong bảng `backups` của chính kho (không phải Storage / file ngoài) vì chưa có Storage cấu hình; mỗi bản ~vài MB, giữ 30 bản mỗi loại. Cột `data` chỉ Admin lấy được qua hàm. Muốn giữ file ngoài kho: đặt `BACKUP_DIR` khi chạy script.
- GD04: **Khôi phục** thay TOÀN BỘ dữ liệu nghiệp vụ của công ty (không đụng tài khoản / quyền); nếu bản sao lưu nhắc tới tài khoản đã bị xóa (Người TH) thì khôi phục báo lỗi và quay về nguyên trạng.
- GD04: **Xóa công trình** chặn khi còn bản ghi ở hóa đơn, chấm công, ứng lương, phiếu chi, thiết bị, thu, HĐ chính, HĐ thầu phụ, quyết toán (app cũ chỉ kiểm tra 4 nơi đầu; chọn rộng hơn để không mất số lãi / lỗ). Bị xóa thì vào Thùng Rác (GĐ8 làm màn khôi phục).
- GD04: **Trang Chi tiết dùng năm trên thanh trên**: công trình hạch toán 1 năm (≥ 80%) hoặc chưa có dòng Lợi Nhuận → các tab con hiện toàn vòng đời (khớp số cấu thành); công trình "Nhiều năm" → hiện theo năm đang chọn.
- GD04: **Nhân viên** mới có bảng trống (app cũ không có danh sách nhân viên; chỉ có tài khoản) — thêm tay ở Danh Bạ; không tự sinh từ tài khoản.
- GD04: **Danh mục Đơn vị tính** bắt đầu trống; nút "Nạp từ dữ liệu đã nhập" gom ĐVT đã gõ trong dòng vật tư (GĐ5 có thể dùng làm gợi ý khi nhập). **Giai đoạn mẫu** = `schedule_templates` (kind phases), hiện trống tới GĐ12.
- GD04: Nút **Thu tiền** và **Xuất Excel** trên trang Chi tiết, và tiến độ thi công (chỉ 1 dòng ghi chú) để GĐ7 / GĐ9 / GĐ12. Chưa có gán công trình cho từng tài khoản "được giao" ở form công trình (làm ở màn Tài Khoản).

- GD05: **Hai session cùng làm GD05 một lúc** (06:35–06:39 ngày 12/11, do app khởi động lại): session kia đã tự gỡ file của nó; bản đang có là của session tiếp sức. Giữ 2 sửa nhỏ của session kia ở lưới (dòng chỉ gõ Ngày coi như dòng trống).
- GD05: **Cảnh báo trùng** gộp 2 bước của app cũ vào 1 hộp (trùng 100% + gần giống ≥ 70% cùng ngày, công trình, số tiền); "Vẫn lưu" để lưu tiếp.
- GD05: **Ngày trong lưới để trống** = lấy ngày dòng trên (dòng đầu = hôm nay); lưu xong lưới sạch, giữ ngày nếu không phải hôm nay (như app cũ).
- GD05: **Công trình đã quyết toán** không hiện trong danh sách chọn khi nhập mới (như app cũ) nhưng sửa hóa đơn cũ của nó vẫn được.
- GD05: **Sửa hóa đơn**: Toàn quyền, hoặc Nhập + (dòng của mình / quyền "Sửa dòng người khác") — đúng RLS; người khác chỉ xem. Hai người sửa cùng lúc: người lưu sau thắng, có báo "vừa được người khác sửa".
- GD05: **Điện thoại** chỉ có Nhập tay một khoản (không có lưới, không có dòng vật tư); 5 loại chi phí dùng nhiều nhất thành nút bấm nhanh, còn lại sau "Khác…". Sửa hóa đơn chi tiết trên điện thoại vẫn được (bảng trượt).
- GD05: **Gợi ý ĐVT / tên vật tư** lấy từ danh mục ĐVT + những gì đã gõ trong các hóa đơn cũ; gõ tự do, không bắt buộc có trong danh mục.
- GD05: **Nguồn** hiện gọn: Nhanh / Chi tiết / Ảnh / Excel / Chấm công. Hóa đơn nhập nhanh được thêm dòng vật tư khi sửa → thành "Chi tiết".

- GD06: **Cột "Trừ nợ" trong sổ chấm công** (app cũ đã bỏ cột này, chuyển sang popup "Tiền ứng CN" tick "tính vào Thực Lãnh") → lưu tuần tự ghi 1 dòng **Trả** trong `wage_advances` (`source_week_id` = tuần, ngày = **thứ Bảy**, `counts_in_net_pay = true`). Thực lãnh 1 dòng sổ = lương + phụ cấp + HĐ mua lẻ − trừ nợ (như mẫu); Thực lãnh ở Tổng lương tuần / phiếu lương vẫn đúng công thức cũ (tl + pc + ứng cũ + HĐ lẻ − trừ cũ + phiếu tính vào Thực lãnh) nên không trừ 2 lần. Dòng Trả này chỉ sửa / xóa ở sổ chấm công.
- GD06: **Tuần đời cũ có "tru"** (13 dòng): mở lại rồi Lưu thì "tru" chuyển thành dòng Trả (ngày đổi từ Chủ nhật sang thứ Bảy cùng tuần; tổng nợ không đổi). "Ứng" ghi thẳng trong tuần đời cũ (`legacy_loan`, 7 dòng) **giữ nguyên** khi lưu lại (app cũ lưu lại thì xóa mất — chọn an toàn hơn).
- GD06: **Lưu tuần** cần quyền Chấm công ≥ Nhập; tuần do người khác nhập cần Toàn quyền hoặc "Sửa / xóa dòng người khác nhập" (đúng RLS). Tên công nhân phải có trong Danh Bạ (như app cũ); thêm nhanh bằng "+ Tạo mới" (tên viết HOA).
- GD06: **Copy tuần** nhớ trong máy (localStorage) để dán sang công trình / tuần khác kể cả sau khi tải lại trang. Chỉ chép tên, vai trò, lương, ngày công (như app cũ).
- GD06: Sổ Tạm ứng lương: không chọn tháng = cả kỳ của năm đang chọn (nhiều năm = từ năm nhỏ nhất đến lớn nhất; Tất cả = toàn bộ). Lọc Công trình = công nhân có chấm công / phiếu ở công trình đó (số nợ vẫn là nợ tổng của người đó). Phiếu lương in số công dạng "5,5" (app cũ in "5.5").
- GD06: Công trình đã quyết toán không có trong ô chọn khi chấm công mới (mở lại tuần cũ của nó từ Lịch sử vẫn được).
## Lỗi còn biết
- GD06: chưa có Xuất Excel kiểu app cũ cho chấm công (GĐ9); ảnh phiếu ứng (_exportUngImageFrom) chưa làm. Bảng sổ chấm công ở 1440px đủ 18 cột nên cuộn ngang trong khung (cột tên không đứng yên). Ô tìm Ctrl+K chưa tìm công nhân.
- GD05: tab con CHỤP HÓA ĐƠN và ảnh kèm hóa đơn chưa có (GĐ9). Form hóa đơn chi tiết không có cột chiết khấu (mẫu không vẽ); hóa đơn cũ có chiết khấu vẫn giữ và hiện "CK …" dưới thành tiền khi sửa.
- GD05: ô gợi ý của form (Combo) không tự đóng khi cuộn trang (lưới nhập nhanh thì có). Ô Ngày của form dùng ô ngày của trình duyệt nên hiện theo ngôn ngữ máy.
- GD05: sửa một hóa đơn mua nợ ĐÃ có phiếu chi trả (đổi số tiền / tích Đã TT) chưa có cảnh báo riêng — GĐ7 (Chi Trả) cần chặn hoặc nhắc.
- GD05: container `supabase_edge_runtime` trên máy hay tự tắt sau khi máy khởi động lại → test "Admin tạo tài khoản" (GĐ1) báo lỗi Edge Function; chạy `docker start supabase_edge_runtime_qlcp-ban-moi` (hoặc `npx supabase stop` rồi `start`) là hết.
- Dữ liệu trong kho mới là **snapshot 03/11/2026 14:25**, trong đó 4 lô nhập 2024–2025 còn ở trạng thái NHÁP. Dữ liệu anh nhập / sửa sau 03/11 (và việc "đưa lô vào dữ liệu chung") chưa có → trước khi chuyển hẳn phải xuất snapshot mới rồi chạy lại 3 lệnh ở mục GD03.
- GD03: 3 màn báo cáo đọc thẳng các bảng qua RLS. Tài khoản có quyền Lợi nhuận / Dashboard nhưng bị ẨN một mục nguồn (Doanh thu, Chi trả, Chấm công…) hoặc chỉ được giao vài công trình thì số trên báo cáo chỉ gồm phần họ được xem (không báo lỗi). Chưa kiểm tra số của vai trò Quản lý có đủ như Admin không (mới kiểm tra mở được màn).
- GD03: cột **C** (và lợi nhuận) của công trình chưa có ngày kết thúc nhích dần theo ngày xem — đúng như app cũ. Trên máy tính 1440px bảng Lợi Nhuận đủ cột phải cuộn ngang trong khung (cột tên đứng yên); bấm "Thu gọn cột" thì vừa màn.
- GD03: mở app lần đầu chưa tự chuyển sang "Tất cả năm" khi năm hiện tại chưa có dữ liệu (mục 4K) — hiện màn trống kèm lời nhắc chọn năm khác.
- GD02: Chưa có file khách hàng đã duyệt (`du-lieu-xu-ly/khach-hang-tu-ho-so/khach-hang-de-duyet.xlsx`) → khách hàng mới chỉ có tên, địa chỉ và 2 số điện thoại sẵn trong app cũ; script **chưa có** đoạn đọc file này (làm khi có file).
- GD02: Danh mục **đơn vị tính** (`catalog_items.kind = 'unit'`) còn trống — app cũ không có danh mục này (ĐVT gõ tay). GĐ4 / GĐ5 quyết định có gợi ý từ ĐVT đã dùng hay không.
- GD02: tài khoản test `e2e.cx` (Chỉ xem) có `project_scope = 'all'` vì `upsertAccount` không áp phạm vi mặc định của vai trò — test tự đặt 'assigned' rồi trả lại.
- Supabase trong máy có thêm các tài khoản test `e2e.*` (do Playwright tạo) — hiện trong danh sách Tài khoản ở máy anh. Không ảnh hưởng bản online. Xóa: `npm run db:reset`.
- Ô tìm (Ctrl+K) mới tìm được tên tab; tìm công trình / hóa đơn / công nhân thêm ở các GĐ sau.
- Font Be Vietnam Pro + icon tải từ Google Fonts (cần mạng). GĐ10 (PWA) nên tự chứa font.

## Việc anh cần làm
0. **So bằng mắt (5 phút, mục "Anh kiểm tra" của GĐ3):** mở app cũ (đăng nhập ADMIN, chọn "Tất cả năm") và app mới cạnh nhau, tab Lợi Nhuận, so 5 công trình bất kỳ: Tổng đã thu, A, B, Tổng đã chi, Lợi nhuận. App mới đang là dữ liệu lúc 03/11 14:25 nên công trình anh có nhập thêm sau đó sẽ lệch; cột C lệch nhẹ theo ngày xem là bình thường.
0b. **Trước khi chuyển hẳn:** xuất JSON sao lưu mới từ app cũ → chép thành `ban-moi/du-lieu/snapshot.json` → chạy `npm run migrate:legacy`, `npm run so-chuan`, `npm test`.
1. **Thử trên máy:** mở Docker Desktop → trong `ban-moi` chạy `npx supabase start` → `npm run dev` → mở http://localhost:5173. Mật khẩu tạm của `tinh`, `chay`, `lam` ở `ban-moi/du-lieu/tai-khoan-tam.txt`.
2. **Vercel** (chưa cần làm ngay, để GĐ10 đưa bản thử online): project `quan-ly-chi-phi-test` → Settings:
   - Build & Development: Framework Preset = **Vite**, Build Command = `npm run build`, Output Directory = `dist`, Root Directory = thư mục chứa `package.json` (gốc repo).
   - Git: Production Branch tạm để **`dev`** (hoặc dùng link Preview của nhánh `dev`).
   - Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (của project Supabase online `qlcp-thu`), `VITE_COMPANY_SLUG` = `nguyenhuu`. Anh tự dán, AI không đụng.
   - `vercel.json` đã có sẵn (mọi đường dẫn trả về `index.html`).
