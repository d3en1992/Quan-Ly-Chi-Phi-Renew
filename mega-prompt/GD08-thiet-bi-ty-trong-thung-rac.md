# GĐ8 — Theo Dõi TB, Tỉ Trọng & Định Mức, Thùng Rác
Model: **Opus 5.5** · Effort: **high** (tỉ trọng chép logic cũ; thiết bị, thùng rác đơn giản). Đọc `00-QUY-TAC-CHUNG.md` trước.
App cũ cần đọc: `legacy/thietbi.js`, `tytrong.core.js`, `tytrong.ui.js`, `thungrac.js`.

## Làm
1. **Theo Dõi TB**: Tại công trình (gom theo CT) · Kho thiết bị · Kho giàn giáo; ô tìm chung không dấu (tên TB, tên CT, thông tin máy, người TH); thêm, chuyển thiết bị giữa CT / kho, tình trạng.
2. **Tỉ Trọng & Định Mức**: 3 subtab PHÂN BỔ CÔNG TRÌNH (khối lượng sàn + hệ số, bảng giai đoạn × hạng mục có tô đậm nhạt, 6 rổ Sắt / Bê tông / Nhân công / Thầu phụ / Quỹ / Khác, đơn giá/m², khoản chưa gán, gán tay, luật tự gán, lưu làm định mức), ĐỊNH MỨC, CẤU HÌNH RỔ. **Chép nguyên logic `tytrong.core.js`** sang `src/lib/calc/cost-allocation.ts` + test so với kết quả tính bằng code cũ trên cùng snapshot. Lưu ý app cũ bỏ hóa đơn của NCC đã có tiền ứng và thay bằng tiền ứng (`nccUng`) — app mới dùng Đã TT + phần đã chia, phải ra cùng số.
3. **Thùng Rác**: subtab theo loại dữ liệu; khôi phục; xóa vĩnh viễn theo quyền `purge_trash`.
4. Điện thoại: `MP.thietbi`, `MP.tytrong`, `MP.thungrac`.

## Xong khi
- Tỉ trọng 1 công trình có dữ liệu (CT Nhà Tình): tổng theo giai đoạn / rổ khớp code cũ.
- Xóa → vào thùng rác → khôi phục → số liệu trở lại như trước (test).

## Khi xong — báo cáo và prompt tiếp theo
Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):
- ✅ **Đã xong GD08:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app.
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc “không có”).
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (nếu có, ví dụ dán key vào `.env`; không có thì ghi “không có”).
- **Prompt tiếp theo:** mở **session MỚI** (đừng dùng tiếp session này, để khỏi tốn token đọc lại lịch sử), chọn model **Opus 5.5**, effort **high**, quyền **Bypass**, dán:
  ```
  Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD09-chup-anh-xuat-excel.md
  ```
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng “Prompt tiếp theo”, điều phối tự chuyển.
