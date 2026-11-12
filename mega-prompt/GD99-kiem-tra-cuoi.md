# GĐ99 — Kiểm tra cuối + chỉnh giao diện laptop theo ý anh Tình + báo cáo
Model: **Sonnet 5.5** · Effort: **medium**. Đọc `00-QUY-TAC-CHUNG.md` trước, rồi `TIEN-DO.md` (mục GD12 và phần bản online).
Viết lại 12/11/2026 sau khi anh Tình dùng thử bản online. Phần A là **việc anh yêu cầu sửa** (làm trước), phần B là kiểm tra cuối.

## Bối cảnh (đọc kỹ)
- App đã có **bản online**: Supabase `qlcp-renew` (ref `xwnimykhtcobgiiodzko`) + Vercel `https://quanlychiphi-renew.vercel.app` (build từ nhánh `main` của repo `d3en1992/Quan-Ly-Chi-Phi-Renew`). Dữ liệu online = snapshot 12/11; anh đang dùng thử trên đó.
- **Mọi thử nghiệm làm trên Supabase trong máy** (`npx supabase start`, `npm run dev`). **KHÔNG** chạy `migrate-legacy` / `seed-users` / `compare-counts` với cờ `--online`, không đổ lại dữ liệu online.
- Nếu giai đoạn này **thêm migration** thì cuối giai đoạn đẩy lên online bằng `npx supabase db push --remote` (đọc mật khẩu từ `.env`, không in ra). Không thêm migration thì bỏ qua.
- **Máy của anh:** laptop 3072×1920, Windows phóng to 200% → bề ngang thật trong trình duyệt ≈ **1536 px** (cao ≈ 860 px sau khi trừ thanh trình duyệt). Đây là khổ chính phải đẹp. Vẫn phải ổn ở 1280, 1920, 820 (máy tính bảng), 390 (điện thoại).

## A. Sửa theo ý anh (làm trước, test sau mỗi phần)
1. **Menu trái hẹp lại** (`src/app/DesktopShell.tsx`, đang `236px`): còn khoảng **200px** ở máy tính (chữ menu, nhãn MỚI, logo vẫn không bị cắt / xuống dòng; chữ dài thì `truncate`). Khổ máy tính bảng (menu biểu tượng 64px) giữ nguyên.
2. **Chấm Công → tab TỔNG LƯƠNG & LỊCH SỬ** (`src/features/timesheets/PayrollTab.tsx`, đang `xl:grid-cols-2` chia đôi): bảng **Tổng lương tuần rộng hơn**, **Lịch sử chấm công hẹp lại** — ví dụ `xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]`. Ở 1536px bảng Tổng lương phải thấy trọn cột Thực lãnh không cần cuộn ngang; Lịch sử có thể rút gọn tên công trình (`truncate`, có `title` để rê chuột xem đủ).
3. **Sổ chấm công** (`WeekSheet.tsx`, `sheet-model.ts`):
   - **Ô ngày công gõ được số lẻ**: gõ `1.3`, `1,5`, `2`, `0.75`… đều nhận (dấu chấm hoặc phẩy, **không giới hạn trên** — anh chọn), số âm / chữ thì báo lỗi và không nhận. Vẫn giữ: bấm ô để đổi 1 → ½ → 0, gõ `5` = nửa công (0,5), mũi tên để đi ô. Gõ `5.5` hay `15` thì là số đó (chỉ đúng chữ `5` một mình mới là nửa công) — ghi rõ điều này trong dòng hướng dẫn dưới bảng. Ô hiện số kiểu Việt `1,3`. Kiểm tra lưu được vào kho (`timesheet_lines.day_units` là numeric — xem kiểu cột, nếu có ràng buộc giới hạn thì sửa bằng migration mới) và **TC, TC Lương, Thực lãnh, Tổng lương tuần, phiếu lương tính đúng với số lẻ** (thêm test Vitest cho `calcSheetRow` / `sheet-model` với 1,3 và 1,5; công thức tiền vẫn chỉ ở `src/lib/calc/`). Test so số với app cũ (`so-chuan`) vẫn phải lệch 0.
   - **Bỏ cột Trừ nợ khỏi sổ chấm công** (chỉ ở sổ; tab Tổng lương tuần và phiếu lương giữ nguyên cột Trừ nợ). Trả nợ ứng lương từ nay ghi ở tab TẠM ỨNG LƯƠNG như app cũ. Tuần cũ đã có dòng "Trả" sinh từ Trừ nợ: **giữ nguyên dữ liệu**, lưu lại tuần **không được xóa** các dòng "Trả" đó (sửa `save_timesheet_week` bằng migration mới nếu hàm đang đồng bộ / xóa dòng Trả theo cột Trừ nợ — đọc hàm trong migration `…000005` trước). Sửa dòng hướng dẫn dưới bảng cho khớp (bỏ câu về Trừ nợ).
   - **Ẩn mặc định 3 cột Phụ cấp, HĐ mua lẻ, Nội dung**, có nút bật / tắt (ví dụ nút nhỏ "Hiện phụ cấp, HĐ lẻ, nội dung" trên thanh công cụ của sổ). Nhớ lựa chọn trong máy (localStorage, bọc try/catch). Khi bật: cột **Nội dung rộng hơn hiện nay** (khoảng 220–260px, chữ dài thì hiện `title`). Dòng nào đang có phụ cấp / HĐ lẻ / nội dung mà cột bị ẩn thì vẫn tính vào Thực lãnh như cũ, và hiện 1 dấu nhỏ (chấm / biểu tượng) ở cột Thực lãnh hoặc tên CN để biết dòng đó có khoản ẩn.
   - Ở 1536px khi 3 cột đang ẩn: sổ chấm công phải thấy hết từ Tên CN tới Thực lãnh **không cuộn ngang**.
   - Điện thoại (MP.cc) theo cùng quy tắc (ô ngày nhận số lẻ; 3 khoản phụ ẩn sau nút "Thêm…").
