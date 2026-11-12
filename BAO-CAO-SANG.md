# Báo cáo sáng — app quản lý chi phí công trình (bản mới)

Cập nhật: 12/11/2026, sau GĐ99 (kiểm tra cuối + chỉnh giao diện laptop theo ý anh Tình).

## 1. Bản online và chạy thử trên máy
- **Bản online:** https://quanlychiphi-renew.vercel.app (Vercel build từ nhánh `main` của repo `d3en1992/Quan-Ly-Chi-Phi-Renew`, Supabase `qlcp-renew`). Dữ liệu online = snapshot 12/11.
- ⚠️ **Phần chỉnh của GĐ99 CHƯA lên bản online**: AI không được cấp quyền chạy `npx supabase db push --remote`, nên chưa đẩy `main` (xem mục 7, anh chạy 2 lệnh là xong).
- **Chạy trên máy:** mở Docker Desktop → trong `ban-moi` chạy `npx supabase start` → `npm run dev` → mở http://localhost:5173.
- **Tài khoản thử:** trên máy xem `du-lieu/tai-khoan-tam.txt`; bản online xem `du-lieu/tai-khoan-online.txt` (báo cáo này không chép mật khẩu).

## 2. Giai đoạn
| GĐ | Nội dung | Trạng thái |
|---|---|---|
| GD01 | Khung app, đăng nhập, quyền, 3 khổ | Xong |
| GD02 | Kho dữ liệu + chuyển dữ liệu cũ | Xong |
| GD03 | Công thức + báo cáo khớp số | Xong (lệch 0) |
| GD04 | Công Trình, Chi tiết CT, Danh Bạ, Danh Mục & Sao Lưu | Xong |
| GD05 | Nhập Chi Phí | Xong |
| GD06 | Chấm Công + Tạm ứng lương | Xong |
| GD07 | Chi Trả, Công Nợ, Doanh Thu, Quyết Toán | Xong |
| GD08 | Thiết bị, Tỉ trọng, Thùng rác | Xong |
| GD09 | Chụp đa năng + Xuất Dữ Liệu | Xong (chụp chạy giả lập — chưa có key Gemini) |
| GD10 | Điện thoại, máy tính bảng, PWA | Xong |
| GD12 | Tiến Độ | Xong phần 1 (phần 2 chưa làm) |
| GD99 | Kiểm tra cuối + chỉnh giao diện laptop | Xong trên máy; **chưa lên online** (chờ anh chạy lệnh ở mục 7) |
| GD11 | Chuyển hẳn | Chưa — cần anh xuất dữ liệu mới rồi đổ lại |

## 3. Kết quả kiểm tra (GĐ99)
- `npm run typecheck`: không lỗi · `npm run build`: được · `npm test`: **203 test xanh** (1 test chờ bỏ qua là bình thường).
- **So số với app cũ (`so-chuan.json`) vẫn lệch 0**: lợi nhuận 36 công trình × 4 mốc, chấm công 124 tuần × mọi người, tỉ trọng từng khoản.
- **Playwright cả bộ: 117 test** — 115 xanh lần đầu; 2 test GĐ1 quá giờ lúc đăng nhập (dev server còn đang biên dịch lần đầu), chạy lại riêng GĐ1: 14/14 xanh.
- Kiểm tra cuối (`e2e/gd99-cuoi.spec.ts`): 5 vai trò (Admin, Giám đốc, Quản lý, Kế toán, Chỉ xem) × 4 khổ (1536 / 1440 / 820 / 390) × mọi tab → **không lỗi console, không màn nào kéo ngang cả trang**. Ảnh: `anh-chup/CUOI/<vai-tro>/<kho>-<tab>.png` (chỉ trên máy, không đưa lên GitHub vì có dữ liệu thật).
- Test giao diện laptop (`e2e/gd99-giao-dien-laptop.spec.ts`), ảnh `anh-chup/GD99/`.

