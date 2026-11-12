# KẾ HOẠCH LÀM LẠI APP QUẢN LÝ CHI PHÍ CÔNG TRÌNH (BẢN MỚI)

Lập 11/11/2026 · Dựa trên app đang dùng `code/ban-dang-dung` (khoảng 43.000 dòng, 185 commit) và snapshot dữ liệu 02/11/2026.

> **Đọc nhanh (5 dòng)**
> 1. Làm app mới trong thư mục `code/ban-moi`. App cũ **vẫn chạy bình thường** tới ngày chuyển hẳn.
> 2. Bộ đồ nghề: **TypeScript + React + shadcn/Tailwind + TanStack Table + TanStack Query + Supabase**.
> 3. **Ban ngày** (anh + AI): chốt giao diện mẫu, làm GĐ0 + GĐ1. **Một đêm 21:00 → 06:00**: AI tự chạy GĐ2 → GĐ12 bằng **bộ mega prompt chia theo module** (thư mục `mega-prompt/`, viết sau khi chốt giao diện; một prompt điều phối gọi lần lượt các prompt module), không cần anh bấm gì. Hết quota thì hẹn giờ tự chạy tiếp. Cách chạy đêm: mục 5A.
> 4. Mốc quan trọng nhất là **Giai đoạn 3**: báo cáo Lợi Nhuận của app mới phải **khớp từng đồng** với app cũ. Không khớp thì chưa đi tiếp.
> 5. Trong lúc làm, **app cũ chỉ sửa lỗi, không thêm tính năng mới**. Tính năng mới **Tiến Độ Thi Công** chỉ làm trên app mới (GĐ12).

---

## 0. Bối cảnh nghiệp vụ (AI đọc trước khi làm bất cứ thứ gì)

- **Công ty:** công ty xây dựng (Nguyễn Hữu). Nhận 3 loại việc: **CT** xây mới nhà phố; **SC** sửa chữa, cải tạo; **SN** sửa nhỏ (ví dụ sửa nhà vệ sinh, chống thấm) và việc khác. **SN là Sửa nhỏ**, không phải sinh nhật.
- **Mục đích chính của app: quản lý chi phí** từng công trình, để biết đã thu bao nhiêu, đã chi bao nhiêu, đang lãi hay lỗ. App bắt đầu từ **chấm công**, sau mở rộng sang chi phí, hóa đơn. Tiến độ chỉ là phần phụ.
- **Tab “Nhập chi phí” chứa mọi khoản chi**, không chỉ hóa đơn có chứng từ: từ vật tư lẻ vài nghìn đồng (con vít, con ốc 5–15 nghìn) đến các khoản lớn vài chục triệu (đổ bê tông, vật liệu xây dựng).
- **Nhà cung cấp lớn giao hàng theo tuần và cho nợ** (vật liệu xây dựng, sắt thép). Một NCC có thể giao cho **nhiều công trình cùng lúc**. Công ty ghi chi phí **tách theo từng công trình**. NCC thì **gom hóa đơn mọi công trình** thành một tổng (giữa tuần, cuối tháng, khi đủ số), rồi công ty **trả một cục**, cộng dồn tới hết nợ (mục 4J).
- **Thầu phụ** ký hợp đồng theo công trình, được ứng nhiều đợt.
- **Chiều tiền (rất quan trọng):** “Công nợ” trong app = **công ty nợ** thầu phụ / nhà cung cấp. “Tiền ứng TP / NCC” = tiền công ty **đã trả** cho họ. “Còn phải thu” = khách hàng nợ công ty. “Ứng công nhân” = công nhân nợ công ty, trừ dần vào lương (mục 4L).
- **Chi phí chung** (lương văn phòng, bảo hiểm, thuế phí, sửa máy…) ghi vào “CÔNG TY”, rồi chia cho các công trình theo số ngày thi công × hệ số k.

## 1. Những gì đã chốt

| Hạng mục | Chọn | Ghi chú cho anh |
|---|---|---|
| Ngôn ngữ | TypeScript | JavaScript có "kiểm tra chính tả": AI gõ sai tên là báo đỏ ngay |
| Khung giao diện | React + Vite | Dữ liệu đổi thì màn hình tự vẽ lại |
| Chuyển trang | React Router | Mỗi tab một đường dẫn, giống cách app cũ đang dùng `#dashboard`, `#nhap`... |
| Nút, popup, ô chọn | shadcn/ui + Tailwind | Đồ làm sẵn, thay cho 2.356 dòng CSS tự viết |
| Bảng dữ liệu | TanStack Table | Lọc, sắp xếp, phân trang có sẵn. Lưới nhập hóa đơn kiểu Excel tự làm trên nền này |
| Kiểm tra dữ liệu nhập | Zod | Ví dụ: tiền phải là số, công trình không được trống |
| Lấy và lưu dữ liệu | TanStack Query | Tự lấy lại khi mở lại app, khi máy khác vừa sửa |
| Kho dữ liệu + đăng nhập | **Supabase** (Postgres + Auth) | Bỏ toàn bộ phần đồng bộ tự viết |
| Máy kiểm tra công thức | Vitest | Tự chạy thử công thức lãi lỗ, so với số chuẩn của app cũ |
| Giữ nguyên | SheetJS (Excel), html2canvas (xuất ảnh phiếu), PWA (cài lên điện thoại) | |
| Nơi chạy web | **Vercel** (miễn phí). Dùng lại project đang có `quan-ly-chi-phi-test.vercel.app` | Đẩy code lên GitHub là web tự cập nhật. Mỗi nhánh thử có link xem trước riêng |
| Kho code | Dùng lại repo GitHub **`d3en1992/Quan-Ly-Chi-Phi-Renew`** (của bản `ban-viet-lai`), chuyển sang **Private** | Code cũ trong repo được cất vào nhánh `luu-tru-vanilla`, không mất |

**Không đổi:** nghiệp vụ, công thức, tên gọi, thứ tự tab, thứ tự ô trong form, cách nhập bằng bàn phím.
**Giao diện:** đổi khoảng 30–40% theo trang mẫu đã chốt `thiet-ke/giao-dien-mau.html`. Đây là **bản vẽ chuẩn**, AI ban đêm phải làm theo.

---

## 2. Quy tắc vàng (bắt buộc trong suốt quá trình)

1. **App cũ không bị đụng tới.** Không sửa dữ liệu Firebase từ app mới. App mới chỉ **đọc file snapshot/sao lưu** để chuyển dữ liệu sang.
2. **Đóng băng tính năng app cũ.** Chỉ sửa lỗi. Ý tưởng mới thì ghi vào mục 9 cuối file này, làm trên app mới.
3. **Ban đêm chỉ dùng một prompt duy nhất** (`MEGA-PROMPT-DEM.md`). AI commit sau **mỗi tab**, nên dừng lúc nào cũng không mất việc đã làm.
4. **Số liệu là trọng tài.** Mọi tab có tiền đều phải so với app cũ trên cùng một bộ dữ liệu.
5. **Không ghi key vào code.** Key Supabase do anh tự dán vào file `.env` (đã nằm trong `.gitignore`).
6. **Công thức tiền chỉ nằm ở một chỗ:** thư mục `src/lib/calc/`, và có test đi kèm. Không chỗ nào khác được tự cộng trừ tiền.

---

## 3. App mới trông như thế nào bên trong

```
ban-moi/
  KE-HOACH-REFACTOR.md      ← file này
  CLAUDE.md                 ← quy tắc cho AI (tạo ở Giai đoạn 1)
  .env                      ← key Supabase, anh tự dán, KHÔNG đưa lên GitHub
  supabase/migrations/      ← các file tạo bảng dữ liệu (.sql)
  scripts/
    chuyen-du-lieu.ts       ← đọc snapshot JSON của app cũ → đổ vào Supabase
    so-chuan.json           ← bảng số chuẩn xuất từ app cũ (tổng chi, doanh thu, lãi lỗ từng CT)
  TU-DIEN.md                ← từ điển: thuật ngữ tiếng Việt ↔ tên trong code (mục 4B)
  src/
    app/                    ← khung: menu, đăng nhập, phân quyền, chuyển trang
    components/ui/          ← nút, popup, bảng làm sẵn (shadcn)
    lib/
      supabase.ts           ← kết nối kho dữ liệu
      calc/                 ← MỌI công thức tiền (lãi lỗ, phân bổ chi phí chung, quyết toán...) + test
      format.ts             ← định dạng tiền, ngày, bỏ dấu tiếng Việt
      excel/                ← xuất Excel
    features/               ← mỗi tab 1 thư mục (tên tiếng Anh, xem TU-DIEN.md)
      projects/  customers/  expenses/  timesheets/  advances/
      revenue/   payables/   settlements/ profit/    dashboard/
      equipment/ cost-allocation/ catalog/ contacts/ accounts/ trash/ schedule/ capture/
    mobile/                 ← giao diện điện thoại
  supabase/functions/
    scan-receipt/           ← chụp hóa đơn: gọi Gemini, giữ key Gemini bí mật trên máy chủ (mục 4D)
```

