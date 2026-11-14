# Tìm kiếm trong app (ô tìm chung + micro + AI khi cần)

Trạng thái: **ĐÃ LÀM ở nhánh `dev`** (15/11/2026) — chưa lên online. Khác bản chốt: không có tổng tiền nhóm (công thức tiền chỉ ở `src/lib/calc/`, nhóm chỉ hiện số dòng); chưa cần chỉ mục trigram (0,12 giây với dữ liệu thật).

## 1. Một ô tìm duy nhất — nâng cấp ô có sẵn
- Ô "Tìm công trình, hóa đơn, công nhân…" trên thanh trên (máy tính / máy tính bảng, phím Ctrl+K)
  và nút 🔍 (điện thoại). Hiện chỉ tìm tên trang → nâng cấp thành tìm **dữ liệu thật**.
- Nút ✨ Trợ lý AI cũng mở **chính ô này** (đầu khung AI), các việc AI cũ (chụp hóa đơn, danh thiếp…) nằm dưới.
- Ô lọc trong từng trang giữ nguyên; bấm kết quả thì app điền sẵn vào ô lọc đó.

## 2. Cách tìm — tốn ít nhất
1. Gõ chữ (không dấu vẫn ra) hoặc 🎤 nói — nhận giọng nói của Chrome / Android, **miễn phí**; chữ hiện vào ô, sai thì sửa.
2. Tìm thường trước trên máy chủ (Postgres `pg_trgm` + `unaccent`) — **miễn phí**, ra ngay.
3. Nút **✨ Tìm bằng AI** — chỉ chạy khi bấm. AI hiểu tên ghi khác nhau (dây điện ↔ cáp 1.5, CV 2.5, Cadivi),
   chọn tên khớp từ danh sách tên rút gọn → app tìm lại. AI không tự trả lời, không tính tiền. Model rẻ nhất; đo chi phí khi xong.
4. Tôn trọng quyền (RLS): chỉ ra dữ liệu tài khoản được xem; không lộ CCCD nếu không có `see_contact_ids`.
- Không làm tab "Hỏi đáp". iPhone (ghi âm → AI): để sau.

## 3. Dữ liệu được tìm (Nhóm A)
Công trình · Danh bạ (KH, TP, NCC, CN, NV) · Cửa hàng · Khoản chi / vật tư · HĐ thầu phụ · Phiếu chi ·
Sổ chấm công · Thiết bị · HĐ chính · Phiếu thu. Cộng nhóm "Đi tới trang" (tên trang, như hiện nay) ở cuối.
- Nhóm B (quyết toán, việc tiến độ, định mức, danh mục): **chưa làm**, thêm sau nếu cần.
- Nhóm C (lợi nhuận, dashboard, tỉ trọng, cấu hình rổ, tài khoản, phân quyền, xuất, thùng rác): không tìm dữ liệu, chỉ có lối tắt tên trang.

## 4. Hiện kết quả
- Máy tính / máy tính bảng: bảng **xổ xuống dưới ô tìm** (tối đa ~70% màn hình, cuộn trong), nền sau tối nhẹ;
  phím ↑↓ chọn, Enter mở, Esc đóng. Điện thoại: **toàn màn hình**, thẻ to, nút ←.
- Chia nhóm có biểu tượng + số dòng (+ tổng tiền lấy từ `src/lib/calc/`), mỗi nhóm tối đa 3 dòng + "xem tất cả ›".
- Mỗi dòng: tên đậm, dòng nhỏ (công trình · cửa hàng · ngày), số tiền bên phải. Kết quả do AI tìm thêm gắn nhãn ✨.
- Chưa gõ gì: "Tìm gần đây" + vài lối tắt.

## 5. Bấm vào kết quả
Đóng bảng → mở đúng tab con, chọn sẵn công trình / tháng, điền ô lọc → **tô sáng** dòng đó vài giây → ✕ để bỏ lọc.
"Xem tất cả" → trang của nhóm đó với danh sách đầy đủ đã lọc.

## 6. Mạng chậm
Chờ gõ xong ~300 ms mới tìm, hủy lượt cũ · "Đang tìm…" · nhớ kết quả vừa tìm · tự thử lại 1–2 lần, lỗi có nút "Thử lại",
chữ không mất · danh sách nhẹ (công trình, danh bạ, cửa hàng, thiết bị) tìm ngay trên máy.

## 7. Thứ tự làm
1. Migration: hàm `search_all` (unaccent + trigram, theo quyền) + chỉ mục.
2. Nâng cấp ô tìm chung (bảng xổ xuống / toàn màn hình điện thoại), nút ✨ AI mở cùng ô.
3. Bấm kết quả → mở trang có lọc + tô sáng (thêm tham số lọc trên đường dẫn cho các trang Nhóm A).
4. 🎤 micro (Web Speech API, vi-VN).
5. ✨ Tìm bằng AI (Edge Function, model rẻ).
6. Test Vitest + Playwright, kiểm 3 khổ màn hình.
