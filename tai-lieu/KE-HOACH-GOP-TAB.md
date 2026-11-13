# Kế hoạch gộp tab: 18 mục → 9 tab

> Soạn 13/11/2026. Làm **một lần**, một commit `GĐ99: gọn menu 18 → 9 tab`, nhánh `dev`.
> Không đụng `src/lib/calc/`, không đổi bảng dữ liệu, không đổi RLS.

---

## 0. Kết quả cuối

| # | Tab (đường dẫn) | Tab con (đường dẫn con) | Mục quyền (module) | Lấy từ |
|---|---|---|---|---|
| 1 | **Công Trình** `/cong-trinh` | — (chi tiết `/cong-trinh/:id` giữ như cũ) | `projects` | Công Trình |
| 2 | **Chi Phí** `/chi-phi` | Nhập `/nhap` · Tra cứu `/tra-cuu` | `expenses` · `expense_stats` | Nhập Chi Phí, Thống Kê CP/HĐ |
| 3 | **Chấm Công** `/cham-cong` | (giữ 3 tab con bên trong) | `timesheets` | Chấm Công |
| 4 | **Thầu Phụ & NCC** `/thau-phu` | HĐ thầu phụ `/hop-dong` · Nhà cung cấp `/ncc` · Tất toán `/tat-toan` · Phiếu chi `/phieu-chi` | `payables` ×3 · `payments` | Công Nợ, Chi Trả |
| 5 | **Thu & Lãi** `/thu-lai` | HĐ chính `/hop-dong` · Thu tiền `/thu-tien` · Quyết toán `/quyet-toan` · Lợi nhuận `/loi-nhuan` | `revenue` ×2 · `settlements` · `profit` | Doanh Thu, Quyết Toán, Lợi Nhuận |
| 6 | **Kế Hoạch** `/ke-hoach` | Tiến độ `/tien-do` · Tỉ trọng `/ti-trong` · Định mức `/dinh-muc` · Cấu hình rổ `/cau-hinh` | `schedule` · `cost_allocation` ×3 | Tiến Độ, Tỉ Trọng & Định Mức |
| 7 | **Thiết Bị** `/thiet-bi` | — | `equipment` | Theo Dõi TB |
| 8 | **Dashboard** `/dashboard` | — | `dashboard` | Dashboard (giữ riêng, nằm dưới Thiết Bị) |
| 9 | **Cài Đặt** `/cai-dat` | Danh bạ `/danh-ba` · Danh mục `/danh-muc` · Tài khoản `/tai-khoan` · Phân quyền `/phan-quyen` · Xuất dữ liệu `/xuat` · Thùng rác `/thung-rac` | `contacts` · `catalog` · `accounts` ×2 · (xuất) · (thùng rác) | Danh Bạ, Danh Mục, Tài Khoản, Xuất, Thùng Rác |

Menu máy tính bỏ tiêu đề nhóm (9 mục, không cần chia nhóm). Cài Đặt nằm cuối, cách một khoảng.

---

## 1. Nguyên tắc phân quyền

**Quyền gắn với *mục dữ liệu* (module), không gắn với tab.** Tab chỉ là cái vỏ để xếp các tab con.

1. **Giữ nguyên 16 mục quyền** trong kho (`app_modules`, `role_permissions`, `has_permission()`, RLS).
   → Không phải viết lại RLS, vai trò anh đã chỉnh vẫn giữ nguyên, không tài khoản nào tự dưng thấy nhiều hơn.
2. **Mỗi tab con gắn đúng 1 mục quyền.** Tab con hiện khi mục đó ≥ Xem. Nút thêm / sửa / xóa trong tab con theo mức của chính mục đó (như hiện nay).
3. **Tab chính hiện khi có ít nhất 1 tab con được thấy.** Không có tab con nào → ẩn hẳn tab.
4. **Còn đúng 1 tab con** → không hiện dải tab con, tiêu đề trang lấy tên tab con.
   Ví dụ: Kế toán vào Cài Đặt chỉ thấy Danh bạ, Xuất dữ liệu, Thùng rác. Chỉ xem vào Kế Hoạch chỉ thấy Tiến độ.
5. **Mỗi tab con có đường dẫn riêng** (`/thu-lai/quyet-toan`). Chặn quyền theo tab con (`Guard`), nên gõ thẳng đường dẫn cũng không lọt.
   Mở `/thu-lai` → chuyển tới tab con đầu tiên được thấy (hoặc tab con mở lần trước, lưu `localStorage`).