Trong mỗi thư mục tab đều có cùng một bộ file: `api.ts` (đọc/ghi dữ liệu), `schema.ts` (quy định dữ liệu), các màn hình `.tsx`. AI vào tab nào cũng thấy một kiểu, nên dễ sửa.

### Những phần của app cũ sẽ biến mất (vì đã có đồ làm sẵn)

| App cũ (tự viết) | Thay bằng |
|---|---|
| `sync.js`, `sync.backup.js`, outbox, bảng bóng, khóa lạc quan, bia mộ, gộp xung đột | Supabase: mỗi thao tác lưu ghi thẳng một dòng vào kho |
| `core.storage.js`, `_mem`, Dexie/IndexedDB, `_reloadGlobals`, `afterDataChange` | TanStack Query |
| `core.normalize.js`, migration dữ liệu cũ (`_migrate*`) | Chạy **một lần** trong script chuyển dữ liệu, sau đó bỏ |
| `core.cloud-cats-ui.js` (Firestore REST, cấu trúc B, doc năm × hạng mục) | Không cần: Postgres không chia doc theo năm |
| `auth.js` (mật khẩu lưu trong code, session tự quản) | Supabase Auth + bảng `profiles` chứa vai trò |
| Đổi tên công trình bằng `aliases`, `relinkProjectNames` | Không cần: bảng khác chỉ lưu `project_id`, tên chỉ nằm ở bảng công trình |
| `cat_ct_years`, `trash_v1`, `hopdong_v1` dạng map theo tên | Bỏ, hoặc thành bảng bình thường |
| `style.css` 2.356 dòng + Bootstrap | Tailwind + shadcn |

---

## 4. Thiết kế kho dữ liệu (Supabase)

Dữ liệu hiện tại rất nhỏ: khoảng 900 hóa đơn, 350 tuần chấm công, 214 thiết bị, 200 phiếu ứng, 78 phiếu thu, 42 công trình, 23 khách hàng. Snapshot JSON chỉ 2,5MB, trong khi Supabase miễn phí cho 500MB.

Mọi bảng nghiệp vụ đều có các cột chung: `id`, `company_id`, `created_at`, `updated_at`, `deleted_at` (xóa mềm, để thùng rác), `created_by` (tài khoản nhập = **Người TH**).

**`company_id` (công ty) có mặt ở mọi bảng ngay từ đầu.** Hiện chỉ có một công ty là Nguyễn Hữu. Sau này muốn bán app cho đơn vị khác thì chỉ cần tạo thêm công ty, dữ liệu mỗi bên tách riêng, không phải sửa lại kho. Thêm cột này bây giờ gần như không tốn công, còn để sau mới thêm thì phải sửa mọi bảng.

Tên bảng và cột dùng **tiếng Anh**, giao diện vẫn tiếng Việt 100% (lý do ở mục 4B).

| Bảng mới | Nghĩa | Lấy từ (app cũ) | Ghi chú |
|---|---|---|---|
| `companies` | Công ty | (mới) | Tên, tên ngắn, logo |
| `profiles` | Tài khoản | `users_v1` | `username`, `display_name` (dùng làm Người TH), `role_id`, `must_change_password`, `project_scope` (mục 4C) |
| `roles`, `role_permissions` | Vai trò, quyền | (mới) | Admin sửa trong app. Mỗi dòng = vai trò × mục × mức (Ẩn / Xem / Nhập / Toàn quyền) |
| `employees` | Nhân viên | (mới) | Danh Bạ (mục 4G) |
| `customers` | Khách hàng | `customers_v1` | Thêm họ tên đầy đủ, SĐT, địa chỉ, CCCD (mục 4G) |
| `projects` | Công trình | `projects_v1` | `customer_id`, `kind`: `new_build` (CT, xây mới) / `renovation` (SC, sửa chữa cải tạo) / `small_repair` (SN, sửa nhỏ, khác), `status`, `cost_weight_k`, `floor_areas` (jsonb). Một công trình đặc biệt `is_company_overhead` = CÔNG TY |
| `catalog_items` | Danh mục | `cat_items_v1` + `cat_*` | Một bảng: `kind` (expense_type / supplier / person / subcontractor / equipment_name), `name`, `archived` |
| `workers` | Công nhân | `cat_cn` + `cat_cn_roles` | Tên gọi + C / T / P, thêm họ tên, ngày sinh, quê quán, thường trú, số CCCD, SĐT, tài khoản nhận lương (mục 4G) |
| `expenses` | Hóa đơn chi phí | `inv_v3` | `project_id`, `date`, `expense_type_id`, `supplier_id`, **`buyer_id` (Người mua — mới)**, **`paid_at_purchase` (Đã TT — mới, mục 4F)**, `description`, `amount`, `invoice_no`, `source` (quick / detail / scan), `receipt_image_path` |
| `suppliers` | Nhà cung cấp | `cat_items_v1.ncc` | Tách khỏi `catalog_items` vì có thêm **`address`, `phone`, `buys_on_credit` (Mua nợ)** |
| `expense_lines` | Dòng vật tư | `inv_v3.items` | Tên, ĐVT, SL, đơn giá, thành tiền |
| `timesheet_weeks` | Tuần chấm công | `cc_v2` | `week_start`, `project_id`. Mỗi công trình mỗi tuần 1 dòng |
| `timesheet_lines` | Dòng công nhân | `cc_v2.workers[]` | 7 ô ngày công, lương/ngày, phụ cấp, HĐ mua lẻ, trừ nợ, nội dung |
| `advances` | Tiền ứng | `ung_v1` | `kind`: subcontractor / supplier / worker; với công nhân thêm `direction`: advance / repay |
| `receipts` | Thu tiền | `thu_v1` | `kind`: tamung / giaidoan / quyettoan / khac, `is_auto` |
| `main_contracts` | Hợp đồng chính | `hopdong_v1` | Mỗi công trình 1 HĐ, `items` jsonb |
| `subcontracts` | HĐ thầu phụ | `thauphu_v1` | |
| `subcontractors` | Thầu phụ | `cat_items_v1.tp` | Tên, lĩnh vực, người liên hệ, SĐT |
| `settlements` | Quyết toán | `quyettoan_v1` | `kind`: increase / decrease / replace, `is_final` |
| `payable_closures` | Tất toán | `congno.tattoan` | Ai tất toán, khi nào, để hoàn tác được |
| `equipment` | Thiết bị | `tb_v1` | `location`: project / warehouse / scaffold |
| `cost_allocations` | Tỉ trọng | `tytrong_v1` | Giữ jsonb như cũ để chuyển an toàn. 3 kiểu: theo CT / định mức / cấu hình rổ |
| `schedule_*` | Tiến độ | (mới, GĐ12) | Giai đoạn dùng chung với Tỉ Trọng |

**Bỏ hẳn**: `import_lots_v1` (Lô nhập gói CT), `trash_v1`, `cat_ct_years`, cờ nháp `draft` / `draftHide` (chỉ phục vụ Lô nhập).

### 4B. Đặt tên trong code
- **Code và kho dữ liệu: tiếng Anh**, theo một kiểu duy nhất: bảng và cột `snake_case` (`expense_lines`), biến và hàm `camelCase` (`calcProjectProfit`), component `PascalCase` (`ExpenseGrid`), thư mục `kebab-case` (`cost-allocation`).
- Lý do: tiếng Việt không dấu dễ nhầm (`ung` là ứng hay ừng, `thu` là thu tiền hay thứ), trộn Việt–Anh như app cũ (`hopDongData`, `_lnContext`, `ccData`) khó đoán. Thư viện và AI đều quen tiếng Anh, nên viết đúng hơn.
- **Giao diện, thông báo, comment giải thích nghiệp vụ: tiếng Việt.**
- File `TU-DIEN.md` (AI tạo ở GĐ1) là bảng tra 2 chiều cho anh và AI sau này. Một phần ví dụ:

| Tiếng Việt | Trong code |
|---|---|
| Công trình / CÔNG TY (chi phí chung) | `project` / `isCompanyOverhead` |
| Hóa đơn chi phí, dòng vật tư | `expense`, `expenseLine` |
| Loại chi phí, Nhà cung cấp, Người mua, Người TH | `expenseType`, `supplier`, `buyer`, `createdBy` |
| Chấm công tuần, công, lương/ngày, thực lãnh | `timesheetWeek`, `dayUnits`, `dailyWage`, `netPay` |
| Ứng, trả (công nhân) | `advance`, `repayment` |
| HĐ chính, HĐ thầu phụ, quyết toán, tất toán | `mainContract`, `subcontract`, `settlement`, `payableClosure` |
| Thu tiền, còn phải thu, còn phải trả | `receipt`, `receivable`, `payable` |
| Phân bổ chi phí chung (C), hệ số k | `overheadAllocation`, `costWeightK` |
| Tỉ trọng, định mức, rổ | `costAllocation`, `costBenchmark`, `costBucket` |

### 4C. Tài khoản, vai trò, quyền (Admin tự chỉnh được)

