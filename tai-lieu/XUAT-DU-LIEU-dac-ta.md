# TN02 — Xuất dữ liệu tùy biến (mọi bảng trong kho, nhiều công trình, nhiều kiểu)

> **Trạng thái:** ĐẶC TẢ **v2** — 12/11/2026. **Chưa code.** Làm chung session **GD09** (xem `01-yeu-cau/GD09-moi-gop-TN02.md`).
> Đọc `mega-prompt/00-QUY-TAC-CHUNG.md`, `CLAUDE.md`, `TU-DIEN.md` của `ban-moi` trước.
> **TN01 (Xuất báo cáo gửi chủ nhà) BỎ — không làm.** Giữ file cho tham khảo, không code.

## 0. Vì sao có TN02 (thay TN01)

App cũ có **9 nút CSV rải khắp app** (`exportAllCSV`, `exportEntryCSV`, `exportCCTLTCSV`, `exportCCWeekCSV`, `exportCCHistCSV`, `exportUngEntryCSV`, `exportUngTpCSV`, `exportUngNccCSV`, `tbExportCSV`) — mỗi nút chỉ xuất đúng một bảng của đúng màn đang đứng, CSV thô, không đầu trang, không tổng, số không có dấu ngăn nghìn.

TN02 gom về **một màn duy nhất**, cho người dùng tự chọn:

- **Xuất loại dữ liệu nào** — mọi bảng nghiệp vụ trong kho, không chỉ 8 loại cũ.
- **Xuất công trình nào** — 1 công trình, nhiều công trình, hoặc tất cả.
- **Lọc thời gian** — theo năm, theo tháng, theo khoảng ngày, hoặc tất cả.
- **Kiểu gom** — mỗi công trình 1 sheet / gộp 1 sheet có cột Công trình / mỗi loại 1 sheet.
- Ra **file Excel có trình bày** (đầu trang, tiêu đề nền màu, dòng tổng bằng công thức, in được).

**Nguyên tắc:** TN02 **chỉ đọc**, không ghi, không thêm bảng, không đụng app cũ.

---

## 0b. Dữ liệu thật để kiểm tra — snapshot 12/11/2026 15:19

File: `ban-moi/du-lieu/cpct_snapshot_2026-11-12_08-19.json` (3,47 MB, `meta.version = 4`).

**Dùng file này để test, KHÔNG dùng bản 03/11 nữa.** So sánh hai bản:

| Loại | 03/11 | **12/11** | Chênh |
|---|---:|---:|---:|
| Hóa đơn (`inv_v3`) | 1.187 | **1.280** | +93 |
| Khách hàng | 23 | **30** | +7 |
| Công trình | 42 | **43** | +1 |
| Tuần chấm công | 350 | **354** | +4 |
| HĐ thầu phụ | 44 | **47** | +3 |
| Phiếu thu | 86 | **89** | +3 |
| Phiếu ứng (`ung_v1`) | 326 | **358** | +32 |
| Công nhân (`cat_cn`) | 51 | **52** | +1 |

**Sau khi bỏ bản ghi đã xóa (`deletedAt`), số CÒN SỐNG:**

| Bảng | Còn sống | Ghi chú |
|---|---:|---|
| `expenses` | **1.189** | hóa đơn, từ 01/01/2025 → 11/11/2026 |
| `projects` | **37** | gồm `CÔNG TY` (chi phí chung, `is_company_overhead`) |
| `timesheet_weeks` | **350** | |
| `timesheet_lines` | **2.077** | dòng công nhân |
| `subcontracts` | **30** | |
| `receipts` | **83** | |
| `payments` | **314** | TP + NCC + công nhân |
| `equipment` | **119** | |
| `settlements` | **14** | |
| `cost_allocations` | **9** | |
| `customers` | **30** | |

**Công trình nhiều dữ liệu nhất** (dùng để làm test case cố định):

| Công trình | Hóa đơn | Tuần CC |
|---|---:|---:|
| CT Cô Sáu (42 CVT, TB) | **210** | **34** |
| CT Nhà Tình (925 Âu Cơ, TP) | **201** | **29** |
| CT A Hoàng (Hóc Môn) | 100 | — |
| CT Yến (168 TVQ, TB) | 86 | — |
| CT Cô Phụng (137 TNH, TP) | 81 | — |
| CÔNG TY (chi phí chung) | 79 | — |