4. **Rà giao diện ở 1536×860 cho mọi tab** (đăng nhập Admin, chọn "Tất cả" năm): tìm chỗ chật / chữ bị cắt / bảng phải cuộn ngang không cần thiết / khoảng trắng phí / 2 cột chia đôi không hợp lý (như mục 2). Sửa những chỗ rõ ràng (≤ 15 phút mỗi chỗ, chỉ đổi bố cục / độ rộng cột / ẩn hiện, **không đổi nghiệp vụ, không đổi công thức**). Chỗ cần quyết định lớn thì **không tự sửa**, ghi vào báo cáo mục "Đề xuất chỉnh giao diện" kèm tên ảnh chụp. Được mở xem ảnh chụp của khổ 1536 để rà (đây là việc chính của phần này), các khổ khác chỉ chụp lưu, không mở.
5. Viết test Playwright `e2e/gd99-giao-dien-laptop.spec.ts`: 1536×860 — menu trái ≈ 200px; sổ chấm công không cuộn ngang khi 3 cột ẩn, bật nút thì 3 cột hiện; gõ `1.3` vào ô ngày → TC đúng → Lưu tuần → mở lại vẫn 1,3; không có cột Trừ nợ trong sổ; bảng Tổng lương tuần rộng hơn bảng Lịch sử. Dọn dữ liệu test sau khi chạy (tên bắt đầu `E2E GD99`).

## B. Kiểm tra cuối
1. `npm run typecheck`, `npm test`, `npm run build`. Ghi kết quả (tóm tắt, không dán log dài).
2. Test so số GĐ3 với `du-lieu/so-chuan.json` vẫn **lệch 0**.
3. Playwright cả bộ (`--reporter=line`). Thêm: đăng nhập từng vai trò (Admin, Giám đốc, Quản lý, Kế toán, Chỉ xem), mở mọi tab ở **1536** / 1440 / 820 / 390px, lưu ảnh `anh-chup/CUOI/`, ghi lỗi console, kiểm tra không kéo ngang cả trang.
4. Viết `ban-moi/BAO-CAO-SANG.md`: link bản online (Vercel) + cách chạy thử trên máy, tài khoản thử (trỏ tới `du-lieu/tai-khoan-tam.txt` và `du-lieu/tai-khoan-online.txt`, **không** chép mật khẩu), bảng GĐ xong / dở, kết quả so số, những gì đã chỉnh theo ý anh ở phần A, "Đề xuất chỉnh giao diện" (mục A4), quyết định AI tự chọn, việc anh cần làm (vd đổ dữ liệu mới trước khi chuyển hẳn, key Gemini, sao lưu online hằng đêm), checklist 10 dòng để anh bấm thử trên bản online.
5. Đánh dấu [x] các GĐ đã xong ở mục 8 `KE-HOACH-REFACTOR.md`. Ghi `TRẠNG THÁI: HOÀN TẤT` (hoặc `TẠM DỪNG` nếu còn việc dở) ở đầu `TIEN-DO.md`, thêm mục GD99 (đã có gì, quyết định AI tự chọn, lỗi còn biết).

## Git và đưa lên bản online
- Commit sau mỗi phần chạy được (`GĐ99: …`), push `dev`.
- Cuối giai đoạn, khi typecheck / test / build / Playwright đều xanh: đẩy lên `main` để Vercel tự cập nhật bản online — `git push origin dev:main` (**không force push**). Nếu bị chặn quyền (CLAUDE.md cũ ghi "không đụng main"), ghi vào báo cáo để anh tự chạy lệnh đó, không tìm cách vượt.
- Có migration mới → `npx supabase db push --remote` lên `qlcp-renew` trước khi đẩy `main`.

## Khi xong — trả lời anh đúng mẫu sau (ngắn, tiếng Việt dễ hiểu)
- ✅ **Đã xong GD99:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app (nêu rõ các chỉnh sửa theo ý anh).
- 🎨 **Đề xuất chỉnh thêm:** những chỗ giao diện thấy chật / khó dùng mà chưa tự sửa (hoặc "không có").
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc "không có").
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 🌐 **Bản online:** đã đẩy `main` chưa, Vercel cập nhật chưa (anh tải lại trang là thấy).
- 👉 **Anh cần làm:** (không có thì ghi "không có").
- Đây là bước cuối. Không còn prompt tiếp theo.
