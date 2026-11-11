# GĐ3 — Công thức + báo cáo khớp số app cũ ⭐⭐ (CỔNG BẮT BUỘC)
Model: **Fable 5.2** · Effort: **high** (chép công thức lãi/lỗ, phải khớp 0 đồng). Đọc `00-QUY-TAC-CHUNG.md` trước. Cần `du-lieu/so-chuan.json` (anh xuất bằng `mega-prompt/xuat-so-chuan.js`). Chưa có → viết test với so sánh bỏ qua, làm màn hình, đánh dấu “chờ so số” trong TIEN-DO, **vẫn được đi tiếp**.

## Làm
1. `src/lib/calc/` (thuần TypeScript, không gọi mạng, có test):
   - `year.ts`: lọc năm đúng mục 4K (nhiều năm, Tất cả; chấm công: liệt kê theo đầu tuần, chi phí theo thứ Bảy; công trình thuộc năm: created_year hoặc có phát sinh).
   - `overhead.ts`: phân bổ chi phí chung = `allocateCompanyCost` + `getProjectDays` (cắt theo năm, tối thiểu 1 ngày khi có giao nhau) + `getProjectK` (mặc định 1, k=0 không gánh).
   - `revenue.ts`: `calcTongDoanhThu` + `_dtCalcRevenue` (giá trị HĐ, đã thu, còn phải thu).
   - `profit.ts`: `lnTinhCongTrinh` theo bảng mục 4F điểm 6: A = hóa đơn Đã TT (gồm lương + HĐ mua lẻ từ chấm công, ngày thứ Bảy) + tiền đã chia cho hóa đơn mua nợ của công trình; B = tiền đã chi thầu phụ; C; Lợi nhuận = Đã thu − (A+B+C). Kèm `tongChiPhi` tham khảo.
   - `payables.ts`: chia phiếu chi NCC vào hóa đơn cũ nhất trước (mục 4J), công nợ NCC, công nợ thầu phụ.
   - `timesheet.ts`: tổng công, lương, thực lãnh như `calcCCRow`.
2. Lấy dữ liệu: một lớp `src/features/*/api.ts` đọc Supabase (TanStack Query). Báo cáo nặng có thể làm SQL view / RPC nhưng **phải gọi cùng công thức** (ưu tiên tính ở TypeScript trên dữ liệu đã lọc cho dễ test).
3. **Test so số** `src/lib/calc/__tests__/so-chuan.test.ts`: với mỗi năm trong `so-chuan.json` và `TAT_CA`, mỗi công trình: A, B, C, Tổng đã chi, Tổng đã thu, Lợi nhuận, Giá trị HĐ, Còn phải thu **lệch 0 đồng**.
4. Màn: **Lợi Nhuận**, **Dashboard**, **Thống Kê CP/HĐ** theo giao diện mẫu (máy tính + máy tính bảng + điện thoại).
5. Lệch số: tìm nguyên nhân (chuyển dữ liệu sai hay công thức sai), sửa. Tối đa 2 giờ. Quá 2 giờ vẫn lệch → ghi rõ công trình nào, năm nào, lệch bao nhiêu, nghi do đâu vào TIEN-DO, đánh dấu ⚠ và đi tiếp.

## Xong khi
- Test so số xanh cho mọi công trình, mọi năm (hoặc danh sách lệch đã ghi rõ).
- 3 màn chạy ở 3 khổ, đúng quyền (Quản lý: Lợi nhuận & Dashboard chỉ xem; Kế toán: ẩn).
- Sau GĐ3: **chốt bộ component dùng chung** trong `src/components/` (bảng, ô tiền chỉ nhận số + tự thêm dấu chấm, ô ngày, ô chọn công trình, ô chọn danh mục có gợi ý + “Tạo mới”, bảng trượt sửa dòng, hộp xác nhận xóa, thông báo, thanh lọc, dải số tổng, thẻ). Các giai đoạn sau chỉ dùng lại.

## Khi xong — báo cáo và prompt tiếp theo
Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):
- ✅ **Đã xong GD03:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app.
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc “không có”).
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (nếu có, ví dụ dán key vào `.env`; không có thì ghi “không có”).
- **Prompt tiếp theo:** mở **session MỚI** (đừng dùng tiếp session này, để khỏi tốn token đọc lại lịch sử), chọn model **Sonnet 5.5**, effort **medium**, quyền **Bypass**, dán:
  ```
  Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD04-cong-trinh-danh-ba-danh-muc.md
  ```
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng “Prompt tiếp theo”, điều phối tự chuyển.