**Đã thay đổi so với đặc tả v1:**
- 6 lô nhập 2024–2025 đã `removed` / `purged` → **không còn dữ liệu NHÁP**. Bộ lọc "lô nháp" không cần.
- Hóa đơn có trải từ **2025-01-01** tới **2026-11-11** → bộ lọc năm phải có đủ **2025 và 2026** (2024 rỗng).

**Test cố định (dùng đúng 2 công trình này):**
- `CT Cô Sáu` = 210 hóa đơn, 34 tuần, ~245 dòng công nhân
- `CT Nhà Tình` = 201 hóa đơn, 29 tuần
- Chọn cả 2 → hóa đơn phải = **411**; công nhân "lọc theo CT" phải **ít hơn 52** (không phải toàn bộ danh bạ)

---

## 1. Màn hình "Xuất Dữ Liệu"

### 1.1. Vị trí

Tab **Xuất Dữ Liệu** trên menu trái, dưới **Thống Kê**, trên **Danh Mục**. Icon `download`. Đường dẫn `/xuat-du-lieu`.

Không thêm quyền mới: ai đã đăng nhập mà có quyền **Xem** ở mục tương ứng thì tick được mục đó (chi tiết mục 6).

### 1.2. Bố cục — 3 cột

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ XUẤT DỮ LIỆU                                                    [Xem trước]  [Xuất Excel] │
├───────────────────────┬───────────────────────────────────────┬─────────────────────────┤
│ 1. BỘ LỌC             │ 2. CHỌN DỮ LIỆU                       │ 3. KIỂU FILE            │
│                       │                                       │                         │
│ Công trình            │ ☑ CHỌN TẤT CẢ        (32 / 32)        │ Kiểu gom                │
│ ◉ Tất cả (36)         │                                       │ ◉ Mỗi công trình 1 sheet│
│ ○ Đang chọn (2) ▾     │ DANH MỤC & DANH BẠ                    │ ○ Gộp 1 sheet           │
│   ☑ CT Cô Sáu         │  ☑ Khách hàng          23 ← CT        │ ○ Mỗi loại 1 sheet      │
│   ☑ CT A Nhựt         │  ☑ Công nhân           51 ← CT        │                         │
│   ☐ CT Nhà Tình       │  ☐ Nhà cung cấp        60             │ Ô tuỳ chọn              │
│   … (ô tìm)           │  ☐ Thầu phụ            11             │ ☑ Đầu trang công ty     │
│                       │  ☐ Nhân viên           —              │ ☑ Có dòng TỔNG CỘNG     │
│ Thời gian             │  ☐ Danh mục            6 nhóm         │ ☑ Ghi chú bộ lọc        │
│ ◉ Tất cả              │                                       │                         │
│ ○ Năm    [2025 ▾]     │ CÔNG TRÌNH                            │ Dữ liệu cá nhân 🔒      │
│ ○ Tháng  [T11/2025 ▾] │  ☑ Công trình          36             │ ☐ SĐT, CCCD, STK        │
│ ○ Khoảng [..]–[..]    │                                       │   (cần quyền)           │
│                       │ CHI PHÍ                               │                         │
│ Trạng thái            │  ☑ Hóa đơn            1.187           │                         │
│ ◉ Đang dùng           │  ☐ Dòng vật tư        2.313  ⚠        │                         │
│ ☐ Cả đã xóa mềm       │  ☐ Tỉ trọng / phân bổ  14            │                         │
│                       │                                       │                         │
│ Chấm công             │ CHẤM CÔNG                             │                         │
│ ◉ Chi tiết (tuần×CN)  │  ☑ Tuần chấm công      350            │                         │
│ ○ Gộp (mỗi CN 1 dòng) │  ☑ Dòng công nhân     2.068  ⚠       │                         │
│                       │  ☐ Tạm ứng lương       42            │                         │
│                       │                                       │                         │
│                       │ TIỀN & HỢP ĐỒNG                       │                         │
│                       │  ☑ Hợp đồng chính      18            │                         │
│                       │  ☑ HĐ thầu phụ         44            │                         │
│                       │  ☑ Phiếu thu           86            │                         │
│                       │  ☐ Phiếu chi           326            │                         │
│                       │  ☐ Chia tiền NCC       628            │                         │
│                       │  ☐ Quyết toán          19            │                         │
│                       │  ☐ Tất toán            11            │                         │
│                       │                                       │                         │
│                       │ KHÁC                                  │                         │
│                       │  ☑ Thiết bị            214            │                         │
│                       │  ☐ Việc / ghi chú tiến độ            │                         │
│                       │                                       │                         │
│                       │ ⚠ 18.642 dòng · ~2,4 MB · 12–20 giây  │                         │
└───────────────────────┴───────────────────────────────────────┴─────────────────────────┘
```

**Cột 1 — Bộ lọc** (áp cho toàn bộ lô xuất)

| Ô | Kiểu | Mặc định | Ghi chú |
|---|---|---|---|
| Công trình | Radio: Tất cả / Đang chọn / Không gán | **Đang chọn** | Chọn nhiều = tick trong danh sách có ô tìm không dấu |
| Thời gian | Radio: Tất cả / Năm / Tháng / Khoảng | **Tất cả** | Lọc theo trường ngày của từng bảng (mục 4.4) |
| Trạng thái | Radio: Đang dùng / Cả đã xóa mềm | **Đang dùng** | Bảng không có `deleted_at` thì ẩn ô này |
| Chấm công | Radio: Chi tiết / Gộp | **Chi tiết** | Chỉ ảnh hưởng 2 dòng của nhóm CHẤM CÔNG |

**Cột 2 — Chọn dữ liệu**: **sắp theo tần suất dùng** — nhóm hay xuất lên trên, nhóm ít dùng gấp lại (mục 1.6). Mỗi dòng có **số bản ghi đếm thật** theo bộ lọc hiện tại. Đổi bộ lọc thì số tự đổi (debounce 400ms).

- Dòng **0 bản ghi** → xám, không tick được, có nhãn lý do ("không có trong khoảng đã chọn").
- Dấu **⚠** ở "Dòng vật tư" / "Dòng công nhân" / "Chia tiền NCC": **bảng con**, tick một mình thì tự kéo theo bảng cha và gộp thành một khối (mục 5.4).
- Nhãn `← CT` ở Khách hàng / Công nhân / NCC / Thầu phụ: bảng **không có `project_id`**, lọc gián tiếp (mục 4.3), có nút gạt "Lọc theo công trình / Lấy tất cả".

**Cột 3 — Kiểu file + tuỳ chọn**

- Kiểu gom: 3 lựa chọn (mục 5).
- Ô **dữ liệu cá nhân**: chỉ hiện với tài khoản có `has_special('see_contact_ids')`; người không có quyền thấy dòng khoá 🔒 (mục 6).

**Thanh dưới** (dính đáy): `⚠ 18.642 dòng · ~2,4 MB · ước tính 12–20 giây` — cập nhật theo bộ lọc.

### 1.3. Nút

| Nút | Làm gì |
|---|---|
| **Xem trước** | Bảng trượt: 20 dòng đầu của khối đầu tiên + số dòng từng khối. Không tải file |
| **Xuất Excel** | Tạo file, tải về. Tên: `DuLieu_<YYYY-MM-DD_HHmm>.xlsx` |
| **Lưu bộ lọc** | Lưu tổ hợp đang chọn thành "bộ lọc thường dùng", nhớ theo tài khoản (localStorage), tối đa 10 bộ |

Nút **Xuất Excel** bị chặn khi: chưa tick dòng nào · tổng dòng = 0 · tổng dòng > 50.000.

### 1.4. Lịch sử xuất

Bảng trượt **"Đã xuất gần đây"**: ngày giờ · người xuất · bộ lọc tóm tắt · số dòng · nút "Xuất lại". Giữ **30 bản**/tài khoản trong localStorage (không lưu file, chỉ lưu bộ lọc).

### 1.5. Nút nhanh ở các màn khác

Mỗi màn có nút **"Xuất dữ liệu"** (icon download, cạnh ô tìm) → nhảy sang tab này, chọn sẵn **đúng loại dữ liệu của màn đó** + **bộ lọc đang áp trên màn**.

Màn có nút nhanh: Hóa đơn (Nhập nhanh / Thống Kê CP-HĐ) · Chấm công (Sổ / Tổng lương / Lịch sử) · Chi trả · Công Nợ Phải Trả · Doanh Thu · Thiết bị · Tỉ Trọng · Thùng rác · Danh Bạ · Danh Mục.

**Bỏ hẳn 9 nút CSV cũ.** Nếu GĐ06 đã làm 2 nút CSV cho Chấm công thì **gỡ**, thay bằng nút nhanh.

---

### 1.6. Thứ tự nhóm trong cột 2 — **sắp theo tần suất dùng** (chốt v2)

Người dùng thật xuất 4 nhóm đầu là chính. Danh bạ gần như không xuất. Vì vậy:

**Hiện thẳng, theo thứ tự này:**

| # | Nhóm | Nhãn | Loại |
|---|---|---|---|
| 1 | **Chi phí** | `hay xuất` | Hóa đơn chi phí · Dòng vật tư ⚠ · Tỉ trọng / phân bổ |
| 2 | **Chấm công** | `hay xuất` | Tuần chấm công · Dòng công nhân ⚠ · Tạm ứng lương |
| 3 | **Tiền & hợp đồng** | `hay xuất` | Phiếu thu · Phiếu chi · HĐ thầu phụ · HĐ chính · Chia tiền NCC ⚠ · Quyết toán · Tất toán |
| 4 | **Khác** | — | Thiết bị · Việc / ghi chú tiến độ (0 → xám) |

**Gấp lại bằng `<details>` (mặc định ĐÓNG):**

| Nhóm gấp | Nhãn bên phải | Loại bên trong |
|---|---|---|
| **Danh mục & danh bạ** | `ít dùng · 8 loại` | Khách hàng · Công nhân · Nhà cung cấp · Thầu phụ · Nhân viên · Danh mục · SĐT/CCCD/STK · Công trình |
| **Mẫu giai đoạn tiến độ** | `sau GĐ12` | Mẫu giai đoạn · Ghi chú tiến độ |

**Quy tắc rút gọn khi hiển thị:**
- **Bỏ dòng mô tả dài** dưới mỗi mục. Chỉ giữ **số bản ghi** bên phải — đó là thông tin quyết định duy nhất.
- Tag ngắn thay cho câu giải thích: `kèm HĐ`, `kèm tuần`, `kèm phiếu chi` (bảng con) · `lọc theo CT` (nhóm C) · `cần quyền` (dữ liệu cá nhân) · `sau GĐ12` (chưa có dữ liệu).
- Nhóm đã gấp mà **có mục được tick** → tên nhóm in đậm + hiện `(2 chọn)` để không ai quên đang xuất gì.
- Ô **"Chọn tất cả"** ở trên cùng: hiện `X/Y loại · N dòng`. Tick ô này thì mở hết các nhóm gấp ra để người dùng thấy mình vừa chọn gì.

**Vì sao không giữ 5 nhóm đều nhau như v1:** màn hình v1 dài 2.300px, phải cuộn để thấy hết. v2 còn ~1.900px và mọi thứ dùng thường ngày nằm trong 1 màn hình 1440×900 không cần cuộn.

---

## 2. Đăng ký loại dữ liệu — nguyên tắc thiết kế

Toàn bộ danh mục khai báo trong **một file**: `src/features/export/registry.ts`.

```ts
export type ProjectLink =
  | { kind: 'direct'; field: string }                       // bảng có cột project_id
  | { kind: 'via'; via: DatasetKey; localField: string; parentField: string }  // nối qua bảng cha
  | { kind: 'related'; via: { dataset: DatasetKey; projectColumn: string }[] } // lọc "đã có phát sinh"
  | { kind: 'none' };                                       // dùng chung, không lọc theo CT