## 4. Đã chỉnh theo ý anh (phần A)
1. **Menu trái hẹp còn 200px** (trước 236px); chữ dài tự cắt "…", nhãn MỚI và logo không bị cắt. Máy tính bảng giữ menu biểu tượng 64px.
2. **Chấm Công → Tổng lương & Lịch sử:** bảng Tổng lương tuần rộng hơn (tỉ lệ 1,5 : 1), Lịch sử hẹp lại, tên công trình dài tự cắt (rê chuột xem đủ). Ở 1536px cả 2 bảng thấy trọn, không cuộn ngang.
3. **Sổ chấm công:**
   - Ô ngày **gõ được số lẻ**: `1.3`, `1,5`, `2`, `0.75`… rồi Enter / mũi tên / bấm ra ngoài; không giới hạn trên. Đúng chữ `5` một mình = nửa công; `5.5`, `15` là đúng số đó. Số âm / chữ → báo lỗi, không nhận. Ô hiện kiểu Việt `1,3`. Bấm ô vẫn đổi 1 → ½ → 0.
   - TC, TC Lương, Thực lãnh, Tổng lương tuần, phiếu lương tính đúng với số lẻ (làm tròn 2 số lẻ; 2,05 công × 400.000 = 820.000 đúng từng đồng).
   - **Bỏ cột Trừ nợ** khỏi sổ (tab Tổng lương và phiếu lương vẫn có). Trả nợ ứng lương ghi ở tab Tạm ứng lương. Tuần cũ đã có dòng "Trả": **giữ nguyên**, lưu lại tuần không xóa (đã có test).
   - **Ẩn mặc định Phụ cấp, HĐ mua lẻ, Nội dung**; nút "Hiện phụ cấp, HĐ lẻ, nội dung" trên thanh lọc, máy nhớ lựa chọn. Khi hiện, cột Nội dung rộng ~240px. Dòng có khoản đang ẩn (hoặc có trừ nợ cũ) có **chấm cam** ở Thực lãnh, rê chuột xem chi tiết; tiền vẫn tính vào Thực lãnh.
   - Ở 1536px khi ẩn 3 cột: thấy hết từ Tên CN tới Thực lãnh, không cuộn ngang.
   - Điện thoại: bấm biểu tượng chỉnh của thẻ thợ → 7 ô gõ số công (bàn phím số, nhận số lẻ); Phụ cấp / HĐ lẻ / Nội dung nằm sau nút "Thêm…".
4. **Rà 1536px mọi tab, đã sửa:** bảng Thống Kê CP/HĐ (trước bị cắt cột Người TH, Nguồn, Số tiền) và Quyết Toán (cắt cột Nội dung) giờ vừa khung; ô chọn công trình ở Tiến Độ rộng hơn (trước cắt "chư…"); ô tìm ở Theo Dõi TB không còn cắt chữ; Thùng Rác: nội dung dài gọn 2 dòng, "Người xóa" không xuống dòng; dòng phụ dưới tên công ty ở menu không bị cắt.

## 5. Đề xuất chỉnh giao diện (chưa tự sửa — cần anh quyết)
- **Lợi Nhuận** (`anh-chup/CUOI/admin/1536-loi-nhuan.png`): ở 1536px bảng đủ cột vẫn cuộn ngang trong khung, cột Lợi nhuận / Lãi bị che. Đề xuất: khổ < 1700px tự bật "Thu gọn cột", hoặc bỏ dòng phụ "gồm trả NCC" để hẹp cột A.
- **Tỉ Trọng & Định Mức** (`1536-ti-trong.png`): khung "Khối lượng sàn" bên trái hẹp nên công thức tầng / khu xuống 2–3 dòng. Đề xuất: cho khung trái rộng hơn hoặc đưa Khối lượng sàn xuống dưới bảng chính.
- **Nhập ngày** (Chi Trả, Tiến Độ: `1536-chi-tra.png`, `1536-tien-do.png`): ô ngày dùng ô của trình duyệt nên có máy hiện `mm/dd/yyyy`. Đề xuất: làm ô ngày riêng kiểu `dd/mm/yyyy` dùng chung cả app.
- **Doanh Thu** (`1536-doanh-thu.png`): Người TH tên dài (NGUYỄN VĂN CHẠY) xuống 2 dòng — nhỏ, có thể đổi sang tên ngắn.
- **Xuất Dữ Liệu** (`1536-xuat-du-lieu.png`): thanh "Xuất Excel" dính đáy che nhóm cuối (Tiến độ) khi màn thấp 860px — cuộn xuống vẫn thấy; nếu vướng thì cho thanh này nằm cuối trang.

