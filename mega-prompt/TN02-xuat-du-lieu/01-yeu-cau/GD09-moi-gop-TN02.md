# GĐ9 — Nút Chụp đa năng (hóa đơn, CCCD, hợp đồng) + TAB XUẤT DỮ LIỆU (TN02)

Model: **Sonnet 5.5** · Effort: **high** (chụp ảnh + Gemini + xuất Excel nhiều khối). Đọc `00-QUY-TAC-CHUNG.md` trước. Đọc kế hoạch mục **4D, 4G**.
Đặc tả chi tiết phần xuất dữ liệu: **`../ban-moi-tinh-nang-moi/TN02-xuat-du-lieu.md`** (đọc mục 0–9).

---

## PHẦN A — Chụp đa năng (việc chính của GD09)

### A1. Edge Function `scan-document`

Supabase Edge Function: nhận ảnh (đã thu nhỏ ≤ 1600px) + ghi chú + loại (`auto` / `invoice` / `id_card` / `contract`); gửi Gemini (model đa phương thức mới nhất có gói miễn phí) với **JSON schema** đầu ra; kèm danh sách loại chi phí, NCC, công trình, công nhân hiện có để AI khớp tên. Trả về loại giấy tờ + dữ liệu + **độ chắc chắn từng ô**.

- Key Gemini lấy từ Supabase secret `GEMINI_API_KEY` (hóa đơn) và `GEMINI_API_KEY_PAID` (CCCD; không có thì dùng key thường, ghi cảnh báo trong TIEN-DO). **Không bao giờ để key ở trình duyệt.**
- Chưa có key → chế độ **giả lập** đọc từ `supabase/functions/scan-document/fixtures/*.json` để làm và test giao diện.

### A2. Hóa đơn

Ảnh lưu Supabase Storage (bucket riêng theo công ty, RLS) → form Hóa đơn chi tiết điền sẵn: ô không chắc tô vàng, tự so tổng dòng với tổng in trên hóa đơn, NCC khớp danh mục gắn sẵn; NCC mới → ô "Thêm nhà cung cấp mới" tích sẵn với Tên / Địa chỉ / SĐT; NCC có rồi mà thiếu địa chỉ / SĐT → hỏi bổ sung; nhãn "khác khu vực"; Đã TT; `source = scan`, gắn ảnh. **Không tự lưu.**

### A3. CCCD

Đọc họ tên, số CCCD, ngày sinh, giới tính, quê quán, nơi thường trú, ngày cấp → tìm người trùng tên trong Danh Bạ (công nhân / khách hàng / nhân viên) → gắn hoặc tạo mới. **Chỉ lưu chữ, xóa ảnh ngay** (không đưa lên Storage).

### A4. Hợp đồng

Đọc chủ đầu tư, địa chỉ, SĐT, giá trị → gợi ý Khách hàng + Hợp đồng chính, anh duyệt rồi mới lưu.

### A5. Ghi chú bằng giọng nói

Nút mic dùng Web Speech API (`vi-VN`); không hỗ trợ thì ẩn nút.

### A6. Giao diện

Máy tính subtab CHỤP HÓA ĐƠN (tab Nhập Chi Phí) + nút Chụp CCCD ở Danh Bạ; điện thoại nút nổi "Chụp" → `MP.chupmenu`, `MP.chup`, `MP.cccd`.

---

## PHẦN B — TAB "XUẤT DỮ LIỆU" (TN02)

Làm **sau khi xong Phần A**, trong cùng session. Đọc đặc tả đầy đủ ở `../ban-moi-tinh-nang-moi/TN02-xuat-du-lieu.md`:

- **Mục 1** — bố cục màn 3 cột (bộ lọc · chọn dữ liệu · kiểu file)
- **Mục 2** — cách khai báo registry (thêm loại = thêm 1 object)
- **Mục 3** — danh mục 29 loại dữ liệu
- **Mục 4** — **HAI CHỖ DỄ SAI**: 3 nhóm lọc công trình (direct / via / related) và lọc thời gian
- **Mục 5** — 3 kiểu gom sheet + trình bày khối
- **Mục 6** — dữ liệu cá nhân (chỉ người có quyền, 403 nếu không)
- **Mục 7** — giới hạn 50.000 dòng
- **Mục 8** — file/hàm cần tạo
- **Mục 9** — 11 mục kiểm tra bắt buộc

File mẫu để đối chiếu trình bày: `../ban-moi-tinh-nang-moi/MAU_TN02_2CongTrinh_TatCaNam.xlsx`

### B0. Việc phải làm trước khi code Phần B

```bash
npm install exceljs
```

ExcelJS (không phải SheetJS) vì SheetJS bản miễn phí **không** tô nền, **không** kẻ viền, **không** merge ô.

Nếu `npm install` lỗi vì ổ D read-only → ghi vào TIEN-DO mục "Việc anh cần làm", **bỏ qua Phần B**, làm xong Phần A vẫn tính là xong GD09.

### B1. Thứ tự làm trong Phần B

