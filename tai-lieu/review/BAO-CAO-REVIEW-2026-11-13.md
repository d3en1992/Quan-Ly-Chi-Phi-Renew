# BÁO CÁO REVIEW & SO SÁNH KIẾN TRÚC 2 BẢN CODE (13/11/2026)

> Phạm vi: So sánh `code/ban-dang-dung` (bản cũ đang dùng thật) và `code/ban-moi` (bản làm lại). Chỉ đọc + chạy kiểm tra cục bộ (`npm test`, `npm run typecheck`); không sửa code, không đụng dữ liệu thật hay Supabase online.

---

## 1. Tóm tắt cho người không đọc code (10 dòng)

1. **Tổng thể bản mới rất chắc chắn:** toàn bộ công thức tính tiền lõi (`src/lib/calc/`) đã đối chiếu khớp **0 đồng** với app cũ trên 36 công trình × mọi năm (`203/203` Vitest xanh, `typecheck` xanh).
2. **Kiến trúc bản mới vượt trội hoàn toàn** về bảo mật (Postgres RLS + Supabase Auth thay cho kiểm quyền bằng ẩn nút DOM), tính toàn vẹn dữ liệu (khóa ngoại `project_id` thay cho nối chuỗi tên), và tách lớp rõ ràng.
3. **Không phát hiện bug mức CHẶN làm sai lệch số liệu Lợi Nhuận cốt lõi** (cột A, B, C, Đã thu, Lãi/Lỗ).
4. **Phát hiện 5 lỗi mức NẶNG** cần xử lý sớm: (a) Biểu đồ "Cơ cấu chi theo loại" ở Dashboard cộng nhầm hóa đơn mua nợ chưa trả và thiếu tiền trả NCC; (b) Lưu khối lượng sàn / xóa mềm ở vài tab chưa làm mới cache Tỉ Trọng & Thùng Rác; (c) Tỉ Trọng lọc năm chặt hơn Lợi Nhuận khi phiếu chi thiếu ngày; (d) Trang `/tong-quan` trên điện thoại thiếu `<Guard>` chặn quyền; (e) `dayWage` chưa làm tròn đồng nguyên khi chấm công số lẻ.
5. **Phát hiện 3 lỗi mức NHẸ (bảo mật/RLS/biên):** cấp thừa `EXECUTE` cho `anon` ở migration `000011`, policy `customers_select` và `INSERT` bảng con chưa chặt hoàn toàn, và xử lý số `<= 0` ở `reallocateSupplierPayments`.
6. **2 điểm NGHI VẤN cần lưu ý khi vận hành/chuyển dữ liệu:** `scan-document` tự rơi về chế độ giả lập nếu thiếu `GEMINI_API_KEY` trên production; 3 khách hàng trùng tên bị bỏ qua khi migrate từ snapshot cũ.
7. **Khác biệt quyền mặc định:** Bản mới mặc định khóa chặt hơn cho vai trò **Kế toán** (ẩn Tỉ trọng, Thiết bị, Danh mục; Công nợ chỉ Xem, không Tất toán được — ngược với bản cũ).
8. **Chưa kiểm được trực tiếp trong phiên này:** Chưa chạy Playwright E2E (`npm run test:e2e`) và chưa khởi động Supabase Docker để test trực tiếp RLS/Edge Function runtime (chỉ review tĩnh toàn bộ SQL + TS).

---

## 2. Danh sách Bug trong bản mới (xếp theo mức độ)