export interface Dataset {
  key: DatasetKey;
  label: string;
  group: 'DANH MUC' | 'CONG TRINH' | 'CHI PHI' | 'CHAM CONG' | 'TIEN' | 'KHAC';
  table: string;
  permModule: ModuleKey;              // has_permission(module,'view')
  projectLink: ProjectLink;
  dateField?: string;
  dateSource?: { via: DatasetKey; field: string };   // ngày lấy từ bảng cha
  hasDeletedFlag: boolean;
  parentDataset?: DatasetKey;         // bảng con
  columns: { field: string; label: string; width: number;
             type?: 'money'|'num'|'dec'|'date'|'text'|'bool';
             lookup?: LookupSpec }[];
  moneyColumns: string[];
  privateFields?: string[];
}
```

**Thêm loại dữ liệu mới về sau = thêm 1 object, không sửa màn hình.**

Lookup để hiện tên thay vì UUID: `{ table: 'projects', idField: 'project_id', nameField: 'name' }` — tải 1 lần, dùng cho mọi khối.

---

## 3. Danh mục 29 loại dữ liệu (theo kho thật)

Kho có **34 bảng**; trừ `profiles`, `roles`, `role_permissions`, `app_modules`, `backups` (bảo mật + kỹ thuật), còn **29 bảng nghiệp vụ**.

### 3.1. DANH MỤC & DANH BẠ

| Key | Bảng | Link CT | Ngày | Quyền |
|---|---|---|---|---|
| `customers` | `customers` | `related` | — | `contacts` |
| `workers` | `workers` | `related` | — | `contacts` |
| `suppliers` | `suppliers` | `related` | — | `contacts` |
| `subcontractors` | `subcontractors` | `related` | — | `contacts` |
| `employees` | `employees` | `none` | — | `contacts` |
| `catalog_items` | `catalog_items` | `none` | — | `catalog` |
| `contact_private` 🔒 | `contact_private` | `related` | — | `contacts` + `see_contact_ids` |

### 3.2. CÔNG TRÌNH

| Key | Bảng | Link CT | Ngày |
|---|---|---|---|
| `projects` | `projects` | `direct` (`id`) | `start_date` |
| `schedule_tasks` | `schedule_tasks` | `via schedule_phases` | `start_date` |
| `schedule_notes` | `schedule_notes` | `via schedule_phases` | `created_at` |

### 3.3. CHI PHÍ

| Key | Bảng | Link CT | Ngày |
|---|---|---|---|
| `expenses` | `expenses` | `direct` | `date` |
| `expense_lines` ⚠ | `expense_lines` | `via expenses` | `via expenses.date` |
| `cost_allocations` | `cost_allocations` | `direct` | — |

### 3.4. CHẤM CÔNG

| Key | Bảng | Link CT | Ngày |
|---|---|---|---|
| `timesheet_weeks` | `timesheet_weeks` | `direct` | `week_start` |
| `timesheet_lines` ⚠ | `timesheet_lines` | `via timesheet_weeks` | `via week_start` |
| `wage_advances` | `wage_advances` | `direct` (có thể null) | `date` |

**Chế độ Chấm công:**
- **Chi tiết**: xuất `timesheet_weeks` + `timesheet_lines`, ghép thành 1 khối có cột T2..T7 (mục 5.4).
- **Gộp**: bỏ bảng thô, gom theo công nhân: tổng công · tiền công · phụ cấp · HĐ lẻ · trừ nợ · thực lãnh · BQ/công · từ–đến ngày. Dùng `src/lib/calc/payroll.ts` — số **phải khớp** tab Tổng lương tuần.

### 3.5. TIỀN & HỢP ĐỒNG

| Key | Bảng | Link CT | Ngày |
|---|---|---|---|
| `main_contracts` | `main_contracts` | `direct` | `date` |
| `subcontracts` | `subcontracts` | `direct` | `date` |
| `receipts` | `receipts` | `direct` | `date` |
| `payments` | `payments` | `direct` | `date` |
| `payment_allocations` ⚠ | `payment_allocations` | `via payments` | `via payments.date` |
| `settlements` | `settlements` | `direct` | `date` |
| `payable_closures` | `payable_closures` | `via subcontracts` | `created_at` |

### 3.6. KHÁC

| Key | Bảng | Link CT | Ngày |
|---|---|---|---|
| `equipment` | `equipment` | `direct` | `date` |
| `schedule_templates` | `schedule_templates` | `none` | — |

---

## 4. Ba nhóm bảng khác nhau về cách lọc công trình — **điểm dễ sai nhất**

### 4.1. Nhóm A — có `project_id` trực tiếp

`expenses`, `timesheet_weeks`, `subcontracts`, `receipts`, `payments`, `main_contracts`, `settlements`, `equipment`, `cost_allocations`, `projects`.

→ Lọc thẳng `.in('project_id', ids)`. Bộ lọc "không gán" thì `.is('project_id', null)`.

### 4.2. Nhóm B — nối qua bảng cha

`expense_lines` (qua `expenses`), `timesheet_lines` (qua `timesheet_weeks`), `payment_allocations` (qua `payments`), `payable_closures` (qua `subcontracts`), `schedule_tasks` / `schedule_notes` (qua `schedule_phases` → `projects`).

→ **Hai bước** (hoặc một câu SQL có `exists`):

1. Lấy id bảng cha thoả bộ lọc công trình + thời gian.
2. `.in('<parent_fk>', parentIds)`.

→ **Lọc thời gian lấy ngày của bảng CHA** (bảng con thường không có ngày).
→ **Không nhồi quá 1.000 id mỗi lượt** — ưu tiên dùng `exists` / view thay vì gửi danh sách id dài.

### 4.3. Nhóm C — không thuộc công trình nào

`customers`, `workers`, `suppliers`, `subcontractors`, `employees`, `catalog_items`, `contact_private`.

→ "Chọn công trình" nghĩa là **"chỉ lấy người/NCC đã có phát sinh ở công trình đó"**:

| Loại | "Của công trình X" = |
|---|---|
| Khách hàng | có `projects.customer_id` ∈ X **hoặc** có `receipts` / `main_contracts` thuộc X |
| Công nhân | có `timesheet_lines` hoặc `wage_advances` thuộc X |
| Nhà cung cấp | có `expenses` hoặc `payments` thuộc X |
| Thầu phụ | có `subcontracts` hoặc `payments` thuộc X |

→ Mặc định **BẬT** lọc này khi có chọn công trình. Có nút gạt **"Lấy tất cả"** để xuất toàn bộ danh bạ. Chọn "Tất cả công trình" = toàn bộ danh bạ.

→ **Bắt buộc ghi chú trong file**: "Danh bạ lọc theo phát sinh của công trình đã chọn" — để người đọc không tưởng là thiếu người.

### 4.4. Lọc thời gian

| Bộ lọc | Điều kiện |
|---|---|
| Tất cả | không lọc |
| Năm Y | `date >= 'Y-01-01' and date < '(Y+1)-01-01'` |
| Tháng M/Y | từ ngày 1 tháng M đến trước ngày 1 tháng M+1 |
| Khoảng | `date between from and to` (bao gồm hai đầu) |

- Bảng **không có ngày** (`catalog_items`, `cost_allocations`, `schedule_templates`) → bộ lọc thời gian **không áp**; màn ghi "bảng này không có ngày, luôn lấy tất cả".
- Bảng con lấy ngày của bảng cha.
- `timesheet_weeks.week_start` = **Chủ nhật đầu tuần**. Lưu ý luật GĐ03: chi phí lương vào năm của **thứ Bảy** (`week_start + 6`). Lọc năm cho bảng chấm công dùng `week_start`, nhưng **ghi chú rõ trong đầu file** để không ai so sai với tab Lợi Nhuận.

---

## 5. Ba kiểu gom file

### 5.1. Mỗi công trình 1 sheet (mặc định)

- Sheet `TONG HOP` **đứng đầu** — mỗi công trình 1 dòng: STT · Công trình · Số hóa đơn · Tiền hóa đơn · Số công · Tiền công · HĐ thầu phụ · Đã chi TP+NCC · Thu tiền · Thiết bị.
- Sau đó **mỗi công trình 1 sheet**, tên sheet = tên công trình (bỏ phần trong ngoặc, cắt 28 ký tự, khử trùng bằng `(2)`).
- Trong sheet công trình: các **loại dữ liệu xếp dọc**, mỗi loại một khối (mục 5.5).
- Chọn **1 công trình** → bỏ sheet `TONG HOP`.
- Bảng nhóm C (danh bạ) chỉ xuất **1 lần**, đặt trong sheet `TONG HOP`, không lặp ở từng công trình.

### 5.2. Gộp 1 sheet

- Một sheet duy nhất `DU LIEU`. Mỗi loại dữ liệu 1 khối **đứng ngang**, thêm cột **"CÔNG TRÌNH"** ở vị trí thứ 2 (sau STT).
- Sắp xếp: công trình (theo thứ tự chọn) → trong công trình theo ngày tăng dần.
- Dùng khi muốn **copy sang bảng khác** hoặc làm PivotTable.

### 5.3. Mỗi loại 1 sheet

- Mỗi loại 1 sheet riêng, tên = nhãn loại (`Hoa don`, `Cham cong - tuan`…), có cột `CÔNG TRÌNH`.
- Nếu chọn > 15 loại → cảnh báo "quá nhiều sheet, nên chọn kiểu khác".

### 5.4. Ghép khối khi tick cả cha và con

Tick **cả** "Hóa đơn" + "Dòng vật tư" → **một khối duy nhất**: mỗi dòng vật tư 1 dòng, cột của hóa đơn lặp lại.

Tick **chỉ** "Dòng vật tư" → tự kéo theo "Hóa đơn" (không có thì không biết dòng vật tư thuộc hóa đơn nào).

Áp dụng cho 4 cặp: `expenses`+`expense_lines` · `timesheet_weeks`+`timesheet_lines` · `payments`+`payment_allocations` · `subcontracts`+`payable_closures`.

### 5.5. Khối trong sheet (trình bày)

```
[r]    ▐ 1. HÓA ĐƠN CHI PHÍ                                  ← dải nền vàng nhạt, chữ đậm
[r+1]    210 hóa đơn · sắp theo ngày                        ← chú thích in nghiêng xám
[r+2]    STT │ NGÀY │ LOẠI CHI PHÍ │ … │ SỐ TIỀN            ← nền xanh đậm, chữ trắng, viền
[r+3…]   dữ liệu
[cuối]              TỔNG CỘNG    │ =SUBTOTAL(9,…)           ← nền xanh nhạt, chữ đậm
```

- **Cột tiền là số thật** (`number`), định dạng `#,##0;[Red]-#,##0;"-"` → `1.250.000`, số 0 hiện `-`.
- Cột ngày: text `dd/mm/yyyy` (giữ như app cũ, tránh lệch múi giờ). Nếu muốn kiểu date thì thêm tuỳ chọn.
- Cột số công `#,##0.0`.
- Dòng tổng: **chỉ cộng cột tiền** (`moneyColumns`), dùng `SUBTOTAL(9,…)` → lọc/sắp xếp vẫn đúng.
- Mỗi sheet chỉ đặt **1 `autoFilter`** (khối đầu). Nhiều khối trong 1 sheet thì bỏ autoFilter, dùng dải tiêu đề màu để tìm.
- Đóng băng dòng tiêu đề: chỉ áp ở khối đầu tiên.
- In: A4 ngang, vừa 1 trang rộng, chân trang `Trang x/y`.

