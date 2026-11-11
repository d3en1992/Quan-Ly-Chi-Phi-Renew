# QUY TẮC CHUNG — mọi giai đoạn đều phải theo

Thư mục dự án: `D:\10-CONG-VIEC\app-quan-ly-cong-trinh\code\ban-moi` (gọi tắt là `ban-moi`).

## Đọc trước mỗi giai đoạn
1. `ban-moi/KE-HOACH-REFACTOR.md` — **mục 0 (bối cảnh nghiệp vụ)**, mục 2 (quy tắc vàng), mục 3–4L (thiết kế), và mục GĐ của giai đoạn đang làm.
2. `ban-moi/CLAUDE.md` và `ban-moi/TU-DIEN.md` (có từ GĐ1).
3. `ban-moi/thiet-ke/giao-dien-mau.html` — **bản vẽ chuẩn** (bố cục, chữ, màu, vị trí nút). Tra `mega-prompt/BAN-DO-GIAO-DIEN.md` để biết `PAGES.<tab>` / `MP.<màn>` nằm ở dòng nào rồi **chỉ đọc đoạn đó**.
4. App cũ để chép nghiệp vụ: tra `mega-prompt/BAN-DO-APP-CU.md` (mọi hàm → file:dòng), rồi **chỉ đọc đúng hàm cần** (Read với offset/limit). **Chép công thức, đừng đoán.** Dữ liệu cũ: `mega-prompt/DU-LIEU-CU.md` (mọi bảng, trường, kiểu, ví dụ).
5. `ban-moi/mega-prompt/TIEN-DO.md` — giai đoạn nào xong, đang dở ở đâu.

## Tiết kiệm token (bắt buộc)
- **Không đọc cả file lớn**: `KE-HOACH-REFACTOR.md` chỉ đọc mục 0, 2 và các mục giai đoạn này nhắc tới; `AI_CONTEXT.md` (1.700+ dòng) **không đọc**, dùng `BAN-DO-APP-CU.md` thay; file JS cũ > 300 dòng chỉ đọc theo hàm; snapshot JSON 2,5MB **không mở bằng Read** (script đọc bằng code; xem cấu trúc ở `DU-LIEU-CU.md`).
- **Không đọc lại file vừa sửa** để kiểm tra; trình sửa đã báo lỗi nếu hỏng.
- **Log dài**: chuyển ra file rồi xem `tail -40`; chạy test với reporter gọn (`vitest run --reporter=dot`), Playwright `--reporter=line`.
- **Ảnh chụp Playwright**: lưu file cho anh xem; **không mở ảnh để tự xem** trừ khi cần sửa một lỗi giao diện cụ thể (ảnh rất tốn token).
- Tìm bằng Grep / Glob trước khi đọc. Không liệt kê `node_modules`.
- Mỗi giai đoạn chạy trong **session mới** (lịch sử ngắn = rẻ). Hết giai đoạn thì dừng, không tự làm sang giai đoạn sau (trừ khi đang chạy bằng prompt điều phối).
- Effort đã hạ một nấc để tiết kiệm quota → bù bằng kiểm tra: **chép đúng hàm app cũ** (tra BAN-DO-APP-CU), chạy `npm test` (gồm test so số với `so-chuan.json`) sau **mỗi** phần có đụng tiền, đừng đợi cuối giai đoạn.
- Không dùng subagent trong một giai đoạn, trừ khi việc thật sự tách rời và lớn (subagent khởi động lại từ đầu, tốn hơn).

## Luật tuyệt đối
- **Không hỏi anh Tình** khi đang chạy tự động. Gặp chỗ phải quyết: chọn phương án **giống app cũ nhất / an toàn nhất**, ghi vào `TIEN-DO.md` mục “Quyết định AI tự chọn”.
- **Cấm** đọc / liệt kê / tìm trong `D:\99-BAO-MAT\`. **Cấm** sửa bất cứ gì trong `../ban-dang-dung` và `../../du-lieu-goc` (chỉ đọc).
- Không in key trong `.env` ra màn hình, log hay commit. `.env` không bao giờ được commit.
- Git: chỉ làm trên nhánh **`dev`**. Không đụng `main`. **Không force push. Không xóa nhánh.** Commit sau mỗi phần chạy được, message tiếng Việt `GĐx: …`. Push `dev` lên `origin` nếu push được; không được thì ghi lại, làm tiếp.
- Supabase: làm trên **Supabase chạy trong Docker trên máy** (`npx supabase start`). Chỉ đụng Supabase online (`qlcp-thu`) khi `.env` có key **và** giai đoạn yêu cầu. Không bao giờ đụng project `qlcp` (bản thật).
- **Công thức tiền chỉ ở `src/lib/calc/`**, mỗi công thức có test Vitest. Lãi/lỗ = **đúng công thức app cũ** (KẾ HOẠCH mục 4F điểm 6, 4J, 4K).
- Tên trong code tiếng Anh theo `TU-DIEN.md` (mục 4B); giao diện, thông báo, comment nghiệp vụ tiếng Việt có dấu.
- Mỗi màn: có trạng thái đang tải / trống / lỗi; xóa = xóa mềm + hỏi xác nhận; chạy được ở 3 khổ: máy tính (≥1024), máy tính bảng / Z Fold mở (640–1023), điện thoại (<640), **không kéo ngang cả trang**.
- Quyền: mọi bảng có RLS; mọi màn ẩn / chỉ xem theo `has_permission(module, level)` (mục 4C).

## “Xong” của một giai đoạn
1. `npm run typecheck` (tsc) không lỗi, `npm test` (Vitest) xanh, `npm run build` được.
2. Test giao diện Playwright cho các màn của giai đoạn: mở được ở 1440px và 390px, không lỗi console, chụp ảnh lưu `ban-moi/anh-chup/GDxx/`.
3. Cập nhật `TIEN-DO.md`: đánh dấu xong, ghi lỗi còn biết, việc anh cần làm.
4. Commit + push nhánh `dev`.

## Khi gặp sự cố
- Lệnh lỗi: đọc lỗi, sửa, thử lại tối đa 3 lần. Vẫn hỏng → ghi `TIEN-DO.md`, bỏ qua bước đó, làm tiếp phần khác của giai đoạn.
- Một giai đoạn quá 2,5 giờ → commit phần chạy được, đánh dấu “Dở”, chuyển giai đoạn sau (trừ GĐ2, GĐ3 là cổng bắt buộc).
- Context dài: tóm tắt trạng thái vào `TIEN-DO.md` trước, rồi làm tiếp.
- **Nhịp tim:** cập nhật dòng `Nhịp tim:` trong `TIEN-DO.md` ít nhất mỗi 15 phút.
