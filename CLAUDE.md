# CLAUDE.md — quy tắc cho AI làm trong `ban-moi`

App quản lý chi phí công trình (bản làm lại). App đang dùng thật vẫn là `../ban-dang-dung` — **chỉ đọc, cấm sửa**.

## Đọc trước khi làm
1. `QLCP-RENEW-INFO.md` — ngữ cảnh app, trạng thái, việc còn dở (chỉ có trên máy, không lên git). Thay đổi lớn thì cập nhật mục 6–7 của file này.
2. `KE-HOACH-REFACTOR.md` — chỉ đọc mục 0 (nghiệp vụ), 2 (quy tắc vàng), mục 4 liên quan.
3. `TU-DIEN.md` — tên tiếng Việt ↔ tên trong code.
4. `thiet-ke/giao-dien-mau.html` — bản vẽ chuẩn. Tra `tai-lieu/BAN-DO-GIAO-DIEN.md` để đọc đúng đoạn.
5. App cũ: tra `tai-lieu/BAN-DO-APP-CU.md` (hàm → file:dòng) rồi chỉ đọc đúng hàm; dữ liệu cũ: `tai-lieu/DU-LIEU-CU.md`.

## Quy tắc vàng (KẾ HOẠCH mục 2)
- Không đụng app cũ, không đụng Firebase. Không sửa `../../du-lieu-goc`.
- **Công thức tiền chỉ ở `src/lib/calc/`**, mỗi công thức có test Vitest, so với số app cũ. Chỗ khác không tự cộng trừ tiền.
- Không ghi key vào code. `.env*` không commit (trừ `.env.example`). Không in key ra log.
- Cấm đọc / tìm / liệt kê `D:\99-BAO-MAT\`.
- Git: chỉ nhánh `dev`. Không đụng `main`, không force push, không xóa nhánh. Commit tiếng Việt `GĐx: …`.

## Bộ đồ nghề
Vite + React 18 + TypeScript strict · Tailwind v4 (token màu ở `src/index.css`, lấy từ mẫu) · component kiểu shadcn tự viết ở `src/components/ui/` (Radix) · React Router 6 · TanStack Query 5 · TanStack Table 8 · Zod · Supabase (Postgres + Auth + Edge Functions) · Vitest · Playwright.

## Cấu trúc
```
src/app/            khung: App (đường dẫn, chặn quyền), DesktopShell (≥640), PhoneShell (<640), nav.ts (menu 9 tab + tab con, MỘT chỗ),
                    TabbedPage (dải tab con, chặn quyền theo tab con), auth.tsx, year.tsx
src/components/ui/  nút, ô nhập, bảng trượt (Sheet), hộp xác nhận, dropdown, thẻ, pill, trạng thái tải/trống/lỗi, toast,
                    data.tsx = dải số tổng (KpiStrip), thanh lọc, HBarList, ProfitPill, Money, Pager, MobileCard, PhoneKpis (dùng lại, đừng viết mới)
src/features/reports/  Lợi nhuận, Dashboard, Tra cứu chi phí (chỉ xem) + api.ts `useReportData()` đọc mọi bảng cho công thức
src/features/cost-allocation/  Tỉ Trọng & Định Mức (công thức ở lib/calc/cost-allocation.ts; jsonb giữ tên trường app cũ: nhomTay, theoHdtp, nhomLoai…)
src/features/equipment/  Theo Dõi TB (thêm / chuyển / sửa qua hàm kho save_equipment, transfer_equipment, edit_equipment)
src/features/schedule/ Tiến Độ (logic.ts = lịch làm việc, trễ / chậm, mẫu giai đoạn, Gantt, báo cáo Zalo — hàm thuần có test; kế hoạch ở schedule_plans)
src/features/trash/    Thùng Rác (thêm loại dữ liệu mới: thêm 1 dòng vào DEFS ở api.ts + `_trash_edit_mods` trong migration)
src/lib/            supabase.ts, format.ts, permissions.ts, calc/ (công thức tiền)
src/features/<tab>/ mỗi tab 1 thư mục tên tiếng Anh: api.ts (đọc/ghi), schema.ts (Zod), các màn .tsx
supabase/migrations/  file .sql tạo bảng, RLS, dữ liệu ban đầu
supabase/functions/   Edge Function (admin-users), _shared/ dùng chung với app
scripts/            seed-users.mjs (tạo tài khoản tạm), local-supabase.mjs, migrate-legacy.ts + compare-counts.ts (chuyển dữ liệu app cũ),
                    legacy/transform.ts (quy tắc chuyển, hàm thuần có test), gen-types.mjs