**Đăng nhập nội bộ, không dùng Gmail / Google.** Admin tạo tài khoản gồm **tên đăng nhập + mật khẩu tạm**. App có nút copy “link app + tên đăng nhập + mật khẩu tạm” để gửi qua Zalo. Người nhận đăng nhập lần đầu thì phải tự đổi mật khẩu.
- Kỹ thuật: Supabase Auth bắt buộc dùng email, nên app tự đổi tên đăng nhập thành một email nội bộ ẩn (ví dụ `lam@nguyenhuu.qlcp`). Người dùng chỉ thấy và gõ tên đăng nhập, không cần email thật, không có thư nào được gửi đi.
- Tạo tài khoản và đặt lại mật khẩu chạy qua một hàm máy chủ chỉ Admin gọi được.

**Vai trò không viết cứng trong code.** Vai trò nằm trong bảng `roles`, quyền nằm trong bảng `role_permissions`. Admin vào tab **Tài Khoản & Quyền** để:
- Bấm từng ô để đổi quyền của một mục: **Ẩn → Xem → Nhập → Toàn quyền**. *Nhập* = thêm mới và sửa dòng của chính mình. *Toàn quyền* = sửa / xóa mọi dòng.
- Bật / tắt quyền đặc biệt: xem SĐT và số CCCD, sửa / xóa dòng người khác nhập, xóa vĩnh viễn trong Thùng rác.
- **Tạo vai trò mới** hoặc **nhân bản** một vai trò có sẵn rồi sửa (ví dụ “Chỉ xem”).
- Gán **phạm vi công trình** cho từng tài khoản: tất cả, hoặc chỉ các công trình được giao.

**Vai trò mặc định lúc bắt đầu:**

| Vai trò | Người | Ghi chú |
|---|---|---|
| **Admin** | TÌNH | Cao nhất: xem, sửa mọi thứ, quản lý tài khoản và quyền, tạo công ty mới khi bán app. Không tự khóa được mình |
| **Giám đốc** | NGUYỄN VĂN CHẠY | Mọi mục trừ Tài khoản & Quyền. Danh mục & sao lưu chỉ xem |
| **Quản lý** | PHẠM VĂN LAM (trước là “Kế toán / KS LAM”) | Toàn quyền nhập liệu, doanh thu, quyết toán, công nợ, tỉ trọng, thiết bị. Lợi nhuận và Dashboard chỉ xem. Không xóa vĩnh viễn |
| **Kế toán** | (chưa có ai, tối đa 5) | Nhập chi phí, chấm công, ứng. **Không** thấy doanh thu, lợi nhuận, quyết toán, dashboard, tỉ trọng / định mức, thiết bị, SĐT / CCCD |
| **Chỉ xem** | ví dụ: giám sát, chủ nhà | Chỉ xem công trình được giao, thống kê chi phí, tiến độ. Không thấy tiền thu, lãi lỗ |

Bảng quyền chi tiết từng ô nằm trong giao diện mẫu, tab Tài Khoản & Quyền → VAI TRÒ & QUYỀN. Đây là **giá trị ban đầu**, anh sửa lúc nào cũng được, không cần sửa code.

- Mọi tài khoản đổi được **tên hiển thị** và **mật khẩu**. Tên hiển thị chính là **Người TH** tự điền khi nhập liệu.
- **Khi chuyển dữ liệu cũ:** Người TH “TÌNH” → tài khoản Tình, “KS LAM” → Phạm Văn Lam, “GIÁM ĐỐC” → Nguyễn Văn Chạy. Các tên khác (LONG, TOÁN, SƠN) không có tài khoản nên chuyển thành **Người mua**.
- **Người mua** chọn từ danh mục, vì người đi mua hàng nhiều khi không phải người nhập.
- Quyền được kiểm tra **ngay trong kho dữ liệu** (RLS gọi hàm `has_permission(module, level)`), nên không ai lách được bằng cách sửa trình duyệt.

### 4D. Chụp hóa đơn (tính năng mới, không cần n8n)
**Làm được ngay trong app**, không cần bot n8n:
1. Trên điện thoại bấm **Chụp HĐ** (hoặc chọn ảnh có sẵn). Trên máy tính thì kéo ảnh vào.
2. Ảnh được thu nhỏ rồi lưu vào **Supabase Storage** (miễn phí 1GB, đủ khoảng 5.000–10.000 ảnh).
3. App gọi **hàm máy chủ** `scan-receipt` (Supabase Edge Function). Hàm này gửi ảnh cho **Gemini** kèm danh mục loại chi phí và nhà cung cấp hiện có, rồi nhận về dữ liệu có cấu trúc: ngày, số HĐ, nhà cung cấp, các dòng hàng (tên, ĐVT, SL, đơn giá, thành tiền), tổng tiền, loại chi phí gợi ý, và **mức chắc chắn từng ô**.
4. App hiện form **Hóa đơn chi tiết** đã điền sẵn: ô AI không chắc thì tô vàng; app tự cộng các dòng và so với số tổng ghi trên hóa đơn; nhà cung cấp khớp danh mục thì gắn luôn. Công trình luôn để anh chọn.
5. Anh sửa, bấm **Lưu**. Hóa đơn lưu với `source = scan`, ảnh gốc gắn kèm để đối chiếu sau.

6. **Nhà cung cấp mới:** AI đọc thêm **tên cửa hàng, địa chỉ, số điện thoại** in trên hóa đơn. Nếu tên không khớp nhà cung cấp nào trong danh mục, app hiện ô **“Thêm nhà cung cấp mới”** (tích sẵn) kèm 3 ô Tên / Địa chỉ / SĐT do AI điền, anh sửa được. Lưu hóa đơn là nhà cung cấp mới vào danh mục luôn. Nếu nhà cung cấp đã có nhưng còn thiếu địa chỉ hoặc SĐT, app hỏi có điền bổ sung không.
7. **Kiểm tra khu vực:** form hiện “Mua tại: <địa chỉ cửa hàng>” cạnh địa chỉ công trình. Nếu khác quận/huyện, app hiện nhãn vàng **“khác khu vực”** để người xem lại có nhập nhầm công trình không. Đây chỉ là nhắc nhở, không chặn lưu.

Lưu ý:
- **Key Gemini nằm ở Supabase (Secrets)**, anh tự dán. Không bao giờ nằm trong app hay trình duyệt.
- **Dùng gói Gemini miễn phí** (anh đã chốt 11/11/2026: chấp nhận để Google dùng ảnh hóa đơn cải thiện mô hình). Đủ cho vài chục hóa đơn mỗi ngày. Hết lượt trong ngày thì app báo, anh nhập tay.
- Chữ viết tay quá xấu thì AI vẫn có thể đọc sai. Vì vậy **bước anh kiểm tra là bắt buộc**, app không bao giờ tự lưu.

### 4F. Thanh toán lúc mua và công nợ nhà cung cấp (thay cách cũ)
**Kết quả lãi / lỗ giữ y như app cũ** (điểm 6). Chỉ thay **cách nhận biết** hóa đơn mua nợ: app cũ dò tên NCC trong danh sách tiền ứng của công trình (`_ctTongChi` trong `projects.ui.js`, `_lnNccDaUng`, `tytrong.core.js`), gõ lệch một chữ là số sai. App mới đánh dấu thẳng trên từng hóa đơn bằng ô **Đã TT**.

