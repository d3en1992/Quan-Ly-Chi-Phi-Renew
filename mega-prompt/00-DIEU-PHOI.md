# PROMPT ĐIỀU PHỐI — dán nguyên khung dưới vào một session mới (thư mục `ban-moi`, model **Opus 5.5**, effort **low**, quyền Bypass)

Điều phối chỉ giao việc và kiểm tra nên để effort **low** cho rẻ; phần nặng do subagent làm với đúng model + effort của từng giai đoạn.

````
Em là người điều phối việc làm lại app quản lý chi phí công trình. Anh Tình không ngồi máy, em tự chạy tới khi xong hoặc tới 06:00 sáng.

BƯỚC 0 — Chuẩn bị
- Đọc: mega-prompt/00-QUY-TAC-CHUNG.md, mega-prompt/TIEN-DO.md, KE-HOACH-REFACTOR.md (mục 0, 2, 4–4L, 5).
- Ghi vào đầu TIEN-DO.md: "TRẠNG THÁI: ĐANG CHẠY" và "Nhịp tim: <giờ hiện tại>".
- Nếu TIEN-DO.md cho thấy đây là lần chạy tiếp sức: làm tiếp giai đoạn đang dở, không làm lại phần đã xong.

BƯỚC 1 — Chạy lần lượt các giai đoạn chưa xong, theo đúng thứ tự:
  GD01 → GD02 → GD03 → GD04 → GD05 → GD06 → GD07 → GD10 → GD08 → GD09 → GD12 → GD99
Với mỗi giai đoạn:
  a. Ghi TIEN-DO: "Đang làm: GDxx", nhịp tim.
  b. Giao cho MỘT subagent (Agent tool, subagent_type general-purpose) với model VÀ effort ghi ở dòng "Model: … · Effort: …"
     đầu file mega-prompt/GDxx-*.md (Fable 5.2 → model "fable", Opus 5.5 → model "opus"; effort low / medium / high đúng như ghi). Prompt cho subagent:
     "Thư mục làm việc: D:\10-CONG-VIEC\app-quan-ly-cong-trinh\code\ban-moi. Làm GIAI ĐOẠN xx.
      Đọc và làm đúng: mega-prompt/00-QUY-TAC-CHUNG.md và mega-prompt/GDxx-*.md. Không hỏi lại ai.
      Cập nhật mega-prompt/TIEN-DO.md (nhịp tim ≥ mỗi 15 phút, kết quả, lỗi còn biết, quyết định tự chọn).
      Commit + push nhánh dev khi xong từng phần. Cuối cùng trả lời theo mẫu ở mục "Khi xong" của file giai đoạn (bỏ dòng Prompt tiếp theo)."
  c. Chờ subagent xong. Tự chạy lại kiểm tra: npm run typecheck, npm test, npm run build (và test so số nếu đã có GĐ3).
     Hỏng → giao lại cho subagent đó (SendMessage) sửa, tối đa 2 lần.
  d. Ghi TIEN-DO: GDxx = Xong / Dở (dở ở đâu). Commit + push dev.
  GĐ2 và GĐ3 là cổng: chưa xong thì không sang GĐ4 (trừ khi đã thử 2 lần mà vẫn kẹt → ghi ⚠ rõ nguyên nhân rồi mới đi tiếp).

BƯỚC 2 — Từ 05:00 (hoặc khi xong hết), chuyển ngay sang GD99 (kiểm tra cuối, model opus, effort low), nội dung như sau:
  - typecheck + test + build xanh trên nhánh dev.
  - Playwright: đăng nhập từng vai trò, mở mọi tab ở 1440 / 820 / 390px, chụp ảnh vào anh-chup/CUOI/, ghi lỗi console.
  - Viết BAO-CAO-SANG.md (ở thư mục ban-moi), ngắn, tiếng Việt dễ hiểu: link xem trước (nếu có), cách chạy thử trên máy,
    tài khoản thử (trỏ tới du-lieu/tai-khoan-tam.txt, KHÔNG chép mật khẩu vào báo cáo), giai đoạn xong / dở,
    kết quả so số với app cũ, quyết định AI tự chọn, việc anh cần làm, checklist 10 dòng để anh thử.
  - Đánh dấu [x] các GĐ đã xong ở mục 8 KE-HOACH-REFACTOR.md. Commit + push dev.
  - Xong hết: ghi "TRẠNG THÁI: HOÀN TẤT" ở đầu TIEN-DO.md. Chưa xong hết mà đã quá 05:45: ghi "TRẠNG THÁI: TẠM DỪNG — chạy lại prompt này để làm tiếp".

LUẬT: theo 00-QUY-TAC-CHUNG.md. Không hỏi anh. Không đụng main, không force push, không đụng ../ban-dang-dung (chỉ đọc), không đụng D:\99-BAO-MAT.
Bắt đầu từ BƯỚC 0.
````

---

## Prompt tiếp sức (hẹn giờ tự chạy mỗi giờ — AI cài sẵn, anh không cần dán)

````
Thư mục: D:\10-CONG-VIEC\app-quan-ly-cong-trinh\code\ban-moi
Đọc mega-prompt/TIEN-DO.md.
- Nếu không có dòng "TRẠNG THÁI: ĐANG CHẠY" (chưa bắt đầu, HOÀN TẤT hoặc TẠM DỪNG) → DỪNG NGAY, không làm gì.
- Nếu dòng "Nhịp tim:" cách giờ hiện tại dưới 25 phút → một session khác đang chạy → DỪNG NGAY.
- Ngược lại (session chính đã dừng vì hết quota hoặc lỗi): mở mega-prompt/00-DIEU-PHOI.md, làm đúng phần trong khung đầu tiên. Đây là lần tiếp sức: làm tiếp, không làm lại.
````
