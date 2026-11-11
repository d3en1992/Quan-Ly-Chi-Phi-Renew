# GĐ9 — Nút Chụp đa năng (hóa đơn, CCCD, hợp đồng) + Xuất Excel
Model: **Sonnet 5.5** · Effort: **high** (chụp ảnh + Gemini, xuất Excel). Đọc `00-QUY-TAC-CHUNG.md` trước. Đọc kế hoạch mục **4D, 4G**.

## Làm
1. **Edge Function `scan-document`** (Supabase): nhận ảnh (đã thu nhỏ ≤ 1600px) + ghi chú + loại (auto / invoice / id_card / contract); gửi Gemini (model đa phương thức mới nhất có gói miễn phí) với **JSON schema** đầu ra; kèm danh sách loại chi phí, NCC, công trình, công nhân hiện có để AI khớp tên. Trả về loại giấy tờ + dữ liệu + **độ chắc chắn từng ô**.
   - Key Gemini lấy từ Supabase secret `GEMINI_API_KEY` (hóa đơn) và `GEMINI_API_KEY_PAID` (CCCD; nếu không có thì dùng key thường và ghi cảnh báo trong TIEN-DO). **Không bao giờ để key ở trình duyệt.**
   - Chưa có key → chế độ **giả lập** đọc từ `supabase/functions/scan-document/fixtures/*.json` để làm và test giao diện.
2. **Hóa đơn**: ảnh lưu Supabase Storage (bucket riêng theo công ty, RLS) → form Hóa đơn chi tiết điền sẵn: ô không chắc tô vàng, tự so tổng dòng với tổng in trên hóa đơn, NCC khớp danh mục gắn sẵn; NCC mới → ô “Thêm nhà cung cấp mới” tích sẵn với Tên / Địa chỉ / SĐT; NCC có rồi mà thiếu địa chỉ / SĐT → hỏi bổ sung; nhãn “khác khu vực”; Đã TT; `source = scan`, gắn ảnh. **Không tự lưu.**
3. **CCCD**: đọc họ tên, số CCCD, ngày sinh, giới tính, quê quán, nơi thường trú, ngày cấp → tìm người trùng tên trong Danh Bạ (công nhân / khách hàng / nhân viên) → gắn hoặc tạo mới. **Chỉ lưu chữ, xóa ảnh ngay** (không đưa lên Storage).
4. **Hợp đồng**: đọc chủ đầu tư, địa chỉ, SĐT, giá trị → gợi ý Khách hàng + Hợp đồng chính, anh duyệt rồi mới lưu.
5. **Ghi chú bằng giọng nói**: nút mic dùng Web Speech API (`vi-VN`); không hỗ trợ thì ẩn nút.
6. Giao diện: máy tính subtab CHỤP HÓA ĐƠN + nút Chụp CCCD ở Danh Bạ; điện thoại nút nổi “Chụp” → `MP.chupmenu`, `MP.chup`, `MP.cccd`.
7. **Xuất Excel** (SheetJS) đủ các sheet như `nhapxuat.export.js` của app cũ. **Không** làm Nhập Excel / Nhập JSON cũ / Lô nhập (mục 4E).

## Xong khi
- Chế độ giả lập: 3 fixture (hóa đơn có NCC mới, hóa đơn chữ mờ, CCCD) chạy hết luồng tới bước Lưu (test Playwright).
- Có key: thử 1 ảnh mẫu trong `supabase/functions/scan-document/fixtures/` (không dùng ảnh thật của anh khi chạy tự động).

## Khi xong — báo cáo và prompt tiếp theo
Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):
- ✅ **Đã xong GD09:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app.
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc “không có”).
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (nếu có, ví dụ dán key vào `.env`; không có thì ghi “không có”).
- **Prompt tiếp theo:** mở **session MỚI** (đừng dùng tiếp session này, để khỏi tốn token đọc lại lịch sử), chọn model **Sonnet 5.5**, effort **medium**, quyền **Bypass**, dán:
  ```
  Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD12-tien-do.md
  ```
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng “Prompt tiếp theo”, điều phối tự chuyển.