### [NẶNG] Biểu đồ "Cơ cấu chi theo loại" trên Dashboard tính cả hóa đơn mua nợ chưa trả và bỏ qua tiền trả NCC
- **File:** `code/ban-moi/src/lib/calc/stats.ts:61-83`
- **Tái hiện:** Mở tab Dashboard khi có công trình mua nợ (`paid_at_purchase = false`) hoặc có phiếu chi trả nợ NCC (`supplier_payment`).
- **Đúng phải là:** Chỉ cộng hóa đơn đã thanh toán (`paid_at_purchase = true`) + tiền trả NCC đã chia cho công trình (như `projectCostByType` ở `src/lib/calc/projectDetail.ts:22-35` và cột A ở `src/lib/calc/profit.ts:132-142`), dùng `inYearLoose` thống nhất với dòng `payments` (dòng 78).
- **Sai thực tế:** Hàm `costBreakdown` (dòng 71–77) lặp `costs` và chỉ kiểm `!inYear(c.date, years)` (dòng 72), **không lọc `c.paid_at_purchase`**, không cộng `paymentAllocations` của `supplier_payment`, và dùng `inYear` trong khi dòng 78 dùng `inYearLoose`.
- **Ảnh hưởng:** Số liệu trên biểu đồ "Cơ cấu chi theo loại" ở Dashboard không khớp với "Tổng đã chi" (`dashboardTotals`) trên cùng màn hình.
- **Đề xuất sửa:** Trong `costBreakdown` (`src/lib/calc/stats.ts:71-78`), lọc `c.paid_at_purchase` + `inYearLoose` và cộng thêm phần `paymentAllocations` của `supplier_payment` theo loại chi phí của hóa đơn (tương tự `projectCostByType`).

### [NẶNG] Lưu Khối lượng sàn và xóa mềm ở một số tab không làm mới cache Tỉ Trọng / Thùng Rác
- **File:** `code/ban-moi/src/features/cost-allocation/api.ts:61-64, 146`; `code/ban-moi/src/features/expenses/api.ts:113-115`; `code/ban-moi/src/features/payments/api.ts:128`; `code/ban-moi/src/features/timesheets/api.ts:82`; `code/ban-moi/src/features/projects/api.ts:90-91`
- **Tái hiện:** (1) Vào Tỉ Trọng & Định Mức → sửa Khối lượng sàn → lưu; hoặc (2) Xóa mềm hóa đơn/phiếu chi/tuần chấm công/công trình rồi mở ngay tab Thùng Rác (đã từng tải trước đó).
- **Đúng phải là:** Lưu Khối lượng sàn phải làm mới cả `ALLOC_KEY` và `REPORT_DATA_KEY`; mọi thao tác xóa mềm phải làm mới `['trash']` (và `ALLOC_KEY` nếu liên quan chi phí/công trình).
- **Sai thực tế:** `useSaveFloorAreas` (`cost-allocation/api.ts:146`) chỉ invalidate `PROJECTS_KEY`; `expenses`, `payments`, `timesheets`, `projects` đều không invalidate `['trash']`.
- **Ảnh hưởng:** Giao diện hiển thị số m² sàn / chi phí hoặc danh sách Thùng Rác cũ cho đến khi F5 tải lại trang.
- **Đề xuất sửa:** Thêm `ALLOC_KEY`, `REPORT_DATA_KEY` vào `useSaveFloorAreas` (`src/features/cost-allocation/api.ts:146`) và thêm `['trash']` vào `useRefresh` của 4 module trên.

### [NẶNG] Tỉ Trọng lọc năm chặt hơn Lợi Nhuận khi phiếu chi thiếu ngày
- **File:** `code/ban-moi/src/lib/calc/cost-allocation.ts:102, 162`
- **Tái hiện:** Xem tab Tỉ Trọng & Định Mức ở một năm cụ thể khi có phiếu chi `date = null` (cột `payments.date` cho phép `null`).
- **Đúng phải là:** Dùng `inYearLoose(p.date, years)` như `projectProfit` (`src/lib/calc/profit.ts:137`) để tổng chi ở Tỉ Trọng khớp cột A + B của Lợi Nhuận.
- **Sai thực tế:** `allocCostLines` dùng `!p.date || !inYear(p.date, years)` (dòng 162), loại bỏ phiếu chi thiếu ngày khi lọc năm.
- **Ảnh hưởng:** Tổng chi ở tab Tỉ Trọng có thể nhỏ hơn Lợi Nhuận nếu phát sinh phiếu chi thiếu ngày.
- **Đề xuất sửa:** Thay `!p.date || !inYear(p.date, years)` ở `src/lib/calc/cost-allocation.ts:162` bằng `!inYearLoose(p.date, years)`.

