TRẠNG THÁI: GD02 XONG — chờ GD03
Nhịp tim: 11/11/2026 16:55
Đang làm: —

# Tiến độ làm lại app

| GĐ | Nội dung | Model | Trạng thái | Ghi chú |
|---|---|---|---|---|
| GD01 | Khung app, đăng nhập, quyền, bố cục 3 khổ | Opus | **Xong** 11/11 | typecheck / 24 Vitest / build / 14 Playwright xanh. Ảnh: `anh-chup/GD01/` |
| GD02 | Kho dữ liệu + chuyển dữ liệu cũ ⭐ | Fable | **Xong** 11/11 | Khớp hết với snapshot 02/11 (bản tạm). typecheck / 40 Vitest / build / 19 Playwright xanh. Báo cáo: `du-lieu/bao-cao-chuyen-du-lieu.md` |
| GD03 | Công thức + báo cáo khớp số ⭐⭐ | Fable | Chưa | |
| GD04 | Công Trình, Chi tiết CT, Danh Bạ, Danh Mục | Opus | Chưa | |
| GD05 | Nhập Chi Phí (lưới Excel, chi tiết) | Fable | Chưa | |
| GD06 | Chấm Công + Tạm ứng lương | Fable | Chưa | |
| GD07 | Chi Trả, Công Nợ Phải Trả, Doanh Thu, Quyết Toán | Fable | Chưa | |
| GD10 | Điện thoại, máy tính bảng, PWA, bản thử online | Opus | Chưa | |
| GD08 | Thiết bị, Tỉ trọng, Thùng rác | Opus / Fable | Chưa | |
| GD09 | Chụp đa năng + Xuất Excel | Fable | Chưa | |
| GD12 | Tiến Độ phần 1 | Opus | Chưa | |
| GD99 | Kiểm tra cuối + báo cáo sáng | Opus (low) | Chưa | |

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

## Kết quả so số với app cũ
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

## Lỗi còn biết
- GD02: đang dùng **snapshot tạm 02/11/2026** (`../ban-dang-dung/cpct_snapshot_2026-11-02_00-51.json`) vì chưa có `du-lieu/snapshot.json`. Dữ liệu anh nhập sau 02/11 chưa có trong kho mới.
- GD02: chưa có `du-lieu/so-chuan.json` → chưa đối chiếu được với số xuất từ app cũ (GĐ3 cần). Chưa có file khách hàng đã duyệt (`du-lieu-xu-ly/khach-hang-tu-ho-so/khach-hang-de-duyet.xlsx`) → khách hàng mới chỉ có tên, địa chỉ và 2 số điện thoại sẵn trong app cũ; script **chưa có** đoạn đọc file này (làm khi có file).
- GD02: Danh mục **đơn vị tính** (`catalog_items.kind = 'unit'`) còn trống — app cũ không có danh mục này (ĐVT gõ tay). GĐ4 / GĐ5 quyết định có gợi ý từ ĐVT đã dùng hay không.
- GD02: tài khoản test `e2e.cx` (Chỉ xem) có `project_scope = 'all'` vì `upsertAccount` không áp phạm vi mặc định của vai trò — test tự đặt 'assigned' rồi trả lại.
- Supabase trong máy có thêm các tài khoản test `e2e.*` (do Playwright tạo) — hiện trong danh sách Tài khoản ở máy anh. Không ảnh hưởng bản online. Xóa: `npm run db:reset`.
- Chọn năm mới chỉ lưu lựa chọn; lọc số liệu theo năm làm ở GĐ3 (mục 4K).
- Ô tìm (Ctrl+K) mới tìm được tên tab; tìm công trình / hóa đơn / công nhân thêm ở các GĐ sau.
- Font Be Vietnam Pro + icon tải từ Google Fonts (cần mạng). GĐ10 (PWA) nên tự chứa font.

## Việc anh cần làm
0. **Trước GĐ3 (5 phút):** mở app cũ → chọn “Tất cả năm”, chờ đồng bộ xanh → (a) xuất JSON sao lưu, chép thành `ban-moi/du-lieu/snapshot.json`; (b) ngay sau đó dán `mega-prompt/xuat-so-chuan.js` vào Console, chép file tải về thành `ban-moi/du-lieu/so-chuan.json`. Hai file phải xuất **cùng lúc** thì số mới khớp. Rồi chạy `npm run migrate:legacy` trong `ban-moi` (khoảng 30 giây), xem `du-lieu/bao-cao-chuyen-du-lieu.md`.
1. **Thử trên máy:** mở Docker Desktop → trong `ban-moi` chạy `npx supabase start` → `npm run dev` → mở http://localhost:5173. Mật khẩu tạm của `tinh`, `chay`, `lam` ở `ban-moi/du-lieu/tai-khoan-tam.txt`.
2. **Vercel** (chưa cần làm ngay, để GĐ10 đưa bản thử online): project `quan-ly-chi-phi-test` → Settings:
   - Build & Development: Framework Preset = **Vite**, Build Command = `npm run build`, Output Directory = `dist`, Root Directory = thư mục chứa `package.json` (gốc repo).
   - Git: Production Branch tạm để **`dev`** (hoặc dùng link Preview của nhánh `dev`).
   - Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (của project Supabase online `qlcp-thu`), `VITE_COMPANY_SLUG` = `nguyenhuu`. Anh tự dán, AI không đụng.
   - `vercel.json` đã có sẵn (mọi đường dẫn trả về `index.html`).