src/types/db.ts     kiểu TypeScript TỰ SINH từ schema (npm run gen:types) — không sửa tay
e2e/                test Playwright (ảnh ra anh-chup/, không lên git)
tai-lieu/           bản đồ app cũ, dữ liệu cũ, bản đồ giao diện mẫu, đặc tả Xuất Dữ Liệu
```

## Kiểu viết
- Tên trong code tiếng Anh theo `TU-DIEN.md`: bảng/cột `snake_case`, biến/hàm `camelCase`, component `PascalCase`, thư mục `kebab-case`.
- Giao diện, thông báo, comment nghiệp vụ: **tiếng Việt có dấu**.
- Mọi bảng nghiệp vụ có: `id, company_id, created_at, updated_at, deleted_at, created_by`. Xóa = **xóa mềm** (`deleted_at`) + hỏi xác nhận.
- Mọi bảng bật **RLS**, chính sách dùng `public.has_permission(module, level)` và `public.current_company_id()`. Bảng nghiệp vụ (GĐ2) có sẵn 4 chính sách + trigger `stamp_row` (tự ghi `created_by`, `updated_at`); bảng có `project_id` còn lọc theo phạm vi công trình. Thêm bảng mới thì làm theo mẫu `_apply_rls` trong migration `…000003`.
  Mức: `none` (Ẩn) < `view` (Xem) < `add` (Nhập: thêm + sửa dòng của mình) < `full` (Toàn quyền). Quyền đặc biệt: `has_special('see_contact_ids' | 'edit_others' | 'purge_trash')`.
- Tiền trong kho là `bigint` (đồng). Script `.ts` chạy thẳng bằng `node` (Node ≥ 23), import phải ghi đuôi `.ts`, dùng `import type` cho kiểu.
- Mỗi màn có trạng thái đang tải / trống / lỗi (`LoadingState`, `EmptyState`, `ErrorState`).
- Menu 9 tab (`tai-lieu/KE-HOACH-GOP-TAB.md`). Quyền gắn với **mục quyền**, mỗi tab con 1 mục. Thêm màn mới = thêm **tab con**
  vào tab hợp lý ở `NAV_TABS` (`src/app/nav.ts`) + trang vào `SUB_PAGES` trong `src/app/App.tsx`; hạn chế thêm tab chính.
  Ô số của mục khác nằm trong trang thì kiểm tra quyền mục đó (`hasLevel`).
- 3 khổ: máy tính ≥1024 (menu chữ), máy tính bảng 640–1023 (menu biểu tượng, khối 1 cột), điện thoại <640 (thẻ, thanh dưới). Không kéo ngang cả trang; bảng rộng thì cuộn trong `.tbl`.
- Dữ liệu đọc qua TanStack Query, kiểm tra bằng Zod trong `api.ts`.

## Chạy
```
npm i
npx supabase start          # Supabase trong Docker
npm run seed:users          # tạo tinh / chay / lam, mật khẩu tạm ở du-lieu/tai-khoan-tam.txt
npm run migrate:legacy      # đổ dữ liệu app cũ (du-lieu/snapshot.json) vào Supabase trên máy + báo cáo so sánh
npm run so-chuan            # chạy code app cũ trong Node trên du-lieu/snapshot.json → du-lieu/so-chuan.json (npm test so từng đồng)
npm run gen:types           # sau khi thêm / sửa migration: npx supabase migration up → sinh lại src/types/db.ts
npm run dev                 # http://localhost:5173
npm run typecheck && npm test && npm run build
npm run test:e2e            # Playwright (cần supabase start)
```
Đăng nhập: tên đăng nhập → email ẩn `<tên>@nguyenhuu.qlcp` (`supabase/functions/_shared/username.ts`).