### [NẶNG] Route `/tong-quan` trên điện thoại thiếu `<Guard>` kiểm quyền
- **File:** `code/ban-moi/src/app/App.tsx:124, 144`
- **Tái hiện:** Đăng nhập bằng tài khoản có quyền `projects = 'none'` trên điện thoại (hoặc gõ thẳng URL `/tong-quan`).
- **Đúng phải là:** Route `/tong-quan` phải bọc `<Guard item={PHONE_HOME}>` tương tự `PHONE_CAPTURE` (dòng 146), và `HomeRedirect` nên chuyển sang `firstVisiblePath(access.permissions)` nếu không có quyền `projects`.
- **Sai thực tế:** `<Route path={PHONE_HOME.path} element={<PhoneHomePage />} />` (dòng 144) không có `<Guard>`, và `HomeRedirect` (dòng 124) luôn đẩy mọi user điện thoại về `/tong-quan`.
- **Ảnh hưởng:** Người không có quyền xem Công trình vẫn truy cập được màn hình Tổng quan (dù dữ liệu bên trong bị RLS chặn).
- **Đề xuất sửa:** Bọc `<Guard item={PHONE_HOME}><PhoneHomePage /></Guard>` tại `src/app/App.tsx:144` và kiểm `canSeeItem(access.permissions, PHONE_HOME)` trong `HomeRedirect`.

### [NẶNG] `dayWage` không làm tròn về số nguyên đồng khi chấm công số lẻ
- **File:** `code/ban-moi/src/lib/calc/timesheet.ts:20-22`
- **Tái hiện:** Nhập số công lẻ (tính năng mới GĐ99, vd `1,25` công) với `daily_wage` không chia hết cho 100 (vd `350.050` đ): `125 * 350050 / 100 = 437562.5`.
- **Đúng phải là:** Tiền trong app và Postgres (`bigint`) luôn là số nguyên đồng.
- **Sai thực tế:** `dayWage` trả về `(Math.round(dayUnits * 100) * (dailyWage || 0)) / 100` mà không bọc `Math.round(...)`.
- **Ảnh hưởng:** Phát sinh số thập phân lẻ `0,5` đồng, có thể lệch 1 đồng khi cộng dồn nhiều dòng.
- **Đề xuất sửa:** Bọc `Math.round(...)` cho kết quả trả về của `dayWage` (`src/lib/calc/timesheet.ts:21`).

### [NHẸ] Cấp quyền `EXECUTE` cho role `anon` trên 18 hàm Postgres
- **File:** `code/ban-moi/supabase/migrations/20261112000011_cap_quyen_ham.sql:8-25`
- **Tái hiện:** Kiểm tra `information_schema.role_routine_grants` cho role `anon`.
- **Đúng phải là:** Role `anon` (chưa đăng nhập) không cần quyền gọi `complete_password_change`, `update_my_display_name`, `has_permission`, `has_special`, `is_admin`, `can_edit_row`, `sees_all_projects`.
- **Sai thực tế:** Migration `000011` cấp `grant execute` cho `anon` với 18 hàm (dòng 8–25). Dù các hàm kiểm `auth.uid()` nên chưa khai thác được, đây vẫn là bề mặt dư thừa.
- **Ảnh hưởng:** Giảm độ chặt bảo mật theo nguyên tắc tối thiểu quyền.
- **Đề xuất sửa:** Tạo migration mới `revoke execute` khỏi `anon` cho các hàm nội bộ / cần đăng nhập.