6. **Khối số của mục khác nằm trong trang thì kiểm tra quyền mục đó**, giống cờ `money` đang dùng ở Công Trình.
   Ví dụ: tab Dashboard có ô "Còn phải trả thầu phụ" thì chỉ hiện khi `payables ≥ Xem`; ô "Lãi" chỉ hiện khi `profit ≥ Xem`.
7. **Cấu hình nằm ở một chỗ duy nhất: `src/app/nav.ts`.** Menu máy tính, menu điện thoại, đường dẫn, ô tìm nhanh (Ctrl K), chặn quyền và bảng phân quyền đều đọc từ đó.
   Sau này thêm hay chuyển tab con chỉ cần sửa một dòng.
8. **Bảng Phân quyền** (Cài Đặt › Phân quyền) xếp các dòng **theo tab mới**, có tiêu đề nhóm:
   ```
   Chi Phí          Nhập chi phí · Tra cứu chi phí
   Thầu Phụ & NCC   Công nợ (HĐ thầu phụ, NCC, tất toán) · Phiếu chi
   Thu & Lãi        Doanh thu, thu tiền · Quyết toán · Lợi nhuận
   Kế Hoạch         Tiến độ · Tỉ trọng & định mức
   ...
   ```
   Bấm tên nhóm → đặt cùng một mức cho cả nhóm (tiện khi tạo vai trò mới).
   Admin nhìn bảng quyền là biết ngay người đó thấy tab con nào.

### Ai thấy gì theo bảng quyền mặc định (phải đúng sau khi làm)

| Tab | Admin | Giám đốc | Quản lý | Kế toán | Chỉ xem |
|---|---|---|---|---|---|
| Công Trình | ✓ | ✓ | ✓ | ✓ | ✓ |
| Chi Phí | ✓ | ✓ | ✓ | Nhập, Tra cứu | Tra cứu |
| Chấm Công | ✓ | ✓ | ✓ | ✓ | — |
| Thầu Phụ & NCC | ✓ | ✓ | ✓ | ✓ (công nợ chỉ Xem) | — |
| Thu & Lãi | ✓ | ✓ | ✓ | — | — |
| Kế Hoạch | ✓ | ✓ | ✓ | Tiến độ | Tiến độ |
| Thiết Bị | ✓ | ✓ | ✓ | — | — |
| Dashboard | ✓ | ✓ | ✓ | — | — |
| Cài Đặt | đủ 6 | trừ TK, Phân quyền | trừ TK, Phân quyền | Danh bạ, Xuất, Thùng rác | Xuất |

---

## 2. Các bước làm (theo thứ tự)

### B1. Cấu hình menu mới: `src/app/nav.ts`
- Kiểu mới:
  ```ts
  type SubItem = { key; slug; label; short?; module: ModuleKey | 'trash' | 'export'; render?: … };
  type NavTab  = { key; path; icon; label; subs?: SubItem[]; module?: ModuleKey };
  export const NAV_TABS: NavTab[] = [ …9 tab… ];
  ```
- Hàm: `visibleSubs(perms, tab)`, `canSeeTab(perms, tab)`, `visibleTabs(perms)`, `firstVisiblePath(perms)`, `findByPath(pathname)` (trả về tab + tab con).
- `LEGACY_REDIRECTS`: đường dẫn cũ → mới (`/cong-no` → `/thau-phu/hop-dong`, `/chi-tra` → `/thau-phu/phieu-chi`, `/doanh-thu` → `/thu-lai/hop-dong`, `/quyet-toan`, `/loi-nhuan`, `/nhap-chi-phi` → `/chi-phi/nhap`, `/thong-ke-cp-hd` → `/chi-phi/tra-cuu`, `/ti-trong`, `/tien-do`, `/danh-ba`, `/danh-muc`, `/tai-khoan`, `/xuat-du-lieu`, `/thung-rac`).
  Để giữ dấu trang và lối tắt PWA đã cài trên điện thoại. Tiến Độ giữ cả `?query` khi chuyển (đường link báo Zalo).
- Điện thoại: `PHONE_MORE_KEYS` còn 5 mục (Thầu Phụ & NCC, Thu & Lãi, Kế Hoạch, Thiết Bị, Cài Đặt).
  `PHONE_HOME_SHORTCUTS` trỏ thẳng tab con: Tra cứu chi, Phiếu chi, Công nợ, Thu tiền.
- Bỏ `isNew` (nhãn MỚI).