**Cách mới:**
1. Mỗi hóa đơn có ô **“Đã TT”** (đã thanh toán lúc mua).
2. **Mặc định tích sẵn.** Mua lẻ, CH TÀI CHÍNH, HÓA ĐƠN MUA LẺ… đều là trả tiền ngay lúc mua.
3. Nhà cung cấp có công tắc **“Mua nợ”** trong Danh mục. Chọn NCC đang bật Mua nợ thì ô Đã TT **tự bỏ tích**. Người nhập vẫn tích lại được nếu lần đó trả ngay.
4. **Khi chuyển dữ liệu cũ:** bật công tắc Mua nợ cho 9 NCC từng có tiền ứng (VLXD HÙNG HUỆ, VLXD PHƯƠNG, VLXD DUY THỊNH PHÁT, CH TRƯỜNG HẢI, VLXD HOÀNG TUẤN BC, HIỆP ĐỔ BÊ TÔNG TAY, SẮT THÉP VLXD ĐỨC ANH, CH SƠN TRUNG HẬU, SẮT THÉP AN PHÚ). Ô Đã TT của hóa đơn cũ đặt theo quy tắc ở điểm 6 để lãi/lỗ khớp app cũ.
5. **Công nợ NCC** = tổng hóa đơn **chưa tích** của NCC đó − tổng tiền đã trả NCC (nhập ở tab Ứng TP/NCC, loại Nhà cung cấp). Không còn dò tên.
6. **Lãi / lỗ từng công trình: giữ ĐÚNG công thức app cũ** (anh chốt 11/11/2026: “lãi lỗ trong app cũ là đúng”). Nguồn: `lnTinhCongTrinh`, `_lnUngCT`, `_lnNccDaUng` trong `doanhthu.reports-export.js`; `calcTongDoanhThu` trong `quyettoan.core.js`; `allocateCompanyCost`, `getProjectDays`, `getProjectK` trong `projects.model.js`; `_dtCalcRevenue` trong `doanhthu.core.js`. Tính theo **tiền thực thu, thực chi**, theo **năm đang lọc** (có chọn “Tất cả năm”).

   | Ký hiệu | Cách tính |
   |---|---|
   | **A · Hóa đơn** | Σ hóa đơn **đã tích Đã TT** của công trình (gồm lương chấm công) **+** Σ tiền đã trả / ứng cho NCC mua nợ ở công trình đó |
   | **B · Thầu phụ** | Σ tiền **đã ứng** cho thầu phụ ở công trình (không lấy giá trị HĐ thầu phụ) |
   | **C · CP chung** | Tổng hóa đơn của CÔNG TY trong năm × (số ngày thi công trong năm × hệ số k) ÷ tổng (ngày × k) của mọi công trình có ngày bắt đầu |
   | **Tổng đã chi** | A + B + C |
   | **Tổng đã thu** (= doanh thu) | Σ phiếu thu của công trình |
   | **Lợi nhuận** | **Tổng đã thu − Tổng đã chi** |
   | X · HĐ gốc, Y · Quyết toán | Chỉ để tham chiếu, **không** vào lợi nhuận |
   | Giá trị HĐ (để tính % đã thu, còn phải thu) | Có quyết toán: HĐ gốc + quyết toán. Chưa có: max(HĐ gốc, đã thu) |
   | Tổng chi phí (mọi HĐ) | Tổng đã chi + nợ NCC còn lại. **Cột tham khảo**, không dùng tính lãi / lỗ |

   **Để số khớp app cũ từng đồng khi chuyển dữ liệu:** app cũ bỏ hóa đơn của một NCC ra khỏi A **nếu NCC đó có phiếu ứng ở chính công trình ấy** (xét toàn bộ lịch sử), rồi cộng tiền đã ứng vào. Vì vậy script chuyển dữ liệu đặt cờ Đã TT như sau:
   - hóa đơn có NCC từng có phiếu ứng NCC **ở cùng công trình** → **chưa tích** Đã TT;
   - mọi hóa đơn khác → **đã tích**.

   Công tắc **Mua nợ** của NCC chỉ dùng để tích sẵn ô Đã TT cho **hóa đơn mới**. Sau khi chuyển, ô Đã TT của từng hóa đơn là nguồn duy nhất, không còn dò tên NCC.

   **GĐ3 so số với app cũ: lệch 0 đồng** cho mọi công trình, cả A, B, C, Đã thu, Lợi nhuận, theo từng năm và “Tất cả năm”.

### 4J. Trả tiền nhà cung cấp theo cục (ĐÃ CHỐT 11/11/2026: chia vào hóa đơn cũ nhất trước)

**Vấn đề:** VLXD Phương giao hàng cho CT A Nhựt (50.037.000) và CT A Huynh (30.110.000). Phương gom thành **một tổng 80.147.000**. Công ty trả 50.000.000 → Phương ghi **còn nợ 30.147.000 cho cả hai công trình**. App cũ bắt ghi phiếu ứng vào **một** công trình (ví dụ A Nhựt), nên A Nhựt trông như “còn 37 nghìn chưa trả”, còn A Huynh trông như “chưa trả đồng nào”. Cả hai đều không đúng với sổ của Phương, rồi phải dùng nút Tất toán để sửa tay.

**Cách làm (đã chốt): sổ công nợ theo nhà cung cấp, app tự chia tiền trả vào hóa đơn cũ nhất trước**
1. Hóa đơn mua nợ vẫn ghi **theo từng công trình** như bây giờ.
2. Tiền trả NCC ghi **một cục theo nhà cung cấp**: ngày, số tiền, ghi chú. **Không cần chọn công trình.**
3. App tự **chia cục tiền vào các hóa đơn chưa trả cũ nhất trước**, bất kể công trình nào (gọi là trừ dần theo thứ tự ngày). Mỗi hóa đơn biết mình đã được trả bao nhiêu.
4. Từ đó app tự ra:
   - **Nợ của NCC** = tổng hóa đơn mua nợ − tổng đã trả. Khớp đúng con số NCC báo, ví dụ “còn 30.147.000”.
   - **Đã trả theo từng công trình** = phần tiền đã chia vào hóa đơn của công trình đó. Con số này vào cột **A** khi tính lãi / lỗ (vẫn đúng công thức tiền thực chi của app cũ).
   - Nợ về 0 thì NCC tự thành “đã tất toán”, **không cần bấm nút Tất toán** cho NCC nữa.
5. Có màn **Đối chiếu với NCC**: danh sách hóa đơn mua nợ của NCC theo ngày, có tổng; anh so với bảng kê NCC gửi. Sau này có thể chụp bảng kê để AI tự so và đánh dấu dòng lệch.
6. Trường hợp đặc biệt (NCC muốn trả cho riêng một công trình): lúc nhập tiền trả, chọn “Trả cho công trình…” hoặc tích chọn từng hóa đơn. App chia theo đó thay vì theo thứ tự ngày.

**Ví dụ:** A Nhựt có hóa đơn Phương ngày 05/10 (20 tr) và 12/10 (30,037 tr), A Huynh có 08/10 (30,11 tr). Trả 50 tr ngày 31/10 → app trả hết hóa đơn 05/10 (20 tr), còn 30 tr trả vào hóa đơn 08/10 (30,11 tr, còn thiếu 0,11 tr), hóa đơn 12/10 chưa được trả. Kết quả: A Nhựt đã trả 20 tr, còn nợ 30,037 tr; A Huynh đã trả 30 tr, còn nợ 0,11 tr; Phương còn nợ 30,147 tr. Tổng khớp sổ Phương.

**Dữ liệu cũ:** các phiếu ứng NCC cũ đã gắn công trình thì giữ nguyên công trình đó (chia vào hóa đơn của chính công trình ấy), để lãi / lỗ các năm cũ **vẫn khớp app cũ từng đồng**. Cách trả theo cục chỉ áp dụng cho phiếu trả nhập từ ngày dùng app mới.

**Phương án thay thế:**
- (B) Chia cục tiền **theo tỉ lệ nợ** của từng công trình (A Nhựt 62%, A Huynh 38%), thay vì cũ nhất trước.
- (C) **Giữ nguyên như app cũ**: phiếu ứng NCC gắn vào một công trình, kèm nút Tất toán.

### 4K. Lọc theo năm (thay `cat_ct_years`, giữ nguyên kết quả app cũ)
App cũ (`inActiveYear`, `_ctInActiveYear`, `_entityInYear` trong `tienich.js`; `_autoSelectYearsWithData` trong `main.js`; `getProjectDays` trong `projects.model.js`) đã lọc năm đúng. App mới **giữ nguyên quy tắc**, chỉ bỏ phần phải “tải dữ liệu từng năm về máy”.

| Việc | App cũ | App mới |
|---|---|---|
| Chọn năm | Chọn một hoặc nhiều năm, hoặc “Tất cả năm” | Giữ nguyên. Ô chọn năm trên thanh trên cùng, nhớ lựa chọn trên từng máy |
| Mở app lần đầu | Chọn năm hiện tại; nếu năm hiện tại chưa có dữ liệu thì tự chuyển sang “Tất cả năm” | Giữ nguyên |
| Một dòng dữ liệu thuộc năm nào | Theo ngày của dòng: hóa đơn, ứng, thu, thiết bị → `ngay`; chấm công khi liệt kê → ngày đầu tuần; **lương chấm công tính chi phí → ngày cuối tuần (thứ Bảy)** | Giữ nguyên. Tuần vắt năm (CN 28/12 – T7 03/01) liệt kê ở năm cũ, nhưng lương tính vào năm mới |
| Công trình hiện trong năm Y | Năm tạo công trình (`cat_ct_years`) = Y, **hoặc** có hóa đơn / chấm công / ứng trong năm Y | Giữ nguyên. `cat_ct_years` chuyển thành cột `projects.created_year`, không còn bảng riêng tra theo tên |
| Phân bổ chi phí chung (C) | Số ngày thi công **cắt theo năm đang chọn** × k | Giữ nguyên |
| Nhãn “vắt năm” | Có | Giữ nguyên |
| Dữ liệu năm cũ | Phải tải về từng năm (`y2025_hoa_don`…), máy khác có thể thiếu năm | **Không còn chuyện này**: mọi năm nằm chung một kho, đổi năm là app hỏi kho ngay, máy nào cũng đủ |

Cả app chỉ có **một hàm lọc năm** (`src/lib/year.ts`) và các báo cáo SQL nhận cùng tham số năm, nên không có chỗ nào lọc lệch nhau.

