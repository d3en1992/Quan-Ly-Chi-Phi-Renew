# GĐ2 — Kho dữ liệu + script chuyển dữ liệu cũ ⭐
Model: **Fable 5.2** · Effort: **high** (chuyển dữ liệu: sai là lệch số toàn bộ app). Đọc `00-QUY-TAC-CHUNG.md` trước. Cần có `ban-moi/du-lieu/snapshot.json` (bản xuất JSON từ app cũ). Nếu chưa có thì dùng tạm `../ban-dang-dung/cpct_snapshot_2026-11-02_00-51.json` và ghi rõ trong TIEN-DO.

## Làm
1. **Migration SQL** (`supabase/migrations/`): mọi bảng mục 4 + 4C + 4F + 4G + 4J + 4K của kế hoạch, cột chung (`id uuid`, `company_id`, `created_at`, `updated_at`, `deleted_at`, `created_by`), khóa ngoại, chỉ mục theo ngày / công trình, RLS theo `has_permission`. Tạo luôn bảng cho GĐ12 Tiến Độ (`schedule_phases`, `schedule_tasks`, `schedule_templates`, `schedule_notes`) để sau khỏi sửa schema.
   - `expenses.paid_at_purchase boolean` (Đã TT), `expense_lines`, `suppliers` (address, phone, buys_on_credit), `payments` (phiếu chi TP / NCC: kind = advance / progress / supplier_payment, supplier_id hoặc subcontract_id, project_id có thể null với trả NCC theo cục), `payment_allocations` (phiếu chi NCC ↔ hóa đơn, số tiền chia — mục 4J), `wage_advances` (tạm ứng / trả của công nhân), `receipts`, `main_contracts`, `subcontracts`, `settlements`, `payable_closures`, `timesheet_weeks` (unique company + project + week_start), `timesheet_lines`, `equipment`, `cost_allocations` (jsonb như cũ), `projects.created_year` (thay `cat_ct_years`), `customers`, `workers` (thêm trường CCCD…), `employees`, `subcontractors`, `catalog_items`.
2. **`scripts/migrate-legacy.ts`** đọc snapshot → làm sạch → đổ vào Supabase (local, bằng service key local). Chạy lại bao nhiêu lần cũng được (xóa sạch dữ liệu nghiệp vụ của công ty rồi đổ lại).
   - Gắn `project_id` cho bản ghi chỉ có tên (theo `findProjectIdByName` + `aliases` của app cũ).
   - Chấm công: gộp trùng tuần + công trình như `normalizeCC`; tách `workers[]` thành `timesheet_lines`.
   - Danh mục: tên chuẩn hóa như `normalizeCatDisplayName`.
   - `hopdong_v1` (map) → `main_contracts`; `quyettoan_v1` → `settlements`; `thauphu_v1` → `subcontracts`.
   - `ung_v1`: `loai=congnhan` → `wage_advances`; `thauphu` → `payments` kind=advance gắn subcontract (khớp theo thầu phụ + công trình, không khớp thì gắn theo công trình); `nhacungcap` → `payments` kind=supplier_payment **giữ project_id cũ** và chia (`payment_allocations`) vào hóa đơn của NCC đó **ở cùng công trình**, cũ nhất trước (mục 4J, phần “dữ liệu cũ”).
   - **Đặt `paid_at_purchase`** đúng quy tắc mục 4F điểm 6: hóa đơn có NCC từng có phiếu ứng NCC ở **cùng công trình** (toàn bộ lịch sử) → false; còn lại → true. Bật `suppliers.buys_on_credit` cho 9 NCC có tiền ứng.
   - Người TH cũ: “TÌNH” → tài khoản tinh, “KS LAM” → lam, “GIÁM ĐỐC” → chay; tên khác → Người mua (catalog `person`). Hóa đơn cũ: `buyer` = `nguoi` cũ.
   - Hóa đơn sinh từ chấm công (lương, HĐ mua lẻ) **không lưu thành hóa đơn**: tính động từ `timesheet_lines` như `buildInvoices` (ngày = **thứ Bảy cuối tuần**).
   - Bỏ: `import_lots_v1`, `draft`, `draftHide`, `trash_v1`, bia mộ quá hạn.
   - Nếu có `../../du-lieu-xu-ly/khach-hang-tu-ho-so/khach-hang-de-duyet.xlsx` thì bổ sung họ tên, SĐT, địa chỉ khách hàng từ file đó.
3. **`scripts/compare-counts.ts`**: in số bản ghi cũ / mới từng loại, danh sách bị bỏ + lý do → ghi `du-lieu/bao-cao-chuyen-du-lieu.md`.
4. Sinh kiểu TypeScript từ schema (`npx supabase gen types`) vào `src/types/db.ts`.

## Xong khi
- Số bản ghi khớp `so-chuan.json → soBanGhi` (nếu có) hoặc khớp snapshot; bản ghi bị bỏ đều có lý do.
- Chạy script 2 lần liên tiếp cho cùng kết quả.
- RLS: test đăng nhập Kế toán không đọc được `receipts`, `main_contracts`, `settlements`.

## Khi xong — báo cáo và prompt tiếp theo
Cập nhật `TIEN-DO.md`, commit + push `dev`, rồi **trả lời anh đúng mẫu sau** (ngắn, tiếng Việt dễ hiểu):
- ✅ **Đã xong GD02:** 3–6 gạch đầu dòng, mỗi dòng một việc anh thấy được trên app.
- ⚠️ **Chưa xong / lỗi còn biết:** (hoặc “không có”).
- 🧪 **Kiểm tra đã chạy:** typecheck / test / build / Playwright → kết quả.
- 👉 **Anh cần làm:** (nếu có, ví dụ dán key vào `.env`; không có thì ghi “không có”).
- **Prompt tiếp theo:** mở **session MỚI** (đừng dùng tiếp session này, để khỏi tốn token đọc lại lịch sử), chọn model **Fable 5.2**, effort **high**, quyền **Bypass**, dán:
  ```
  Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD03-bao-cao-khop-so.md
  ```
- Nếu đang chạy bằng **prompt điều phối** (`00-DIEU-PHOI.md`) thì bỏ qua dòng “Prompt tiếp theo”, điều phối tự chuyển.
