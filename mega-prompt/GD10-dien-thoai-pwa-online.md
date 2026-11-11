# GĐ10 — Hoàn thiện điện thoại, máy tính bảng, PWA, đưa lên bản thử online
Model: **Sonnet 5.5** · Effort: **medium** (rà giao diện điện thoại, PWA). Đọc `00-QUY-TAC-CHUNG.md` trước.

## Làm
1. Rà **mọi** màn điện thoại theo `MP.*` của giao diện mẫu (Tổng quan, Công trình, Chi tiết CT, Nhập, Chụp, Chấm công, Thêm + 14 màn con). Màn nào giai đoạn trước chưa làm thì làm.
2. Rà khổ máy tính bảng / Z Fold mở (820px, 673px): menu biểu tượng, khối 1 cột, bảng cuộn trong khung.
3. **PWA**: `vite-plugin-pwa`, manifest (tên “QLCP Nguyễn Hữu”, icon từ `../ban-dang-dung/manifest.json` / assets), cài được lên màn hình chính. Không cache dữ liệu nghiệp vụ offline (app chạy online).
4. **Bản thử online** (chỉ khi `.env` có `SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `SUPABASE_TEST_DB_URL`): `npx supabase db push` lên `qlcp-thu`, deploy Edge Functions, chạy `scripts/migrate-legacy.ts` vào `qlcp-thu`, tạo 3 tài khoản. Nút “Nạp lại dữ liệu mẫu” (Admin, chỉ có ở bản thử). Chưa có key → ghi “Việc anh cần làm” trong TIEN-DO, bỏ qua.
5. Push `dev` → Vercel tạo link xem trước (nếu anh đã nối và đặt biến môi trường). Ghi link vào TIEN-DO.

## Xong khi
- Playwright chụp mọi màn ở 390px, 820px, 1440px vào `anh-chup/GD10/`, không lỗi console, không kéo ngang trang.

## Khi xong — báo cáo và prompt tiếp theo
Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):
- ✅ **Đã xong GD10:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app.
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc “không có”).
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (nếu có, ví dụ dán key vào `.env`; không có thì ghi “không có”).
- **Prompt tiếp theo:** mở **session MỚI** (đừng dùng tiếp session này, để khỏi tốn token đọc lại lịch sử), chọn model **Opus 5.5**, effort **medium**, quyền **Bypass**, dán:
  ```
  Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD08-thiet-bi-ty-trong-thung-rac.md
  ```
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng “Prompt tiếp theo”, điều phối tự chuyển.