### 4L. Tên gọi phần tiền trả thầu phụ / nhà cung cấp (ĐÃ CHỐT 11/11/2026: đổi tên theo bảng dưới)
**Nghĩa trong app (anh xác nhận 11/11/2026):**
- **Công nợ** = tiền **công ty còn nợ** thầu phụ và nhà cung cấp (phải trả). Không phải người khác nợ công ty.
- **Tiền ứng TP / NCC** = tiền công ty **đã trả trước / đã trả** cho thầu phụ, nhà cung cấp. Còn nợ = giá trị HĐ (hoặc tổng hóa đơn mua nợ) − đã ứng.
- Ngược chiều: **Còn phải thu** (tab Doanh thu) = khách hàng còn nợ công ty. **Ứng công nhân** = công nhân còn nợ công ty, trừ dần vào lương.

**Các công ty xây dựng thường gọi:**
- Thầu phụ: **tạm ứng** (trả trước khi nghiệm thu) và **thanh toán** (trả theo đợt khối lượng đã nghiệm thu). Gộp chung gọi là **thanh toán thầu phụ**.
- Nhà cung cấp: **thanh toán công nợ** / **trả nợ nhà cung cấp**.
- Mỗi lần trả tiền ra gọi là **phiếu chi**. Tổng còn nợ gọi là **công nợ phải trả**.

**Tên mới (đã chốt):**

| App cũ | Đề xuất | Ghi chú |
|---|---|---|
| Tab **Ứng TP/NCC** | **Chi Trả TP/NCC** | Mỗi dòng là một **phiếu chi**, chọn loại: *Tạm ứng* · *Thanh toán đợt* · *Trả nợ NCC* |
| Tab **Công Nợ TP/NCC** | **Công Nợ Phải Trả** | 3 subtab: Thầu phụ · Nhà cung cấp · Tất toán |
| Cột “Đã ứng” | **Đã trả** | Ở mọi bảng TP / NCC |
| Ứng công nhân | **Tạm ứng lương** | Giữ trong tab Chấm Công |
| Còn phải thu (Doanh thu) | Giữ nguyên | Khách hàng nợ công ty |

Trong code: `payments` (phiếu chi TP / NCC, `kind`: advance / progress / supplier_payment), `payables` (công nợ phải trả), `wage_advances` (tạm ứng lương), `receivables` (còn phải thu).

### 4G. Danh Bạ (tab mới) và nút Chụp đa năng
**Tab Danh Bạ** gom toàn bộ thông tin liên lạc, để tách khỏi Danh mục (Danh mục chỉ còn các danh sách ngắn: loại chi phí, người mua, tên thiết bị, đơn vị tính, giai đoạn mẫu).

| Nhóm | Thông tin lưu |
|---|---|
| Khách hàng | Tên gọi, họ tên đầy đủ, SĐT, địa chỉ, CCCD (không bắt buộc), ghi chú. Kèm danh sách công trình và tổng giá trị HĐ |
| Công nhân | Tên gọi (HIỀN, LONG…), ký hiệu C / T / P, họ tên theo CCCD, ngày sinh, quê quán, nơi thường trú, số CCCD, SĐT, tài khoản nhận lương |
| Nhân viên | Họ tên, chức danh, tài khoản app (nếu có), SĐT, ngày vào làm |
| Nhà cung cấp | Tên, địa chỉ, SĐT, công tắc Mua nợ |
| Thầu phụ | Tên, lĩnh vực, người liên hệ, SĐT, số HĐ, còn phải trả |

**Nút Chụp đa năng** (nút nổi trên điện thoại, nút “Chụp” trên máy tính):
1. Chụp hoặc chọn ảnh. Kèm **ghi chú** gõ tay hoặc bấm mic để nói (ví dụ “hóa đơn copha công trình A Huynh, Lam mua”, “CCCD thợ Hiền”). Mic dùng nhận giọng nói có sẵn của trình duyệt Chrome trên Android, không tốn tiền.
2. Hàm máy chủ gửi ảnh + ghi chú cho Gemini. AI **tự nhận loại giấy tờ**: hóa đơn / CCCD / hợp đồng / khác. Người dùng cũng chọn tay được.
3. Chuyển sang đúng form:
   - **Hóa đơn** → form hóa đơn chi tiết (mục 4D). Ghi chú giúp AI chọn sẵn công trình, loại chi phí, người mua.
   - **CCCD** → AI đọc họ tên, số CCCD, ngày sinh, giới tính, quê quán, nơi thường trú, ngày cấp, rồi tìm người trùng tên trong Danh Bạ (ví dụ “HIỀN” chưa có CCCD) để gắn vào, hoặc tạo mới. Lưu vào nhóm công nhân, khách hàng hay nhân viên theo ghi chú hoặc theo nút anh chọn.
   - **Hợp đồng** → AI đọc tên chủ đầu tư, địa chỉ, SĐT, giá trị hợp đồng, và gợi ý điền vào Khách hàng + Hợp đồng chính. Anh duyệt rồi mới lưu.
4. Bước anh kiểm tra luôn bắt buộc. App không bao giờ tự lưu.

**CCCD: chỉ lưu chữ, không lưu ảnh.** Ảnh chỉ dùng để đọc rồi bị xóa ngay. Số CCCD bị che bớt (`079188•••123`) với vai trò không có quyền “Xem SĐT, số CCCD”.

⚠️ **Lưu ý về CCCD:** đây là dữ liệu cá nhân của người khác (công nhân, khách hàng), nặng hơn hóa đơn. Với gói Gemini miễn phí, Google có thể dùng ảnh gửi lên. Em đề xuất: **riêng CCCD gọi Gemini bằng key có bật thanh toán** (mỗi lần đọc chỉ vài chục đồng, Google không dùng dữ liệu), hóa đơn vẫn dùng gói miễn phí. Nếu anh vẫn muốn dùng gói miễn phí cho CCCD thì chỉ cần đổi một cài đặt.

**Dò thông tin khách hàng từ hồ sơ cũ (làm một lần, trước khi chuyển dữ liệu):** quét các file hợp đồng, quyết toán trong `du-lieu-goc` (chỉ đọc), trích tên chủ đầu tư, họ tên đầy đủ, SĐT, địa chỉ, CCCD (nếu có), công trình liên quan → ra **một file Excel để anh duyệt**. Script chuyển dữ liệu (GĐ2) đọc file đã duyệt đó và đổ vào Danh Bạ. Đây không phải tính năng Nhập Excel trong app.

### 4H. Chạy thử trước khi dùng thật
Có **3 nơi chạy**, tách biệt hoàn toàn:

| Nơi | Dùng để | Dữ liệu |
|---|---|---|
| **Máy anh (offline)** | AI làm việc ban đêm, chạy test. Supabase chạy trên máy anh bằng Docker (Supabase CLI) | Bản sao dữ liệu thật, phá thoải mái |
| **Bản thử online** (project Supabase `qlcp-thu` + link xem trước Vercel) | Anh và anh Lam bấm thử trên điện thoại, Z Fold, máy tính | Bản sao dữ liệu thật, nạp lại được bất cứ lúc nào |
| **Bản thật** (project Supabase `qlcp`) | Chỉ bật ở GĐ11, khi anh thấy mọi thứ ổn | Dữ liệu thật, từ đó app cũ thôi nhập |

- Supabase miễn phí cho 2 project, vừa đủ cho bản thử và bản thật.
- App cũ vẫn chạy thật suốt thời gian thử, không bị ảnh hưởng gì.
- Trong bản thử có nút “Nạp lại dữ liệu mẫu” (chỉ Admin) để làm lại từ đầu sau khi thử phá.

### 4I. Máy tính, máy tính bảng, điện thoại
**Chỉ có một app**, tự đổi bố cục theo bề ngang màn hình. Cùng dữ liệu, cùng code nghiệp vụ.

| Bề ngang | Thiết bị | Bố cục |
|---|---|---|
| ≥ 1024px | Máy tính, laptop | Menu trái đầy đủ chữ, bảng nhiều cột |
| 640–1023px | **Z Fold 5 mở ra**, máy tính bảng | Menu thu thành cột biểu tượng, các khối xếp một cột, bảng cuộn ngang trong khung |
| < 640px | Điện thoại, Z Fold gập | Bố cục điện thoại: thanh dưới 5 nút, danh sách dạng thẻ, nút Chụp nổi |

- Giao diện điện thoại là **một bộ màn riêng** (thẻ thay cho bảng), nhưng gọi cùng các hàm lấy dữ liệu và công thức với máy tính. Sửa công thức một chỗ thì cả 3 cùng đúng.
- Gập / mở Z Fold thì app tự đổi bố cục ngay, không cần tải lại.