## 6. Quyết định AI tự chọn (GĐ99)
- Số công làm tròn **2 số lẻ** (app cũ làm tròn 1 số lẻ vì chỉ có 1 / ½ / 0). Dữ liệu cũ (bội số 0,5) ra đúng số cũ — đã kiểm tra lệch 0.
- Tiền công = số công × lương ngày tính trên "phần trăm công" để không lệch lẻ đồng do số thực (vd 2,05 × 400.000).
- Cột `timesheet_lines.day_units` nới từ `numeric(4,2)` (tối đa 99,99) thành `numeric(8,2)` — migration `20261112000012_cham_cong_so_le.sql`.
- `save_timesheet_week` mới: **không đụng** dòng "Trả" và "trừ nợ đời cũ" của tuần; thợ bị bỏ khỏi tuần thì dòng "Trả" của họ vẫn giữ ở sổ Tạm ứng lương. Xóa cả tuần vẫn xóa mềm dòng "Trả" của tuần (khôi phục được ở Thùng rác).
- Sổ chấm công vẫn trừ "Trừ nợ" cũ của tuần vào Thực lãnh (giữ đúng số cũ), hiện chấm cam để biết; ô "Trừ nợ ứng (tuần cũ)" ở dải số chỉ hiện khi tuần có trừ nợ.
- Chưa đẩy `main` vì migration chưa lên online (lý do ở mục 7).

## 7. Việc anh cần làm
1. **Đưa GĐ99 lên bản online (bắt buộc làm theo thứ tự này):** trong `ban-moi` chạy
   - `npx supabase db push --remote` (nhập mật khẩu database của `qlcp-renew` khi được hỏi, hoặc đặt biến `SUPABASE_DB_PASSWORD`)
   - rồi `git push origin dev:main` → Vercel tự build, anh tải lại trang là thấy.
   Đừng đẩy `main` trước khi chạy migration: code mới mà hàm lưu tuần trên online còn bản cũ thì lưu lại tuần sẽ xóa các dòng "Trả" cũ.
2. **Trước khi chuyển hẳn (GĐ11):** xuất JSON sao lưu mới từ app cũ → chép thành `ban-moi/du-lieu/snapshot.json` → `npm run migrate:legacy`, `npm run so-chuan`, `npm test`; rồi đổ lại dữ liệu online (lệnh có cờ `--online`).
3. **Key Gemini** (chụp hóa đơn / CCCD thật): dán `GEMINI_API_KEY` (và nếu muốn `GEMINI_API_KEY_PAID`) vào Supabase → Edge Functions → Secrets của `qlcp-renew`.
4. **Sao lưu online hằng đêm:** bật GitHub Action theo mẫu `scripts/mau-github-action-sao-luu.yml` (hướng dẫn ở đầu file).

## 8. Checklist bấm thử trên bản online (sau khi làm mục 7.1)
1. Đăng nhập bằng tài khoản ở `du-lieu/tai-khoan-online.txt`, chọn năm "Tất cả".
2. Menu trái hẹp hơn, chữ không bị cắt mất nghĩa.
3. Chấm Công → Sổ chấm công: chọn một tuần thử, thêm thợ, gõ `1.3` vào ô T2 rồi Enter → ô hiện `1,3`, TC đúng.
4. Gõ `5` vào ô khác → hiện ½; gõ `-1` → báo lỗi, ô không đổi.
5. Bấm "Hiện phụ cấp, HĐ lẻ, nội dung" → hiện 3 cột; bấm lại → ẩn, dòng có phụ cấp có chấm cam ở Thực lãnh.
6. Lưu tuần → tải lại trang → mở lại tuần, vẫn `1,3`.
7. Mở một tuần cũ có trừ nợ → lưu lại → tab Tạm ứng lương: dòng "Trả" của tuần vẫn còn, nợ không đổi.
8. Tổng lương & Lịch sử: bảng Tổng lương rộng hơn, thấy cột Thực lãnh; phiếu lương Zalo hiện số công lẻ đúng.
9. Thống Kê CP/HĐ và Quyết Toán: bảng thấy đủ cột tới Số tiền / Nội dung, không phải kéo ngang.
10. Lợi Nhuận: số tổng giống trước khi chỉnh (GĐ99 không đổi công thức lãi / lỗ).