### [NHẸ] Policy `customers_select` và `INSERT` bảng con chưa chặn triệt để
- **File:** `code/ban-moi/supabase/migrations/20261111000003_bang_nghiep_vu.sql:640-641, 646-647, 657-658, 673-676`
- **Tái hiện:** (1) User không có quyền `contacts` vẫn đọc được khách hàng của công trình đã xóa mềm vì `customers_select` (dòng 676) thiếu `p.deleted_at is null`. (2) User chỉ có quyền `add` (không có `edit_others`) nếu gọi API trực tiếp có thể `INSERT` dòng con (`expense_lines`, `timesheet_lines`, `payment_allocations`) vào phiếu cha của người khác vì policy `INSERT` chỉ kiểm `exists (select 1 from <cha>)`.
- **Đúng phải là:** `customers_select` kiểm thêm `p.deleted_at is null`; policy `INSERT` bảng con kiểm quyền sửa được dòng cha (`can_edit_row`).
- **Ảnh hưởng:** Rò rỉ tên khách hàng của CT đã xóa mềm; có thể chèn dòng con qua API nếu cố tình gọi ngoài UI.
- **Đề xuất sửa:** Bổ sung migration mới cập nhật các policy trên.

### [NHẸ] `reallocateSupplierPayments` xử lý không đồng nhất khi `amount <= 0`
- **File:** `code/ban-moi/src/lib/calc/payables.ts:161-176`
- **Tái hiện:** Phiếu trả NCC có `amount <= 0`: nếu `allocation_mode === 'project'` (dòng 173) thì tạo dòng chia âm, còn `fifo` / `manual` (dòng 175) thì bỏ qua hoàn toàn.
- **Đúng phải là:** Chặn `amount <= 0` ở schema hoặc xử lý thống nhất.
- **Đề xuất sửa:** Kiểm tra `amount > 0` ngay ở Zod schema phiếu chi NCC hoặc chuẩn hóa trong `reallocateSupplierPayments`.

### [NGHI VẤN] `scan-document` tự chạy chế độ giả lập nếu quên cài `GEMINI_API_KEY` trên production
- **File:** `code/ban-moi/supabase/functions/scan-document/index.ts:76-81`
- **Tái hiện:** Nếu deploy lên Supabase online mà thiếu cả `GEMINI_API_KEY` lẫn `GEMINI_API_KEY_PAID`, hàm vẫn trả về `200 OK` với dữ liệu mẫu (`fixtures/*.json`) kèm `mode: 'mock'`.
- **Ảnh hưởng:** Người dùng có thể nhầm dữ liệu mẫu là kết quả AI đọc từ ảnh thật nếu không để ý dòng cảnh báo.
- **Đề xuất sửa:** Chỉ bật `mock` khi có cờ môi trường `ALLOW_SCAN_MOCK=true` hoặc hiển thị banner cảnh báo đỏ trên UI khi `mode === 'mock'`.

### [NGHI VẤN] 3 khách hàng trùng tên bị bỏ qua khi chuyển dữ liệu từ snapshot cũ
- **File:** `code/ban-moi/du-lieu/bao-cao-chuyen-du-lieu.md:116-119`; `code/ban-moi/supabase/migrations/20261111000003_bang_nghiep_vu.sql:82`
- **Tái hiện:** `customers_name_uq` đặt unique theo `(company_id, lower(name)) where deleted_at is null`, khiến 3 bản ghi sống (`Chú Thái`, `A Trí`, `C Yến`) bị loại khi chạy `migrate-legacy`.
- **Ảnh hưởng:** Mất thông tin riêng (SĐT/ghi chú) của 3 bản ghi trùng tên nếu không kiểm tra trước GĐ11.
- **Đề xuất sửa:** Kiểm tra 3 khách hàng này trên app cũ trước khi chuyển hẳn để gộp hoặc đặt tên phân biệt.

---

## 3. LƯỢT 1 — So sánh kiến trúc 2 bản

### 3.1. Kiến trúc & liên kết file

