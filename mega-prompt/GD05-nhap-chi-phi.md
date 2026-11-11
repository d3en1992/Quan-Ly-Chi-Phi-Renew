# GĐ5 — Nhập Chi Phí (lưới nhập nhanh kiểu Excel, hóa đơn chi tiết, danh sách)
Model: **Fable 5.2** · Effort: **medium** (lưới nhập kiểu Excel, nhiều phím tắt). Đọc `00-QUY-TAC-CHUNG.md` trước.
App cũ cần đọc kỹ: `hoadon.quick-entry.js`, `hoadon.sheet-grid.js` (≈1.000 dòng — chép đúng hành vi phím), `hoadon.detail-entry.js`, `hoadon.list-trash.js`, `tienich.js` (`calcRowMoney`, gợi ý tên). **Không chép** `parseMoney` gõ tắt “1tr” (đã bỏ, mục 4E).

## Làm
1. **Lưới nhập nhanh** (`PAGES.nhap` subtab NHẬP NHANH): cột Ngày · Loại chi phí * · Công trình * · Số tiền · Nội dung · **Người mua** · Nhà cung cấp · **Đã TT**. Người TH tự lấy từ tài khoản (hiện nhãn, không có cột nhập).
   - Phím: Enter xuống, Tab sang phải, mũi tên, Ctrl+V dán vùng nhiều dòng nhiều cột từ Excel, Ctrl+D chép ô trên, Space bật/tắt Đã TT, Ctrl+S lưu, Delete xóa ô, chọn vùng bằng Shift+mũi tên / kéo chuột.
   - Ô gợi ý ngay dưới ô đang gõ (không dấu cũng tìm ra), có dòng “+ Tạo mới”.
   - Đã TT tích sẵn; chọn NCC có Mua nợ thì tự bỏ tích.
   - Cảnh báo trùng như `_showDupModal` (cùng ngày + công trình + số tiền + nội dung gần giống).
   - Ô tiền chỉ nhận số, tự thêm dấu chấm hàng nghìn.
2. **Hóa đơn chi tiết**: đầu phiếu (ngày, công trình, loại, NCC, người mua, số HĐ, Đã TT) + bảng dòng vật tư (tên, ĐVT, SL, đơn giá, thành tiền) + nội dung tự ghép như `generateDetailNd`; hiện “Mua tại: địa chỉ NCC” cạnh địa chỉ công trình, nhãn “khác khu vực” nếu khác quận / huyện.
3. **Hóa đơn trong ngày** dưới lưới; bấm dòng → bảng trượt sửa.
4. **Thống Kê CP/HĐ** (đã có ở GĐ3) thêm: lọc tháng / CT / loại / NCC / người mua, cột Thanh toán (Đã trả / Mua nợ), Nguồn (Nhanh / Chi tiết / Ảnh / Chấm công), mở dòng xem dòng vật tư + ảnh.
5. Điện thoại: màn Nhập tay (`MP.nhap`).

## Xong khi
- Test Playwright: gõ 5 dòng bằng bàn phím không dùng chuột; dán 20 dòng × 7 cột từ chuỗi TSV; lưu; số dòng và tổng tiền đúng.
- Lưu hóa đơn mới → Lợi Nhuận đổi đúng (A tăng khi Đã TT; không tăng khi mua nợ cho tới khi có phiếu chi).

## Khi xong — báo cáo và prompt tiếp theo
Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):
- ✅ **Đã xong GD05:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app.
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc “không có”).
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (nếu có, ví dụ dán key vào `.env`; không có thì ghi “không có”).
- **Prompt tiếp theo:** mở **session MỚI** (đừng dùng tiếp session này, để khỏi tốn token đọc lại lịch sử), chọn model **Opus 5.5**, effort **medium**, quyền **Bypass**, dán:
  ```
  Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD06-cham-cong.md
  ```
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng “Prompt tiếp theo”, điều phối tự chuyển.
