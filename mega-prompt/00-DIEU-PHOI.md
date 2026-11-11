# PROMPT ĐIỀU PHỐI — dán nguyên khung dưới vào một session mới (thư mục `ban-moi`, model **Sonnet 5.5**, effort **medium**, quyền Bypass)

Điều phối chỉ giao việc và kiểm tra, nên dùng Sonnet cho rẻ; phần nặng do subagent làm với đúng model + effort ghi ở đầu từng file giai đoạn.
Hết quota 5 giờ thì session dừng giữa chừng. Khi quota reset, dán lại đúng prompt này (hoặc để hẹn giờ tiếp sức tự dán): nó đọc `TIEN-DO.md` và làm tiếp, không làm lại.

````
Em là người điều phối việc làm lại app quản lý chi phí công trình. Anh Tình không ngồi máy, em tự chạy tới khi xong hết (hạn chót 12:00 trưa 12/11/2026).

BƯỚC 0 — Chuẩn bị
- Đọc: mega-prompt/00-QUY-TAC-CHUNG.md, mega-prompt/TIEN-DO.md (chỉ phần đầu + bảng + mục của GĐ đang dở). KHÔNG đọc cả KE-HOACH-REFACTOR.md; subagent tự đọc.
- Ghi vào đầu TIEN-DO.md: "TRẠNG THÁI: ĐANG CHẠY" và "Nhịp tim: <giờ hiện tại>".
- Nếu TIEN-DO.md có GĐ đang "Dở" / "Đang làm": đây là lần chạy tiếp → làm tiếp GĐ đó (subagent đọc TIEN-DO để biết đã xong phần nào), không làm lại phần đã xong.

BƯỚC 1 — Chạy lần lượt các giai đoạn chưa xong, theo đúng thứ tự:
  GD04 → GD05 → GD06 → GD07 → GD10 → GD08 → GD09 → GD12 → GD99
Với mỗi giai đoạn:
  a. Ghi TIEN-DO: "Đang làm: GDxx", nhịp tim. Commit.
  b. Giao cho MỘT subagent (Agent tool, subagent_type general-purpose) với model VÀ effort ghi ở dòng "Model: … · Effort: …"
     đầu file mega-prompt/GDxx-*.md (Fable 5.2 → "fable", Opus 5.5 → "opus", Sonnet 5.5 → "sonnet"; effort đúng như ghi).
     Nếu gọi Fable báo hết quota / bị từ chối → giao lại bằng model "opus", effort "medium", ghi ⚠ vào TIEN-DO.
     Prompt cho subagent:
     "Thư mục làm việc: D:\10-CONG-VIEC\app-quan-ly-cong-trinh\code\ban-moi. Làm GIAI ĐOẠN xx.
      Đọc và làm đúng: mega-prompt/00-QUY-TAC-CHUNG.md và mega-prompt/GDxx-*.md. Không hỏi lại ai.
      Cập nhật mega-prompt/TIEN-DO.md (nhịp tim ≥ mỗi 15 phút, phần nào xong, lỗi còn biết, quyết định tự chọn).
      Commit + push nhánh dev sau MỖI phần chạy được (để nếu hết quota giữa chừng thì không mất việc).
      Cuối cùng trả lời theo mẫu ở mục "Khi xong" của file giai đoạn (bỏ dòng Prompt tiếp theo), tối đa 15 dòng."
  c. Chờ subagent xong. Tự chạy lại: npm run typecheck, npm test (gồm so số với so-chuan.json), npm run build — chỉ xem tail -20 log.
     Hỏng → SendMessage cho chính subagent đó sửa, tối đa 2 lần.
  d. Ghi TIEN-DO: GDxx = Xong / Dở (dở ở đâu), nhịp tim. Commit + push dev.
  Test so số (lệch 0 đồng) là cổng: nếu một GĐ làm lệch số thì phải sửa xong mới sang GĐ sau.

BƯỚC 2 — Khi xong hết GD04…GD12, hoặc khi đã 11:00 ngày 12/11 mà chưa xong: chạy GD99 (theo file GD99, model sonnet, effort medium):
  - typecheck + test + build xanh trên nhánh dev; Playwright từng vai trò, mọi tab ở 1440 / 820 / 390px, ảnh vào anh-chup/CUOI/.
  - Viết BAO-CAO-SANG.md (thư mục ban-moi), ngắn, tiếng Việt dễ hiểu: cách chạy thử, tài khoản thử (trỏ tới du-lieu/tai-khoan-tam.txt,
    KHÔNG chép mật khẩu), GĐ xong / dở, kết quả so số, quyết định AI tự chọn, việc anh cần làm, checklist 10 dòng để anh thử.
  - Đánh dấu [x] các GĐ đã xong ở mục 8 KE-HOACH-REFACTOR.md. Commit + push dev.
  - Ghi đầu TIEN-DO.md: "TRẠNG THÁI: HOÀN TẤT" (hoặc "TẠM DỪNG — <GĐ còn dở>" nếu chưa xong hết).

LUẬT: theo 00-QUY-TAC-CHUNG.md. Không hỏi anh. Không đụng main, không force push, không đụng ../ban-dang-dung (chỉ đọc), không đụng D:\99-BAO-MAT.
Bắt đầu từ BƯỚC 0.
````

---

## Prompt tiếp sức (hẹn giờ tự chạy sau mỗi lần quota reset — hoặc anh tự dán)

````
Thư mục: D:\10-CONG-VIEC\app-quan-ly-cong-trinh\code\ban-moi
Đọc 5 dòng đầu mega-prompt/TIEN-DO.md.
- Nếu không có dòng "TRẠNG THÁI: ĐANG CHẠY" (đã HOÀN TẤT, TẠM DỪNG hoặc đang chạy tay từng bước) → DỪNG NGAY, không làm gì.
- Nếu dòng "Nhịp tim:" cách giờ hiện tại dưới 25 phút → một session khác đang chạy → DỪNG NGAY.
- Ngược lại (session trước dừng vì hết quota hoặc lỗi): mở mega-prompt/00-DIEU-PHOI.md, làm đúng phần trong khung đầu tiên. Đây là lần tiếp sức: làm tiếp, không làm lại.
````