- **Bản cũ (`ban-dang-dung`):**
  - `index.html` nạp **52 thẻ `<script>`** tuần tự; toàn bộ hàm gắn lên `window` (không ES module), với **576 chỗ** kiểm tra phòng thủ `typeof x === 'function'`.
  - **Vòng phụ thuộc chéo:** `js/sync/sync.js` (1.210 dòng) gọi `_reloadGlobals()` (`sync.js:1060, 1184`) và `afterDataChange()` (`sync.js:1069`) nằm ở `js/core/core.state-backup.js:283, 290`; `js/app/main.js` (dòng 213, 403, 459) lại gọi `_reloadGlobals()`, còn `core.state-backup.js` kích hoạt lại các hàm `render*` của từng module UI.
  - **File phình bất thường:** `js/mobile/mobile.screens.js` (2.714 dòng), `js/modules/projects/projects.ui.js` (2.166 dòng), `js/legacy/datatools.js` (1.558 dòng), `js/modules/tytrong/tytrong.ui.js` (1.446 dòng), `js/mobile/mobile.actions.js` (1.237 dòng), `js/sync/sync.js` (1.210 dòng).
  - **Hậu quả khi sửa:** Đổi tên một hàm hoặc thứ tự `<script>` dễ làm gãy ngầm nhiều màn hình khác; sửa logic mobile phải sửa lặp lại tách rời khỏi desktop.
- **Bản mới (`ban-moi`):**
  - 137 file TypeScript chia lớp rõ: `src/app/*` (khung/route/auth) → `src/features/*` (`api.ts` dùng TanStack Query + Zod, `schema.ts`, `.tsx`) → `src/lib/calc/*` (công thức thuần) → `src/lib/supabase.ts` → Postgres/RPC/Edge Functions.
  - **Kiểm tra quy tắc "chỉ `lib/calc` được cộng trừ tiền":** Không phát hiện công thức nghiệp vụ nào tự viết ngoài `lib/calc`, nhưng có **10 chỗ trong `.tsx`** dùng `.reduce(...)` để cộng tổng chân bảng trực tiếp thay vì gọi `sumOf` (`src/lib/calc/payables.ts:230`):
    - `src/features/cost-allocation/CostAllocationPage.tsx:49, 181`
    - `src/features/projects/ProjectDetailPage.tsx:96, 235, 264, 337`
    - `src/features/projects/ProjectsPage.tsx:153`
    - `src/features/reports/ProfitPage.tsx:49, 50, 51`
    - `src/features/timesheets/AdvancesTab.tsx:167`
    - `src/features/timesheets/PayrollTab.tsx:69`
- **Chấm điểm thêm 1 tab mới:**
  - **Bản cũ:** Sửa ít nhất **5–6 chỗ** rải rác (thêm `<script>` vào `index.html`, thêm `.nav-btn` trong HTML, thêm quyền trong `js/app/auth.js`, thêm điều hướng trong `js/app/main.js`, viết JS thao tác DOM + tự đồng bộ `core.storage.js`, viết riêng thêm ở `mobile.screens.js`).
  - **Bản mới:** Sửa **3 chỗ** gọn (tạo thư mục `src/features/<tab>/`, khai báo 1 mục trong `src/app/nav.ts`, gắn 1 dòng vào `PAGES` ở `src/app/App.tsx`; nếu có bảng DB mới thì thêm 1 migration `.sql` + dòng `_apply_rls`).

### 3.2. Dữ liệu & đồng bộ (Firestore 1 doc/năm vs Postgres)

- **Bản cũ:** Lưu JSON theo năm (`y2026_hoa_don`, `_cham_cong`…) + 6 doc danh mục, đồng bộ tự chế bằng outbox/bảng bóng/khóa lạc quan/bia mộ (`purgedAt`). Đổi tên công trình phải chạy `relinkProjectNames` trên chuỗi tên.
- **Bản mới:** 28 bảng dữ liệu nghiệp vụ + hệ thống trong Postgres (tất cả bảng đều có `company_id`, `deleted_at` xóa mềm). Mọi tham chiếu dùng khóa ngoại UUID (`project_id`, `supplier_id`…).
- **Đối chiếu key từ `du-lieu/snapshot.json` không có cột tương ứng ở Postgres:**
  - *Bỏ có chủ đích (theo mục 4E):* `import_lots_v1`, `trash_v1`, `cat_ct_years` (chuyển thành `projects.created_year`), cờ `importKey`, `importLot`, `draft`, `draftHide`, `deviceId`, `purgedAt`.
  - *Trường không có cột ở bảng mới:* `inv_v3.footerCkStr` (chiết khấu chân phiếu), `inv_v3.sl`, `tb_v1.nguoi`. Kiểm tra trực tiếp trên `du-lieu/snapshot.json` cho thấy cả 3 trường này đều có **0 bản ghi còn sống chứa dữ liệu** nên không gây mất dữ liệu thực tế. Riêng `thauphu_v1.items` (có 16 bản ghi) đã được giữ nguyên vào `subcontracts.items` (jsonb).