---

## 6. Dữ liệu cá nhân — chỉ người có quyền

1. Ô **"Xuất SĐT, CCCD, số tài khoản"** chỉ hiện khi `has_special('see_contact_ids')`. Người khác thấy dòng khoá 🔒.
2. Người **không** có quyền mà vẫn gọi được (localStorage cũ, gọi thẳng API) → **server trả lỗi 403**, không chỉ ẩn ở giao diện.
3. Không có quyền → lấy qua **`list_contact_private_masked()`** (hàm có từ GĐ02), SĐT hiện `0909***456`.
4. File có dữ liệu cá nhân → thêm dòng đỏ ở sheet đầu:
   `⚠ FILE NÀY CHỨA DỮ LIỆU CÁ NHÂN (SĐT / CCCD / SỐ TÀI KHOẢN). Không gửi qua nhóm chat.`
5. **Ghi log** mỗi lần xuất dữ liệu cá nhân: ai, lúc nào, bao nhiêu dòng. Bảng `audit_log` mới, chỉ Admin đọc.

---

## 7. Giới hạn và hiệu năng

| Ngưỡng | Hành vi |
|---|---|
| 0 dòng | Chặn xuất |
| 5.000–20.000 dòng | Bình thường, hiện "đang xử lý…" |
| 20.000–50.000 dòng | Cảnh báo vàng "file lớn (~X MB), có thể mất 20–40 giây" |
| > 50.000 dòng | **Chặn**, gợi ý hẹp lại bộ lọc |
| Tải dữ liệu | Phân trang **1.000 dòng/lượt** (PostgREST mặc định), lặp tới hết |
| Bộ nhớ | Xuất từng khối vào workbook, không giữ tất cả trong RAM cùng lúc |
| Tiến trình | Thanh tiến trình theo khối |

