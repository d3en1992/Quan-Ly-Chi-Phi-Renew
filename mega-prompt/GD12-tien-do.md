# GĐ12 — Tiến Độ Thi Công, Phần 1 (tính năng phụ)
Model: **Opus 5.5** · Effort: **medium** (tiến độ, tính năng phụ). Đọc `00-QUY-TAC-CHUNG.md` trước. Đọc kế hoạch mục GĐ12, `../ban-dang-dung/PLAN_TIEN_DO_THI_CONG.md` (chỉ phần **nội dung tính năng** của Mega Prompt 1; **bỏ** phần kỹ thuật `tiendo_v1`, `meta_tien_do`, outbox, giới hạn 1MB), `../ban-dang-dung/PHAN_TICH_XONGVIEC.md`.

## Làm
- Bảng đã tạo ở GĐ2 (`schedule_*`). Giai đoạn **dùng chung** với giai đoạn của Tỉ Trọng.
- Tab Tiến Độ: chọn công trình, áp mẫu giai đoạn mặc định (lấy “Mẫu giai đoạn mặc định” trong plan cũ), lịch nghỉ, bảng việc + Gantt (vạch Hôm nay, việc trễ tô đỏ), chi tiết việc (% xong, người phụ trách, ghi chú, việc trước–sau), báo cáo chữ gửi Zalo.
- Chi tiết công trình chỉ hiện **1 dòng** “Tiến độ x% · trễ n việc”.
- Điện thoại: `MP.tiendo`.
- Phần 2 (phát sinh có duyệt → quyết toán, vật tư cần về, so % tiến độ với % chi) **không làm** đêm nay.

## Xong khi
- Lập tiến độ cho 1 công trình từ mẫu, sửa %, Gantt cập nhật (test).

## Khi xong — báo cáo và prompt tiếp theo
Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):
- ✅ **Đã xong GD12:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app.
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc “không có”).
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (nếu có, ví dụ dán key vào `.env`; không có thì ghi “không có”).
- **Prompt tiếp theo:** mở **session MỚI** (đừng dùng tiếp session này, để khỏi tốn token đọc lại lịch sử), chọn model **Opus 5.5**, effort **low**, quyền **Bypass**, dán:
  ```
  Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD99-kiem-tra-cuoi.md
  ```
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng “Prompt tiếp theo”, điều phối tự chuyển.