### 3.3. Công thức tiền (`src/lib/calc/` vs bản cũ)

- **Giữ nguyên 100% logic (đã qua `so-chuan.test.ts` lệch 0 đồng):** `profit.ts` (`projectProfit`, `effectiveYear` 80%, `profitReport`), `overhead.ts` (`projectDays`, `projectK`, `allocateOverhead`), `revenue.ts` (`contractValue`, `settlementDeltas`, `projectRevenue`), `timesheet.ts`, `cost-allocation.ts` (4 nhóm, 6 rổ).
- **Khác có chủ đích (đã chốt trong `KE-HOACH-REFACTOR.md`):**
  - Nhận diện hóa đơn mua nợ (4F): dùng cờ `expenses.paid_at_purchase` + `suppliers.buys_on_credit` thay cho dò chuỗi tên NCC trong danh sách ứng.
  - Trả NCC theo cục (4J): `reallocateSupplierPayments` chia FIFO vào hóa đơn cũ nhất trước mọi công trình (phiếu cũ vẫn giữ `allocation_mode = 'project'` để bảo toàn số năm cũ).
  - Chấm công số lẻ (GĐ99): `parseDayUnit` nhận số thập phân làm tròn 2 chữ số (`round2`); cột "Trừ nợ" tạo dòng `wage_advances` (`repay`, `counts_in_net_pay = true`).
  - Nhập tiền (`expense.ts`): bỏ gõ tắt `"1tr"`, `"1,5tr"` (4E).
- **Khác do lỗi (đã báo ở Mục 2):** `costBreakdown` ở `stats.ts` chưa lọc `paid_at_purchase`; `cost-allocation.ts` dùng `inYear` thay vì `inYearLoose` cho phiếu chi; `dayWage` chưa làm tròn đồng nguyên.

### 3.4. Quyền & bảo mật

| Tab / Mục | Bản cũ (`auth.js`) | Bản mới (`000002` — Admin / GĐ / Quản lý / Kế toán / Chỉ xem) | Ghi chú |
|---|---|---|---|
| Công Trình | Mọi role | `full` / `full` / `full` / `view` / `view` (scope `assigned`) | Bản mới thêm phạm vi CT |
| Nhập Chi Phí | Mọi role | `full` / `full` / `full` / `add` / `none` | Kế toán bản mới không sửa dòng người khác |
| Thống Kê CP/HĐ | Mọi role | `full` / `full` / `full` / `view` / `view` | Khớp |
| Chấm Công | Mọi role | `full` / `full` / `full` / `add` / `none` | Bản mới chặt hơn cho Kế toán |
| Chi Trả TP/NCC | Mọi role | `full` / `full` / `full` / `add` / `none` | Bản mới chặt hơn cho Kế toán |
| Công Nợ Phải Trả | Mọi role (Kế toán được tất toán) | `full` / `full` / `full` / `view` / `none` | **Chặt hơn:** Kế toán không tất toán được |
| Tỉ Trọng & Định Mức | Mọi role (kể cả Kế toán) | `full` / `full` / `full` / `none` / `none` | **Chặt hơn:** Kế toán bị ẩn hẳn |
| Theo Dõi TB | Mọi role | `full` / `full` / `full` / `none` / `none` | **Chặt hơn:** Kế toán bị ẩn hẳn |
| Tiến Độ | Chưa có | `full` / `full` / `full` / `view` / `view` | Tính năng mới |
| Danh Bạ | Gộp trong Danh Mục | `full` / `full` / `full` / `view` / `none` + `see_contact_ids` | Bản mới che SĐT/CCCD |
| Doanh Thu / Lợi Nhuận / Dashboard | Ẩn với Kế toán | `full` / `full` / `full`(DT) `view`(LN,DB) / `none` / `none` | Khớp |
| Quyết Toán | Chỉ Admin + GĐ | `full` / `full` / `full` / `none` / `none` | **Lỏng hơn cho Quản lý** (Lam được chốt QT) |
| Danh Mục & Sao Lưu | GĐ ẩn Tools; Kế toán ẩn Tools | `full` / `view` / `view` / `none` / `none` | Chặt hơn cho Kế toán |
| Tài Khoản & Quyền | Chỉ Admin | `full` / `none` / `none` / `none` / `none` | Khớp |

