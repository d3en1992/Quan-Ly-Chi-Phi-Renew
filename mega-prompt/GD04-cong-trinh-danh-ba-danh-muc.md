# GĐ4 — Công Trình, Chi tiết công trình, Danh Bạ, Danh Mục & Sao Lưu
Model: **Opus 5.5** · Effort: **medium** (màn hình CRUD theo mẫu). Đọc `00-QUY-TAC-CHUNG.md` trước.
App cũ cần đọc: `projects.model.js`, `projects.ui.js`, `khachhang.model.js`, `khachhang.ui.js`, `danhmuc.categories.js`, `danhmuc.tools.js`.

## Làm
1. **Công Trình** (giao diện mẫu `PAGES.congtrinh`): 3 phân khu **CT (xây mới) / SC (sửa chữa, cải tạo) / SN (sửa nhỏ) – Khác**, CÔNG TY cuối; nút “Theo loại / Theo khách hàng”; thẻ: Tổng đã chi (+ nợ NCC), Đã thu, Còn phải thu, Lãi/lỗ, thanh % đã thu; tạo / sửa / đóng / hoàn thành / xóa (chỉ khi không còn dữ liệu, như `canDeleteProject`); tên gợi ý ≤ 45 ký tự dạng ngoặc đơn như app cũ; chủ đầu tư bắt buộc + thêm nhanh; hệ số k; ngày bắt đầu / kết thúc; khối lượng sàn; địa chỉ công trình.
2. **Chi tiết công trình** (`PAGES.chitietct`): dải số, cấu thành A / B / C, 6 tab Tổng hợp chi phí · Hóa đơn · Nhân công · Thầu phụ · Nhà cung cấp · Thu tiền; tiến độ chỉ 1 dòng nhỏ. Số lấy từ `src/lib/calc`.
3. **Danh Bạ** (mục 4G, `PAGES.danhba`): Khách hàng / Công nhân / Nhân viên / Nhà cung cấp (địa chỉ, SĐT, Mua nợ) / Thầu phụ; che SĐT, CCCD theo quyền `see_contact_ids`. (Nút Chụp CCCD làm ở GĐ9; ở đây để nút sẵn.)
4. **Danh Mục & Sao Lưu**: loại chi phí, người mua, tên thiết bị, đơn vị tính, giai đoạn mẫu; đổi tên một chỗ → mọi nơi hiện tên mới; thông tin công ty (tên, tên ngắn, logo); sao lưu: nút “Tải bản sao lưu JSON” (toàn bộ dữ liệu công ty), danh sách bản sao lưu, khôi phục (Admin). Script `scripts/backup-nightly.ts` + mẫu GitHub Action (chưa bật, ghi hướng dẫn).

## Xong khi
- Đổi tên một công trình → Chi tiết, Lợi Nhuận, hóa đơn đều hiện tên mới (test).
- Số trên thẻ công trình = số tab Lợi Nhuận (test).

## Khi xong — báo cáo và prompt tiếp theo
Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):
- ✅ **Đã xong GD04:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app.
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc “không có”).
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (nếu có, ví dụ dán key vào `.env`; không có thì ghi “không có”).
- **Prompt tiếp theo:** mở **session MỚI** (đừng dùng tiếp session này, để khỏi tốn token đọc lại lịch sử), chọn model **Fable 5.2**, effort **high**, quyền **Bypass**, dán:
  ```
  Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD05-nhap-chi-phi.md
  ```
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng “Prompt tiếp theo”, điều phối tự chuyển.