**Không dùng Edge Function**: dữ liệu phải qua RLS của chính người dùng → chạy ở trình duyệt là cách đúng.

---

## 8. Kỹ thuật — file và hàm

```
src/features/export/
  registry.ts          danh mục 29 loại (khai báo, không logic)
  useDatasetCounts.ts  đếm số dòng từng loại theo bộ lọc (debounce 400ms)
  fetchDataset.ts      tải dữ liệu 1 loại (xử lý 3 nhóm A/B/C)
  joinDatasets.ts      ghép cha–con (5.4), gom chấm công (3.4)
  buildWorkbook.ts     dựng workbook theo kiểu gom (5)
  ExportPage.tsx       màn hình 3 cột
  ExportHistory.tsx    lịch sử xuất
src/lib/export/
  excel-khoi.ts        vẽ MỘT khối: dải tiêu đề, hàng cột, dòng tổng, định dạng số
  dau-trang.ts         đầu trang công ty + thông tin bộ lọc
  ten-file.ts          tên file, khử ký tự lạ
```

**Thư viện: ExcelJS** (`exceljs`). SheetJS bản miễn phí **không** tô nền, **không** kẻ viền, **không** merge ô — toàn bộ trình bày ở 5.5 cần ExcelJS.

**Tái dùng, không viết lại:** `src/lib/calc/payroll.ts` (gom chấm công) · `src/lib/calc/payables.ts` (`payment_allocations`) · `src/lib/format.ts` · `src/components/ui/*` (Sheet, Checkbox, Radio, Toast).