- **Bảo mật:** Bản cũ chỉ ẩn nút DOM (`auth.js:751-763`), không bảo vệ dữ liệu gốc trên Firestore. Bản mới kiểm ở Postgres RLS (`has_permission`, `current_company_id`, `can_edit_row`, `sees_all_projects`), riêng SĐT/CCCD tách sang `contact_private` + RPC `list_contact_private_masked()`.

### 3.5. Tính năng có / không

| Tính năng | Trạng thái bản mới | Ghi chú |
|---|---|---|
| Lô nhập gói CT (`lonhap.js`), xóa theo CT×hạng mục | **Bỏ có chủ đích** (4E) | Thay bằng script migrate + Thùng rác xóa mềm |
| Chọn nhiều năm / "Tất cả năm" | **Có** | `src/lib/calc/year.ts` + `src/app/year.tsx` |
| Xuất Excel từng loại, in phiếu thu/ứng/HĐTP | **Có** | `features/export` (ExcelJS), `lib/voucher.ts` |
| Copy tin nhắn Zalo phiếu lương / tiến độ | **Có** | `payslipText` (`payroll.ts:398`), báo cáo Zalo (`schedule/logic.ts`) |
| Tạm ứng CN trừ vào thực lĩnh | **Có (khác hành vi nhẹ)** | Cột "Trừ nợ" tự sinh dòng `repay` trong `wage_advances` |
| Trả NCC theo cục + Đối chiếu NCC | **Có (nâng cấp)** | Chia FIFO cũ nhất trước (4J) |
| Chụp đa năng AI (Hóa đơn / CCCD / HĐ) | **Có (mới)** | Edge Function `scan-document` + Gemini |
| Tiến độ thi công (Gantt, mẫu, nhật ký) | **Có (mới, xong phần 1)** | Phần 2 (phát sinh có duyệt, so % tiến độ vs % chi) chưa làm |

### 3.6. Vận hành

- **Mất mạng:** Bản cũ vẫn nhập/xem offline nhờ IndexedDB/localStorage + outbox tự đẩy khi có mạng (nhưng dễ xung đột doc). Bản mới phụ thuộc kết nối mạng tới Supabase; mất mạng thì không lưu được (TanStack Query báo lỗi).
- **Chi phí dịch vụ:** Bản cũ (Firebase Spark miễn phí). Bản mới: Vercel Hobby (miễn phí) + Supabase Free (500MB DB, 1GB Storage — đủ cho ~2.5MB dữ liệu hiện tại + vài nghìn ảnh hóa đơn; nếu cần auto-backup ngày thì Supabase Pro ~$25/tháng, hiện bù bằng GitHub Action `backup-nightly.ts`).
- **Chẩn đoán & sao lưu:** Bản mới dễ chẩn đoán hơn nhiều nhờ TypeScript strict, Sentry/log SQL, bảng `audit_log`, và `restore_backup` trong 1 transaction Postgres (tự tạo bản `before_restore` trước khi ghi đè).

---

## 4. 5 khác biệt nguy hiểm nhất khi chuyển từ cũ sang mới

