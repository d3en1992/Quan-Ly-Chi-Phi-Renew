TRẠNG THÁI: GD01 XONG — chờ GD02
Nhịp tim: 11/11/2026 16:15
Đang làm: —

# Tiến độ làm lại app

| GĐ | Nội dung | Model | Trạng thái | Ghi chú |
|---|---|---|---|---|
| GD01 | Khung app, đăng nhập, quyền, bố cục 3 khổ | Opus | **Xong** 11/11 | typecheck / 24 Vitest / build / 14 Playwright xanh. Ảnh: `anh-chup/GD01/` |
| GD02 | Kho dữ liệu + chuyển dữ liệu cũ ⭐ | Fable | Chưa | |
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

## Kết quả so số với app cũ
(chưa chạy)

## Quyết định AI tự chọn
- GD01: **Kế toán không thấy "Danh Mục & Sao Lưu"**. Giao diện mẫu mâu thuẫn: `ACCOUNTS.ketoan.hide` không ẩn Danh mục, nhưng bảng quyền mẫu (`PERM_ROWS`) ghi Danh mục = Ẩn. Chọn theo bảng quyền (an toàn hơn); Admin bật lại 1 ô là xong.
- GD01: **Thùng Rác** không có dòng riêng trong bảng quyền mẫu → hiện khi tài khoản được **Nhập** ở ít nhất 1 mục (Kế toán thấy, Chỉ xem không thấy — khớp mẫu). Quyền khôi phục / xóa hẳn làm ở GĐ8 (`purge_trash`).
- GD01: Phạm vi công trình trong bảng quyền là **mặc định của vai trò** khi tạo tài khoản; phạm vi thật nằm ở từng tài khoản (`profiles.project_scope`). Chọn công trình cụ thể để giao làm sau khi có bảng `projects` (GĐ2–GĐ4).
- GD01: Admin luôn toàn quyền (trigger chặn sửa quyền / xóa vai trò Admin, không tạo thêm vai trò Admin). Admin không tự khóa / tự đổi vai trò của mình.
- GD01: Đổi quyền → menu người dùng vai trò đó tự đổi trong ≤ 1 phút (app tự hỏi lại quyền mỗi 60 giây và khi quay lại cửa sổ); RLS trong kho có hiệu lực ngay.
- GD01: Mật khẩu tối thiểu 8 ký tự, có chữ và số. Mật khẩu tạm dạng `K7mq-42xa`. Tắt đăng ký tự do (chỉ Admin tạo tài khoản).
- GD01: Không làm bước "cất code cũ sang nhánh `luu-tru-vanilla`" và "thay `main`" của KẾ HOẠCH mục GĐ1 — prompt GD01 chỉ cho làm trên `dev`, không đụng `main`. `main` trên GitHub vẫn là code cũ.

## Lỗi còn biết
- Supabase trong máy có thêm các tài khoản test `e2e.*` (do Playwright tạo) — hiện trong danh sách Tài khoản ở máy anh. Không ảnh hưởng bản online. Xóa: `npm run db:reset`.
- Chọn năm mới chỉ lưu lựa chọn; lọc số liệu theo năm làm ở GĐ3 (mục 4K).
- Ô tìm (Ctrl+K) mới tìm được tên tab; tìm công trình / hóa đơn / công nhân thêm ở các GĐ sau.
- Font Be Vietnam Pro + icon tải từ Google Fonts (cần mạng). GĐ10 (PWA) nên tự chứa font.

## Việc anh cần làm
1. **Thử trên máy:** mở Docker Desktop → trong `ban-moi` chạy `npx supabase start` → `npm run dev` → mở http://localhost:5173. Mật khẩu tạm của `tinh`, `chay`, `lam` ở `ban-moi/du-lieu/tai-khoan-tam.txt`.
2. **Vercel** (chưa cần làm ngay, để GĐ10 đưa bản thử online): project `quan-ly-chi-phi-test` → Settings:
   - Build & Development: Framework Preset = **Vite**, Build Command = `npm run build`, Output Directory = `dist`, Root Directory = thư mục chứa `package.json` (gốc repo).
   - Git: Production Branch tạm để **`dev`** (hoặc dùng link Preview của nhánh `dev`).
   - Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (của project Supabase online `qlcp-thu`), `VITE_COMPANY_SLUG` = `nguyenhuu`. Anh tự dán, AI không đụng.
   - `vercel.json` đã có sẵn (mọi đường dẫn trả về `index.html`).
