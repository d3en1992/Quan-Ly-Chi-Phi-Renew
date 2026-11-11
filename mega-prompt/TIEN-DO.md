TRẠNG THÁI: GD03 XONG — chờ GD04
Nhịp tim: 11/11/2026 21:50
Đang làm: —

# Tiến độ làm lại app

| GĐ | Nội dung | Model | Trạng thái | Ghi chú |
|---|---|---|---|---|
| GD01 | Khung app, đăng nhập, quyền, bố cục 3 khổ | Opus | **Xong** 11/11 | typecheck / 24 Vitest / build / 14 Playwright xanh. Ảnh: `anh-chup/GD01/` |
| GD02 | Kho dữ liệu + chuyển dữ liệu cũ ⭐ | Fable | **Xong** 11/11 | Khớp hết với snapshot 02/11 (bản tạm). typecheck / 40 Vitest / build / 19 Playwright xanh. Báo cáo: `du-lieu/bao-cao-chuyen-du-lieu.md` |
| GD03 | Công thức + báo cáo khớp số ⭐⭐ | Fable | **Xong** 11/11 | So với app cũ **lệch 0 đồng** (36 công trình × 2024, 2025, 2026, Tất cả). typecheck / 75 Vitest / build / 27 Playwright xanh. Ảnh: `anh-chup/GD03/` |
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

## GD03 — đã có gì (cho GĐ sau)
- **Dữ liệu đang dùng:** `du-lieu/snapshot.json` = `du-lieu-xu-ly/file-import-chuan-hoa/cpct_snapshot_2026-11-03_14-25.json` (anh Tình chỉ định; có 4 lô nhập NHÁP 2024–2025: 277 hóa đơn, 123 phiếu ứng, 7 phiếu thu, 13 HĐ thầu phụ, 4 HĐ chính).
- **Số chuẩn:** `npm run so-chuan` (= `scripts/legacy/xuat-so-chuan-node.mjs`) nạp NGUYÊN code `../ban-dang-dung/js` vào hộp cát `node:vm` (document / mạng là đồ giả, không đụng Firebase), đổ snapshot vào `_mem`, chạy đúng `mega-prompt/xuat-so-chuan.js` → `du-lieu/so-chuan.json`. Xem bằng mắt ADMIN (thấy dữ liệu nháp). Đổi snapshot thì chạy lại: `npm run migrate:legacy` → `npm run so-chuan` → `npm test`.
- **Công thức** `src/lib/calc/` (import từ `@/lib/calc`): `year.ts` (`inYear` = thiếu ngày thì loại; `inYearLoose` = thiếu ngày thì hiện mọi năm, dùng cho thu / HĐ / quyết toán / phiếu chi / hóa đơn trong lãi-lỗ), `timesheet.ts`, `overhead.ts` (ngày tính theo giờ VN cố định +07; chọn NHIỀU năm thì số ngày = cả vòng đời như app cũ; công trình chưa kết thúc tính tới "bây giờ" nên C đổi theo giờ xem), `revenue.ts`, `profit.ts` (`profitReport` = bảng tab Lợi Nhuận kèm quy tắc năm hạch toán 80%; `projectProfit` = `lnTinhCongTrinh`), `payables.ts` (chia tiền trả NCC cũ nhất trước; công nợ NCC; đã trả từng HĐ thầu phụ như `_hdtpUngAlloc`), `stats.ts` (chi theo tuần, cơ cấu chi, tổng danh sách).
- **Đọc dữ liệu:** `src/features/reports/api.ts` → `useReportData()` tải mọi năm 1 lần (bản ghi còn sống, Zod kiểm tra, giữ 1 phút), 3 màn dùng chung; lọc năm bằng ô chọn năm trên thanh trên (`useReport()` trong `shared.tsx`).
- **Component dùng chung đã chốt** (GĐ sau chỉ dùng lại): `src/components/ui/data.tsx` — `KpiStrip` (dải số tổng), `FilterBar` + `FilterSelect` + `SearchBox` (thanh lọc), `HBar` / `HBarList`, `ProfitPill`, `Money` + `signedMoney`, `usePaged` + `Pager`, `MobileCard` + `MobileRow`, `PhoneKpis`, `Segmented`; cùng `misc.tsx` (Card, CardHeader, PageHeader, SubTabs, Pill, Note, Loading / Empty / ErrorState), `sheet.tsx` (bảng trượt), `confirm.tsx` (hộp xác nhận xóa), `toast.tsx`, `input.tsx` (Input, Select, Field, Checkbox), bảng `.tbl`. **Chưa có** (làm ở GĐ4–GĐ5 lúc có form nhập đầu tiên): ô tiền tự thêm dấu chấm, ô ngày, ô chọn công trình, ô chọn danh mục có gợi ý + "Tạo mới".

## Kết quả so số với app cũ
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

## Lỗi còn biết
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
