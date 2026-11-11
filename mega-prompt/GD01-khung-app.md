# GĐ1 — Khung app, đăng nhập, phân quyền, bố cục 3 khổ màn hình
Model: **Opus 5.5** · Effort: **medium** (dựng khung theo mẫu có sẵn, ít suy luận nghiệp vụ). Đọc `00-QUY-TAC-CHUNG.md` trước.

## Làm
1. **Git:** trong `ban-moi`: `git init` (nếu chưa có), `.gitignore` (node_modules, dist, .env, du-lieu/, anh-chup/ giữ lại ảnh nhỏ được), remote `origin` = `https://github.com/d3en1992/Quan-Ly-Chi-Phi-Renew.git`, tạo nhánh **`dev`**. Không đụng `main` của remote (code cũ vẫn ở đó).
2. **Khung:** Vite + React 18 + TypeScript (strict) + Tailwind + shadcn/ui + React Router + TanStack Query + TanStack Table + Zod + React Hook Form (chỉ khi cần) + Vitest + Playwright. Font Be Vietnam Pro, icon Material Symbols (như giao diện mẫu). Chủ đề sáng/tối theo token màu của giao diện mẫu (`:root` trong `thiet-ke/giao-dien-mau.html`).
3. **Supabase trên máy:** `npx supabase init`, `npx supabase start` (Docker đã có sẵn). Tạo `.env.local` trỏ vào Supabase local. `src/lib/supabase.ts`.
4. **Bố cục** (giao diện mẫu, mục 4I):
   - ≥1024px: menu trái 4 nhóm (Chi phí / Quản lý / Doanh thu & lãi / Hệ thống), thanh trên (tìm Ctrl+K, chọn năm nhiều năm + Tất cả, tài khoản), vùng nội dung, bảng trượt phải.
   - 640–1023px: menu thu thành cột biểu tượng, khối xếp 1 cột.
   - <640px: bố cục điện thoại: thanh dưới 5 nút (Tổng quan, Công trình, Nhập, Chấm công, Thêm), nút nổi “Chụp”, mục Thêm dạng lưới.
   - Đủ đường dẫn cho mọi tab (trang trống “Đang làm” cho tab chưa xong). Tên tab theo mục 4L: **Chi Trả TP/NCC**, **Công Nợ Phải Trả**.
5. **Đăng nhập + quyền** (mục 4C):
   - Bảng `companies`, `profiles` (username, display_name, role_id, must_change_password, project_scope), `roles`, `role_permissions` (role × module × level: none/view/add/full) + quyền đặc biệt (see_contact_ids, edit_others, purge_trash), `profile_projects` (phạm vi công trình).
   - Đăng nhập bằng **tên đăng nhập + mật khẩu**; nội bộ đổi thành email ẩn `<username>@<company-slug>.qlcp`. Không Gmail.
   - Hàm SQL `has_permission(module text, level text)` dùng trong RLS.
   - Edge Function `admin-users`: tạo tài khoản, đặt lại mật khẩu, khóa (chỉ Admin gọi được).
   - Seed 5 vai trò + bảng quyền **đúng như giao diện mẫu** (`PERM_ROWS`, `PERM_EXTRA` trong tab Tài Khoản & Quyền), 1 công ty “CÔNG TY NGUYỄN HỮU”, tài khoản: `tinh` (TÌNH, Admin), `chay` (NGUYỄN VĂN CHẠY, Giám đốc), `lam` (PHẠM VĂN LAM, Quản lý) với mật khẩu tạm sinh ngẫu nhiên, ghi vào `ban-moi/du-lieu/tai-khoan-tam.txt` (thư mục `du-lieu/` đã gitignore), bắt đổi mật khẩu lần đầu.
   - Màn đăng nhập, màn đổi mật khẩu lần đầu, menu ẩn theo quyền.
6. **Tab Tài Khoản & Quyền** (chỉ Admin): danh sách tài khoản, tạo / sửa / đặt lại MK / khóa, nút “Copy thông tin đăng nhập”; bảng quyền bấm ô đổi mức, tạo / nhân bản vai trò, phạm vi công trình.
7. `CLAUDE.md` (quy tắc code, trỏ tới kế hoạch + 00-QUY-TAC-CHUNG), `TU-DIEN.md` (bảng Việt ↔ Anh, mở rộng từ mục 4B, 4L), `README.md` (cách chạy: `npm i`, `npx supabase start`, `npm run dev`).
8. `vercel.json` cho SPA (rewrite mọi đường dẫn về index.html). **Không tự đổi cài đặt Vercel**; ghi vào TIEN-DO hướng dẫn anh chỉnh Framework = Vite, Output = dist, biến môi trường.

## Xong khi
- Đăng nhập được bằng 3 tài khoản seed trên Supabase local; mỗi vai trò thấy đúng menu (test Playwright đăng nhập từng vai trò, so menu với `ACCOUNTS[...].hide` của giao diện mẫu).
- Đổi một ô quyền trong tab Tài Khoản & Quyền → menu vai trò đó đổi theo (test).
- 3 khổ màn hình hiện đúng bố cục (ảnh chụp 1440 / 820 / 390).

## Khi xong — báo cáo và prompt tiếp theo
Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):
- ✅ **Đã xong GD01:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app.
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc “không có”).
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (nếu có, ví dụ dán key vào `.env`; không có thì ghi “không có”).
- **Prompt tiếp theo:** mở **session MỚI** (đừng dùng tiếp session này, để khỏi tốn token đọc lại lịch sử), chọn model **Fable 5.2**, effort **high**, quyền **Bypass**, dán:
  ```
  Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD02-du-lieu.md
  ```
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng “Prompt tiếp theo”, điều phối tự chuyển.
