# GĐ6 — Chấm Công + Tạm Ứng Lương
Model: **Opus 5.5** · Effort: **medium** (chấm công: công thức vừa phải, nhiều màn). Đọc `00-QUY-TAC-CHUNG.md` trước.
App cũ cần đọc: `chamcong.core.js`, `chamcong.week-form.js`, `chamcong.history-reports.js`, `chamcong.ung-ledger.js`, phần chấm công trong `tienich.js` (`buildInvoices`: lương, HĐ mua lẻ).

## Làm
1. **SỔ CHẤM CÔNG**: tuần CN → T7, lùi / tiến tuần, chọn công trình; bảng: Tên CN · T/P (C / T / P) · CN..T7 (1 / ½ / 0, tô màu) · TC · Lương/ngày · TC Lương · Phụ cấp · HĐ mua lẻ · Nội dung · Trừ nợ · Thực lãnh; dòng tổng; thêm công nhân (gợi ý từ Danh Bạ); Copy tuần / Dán tuần; Phiếu lương dạng chữ để gửi Zalo (`ccPayslipText`); lưu tuần (mỗi công trình mỗi tuần 1 bản ghi).
2. **TỔNG LƯƠNG & LỊCH SỬ**: tổng lương tuần theo công nhân (mọi công trình), tick để cộng nhanh, tìm tên; lịch sử tuần, mở lại tuần; xuất CSV.
3. **TẠM ỨNG LƯƠNG** (đổi tên từ Ứng công nhân, mục 4L): sổ cái theo tháng: nợ cũ mang sang, ứng (+), trả (−), tổng nợ hiện tại; ghi tạm ứng / trả; cột Trừ nợ trong sổ chấm công tự thành dòng “trả” (như popup Tiền ứng CN tick vào Thực Lãnh của app cũ).
4. Chi phí lương đi vào A của công trình theo **ngày thứ Bảy** (đã có công thức ở GĐ3, chỉ kiểm tra lại).
5. Điện thoại: mỗi thợ một thẻ, chạm ngày đổi 1 → ½ → 0 (`MP.cc`).

## Xong khi
- 3 tuần cũ bất kỳ: tổng lương tuần = app cũ (so với `so-chuan.json` qua lợi nhuận, hoặc tính lại từ snapshot).
- Tuần vắt năm: lương vào năm của thứ Bảy (test).

## Khi xong — báo cáo và prompt tiếp theo
Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):
- ✅ **Đã xong GD06:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app.
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc “không có”).
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (nếu có, ví dụ dán key vào `.env`; không có thì ghi “không có”).
- **Prompt tiếp theo:** mở **session MỚI** (đừng dùng tiếp session này, để khỏi tốn token đọc lại lịch sử), chọn model **Fable 5.2**, effort **medium**, quyền **Bypass**, dán:
  ```
  Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD07-chi-tra-cong-no-doanh-thu.md
  ```
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng “Prompt tiếp theo”, điều phối tự chuyển.