1. **Mất mạng tại công trình = không lưu được dữ liệu:** Khác với bản cũ có outbox offline, bản mới ghi trực tiếp Postgres; nếu mất mạng khi đang nhập lưới hóa đơn hoặc chấm công cần cảnh báo người dùng giữ tab, không đóng trình duyệt.
2. **Thay đổi cách nhận diện nợ NCC & trả theo cục (4F + 4J):** Người dùng không còn nhập "tiền ứng NCC vào 1 công trình" như thói quen cũ mà nhập phiếu trả chung theo NCC (tự chia FIFO), và phải chú ý ô tick **Đã TT** khi nhập hóa đơn mới.
3. **Quyền mặc định của vai trò Kế toán bị thu hẹp:** Kế toán mới không vào được Tỉ Trọng, Thiết bị, Danh mục và không Tất toán được công nợ — Admin cần kiểm tra và tích lại quyền trên tab Tài Khoản & Quyền nếu vẫn muốn cho Kế toán dùng các mục này như app cũ.
4. **3 khách hàng trùng tên bị gộp/loại khi chuyển dữ liệu:** `Chú Thái`, `A Trí`, `C Yến` có tên gọi trùng trong `customers_v1`, cần rà soát SĐT/địa chỉ trước khi chạy migration cuối cùng ở GĐ11.
5. **Chưa có trigger DB chặn sửa phiếu thu tự động / phiếu chi tất toán:** Hiện mới chặn trên giao diện (`QLCP-RENEW-INFO.md:106`); nếu gọi API trực tiếp hoặc khôi phục không đồng bộ vẫn có thể sửa lệch với bản quyết toán / tất toán gốc.

---

## 5. Việc nên sửa ngay tuần này

1. **Sửa `costBreakdown` (`src/lib/calc/stats.ts:71-78`)** để lọc `paid_at_purchase` + cộng `paymentAllocations` của `supplier_payment`, giúp biểu đồ Dashboard khớp "Tổng đã chi".
2. **Bổ sung `invalidateQueries`** (`ALLOC_KEY`, `REPORT_DATA_KEY`, `['trash']`) ở `cost-allocation/api.ts`, `expenses/api.ts`, `payments/api.ts`, `timesheets/api.ts`, `projects/api.ts`.
3. **Bọc `<Guard item={PHONE_HOME}>`** cho `/tong-quan` trong `src/app/App.tsx:144` và làm tròn đồng trong `dayWage` (`src/lib/calc/timesheet.ts:21`).
4. **Sửa `inYearLoose`** trong `allocCostLines` (`src/lib/calc/cost-allocation.ts:162`).
5. **Thêm 1 migration nhỏ** thu hồi quyền `EXECUTE` của `anon` trên các hàm nội bộ (`000011`) và thêm `p.deleted_at is null` vào policy `customers_select`.

---

## 6. Thống kê kiểm tra

- **Số file đã đọc trực tiếp:** ~28 file (tài liệu thiết kế, toàn bộ `src/lib/calc/*.ts`, các file test chính, toàn bộ `supabase/migrations/*.sql` trọng yếu, `supabase/functions/*`, `src/app/*`, các `api.ts` chính, `scripts/compare-counts.ts`, `scripts/legacy/transform.ts`, `ban-dang-dung/js/app/auth.js`, `du-lieu/bao-cao-chuyen-du-lieu.md`, `du-lieu/snapshot.json`).
- **Lệnh đã chạy:**
  - `cmd /c "npm test"` → **17 test files passed, 203 passed | 1 skipped (placeholder chờ so-chuan)**, trong đó `so-chuan.test.ts` khớp 0 đồng toàn bộ.
  - `cmd /c "npm run typecheck"` → **exit code 0 (xanh)**.
  - Script Node kiểm tra key thực tế của `du-lieu/snapshot.json`.
- **Chưa kiểm được:** Chưa chạy Playwright E2E (`npm run test:e2e`) và chưa chạy `npx supabase start` để test runtime Edge Functions / RLS trên Docker.
