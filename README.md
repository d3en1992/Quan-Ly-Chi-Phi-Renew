# ban-moi — App quản lý chi phí công trình (bản làm lại)

Bản làm lại của `../ban-dang-dung` bằng TypeScript + React + Supabase. App đang dùng thật vẫn là `../ban-dang-dung`.
Kế hoạch: [KE-HOACH-REFACTOR.md](KE-HOACH-REFACTOR.md) · Ngữ cảnh + tiến độ: `QLCP-RENEW-INFO.md` (chỉ có trên máy) · Quy tắc cho AI: [CLAUDE.md](CLAUDE.md) · Từ điển: [TU-DIEN.md](TU-DIEN.md)

## Cách chạy trên máy

Cần: Node 20+, Docker Desktop đang mở.

```bash
npm i
npx supabase start        # bật Supabase trong Docker (lần đầu tải lâu)
npm run seed:users        # tạo tài khoản tinh / chay / lam
npm run dev               # mở http://localhost:5173
```

- Mật khẩu tạm của 3 tài khoản nằm ở `du-lieu/tai-khoan-tam.txt` (không đưa lên GitHub). Lần đầu đăng nhập phải đổi mật khẩu.
- `.env.local` trỏ vào Supabase trong máy. Mẫu ở `.env.example`; lấy `ANON_KEY` bằng `npx supabase status`.
- Làm lại kho từ đầu: `npm run db:reset` (xóa sạch dữ liệu trong máy, chạy lại migration + tạo lại tài khoản).
- Muốn sinh mật khẩu tạm mới cho 3 tài khoản: `npm run seed:users -- --reset`.

## Kiểm tra

```bash
npm run typecheck   # TypeScript
npm test            # Vitest
npm run build       # đóng gói ra dist/
npm run test:e2e    # Playwright (cần supabase start), ảnh lưu ở anh-chup/
```