### 4E. Tính năng app cũ bỏ đi
| Bỏ | Lý do |
|---|---|
| Gõ tắt tiền “1tr”, “1,5tr”, “2tỷ” (`parseMoney`) | Anh không dùng, dễ nhập nhầm. Ô tiền chỉ nhận số, tự thêm dấu chấm |
| Nhập Excel 9 sheet (`nhapxuat.import`, `nhapxuat.parsers`) | Dữ liệu cũ chuyển **một lần** bằng script. Cần nhập thêm sau này thì viết riêng |
| Nhập JSON cũ (`importJSON`, `importJSONFull`) | Như trên. App mới chỉ khôi phục **bản sao lưu của chính nó** |
| Lô nhập gói công trình (`lonhap.js`, nháp / đưa vào chung / gỡ) | Phục vụ nhập dữ liệu cũ |
| Xóa dữ liệu theo công trình × hạng mục (`danhmuc.project-clear`) | Có Thùng rác + xóa mềm thay thế |
| Reset toàn bộ (`toolResetAll`) | Quá nguy hiểm. Admin làm trực tiếp trên Supabase khi thật cần |
| Đồng bộ, outbox, nút 🔄, chặn khi offline | Supabase lo việc này |
| `renderLaiLo`, `renderCongNoThauPhu`, `renderCongNoNhaCungCap` (đã ghi DEPRECATED) | Code chết |
| “Xem như giám đốc” (`_draftView`) | Chỉ phục vụ Lô nhập |
| Dò tên NCC trong danh sách ứng để tính tổng chi / công nợ NCC | Thay bằng ô Đã TT + công tắc Mua nợ (mục 4F). Kết quả lãi / lỗ giữ nguyên như app cũ |

**Giữ:** Xuất Excel, xuất ảnh phiếu thu / phiếu ứng / HĐ thầu phụ, phiếu lương chữ gửi Zalo, copy / dán tuần chấm công, copy / dán khối lượng, sao lưu hằng đêm.

**Sửa cùng lúc trên 2 máy:** mỗi lần lưu chỉ ghi đúng **một dòng**, không ghi đè cả "túi" như Firestore trước đây. Hai người sửa hai hóa đơn khác nhau thì không bao giờ đè nhau. Cùng sửa một hóa đơn thì người lưu sau thắng, và app báo "dòng này vừa được người khác sửa".

**Sao lưu** (Supabase miễn phí không tự sao lưu):
- GitHub Action chạy mỗi đêm, xuất toàn bộ kho ra file và lưu vào một repo riêng tư, giữ 30 bản.
- Nút "Tải bản sao lưu JSON" trong tab Danh Mục như app cũ.
- Khi dữ liệu thật sự quan trọng hơn: lên Supabase Pro (khoảng 25 USD/tháng), có sao lưu tự động hằng ngày.

---

## 5A. Chạy trong một đêm (21:00 → 06:00)

> **Cập nhật 11/11/2026 15:20:** anh chốt **chạy ngay từ chiều 11/11 tới sáng 12/11**. Cách chạy, việc cần làm trước, bộ prompt theo giai đoạn: xem **`mega-prompt/README.md`**. Phần dưới đây là bản phân tích ban đầu, giữ để tham khảo.