### B2. Khung trang có tab con: `src/app/TabbedPage.tsx` (mới)
- Đọc `:sub` từ URL → lọc tab con theo quyền → hiện `SubTabs` (ẩn khi chỉ còn 1) → vẽ trang con.
- Không có `:sub` → chuyển tới tab con nhớ lần trước nếu còn quyền, không thì tab con đầu tiên.
- `:sub` không có quyền → `BlockedPage`. `:sub` sai tên → `NotFoundPage`.

### B3. Đường dẫn: `src/app/App.tsx`
- Thay `PAGES` + `ALL_ITEMS.map` bằng route sinh từ `NAV_TABS`: `/<tab>` và `/<tab>/:sub`.
- Thêm route chuyển hướng từ `LEGACY_REDIRECTS`.
- Công Trình (`/cong-trinh`, `/cong-trinh/:projectId`) và Dashboard (`/dashboard`) giữ đường dẫn cũ, không có tab con.
- Điện thoại: `/tong-quan` (`PhoneHomePage` = lối tắt + Dashboard) giữ như cũ, vẫn là nút đầu ở thanh dưới;
  Dashboard không nằm trong "Thêm" nữa (đã có ở Tổng quan).
- Bỏ `STAGE` và `ComingSoonPage` (mọi trang đã xong).

### B4. Cho các trang nhận tab con từ ngoài (bỏ dải tab con bên trong)
Trang nào đang tự giữ tab con bằng `useState` thì đổi thành prop `tab`, để chỉ còn **một hàng tab con**:
- `PayablesPage` → `tab: 'contracts' | 'suppliers' | 'closures'`
- `RevenuePage` → `tab: 'contracts' | 'receipts'` (điện thoại mặc định Thu tiền: xử lý ở B2 bằng thứ tự tab con điện thoại)
- `CostAllocationPage` → `tab: 'alloc' | 'benchmark' | 'config'`
- `AccountsPage` → tách thành 2 tab con `AccountsTab`, `RolesTab` (bỏ `AccountsPage`)
- Mỗi trang bỏ `PageHeader` riêng: `TabbedPage` vẽ tiêu đề chung (tên tab + mô tả tab con).
- Giữ nguyên tab con bên trong của: Chấm Công (1 mục quyền), Danh Bạ (lọc loại liên hệ), Thùng Rác (lọc loại dữ liệu), Nhập Chi Phí (Nhanh / Chi tiết), chi tiết công trình.

### B5. Thanh menu
- `DesktopShell.tsx`: vẽ 9 mục từ `visibleTabs()`, bỏ tiêu đề nhóm. Khổ máy tính bảng (biểu tượng) giữ nguyên cách vẽ.
  Mục đang chọn: so theo đoạn đầu đường dẫn (`/thu-lai/...` → Thu & Lãi).
- `PhoneShell.tsx`: thanh dưới giữ 5 nút (Tổng quan · Công trình · Nhập · Chấm công · Thêm). Nút Nhập trỏ `/chi-phi/nhap`.
  Sửa `activeBottomKey`, `MAIN_PATHS`, `backTo`, `showFab` (`/chi-phi/tra-cuu`).
- `placeholder/pages.tsx` (`PhoneMorePage`, `PhoneHomePage`): đọc danh sách mới.
- `CommandPalette.tsx` (Ctrl K): liệt kê **cả tab con** ("Quyết toán", "Phiếu chi", "Định mức"…), để ai quen tên cũ gõ vẫn ra.

### B6. Bảng phân quyền
- `RolesTab.tsx`: xếp dòng theo nhóm lấy từ `NAV_TABS` (mỗi mục quyền thuộc tab nào). Thêm tiêu đề nhóm và nút "đặt cả nhóm".
- Migration nhỏ `…_gop_tab_menu.sql`: chỉ cập nhật `label` + `sort_order` của `app_modules` cho khớp tên mới
  (vd `payments` → "Phiếu chi TP/NCC", `expense_stats` → "Tra cứu chi phí").
  Không thêm, không xóa mục quyền. Chạy `npm run gen:types`.