**Không đụng:** `src/lib/calc/` (không thêm hàm tính tiền mới), app cũ, `du-lieu/`.

---

## 9. Xong khi (kiểm tra bắt buộc)

1. **Đếm khớp:** chọn "Hóa đơn" + 1 công trình → số trên màn = số dòng trong file.
2. **Nhóm B đúng:** "Dòng vật tư" của CT Cô Sáu → chỉ dòng vật tư thuộc hóa đơn của Cô Sáu, không lẫn A Nhựt.
3. **Nhóm C đúng:** "Công nhân" + CT Cô Sáu → chỉ công nhân có chấm công ở Cô Sáu (không phải cả 51). Bật "Lấy tất cả" → đủ 51.
4. **Lọc thời gian:** "Năm 2025" chỉ ra dòng trong 2025; "01/06–30/06/2025" đúng biên hai đầu.
5. **Ba kiểu gom:** mỗi công trình 1 sheet / gộp 1 sheet (có cột Công trình) / mỗi loại 1 sheet — ba file khác nhau, **tổng số dòng bằng nhau**.
6. **Chấm công 2 kiểu:** chi tiết và gộp — **tổng "Thực lãnh" hai kiểu phải bằng nhau**. Test.
7. **Dòng tổng là công thức:** mở file, xóa 1 dòng dữ liệu, tổng tự giảm.
8. **Dữ liệu cá nhân:** tài khoản không có quyền → không thấy ô tick; gọi thẳng API → **403**.
9. **Giới hạn:** chọn tất cả 29 loại × 36 công trình × tất cả năm → chặn ở 50.000 dòng, không treo trình duyệt.
10. **Không còn nút CSV:** grep `dlCSV`, `exportAllCSV`, `exportEntryCSV`, `exportCCTLTCSV`, `tbExportCSV` → 0 kết quả.
11. typecheck / test / build xanh; Playwright chụp 390 / 820 / 1440; commit `TN02: …` trên nhánh `dev`.