1. `src/features/export/registry.ts` — khai báo 29 loại (chưa cần giao diện)
2. `src/features/export/fetchDataset.ts` — xử lý 3 nhóm lọc (mục 4 của đặc tả). **Test bằng Vitest trước khi làm giao diện.**
3. `src/lib/export/excel-khoi.ts` — vẽ 1 khối Excel, kiểm bằng 1 script nhỏ xuất 1 khối ra file, mở xem
4. `src/features/export/buildWorkbook.ts` — 3 kiểu gom
5. `src/features/export/ExportPage.tsx` — màn 3 cột
6. Nút "Xuất dữ liệu" ở các màn (mục 1.5) + **gỡ 9 nút CSV cũ**

### B2. Bỏ hẳn, không làm

- **Xuất Excel 12 sheet** kiểu `nhapxuat.export.js` cũ — TN02 thay thế hoàn toàn
- **9 nút CSV** rải khắp app (`exportAllCSV`, `exportEntryCSV`, `exportCCTLTCSV`, `exportCCWeekCSV`, `exportCCHistCSV`, `exportUngEntryCSV`, `exportUngTpCSV`, `exportUngNccCSV`, `tbExportCSV`) — gỡ, thay bằng nút nhanh "Xuất dữ liệu"

### B3. Đã có sẵn, KHÔNG làm lại

| Việc | Đã có ở |
|---|---|
| Ảnh phiếu chi / phiếu thu / HĐ thầu phụ | GD07 — `src/lib/voucher.ts` (`exportVoucherImage`) |
| Phiếu lương gửi Zalo **dạng chữ** | GD06 — `calc/payroll.ts` (`payslipText`) |
| Gộp chấm công theo công nhân | GD06 — `calc/payroll.ts` |

**Không** làm ảnh phiếu ứng công nhân (đã bỏ theo yêu cầu anh Tình 12/11).

---

## Xong khi

**Phần A:**
- Chế độ giả lập: 3 fixture (hóa đơn có NCC mới, hóa đơn chữ mờ, CCCD) chạy hết luồng tới bước Lưu (test Playwright)
- Có key: thử 1 ảnh mẫu trong `fixtures/` (không dùng ảnh thật của anh khi chạy tự động)

**Phần B (nếu cài được ExcelJS):**
- Chạy đủ **11 mục kiểm tra** ở mục 9 của `02-dac-ta/TN02-dac-ta.md`
- Đặc biệt 3 mục dễ sai:
  - (2) Dòng vật tư của CT Cô Sáu **không lẫn** CT Nhà Tình
  - (3) Công nhân "lọc theo CT" của Cô Sáu + Nhà Tình ra **ít hơn 52** (không phải cả danh bạ)
  - (6) Tổng "Thực lãnh" kiểu chi tiết = kiểu gộp (lệch **0**)

**Dữ liệu test — snapshot 12/11/2026:**
`ban-moi/du-lieu/cpct_snapshot_2026-11-12_08-19.json` (3,47 MB). **Không dùng bản 03/11.**
- Còn sống: **1.189 hóa đơn** · **37 công trình** · **350 tuần chấm công** · **2.077 dòng công nhân** · **30 HĐ thầu phụ** · **83 phiếu thu** · **314 phiếu chi** · **119 thiết bị** · **30 khách hàng**
- Test cố định: **CT Cô Sáu** = 210 hóa đơn / 34 tuần · **CT Nhà Tình** = 201 hóa đơn / 29 tuần → chọn cả 2 phải ra **411 hóa đơn**
- Hóa đơn trải **01/01/2025 → 11/11/2026**; 6 lô nhập 2024–2025 đã `removed/purged` → **không còn nháp**

**Thứ tự nhóm trong cột 2 (quan trọng — đừng làm theo thứ tự cũ):**
`Chi phí → Chấm công → Tiền & hợp đồng → Khác`, rồi **gấp lại** `Danh mục & danh bạ` và `Mẫu giai đoạn`. Chi tiết ở mục **1.6** của đặc tả.

**Giao diện tham khảo:** `05-giao-dien/tab-xuat-du-lieu.html` — mở bằng trình duyệt là thấy đúng bố cục, số liệu, thứ tự nhóm. Ảnh: `05-giao-dien/v2-01-3cot.png`.

**Chung:** typecheck / test / build xanh; Playwright 390/820/1440; commit `GĐ9: …` và `TN02: …` trên nhánh `dev`.

---

## Khi xong — báo cáo và prompt tiếp theo

Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):

- ✅ **Đã xong GD09:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app (tách rõ Phần A / Phần B).
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc "không có"). Ghi rõ nếu Phần B bị bỏ vì thiếu ExcelJS.
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (ví dụ dán `GEMINI_API_KEY` vào Supabase secret; `npm install exceljs` nếu lỗi; không có thì ghi "không có").
- **Prompt tiếp theo:** mở **session MỚI** (đừng dùng tiếp session này), chọn model **Opus 5.5**, effort **medium**, quyền **Bypass**, dán:
  ```
  Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD12-tien-do.md
  ```
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng "Prompt tiếp theo", điều phối tự chuyển.