### Ban ngày, trước 21:00: phải xong hết danh sách này
| # | Việc | Ai làm |
|---|---|---|
| 1 | Chốt trang giao diện mẫu → lưu `thiet-ke/giao-dien-mau.html` | Anh góp ý, AI sửa |
| 2 | GĐ0: repo riêng tư, kiểm tra Vercel nối đúng repo, tạo Supabase, đổi mật khẩu ADMIN app cũ | Anh |
| 3 | GĐ1: khung app + đăng nhập 4 vai trò + chạy được trên link Vercel | AI làm ban ngày, anh bấm đồng ý đẩy code |
| 4 | Dán vào `ban-moi/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (key cho script chuyển dữ liệu, **chỉ nằm ở máy anh**), `SUPABASE_DB_URL` | Anh tự dán |
| 5 | Xuất snapshot JSON mới nhất → `ban-moi/du-lieu/snapshot.json` | Anh |
| 6 | Dán đoạn lệnh "xuất số chuẩn" (AI viết sẵn) vào Console của app cũ → lưu `ban-moi/du-lieu/so-chuan.json` | Anh, khoảng 2 phút |
| 7 | Cài **luật chạy đêm** `ban-moi/.claude/settings.json`: cho phép mọi lệnh trong `ban-moi`; **cấm** đọc/ghi `D:\99-BAO-MAT`, cấm ghi `ban-dang-dung`, cấm `git push --force`, cấm xóa nhánh | AI cài, anh xem |
| 8 | Hẹn giờ **"tiếp sức"** mỗi giờ từ 22:00 → 05:00 (giải thích ngay dưới) | AI cài |
| 9 | Máy: cắm sạc, tắt chế độ ngủ, **để app Claude mở** | Anh |
| 10 | 21:00: mở session mới trong `ban-moi`, chọn model **Fable 5.2**, chế độ quyền **Bypass**, dán `MEGA-PROMPT-DEM.md` → đi ngủ | Anh |

### Quota: cách để không bị dừng giữa đêm
- Quota gói Claude tính theo **khung 5 tiếng**, đếm từ tin nhắn đầu tiên sau lần reset. Hết quota thì session dừng, chờ reset.
- **Hẹn giờ tiếp sức** (scheduled task) chạy mỗi giờ đúng, từ 22:00 đến 05:00. Mỗi lần chạy nó đọc `BAO-CAO-DEM.md`:
  - Nếu dòng "Nhịp tim" mới hơn 20 phút (session chính còn đang chạy) → thoát ngay, gần như không tốn quota.
  - Nếu cũ hơn (session chính đã dừng vì hết quota hoặc lỗi) → **làm tiếp** từ chỗ dừng, theo đúng mega prompt.
  - Nếu quota chưa reset → lần chạy đó không khởi động được, một giờ sau thử lại.
- Nhờ vậy dù quota reset lúc mấy giờ, tối đa khoảng 1 tiếng sau là có session chạy tiếp.
- **Gói Pro, chia model để quota chạy được lâu:**
  - **Fable 5.2** cho việc khó cần chính xác: kho dữ liệu + script chuyển dữ liệu, công thức Lợi Nhuận / phân bổ chung, lưới nhập hóa đơn, Chấm Công, Tỉ Trọng, Chụp hóa đơn.
  - **Opus 5.5** cho phần còn lại: Danh Mục, Tài khoản, Khách hàng, Thiết Bị, Thùng Rác, Tiến Độ, Xuất Excel, điện thoại, viết test, chụp ảnh kiểm tra.
  - Session chính (điều phối, gộp code) chạy Fable. Subagent chọn model theo danh sách trên.
- Với gói Pro, **một đêm khả năng cao không xong hết**. Thứ tự ưu tiên bên dưới bảo đảm phần quan trọng xong trước. Đêm sau dán lại đúng prompt là làm tiếp.

### Thứ tự ưu tiên (hết quota lúc nào thì phần quan trọng nhất đã xong trước)
1. GĐ2 dữ liệu → GĐ3 báo cáo khớp số ⭐⭐
2. GĐ4 Danh Mục, Công Trình, Khách Hàng
3. GĐ5 Hóa Đơn
4. GĐ6 Chấm Công
5. GĐ7 Tiền Ứng, Doanh Thu, Công Nợ, Quyết Toán
6. GĐ10 giao diện điện thoại cho các tab đã xong
7. GĐ8 Thiết Bị, Thùng Rác, Tỉ Trọng
8. GĐ9 Chụp hóa đơn, Xuất Excel
9. GĐ12 Tiến Độ **Phần 1** (Phần 2 làm sau khi dùng thật)
10. Vòng cuối: test toàn bộ, chụp màn hình mọi tab (máy tính + điện thoại), viết báo cáo sáng

GĐ11 (chuyển hẳn) **không làm ban đêm**: anh dùng thử vài ngày rồi mới chuyển.

### Làm song song để kịp một đêm
- GĐ2 và GĐ3 làm tuần tự, vì mọi thứ khác dựa trên đó. Sau GĐ3, kho dữ liệu, công thức và khung giao diện dùng chung đã cố định.
- Từ GĐ4 trở đi, session chính chia việc cho **tối đa 3 subagent cùng lúc**, mỗi subagent một tab, mỗi tab chỉ sửa thư mục `src/features/<tab>/` của nó. Session chính gộp lại, chạy test chung, rồi commit.
- Subagent **không được sửa** bảng dữ liệu, công thức chung hay khung giao diện. Cần thêm thì ghi vào báo cáo, để session chính làm.

### Sáng ra anh nhận được gì
- Nhánh `dem-1` trên GitHub, có **link xem trước Vercel** riêng. Nhánh chính không bị đụng.
- `BAO-CAO-DEM.md`: tab nào xong, tab nào dở, số liệu có khớp không, các quyết định AI tự chọn thay anh, việc cần anh làm.
- Thư mục `anh-chup/`: ảnh chụp mọi màn hình, cả máy tính lẫn điện thoại.

---

## 5. Các giai đoạn

Thời gian bên dưới là ước lượng cho người vibe code làm buổi tối, đã gồm thời gian anh tự kiểm tra. Tổng cộng khoảng **6–10 tuần**. Đây là ước đoán, có thể nhanh hoặc chậm hơn.

### GĐ0 — Chuẩn bị (anh tự làm, khoảng 20 phút)
- [ ] **Chuyển repo `Quan-Ly-Chi-Phi-Renew` sang riêng tư:** vào repo trên GitHub → **Settings** → kéo xuống cuối (**Danger Zone**) → **Change repository visibility** → **Make private** → gõ tên repo để xác nhận.
- [ ] **Kiểm tra Vercel đang nối đúng repo:** vào vercel.com → project `quan-ly-chi-phi-test` → **Settings → Git**, thấy ghi `d3en1992/Quan-Ly-Chi-Phi-Renew` là đúng. Nếu là repo khác thì chụp màn hình gửi em.
- [ ] Tạo tài khoản **Supabase** (đăng nhập bằng GitHub), tạo project tên `qlcp`, chọn vùng **Singapore**. Đặt mật khẩu database thì **anh tự giữ**, không gửi vào chat.
- [ ] ⚠️ **Đổi mật khẩu tài khoản ADMIN của app cũ.** Hiện mật khẩu mặc định đang nằm thẳng trong file `auth.js` trên GitHub.
- [ ] Xuất snapshot JSON mới nhất từ app cũ (Danh Mục → Xuất JSON), lưu vào `…/backup/`. **Để tới sát GĐ2 mới làm** để có dữ liệu mới nhất.

### GĐ1 — Khung app (1 session)
**AI làm:**
1. **Cất code cũ trước:** trong `../ban-viet-lai`, đẩy `main` hiện tại lên nhánh `luu-tru-vanilla` của repo `Quan-Ly-Chi-Phi-Renew`, rồi kiểm tra nhánh đó đã có trên GitHub.
2. Trong `ban-moi`: tạo project Vite + React + TypeScript, cài Tailwind + shadcn, React Router, TanStack Query, Supabase; tạo `CLAUDE.md` chứa quy tắc ở mục 2–3; làm màn đăng nhập, menu trái (máy tính), thanh dưới (điện thoại), các tab còn trống.
3. Nối `ban-moi` với repo `Quan-Ly-Chi-Phi-Renew`, thay `main` bằng code mới. **Hỏi anh trước khi đẩy**, vì bước này thay nội dung nhánh chính.
4. Hướng dẫn anh chỉnh project Vercel `quan-ly-chi-phi-test`: Framework = **Vite**, Build = `npm run build`, Output = `dist`; anh tự dán `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` vào **Settings → Environment Variables**.
**Anh kiểm tra:**
- [ ] Mở link Vercel trên máy tính và điện thoại đều vào được.
- [ ] Đăng nhập bằng 5 vai trò mặc định Admin / Giám đốc / Quản lý / Kế toán / Chỉ xem, mỗi tài khoản thấy đúng các tab được phép; đổi một ô quyền trong Tài Khoản & Quyền thì menu đổi theo.
**Xong khi:** đăng nhập được, bấm qua lại các tab trống không lỗi.

### GĐ2 — Kho dữ liệu + chuyển dữ liệu (1–2 session) ⭐
- Nếu đã có file khách hàng anh duyệt (dò từ hồ sơ cũ, mục 4G) thì đổ luôn vào Danh Bạ.
- Đổ dữ liệu vào **Supabase trên máy (Docker)** trước, chạy test xong mới đổ lên **bản thử online** (mục 4H).
**AI làm:**
1. Tạo các bảng ở mục 4, kèm phân quyền RLS.
2. Viết `scripts/chuyen-du-lieu.ts`: đọc snapshot JSON → làm sạch (gắn `cong_trinh_id` cho bản ghi chỉ có tên, gộp trùng chấm công, chuẩn hóa tên danh mục) → đổ vào Supabase. Chạy lại bao nhiêu lần cũng được (xóa sạch rồi đổ lại).
3. Viết đoạn script **chỉ đọc** để anh dán vào Console của app cũ, xuất ra `so-chuan.json`: tổng chi theo loại, doanh thu, đã thu, công nợ, lãi lỗ **của từng công trình**, tổng lương từng tuần.
4. Script `so-sanh` in ra số lượng bản ghi cũ và mới, đếm bản ghi bị bỏ, và lý do.

**Anh kiểm tra:**
- [ ] Số bản ghi khớp: hóa đơn, chấm công, ứng, thu, thiết bị, công trình, khách hàng.
- [ ] Mở Supabase → Table Editor, nhìn thấy dữ liệu tiếng Việt đúng dấu.
**Xong khi:** báo cáo so sánh **không có bản ghi nào bị mất mà không rõ lý do**.

### GĐ3 — Báo cáo chỉ đọc: Lợi Nhuận, Dashboard, Thống Kê CP Hóa Đơn (1–2 session) ⭐⭐ MỐC QUAN TRỌNG NHẤT
**AI làm:**
- Chuyển các công thức sang `src/lib/calc/` (tên tiếng Anh theo `TU-DIEN.md`) từ các hàm cũ: `calcTongDoanhThu`, `lnTinhCongTrinh`, `allocateCompanyCost` / `getProjectWeight` (phân bổ chi phí chung theo ngày × k), tổng lương chấm công.
- Viết test so với `so-chuan.json`.
- Làm 3 màn hình chỉ xem.

**Anh kiểm tra:**
- [ ] Mở app cũ và app mới cạnh nhau, chọn 5 công trình bất kỳ (có cả CÔNG TY), so: tổng chi, doanh thu, đã thu, lãi/lỗ.
- [ ] Test của AI báo **tất cả công trình khớp**.
**Xong khi:** khớp từng đồng. Lệch thì sửa tại đây, **chưa được qua GĐ4**.

### GĐ4 — Danh Mục, Công Trình, Khách Hàng (1 session)
- **Danh Bạ** (mục 4G): khách hàng, công nhân, nhân viên, nhà cung cấp (địa chỉ, SĐT, Mua nợ), thầu phụ.
- **Tài Khoản & Quyền** (mục 4C): tạo tài khoản bằng tên đăng nhập, bảng quyền sửa được, vai trò mới, phạm vi công trình.
- Danh mục: thêm, sửa, xóa mềm, đổi tên (đổi một chỗ là mọi nơi tự đúng).
- Công trình: 3 phân khu CT (xây mới) / SC (sửa chữa, cải tạo) / SN (sửa nhỏ) – Khác, gộp theo khách hàng, tạo / sửa / đóng / hoàn thành, tên tự gợi ý (≤ 45 ký tự), chi tiết công trình 3 tab.
- Hồ sơ khách hàng, số điện thoại chỉ admin và GĐ thấy.

**Kiểm tra:** tạo một công trình thử, đổi tên, xem các báo cáo GĐ3 có tự hiện tên mới không.

### GĐ5 — Hóa Đơn (2 session, phần khó nhất về giao diện)
- **Nhập nhanh dạng lưới Excel:** di chuyển bằng phím mũi tên / Enter / Tab, dán vùng từ Excel, gợi ý tên ngay trong ô, cảnh báo trùng hóa đơn.
- Hóa đơn chi tiết nhiều dòng vật tư.
- Danh sách: lọc, tìm, phân trang, sửa, xóa mềm, "hóa đơn trong ngày".

**Kiểm tra:** copy 20 dòng từ một file Excel thật dán vào; nhập thử bằng bàn phím không cần chuột; so với cách nhập ở app cũ.

### GĐ6 — Chấm Công + Ứng Công Nhân (1–2 session)
- Form tuần (Chủ nhật → thứ Bảy), lùi/tiến tuần, copy/dán tuần, thêm công nhân, tính lương từng dòng và tổng.
- Lịch sử, Tổng Lương Tuần, phiếu lương dạng chữ để gửi Zalo.
- Sổ cái ứng công nhân, popup "Tiền ứng CN" tick vào Thực Lãnh.
- Tuần vắt năm vẫn tính đúng.

**Kiểm tra:** chọn 3 tuần cũ, so Tổng Lương Tuần với app cũ.

### GĐ7 — Tiền Ứng, Doanh Thu, Công Nợ, Quyết Toán (2 session)
- Tiền ứng: nhập nhiều dòng, lịch sử, xuất ảnh phiếu ứng.
- Doanh thu: 2 subtab HỢP ĐỒNG CHÍNH / THU TIỀN, form nằm thẳng trên màn hình, xuất ảnh phiếu thu.
- Công nợ: HĐ Thầu Phụ master-detail (Đã ứng / Còn phải trả), tất toán.
- Quyết toán: tăng / giảm / thay thế / chốt, tự sinh phiếu thu.

**Kiểm tra:** sau khi nhập thử một phiếu thu và một quyết toán, Lợi Nhuận (GĐ3) đổi đúng.

### GĐ8 — Thiết Bị, Tỉ Trọng & Định Mức, Thùng Rác (1–2 session)
- Thiết bị: tại công trình, Kho TB, Kho Giàn Giáo, ô tìm kiếm chung không dấu.
- Tỉ trọng: giai đoạn, hạng mục, phân bổ, luật, rổ, định mức. Chuyển nguyên logic từ `tytrong.core.js` và có test.
- Thùng rác: xem, khôi phục, xóa vĩnh viễn (theo quyền) của mọi loại dữ liệu.

### GĐ9 — Chụp hóa đơn + Xuất Excel (1–2 session)
- **Nút Chụp đa năng** (mục 4G): tự nhận hóa đơn / CCCD / hợp đồng, ghi chú gõ hoặc nói, CCCD chỉ lưu chữ.
- Chụp hóa đơn theo mục 4D: Storage, hàm `scan-receipt`, form kiểm tra (ô tô vàng, tự so tổng), lưu kèm ảnh.
- Nếu chưa có key Gemini: làm đủ giao diện + hàm, kèm chế độ **giả lập** đọc từ file mẫu, để sáng ra anh chỉ cần dán key.
- Xuất Excel đủ các sheet như app cũ. **Không** làm Nhập Excel, Nhập JSON cũ, Lô nhập (mục 4E).

**Kiểm tra:** chụp 5 hóa đơn thật (có 1 tờ viết tay), xem AI đọc đúng bao nhiêu ô.

### GĐ10 — Giao diện điện thoại + cài như app (1 session)
- Các màn hình điện thoại như `pages/mobile` hiện tại: nhập hóa đơn nhanh, chấm công, xem lãi lỗ.
- PWA cài được lên màn hình chính.

**Kiểm tra:** dùng một ngày thật trên điện thoại.

### GĐ11 — Chuyển hẳn (1–2 tuần dùng song song)
1. Xuất snapshot mới nhất từ app cũ → chạy lại `chuyen-du-lieu.ts` → chạy lại test so số.
2. **Dùng song song 1–2 tuần:** nhập thật ở app mới. Cuối tuần so Lợi Nhuận vài công trình (app cũ chỉ để xem).
3. Bật sao lưu tự động hằng đêm (mục 4).
4. Đặt app cũ ở chế độ chỉ xem, sau 1 tháng chuyển `ban-dang-dung` sang `90-LUU-TRU`.

### GĐ12 — Tiến Độ Thi Công (tính năng mới, 2 phần)
Tính năng này **chỉ có ở app mới**. Nội dung lấy từ `../ban-dang-dung/PLAN_TIEN_DO_THI_CONG.md` và `PHAN_TICH_XONGVIEC.md` (khảo sát xongviec.com).
**Phần kỹ thuật của plan cũ KHÔNG dùng nữa:** `tiendo_v1`, doc `meta_tien_do`, outbox, giới hạn 1MB của Firestore. Thay bằng các bảng Supabase thường.

**Phần 1 — Lõi tiến độ** (ứng với Mega Prompt 1 cũ):
- Bảng mới: `tien_do_giai_doan`, `tien_do_viec` (việc, ngày bắt đầu/kết thúc, % xong, người phụ trách, liên kết việc trước–sau), `tien_do_mau` (mẫu giai đoạn), `tien_do_nhat_ky` (ghi chú, ảnh hiện trường).
- Tab TIẾN ĐỘ: bảng việc + biểu đồ Gantt, áp mẫu giai đoạn mặc định, lịch nghỉ, chi tiết việc, xem trên điện thoại, hiện trong chi tiết công trình, thùng rác, sao lưu, Excel.
- **Trước khi làm, anh sửa số ngày trong "Mẫu giai đoạn mặc định"** của plan cũ cho đúng thực tế.

**Phần 2 — Báo cáo và nối với chi phí** (ứng với Mega Prompt 2 cũ, làm sau khi dùng thật Phần 1 khoảng 1–2 tuần):
- Tổng hợp và cảnh báo trễ, báo cáo gửi Zalo, in A3/A4.
- Phát sinh có duyệt → tự đưa vào Quyết Toán (bảng `phat_sinh`).
- Vật tư cần về, duyệt mẫu (bảng `vat_tu_can_ve`).
- **Tiến độ và chi phí trên cùng một màn:** % xong việc so với % tiền đã chi. Đây là phần mà app cũ chạy Firestore rất khó làm, còn Supabase chỉ cần một câu SQL.
- Liên kết việc thì tự dời lịch, ghi nhanh trên điện thoại.

**Kiểm tra:** lập tiến độ cho 1 công trình đang chạy thật, dùng 1 tuần.

---

## 6. Prompt

- **Ban đêm:** dùng `MEGA-PROMPT-DEM.md`.
- **Ban ngày** (sửa lỗi, làm lại một tab riêng): mở session mới trong `code/ban-moi`, dán đoạn sau (đổi số giai đoạn):

```
Đọc KE-HOACH-REFACTOR.md và CLAUDE.md trong thư mục này.
Làm GIAI ĐOẠN <số> đúng như kế hoạch.
- App cũ để tham khảo nghiệp vụ: ../ban-dang-dung (đọc AI_CONTEXT.md trước, KHÔNG sửa gì trong đó).
- Giữ đúng công thức và tên gọi của app cũ. Chỗ nào chưa rõ thì hỏi anh, đừng đoán.
- Công thức tiền chỉ đặt trong src/lib/calc/ và phải có test. Đặt tên theo TU-DIEN.md.
- Làm xong từng phần thì chạy `npm run build` + `npm test`, rồi commit.
- Cuối cùng đưa anh checklist kiểm tra bằng tiếng Việt dễ hiểu, và đánh dấu [x] giai đoạn này trong mục 8 của KE-HOACH-REFACTOR.md.
```

Một giai đoạn hỏng thì bảo AI: "quay lại commit trước giai đoạn <số>".

---

## 7. Rủi ro và cách xử lý

| Rủi ro | Cách xử lý |
|---|---|
| Lại bỏ dở giữa chừng như các bản viết lại trước | App cũ vẫn chạy, nên bỏ dở không mất gì. GĐ3 xong là đã có một bản báo cáo dùng được ngay |
| Công thức lãi lỗ chuyển sai | GĐ3 có test so từng công trình với số chuẩn của app cũ |
| Dữ liệu cũ bẩn (bản ghi chỉ có tên CT, trùng tuần chấm công) | Script chuyển dữ liệu làm sạch một lần và in danh sách bản ghi lạ cho anh xem |
| Lưới nhập hóa đơn kém tiện hơn bản cũ | GĐ5 dành 2 session riêng. Anh so tay thật với app cũ, chưa ưng thì chưa qua |
| Supabase miễn phí ngủ khi 7 ngày không ai dùng | App dùng hằng ngày nên không bị. Lỡ ngủ thì bấm "Restore" trong Supabase là chạy lại |
| Mất dữ liệu | Sao lưu hằng đêm, cộng nút xuất JSON, cộng app cũ giữ nguyên tới hết GĐ11 |
| Quên key, lộ key | Key chỉ nằm trong `.env` (máy anh) và phần cài đặt của Vercel. Không bao giờ nằm trong code |

---

## 8. Theo dõi tiến độ

- [x] GĐ0 — Chuẩn bị
- [x] GĐ1 — Khung app
- [x] GĐ2 — Kho dữ liệu + chuyển dữ liệu
- [x] GĐ3 — Báo cáo khớp số ⭐⭐
- [x] GĐ4 — Danh Mục, Công Trình, Khách Hàng
- [x] GĐ5 — Hóa Đơn
- [x] GĐ6 — Chấm Công
- [x] GĐ7 — Tiền Ứng, Doanh Thu, Công Nợ, Quyết Toán
- [x] GĐ8 — Thiết Bị, Tỉ Trọng, Thùng Rác
- [x] GĐ9 — Chụp đa năng (hóa đơn, CCCD, hợp đồng), Xuất Excel
- [x] GĐ10 — Điện thoại + PWA
- [ ] GĐ11 — Chuyển hẳn (chưa: cần anh xuất dữ liệu mới, đổ lại rồi dùng hẳn bản online)
- [x] GĐ12 — Tiến Độ Thi Công (Phần 1 lõi · Phần 2 báo cáo và nối chi phí) — xong Phần 1 (12/11/2026); Phần 2 chưa làm
- [x] GĐ99 — Kiểm tra cuối + chỉnh giao diện laptop theo ý anh Tình (12/11/2026)

---

## 9. Ý tưởng để dành (làm sau khi chuyển hẳn)

- (ghi thêm vào đây khi nghĩ ra, đừng làm ở app cũ)

---

## Từ điển nhỏ

| Từ | Nghĩa |
|---|---|
| Session | Một cuộc chat mới với AI |
| Commit | Một "điểm lưu game" của code, quay lại được |
| Bảng / dòng / cột | Như Excel: bảng `hoa_don` là một sheet, mỗi hóa đơn là một dòng |
| RLS | Luật phân quyền đặt trong kho dữ liệu: ai được xem hoặc sửa dòng nào |
| jsonb | Một ô chứa cả cụm dữ liệu (như danh sách vật tư của một hóa đơn) |
| Test | Đoạn code tự kiểm tra công thức có ra đúng số không |
| `.env` | File giữ key bí mật trên máy anh, không đưa lên mạng |
| Vercel | Nơi chạy trang web, tự cập nhật khi code đổi |