### B7. Bỏ số liệu dư (anh đã đồng ý)
| Chỗ | Bỏ | Giữ |
|---|---|---|
| Công Trình (danh sách) | dải số Tổng đã chi / Đã thu / Còn phải thu / Lãi (trùng Dashboard) | "Đang thi công: N công trình" (đưa vào dòng mô tả dưới tiêu đề) |
| Chi tiết công trình | ô "Tổng chi phí (mọi HĐ)" | "Tổng đã chi", thêm ghi chú nhỏ "còn nợ NCC x đ" bên dưới |
| Dashboard | khối "Top 5 chi nhiều nhất", "Còn phải thu nhiều nhất" (đã có ở Thu & Lãi › Thu tiền), nút 12 / 52 tuần | dải số, biểu đồ chi theo tuần (cố định 12 tuần), cơ cấu chi theo loại |
| Thu & Lãi › Lợi nhuận | dải số trên cùng (trùng Dashboard); cột X · HĐ gốc, Y · Quyết toán, cột "tính cả mua nợ" (chuyển vào khung chi tiết khi bấm một dòng) | bảng lợi nhuận + dòng tổng, khối Lãi cao nhất / Đang lỗ |
| Chi Phí › Tra cứu | bộ lọc "Nguồn nhập" (Nhanh / Chi tiết / Ảnh / Excel / Chấm công) | các bộ lọc khác |
| Menu | nhãn MỚI | — |

Chỉ bỏ phần **hiển thị**. Công thức trong `src/lib/calc/` không đổi, test so số với app cũ vẫn chạy như cũ.
Hàm tính nào sau khi bỏ không còn ai gọi thì **giữ lại** (đã có test, Xuất Dữ Liệu có thể cần).

### B8. Test
- `src/app/nav.test.ts`: viết lại bảng "ai thấy gì" ở mục 1 cho 5 vai trò mặc định (tab + tab con).
  Thêm test: 1 tab con → không có dải tab con; mọi đường dẫn cũ đều có chỗ chuyển; mọi mục quyền đều nằm trong đúng 1 tab.
- E2E (13 file, khoảng 93 chỗ ghi đường dẫn cũ): đổi sang đường dẫn mới, đổi chỗ bấm menu theo tên mới.
  Thêm 1 file `gd99-gop-tab.spec.ts`: đăng nhập từng vai trò → đếm tab, tab con; gõ đường dẫn cũ → tới đúng trang mới; gõ tab con không có quyền → trang chặn.
- Chạy: `npm run typecheck && npm test && npm run build && npm run test:e2e`.
- Chụp 3 khổ (1280 / 800 / 375) cho từng tab mới vào `e2e/anh-chup/`, tự soát không bị cuộn ngang cả trang.

### B9. Tài liệu
- `CLAUDE.md` (mục Cấu trúc, "Thêm tab mới" → thêm tab con ở `NAV_TABS`).
- `TU-DIEN.md`: Thu & Lãi, Kế Hoạch, Cài Đặt, Tra cứu chi phí, Phiếu chi.
- `QLCP-RENEW-INFO.md` mục 6–7.
- `tai-lieu/BAN-DO-GIAO-DIEN.md`: ghi chú menu đã khác bản vẽ mẫu (mẫu vẫn giữ nguyên, không sửa).

---

## 3. Rủi ro và cách tránh

| Rủi ro | Cách tránh |
|---|---|
| Ai đó thấy nhiều hơn trước | Không đổi mục quyền, không đổi RLS; test bảng "ai thấy gì" cho 5 vai trò. |
| Dấu trang, lối tắt PWA, link báo Zalo tiến độ bị hỏng | `LEGACY_REDIRECTS` giữ cả `?query`; e2e thử từng đường dẫn cũ. |
| Hai hàng tab con chồng nhau | B4 đưa tab con của trang ra ngoài; chỉ giữ tab con bên trong khi nó là bộ lọc, không phải trang khác. |
| Điện thoại dải tab con 4–6 mục bị chật | `SubTabs` đã cuộn ngang được; thêm nhãn ngắn `short` cho từng tab con. |
| Lệch số sau khi bỏ khối hiển thị | Không đụng `calc/`; `npm test` so từng đồng với `so-chuan.json`. |

---

## 4. Xong khi
- [ ] Menu máy tính 9 mục; điện thoại thanh dưới 5 nút + "Thêm" 5 mục.
- [ ] Bảng "ai thấy gì" đúng cho 5 vai trò (test xanh).
- [ ] Mọi đường dẫn cũ chuyển đúng chỗ.
- [ ] Bảng Phân quyền xếp theo tab mới, có nút đặt cả nhóm.
- [ ] Các số liệu ở B7 đã bỏ; `npm test` so số vẫn xanh.
- [ ] typecheck, test, build, e2e xanh; ảnh chụp 3 khổ đã soát.
- [ ] Tài liệu B9 đã cập nhật; 1 commit trên `dev`.