---

## 10. Prompt giao cho AI (sau GD99)

Mở **session mới** trong `ban-moi`, model **Opus 5.5**, effort **medium**, quyền **Bypass**, dán:

```
Đọc mega-prompt/00-QUY-TAC-CHUNG.md, CLAUDE.md, TU-DIEN.md.
Làm tính năng TN02 theo đúng ../ban-moi-tinh-nang-moi/TN02-xuat-du-lieu.md
(đọc mục 0–9; mục 1.2 là bố cục màn; mục 4 là 3 nhóm lọc công trình; mục 5 là 3 kiểu gom).
Chạy đủ 11 mục kiểm tra ở mục 9. Cập nhật TIEN-DO.md, commit "TN02: …" trên nhánh dev.
File mẫu để đối chiếu trình bày: ../ban-moi-tinh-nang-moi/MAU_TN02_2CongTrinh_TatCaNam.xlsx
```

**Không cần đọc TN01** — đã bỏ.

---

## 11. Ghi chú

- TN01 (`TN01-xuat-bao-cao.md`) **giữ làm tham khảo, không code**. Lý do bỏ: báo cáo tổng hợp chỉ phục vụ quyết toán, còn nhu cầu hằng ngày là **xem và đối chiếu dữ liệu chi tiết**.
- Nếu sau này cần báo cáo gửi chủ nhà thì làm **TN03**, dùng lại `lib/export/excel-khoi.ts` của TN02.
- **Chênh lệch cần biết:** bản xuất chi tiết có tổng hóa đơn **cao hơn** số trên tab Lợi Nhuận (vì Lợi Nhuận tính hóa đơn Đã TT + phần trả NCC, còn xuất chi tiết lấy toàn bộ hóa đơn kể cả mua nợ). Không phải lỗi — nhưng phải ghi chú trong file để không ai so sai.
