# GĐ99 — Kiểm tra cuối + báo cáo sáng
Model: **Opus 5.5** · Effort: **low** (chỉ chạy kiểm tra, viết báo cáo). Đọc `00-QUY-TAC-CHUNG.md` trước. **Không viết tính năng mới**, chỉ kiểm tra và báo cáo. Sửa lỗi nhỏ (≤ 15 phút mỗi lỗi) thì được.

## Làm
1. `npm run typecheck`, `npm test`, `npm run build` trên nhánh `dev`. Ghi kết quả (chỉ tóm tắt, không dán log dài).
2. Chạy lại test so số GĐ3 với `du-lieu/so-chuan.json`.
3. Playwright: đăng nhập từng vai trò (Admin, Giám đốc, Quản lý, Kế toán, Chỉ xem), mở mọi tab ở 1440 / 820 / 390px, lưu ảnh `anh-chup/CUOI/`, ghi lỗi console. **Không mở xem từng ảnh** (tốn token), chỉ ghi danh sách.
4. Viết `ban-moi/BAO-CAO-SANG.md`: link xem trước (nếu có), cách chạy thử trên máy (`npx supabase start`, `npm run dev`), tài khoản thử (trỏ tới `du-lieu/tai-khoan-tam.txt`, **không** chép mật khẩu), bảng GĐ xong / dở, kết quả so số, quyết định AI tự chọn, việc anh cần làm, checklist 10 dòng để anh bấm thử.
5. Đánh dấu [x] các GĐ đã xong ở mục 8 `KE-HOACH-REFACTOR.md`. Ghi `TRẠNG THÁI: HOÀN TẤT` (hoặc `TẠM DỪNG` nếu còn GĐ dở) ở đầu `TIEN-DO.md`.

## Khi xong — báo cáo và prompt tiếp theo
Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):
- ✅ **Đã xong GD99:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app.
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc “không có”).
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (nếu có, ví dụ dán key vào `.env`; không có thì ghi “không có”).
- Đây là bước cuối. Không còn prompt tiếp theo.
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng “Prompt tiếp theo”, điều phối tự chuyển.
