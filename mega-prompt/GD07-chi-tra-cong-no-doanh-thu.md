# GĐ7 — Chi Trả TP/NCC, Công Nợ Phải Trả, Doanh Thu, Quyết Toán
Model: **Fable 5.2** · Effort: **medium** (chia tiền trả NCC, công nợ, quyết toán). Đọc `00-QUY-TAC-CHUNG.md` trước. Đọc kỹ kế hoạch mục **4F, 4J, 4L**.
App cũ cần đọc: `tienung.*.js`, `congno.hdtp.js`, `congno.tattoan.js`, `doanhthu.core.js`, `doanhthu.forms.js`, `doanhthu.reports-export.js` (xuất ảnh phiếu), `quyettoan.core.js`, `quyettoan.congtrinh.js`.

## Làm
1. **Chi Trả TP/NCC** (đổi tên từ Ứng TP/NCC): nhập nhiều phiếu chi một lần; loại **Tạm ứng TP** / **Thanh toán đợt TP** (chọn thầu phụ + công trình / HĐ thầu phụ) / **Trả nợ NCC** (chọn NCC, **không bắt buộc công trình**, có tùy chọn “Trả cho công trình…” hoặc tích từng hóa đơn). Hiện “còn nợ” ngay khi chọn đối tác. Lịch sử phiếu chi, xuất ảnh phiếu chi (html2canvas như `exportUngToImage`).
2. **Chia tiền trả NCC** (mục 4J): mỗi lần lưu / sửa / xóa phiếu Trả nợ NCC → tính lại `payment_allocations` của NCC đó: chia vào hóa đơn mua nợ (`paid_at_purchase=false`) **cũ nhất trước** (ngày, rồi ngày tạo), trừ phiếu có chỉ định công trình / hóa đơn thì chia theo chỉ định. Phiếu cũ chuyển từ app cũ giữ nguyên cách chia theo công trình. Có test với ví dụ VLXD Phương trong mục 4J.
3. **Công Nợ Phải Trả** (đổi tên): subtab HỢP ĐỒNG THẦU PHỤ (master–detail: giá trị HĐ, đã trả, còn phải trả, mở dòng xem lịch sử + ô trả nhanh), NHÀ CUNG CẤP (theo NCC: tổng mua nợ, đã trả, còn nợ; màn **Đối chiếu** liệt kê hóa đơn mua nợ theo ngày + phần đã chia), TẤT TOÁN (thầu phụ: chờ tất toán / đã tất toán / hoàn tác lần gần nhất; NCC tự tất toán khi nợ về 0).
4. **Doanh Thu**: HỢP ĐỒNG CHÍNH (form bên trái + danh sách, hạng mục trong HĐ, copy / dán khối lượng như `copyKLCT`) và THU TIỀN (form: loại Tạm ứng / Giai đoạn / Quyết toán / Khác; tiến độ thu theo công trình; sổ thu; phiếu thu tự động từ quyết toán không sửa / xóa tay được; xuất ảnh phiếu thu).
5. **Quyết Toán**: tăng / giảm / thay thế tổng, Chốt → tự tạo phiếu thu phần còn lại (như app cũ).
6. Điện thoại: `MP.ung`, `MP.congno`, `MP.doanhthu`, `MP.quyettoan`.

## Xong khi
- Test ví dụ mục 4J cho đúng từng đồng.
- Sau khi chuyển dữ liệu, test so số GĐ3 **vẫn xanh** (không làm lệch lãi/lỗ cũ).
- Nhập 1 phiếu thu, 1 quyết toán, 1 phiếu trả NCC theo cục → Lợi Nhuận, Công Nợ đổi đúng.

## Khi xong — báo cáo và prompt tiếp theo
Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):
- ✅ **Đã xong GD07:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app.
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc “không có”).
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (nếu có, ví dụ dán key vào `.env`; không có thì ghi “không có”).
- **Prompt tiếp theo:** mở **session MỚI** (đừng dùng tiếp session này, để khỏi tốn token đọc lại lịch sử), chọn model **Sonnet 5.5**, effort **medium**, quyền **Bypass**, dán:
  ```
  Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD10-dien-thoai-pwa-online.md
  ```
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng “Prompt tiếp theo”, điều phối tự chuyển.
