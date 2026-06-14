# Project_Analytic.md — Bản đồ kỹ thuật App "Quản Lý Chi Phí Công Trình"

> **Mục đích tài liệu:** Giúp bất kỳ AI / lập trình viên nào đọc vào là **lập tức hiểu toàn bộ kiến trúc** để fix bug, refactor và thêm tính năng mà không phải dò lại từ đầu. Đây là tài liệu *tham chiếu hiện hành* — mô tả CODE ĐANG CHẠY, không phải kế hoạch.
>
> **Tài liệu thiết kế gốc** (schema/quy tắc nghiệp vụ chi tiết từng tab) nằm ở thư mục sibling: `..\Claude (Old ver)\REWRITE BRAND NEW APP\` — gồm 10 doc `NN TAB ... - THIET KE KY THUAT.md` + `00 MASTER PLAN v3` + `11 LO TRINH TRIEN KHAI`. Khi cần schema chính xác của 1 tab, đọc doc tương ứng. ⚠️ Doc 00 còn ghi KEY cũ `_v1/_v2/_v3` ĐÃ BỊ ĐÈ bởi tên store sạch (xem §4).

---

## Mục lục

- **PHẦN I — KIẾN TRÚC**
  - [1. Tổng quan & triết lý](#1-tổng-quan--triết-lý)
  - [2. Mô hình phân tầng (Layered Architecture)](#2-mô-hình-phân-tầng-layered-architecture)
  - [3. Sơ đồ thư mục](#3-sơ-đồ-thư-mục)
  - [4. Lưu trữ dữ liệu (IndexedDB) & mô hình bản ghi](#4-lưu-trữ-dữ-liệu-indexeddb--mô-hình-bản-ghi)
  - [5. Đồng bộ đám mây (Firestore REST + LWW)](#5-đồng-bộ-đám-mây-firestore-rest--lww)
  - [6. Khởi động, điều hướng (router) & phân quyền](#6-khởi-động-điều-hướng-router--phân-quyền)
- **PHẦN II — DỮ LIỆU & TIỆN ÍCH**
  - [7. Sơ đồ dữ liệu 10 kho (Data Model)](#7-sơ-đồ-dữ-liệu-10-kho-data-model)
  - [8. Thư viện util dùng chung](#8-thư-viện-util-dùng-chung)
- **PHẦN III — CÁC TAB NGHIỆP VỤ**
  - [9. Bản đồ từng tab (file · vai trò · điểm vào)](#9-bản-đồ-từng-tab)
  - [10. Quy ước chung giữa các tab](#10-quy-ước-chung-giữa-các-tab)
- **PHẦN IV — BẢO TRÌ**
  - [11. Quy tắc lập trình & cách thêm tính năng](#11-quy-tắc-lập-trình--cách-thêm-tính-năng)
  - [12. Cạm bẫy đã biết (gotchas)](#12-cạm-bẫy-đã-biết-gotchas)

---

# PHẦN I — KIẾN TRÚC

## 1. Tổng quan & triết lý

| | |
|---|---|
| **Tên** | Quản Lý Chi Phí Công Trình (cpct) |
| **Loại** | SPA single-page, **vanilla JS thuần** (ES Modules), KHÔNG framework, KHÔNG bundler |
| **UI** | Bootstrap 5.3.3 (CDN) + Bootstrap Icons 1.11.3 + IBM Plex font. CSS thủ công tối thiểu ở `assets/css/style.css` |
| **Lưu trữ** | **IndexedDB** (local, offline-first) là nguồn chính; **Firestore REST** là bản sao đám mây để đồng bộ nhiều máy |
| **Chạy** | Phải mở qua HTTP (Live Server cổng 5500), KHÔNG mở `file://` (vì dùng ES Modules) |
| **Ngôn ngữ** | 100% tiếng Việt (UI + comment code), người dùng cuối là đội thi công xây dựng |
| **Mobile** | Mobile-first — nhiều bảng có cặp layout desktop (`d-none d-lg-block`) + card (`d-lg-none`) |

**4 triết lý xương sống** (vi phạm là gây bug):

1. **Offline-first**: mọi thao tác ghi local IndexedDB TRƯỚC, đồng bộ cloud là phụ (debounce ngầm). App phải chạy đầy đủ kể cả khi chưa cấu hình/không có mạng.
2. **Soft-delete + tombstone**: KHÔNG xóa cứng bản ghi nghiệp vụ. Xóa = đặt `deletedAt`. Cho phép Thùng rác/khôi phục, và đồng bộ "xóa" sang máy khác.
3. **Công trình là hub trung tâm**: mọi tab giao dịch liên kết tới công trình **CHỈ qua `projectId`** (không nhúng tên CT vào bản ghi — tên đọc realtime). `projectId='COMPANY'` là "Công ty / Kho Tổng" (chi phí chung, tồn kho trung tâm).
4. **Tách dữ liệu khỏi UI**: mỗi tab có file `*.data.js` (logic thuần + CRUD, dễ test) tách khỏi file UI. Hàm tính toán tài chính viết dạng **pure function** nhận data vào, trả kết quả ra.

## 2. Mô hình phân tầng (Layered Architecture)

Mỗi file ghi rõ tầng của mình ở đầu (`TẦNG ... (Layer N)`). Phụ thuộc chỉ đi **từ trên xuống dưới**, KHÔNG có vòng (cycle):

```
Layer 8  KHUNG APP        app.js · router.js · topbar.js
            │  (ráp khung, điều hướng tab, chọn năm)
Layer 7  TỔNG HỢP / TAB   modules/<tab>/*  (projects, hoadon, chamcong, tienung,
            │              doanhthu, thietbi, danhmuc, dashboard, nhapxuat, backup, auth)
Layer 4  ĐĂNG NHẬP        modules/auth/*  (auth.data · auth.ui · auth.roles)
Layer 2  KẾT NỐI          core/sync.js · core/sync.ui.js · core/firebase.js
Layer 1  HẠ TẦNG          core/store.js · utils/year.js · utils/* (fmt, cat, csv, ui...)
Layer 0  MÓNG             core/db.js  (IndexedDB key-value)
```

**Kỹ thuật chống phụ thuộc vòng** (mẫu lặp lại khắp app — học 1 lần dùng mọi nơi):
- `store.js` KHÔNG import `sync.js`. Thay vào đó `sync.js` "cắm" hàm đẩy vào qua `setPushScheduler(fn)`.
- `auth.roles.js` KHÔNG import `auth.ui.js`. Vai trò được đẩy vào qua `setCurrentRole(role)`.
- `sync.js` KHÔNG import `sync.ui.js`. Trạng thái sync phát ra qua `setSyncStateListener(fn)` / `_emit(state)`.
- → **Khi thêm liên kết chéo tầng, dùng pattern Dependency Injection listener này thay vì import thẳng.**

## 3. Sơ đồ thư mục

```
Claude (New ver)/
├─ index.html              Điểm nạp DUY NHẤT: <script type="module" src="js/app.js">. Dựng <div id="app-root">
├─ assets/css/style.css    CSS thủ công tối thiểu (token màu, nav sidebar, sticky...)
├─ firestore.rules         Security Rules: chỉ cho đọc/ghi cpct_data/{doc} khi request.auth != null
├─ test.html               Trang test thủ công độc lập (seed/inspect DB)
├─ REWRITE BRAND NEW APP/  ⚠️ TÀI LIỆU THIẾT KẾ (read-only tham chiếu) — không phải code
└─ js/
   ├─ app.js               (133) Layer 8 — bootstrap: initAuth → login | app shell
   ├─ router.js            (161) Layer 8 — TABS[], registerTab(), navigate(), #hash sync
   ├─ topbar.js            (151) Layer 8 — thanh trên: chọn NĂM, nút 🔄 sync, user, logout, offcanvas sidebar
   ├─ core/
   │  ├─ db.js             (141) Layer 0 — IndexedDB kv-store; STORE{} (10 kho); DEVICE_ID; idbGet/Set/Delete
   │  ├─ store.js          (128) Layer 1 — load/save + createRecord/markUpdated/softDelete/restore/upsert + bộ lọc
   │  ├─ firebase.js       (332) Layer 2 — REST Firestore: cloudGet/Set, toFirestore/fromFirestore, ensureAuth (anon), quota
   │  ├─ sync.js           (438) Layer 2 — engine LWW+tombstone: pushChanges/pullChanges, mergeById, sharding theo năm
   │  └─ sync.ui.js        (148) Layer 2 — chấm trạng thái + banner đồng bộ
   ├─ utils/
   │  ├─ year.js           (82)  DATE_FIELD{} · getRecordYear · filterByYear · activeYears
   │  ├─ fmt.js            (113) formatMoney/parseMoney · formatDate/parseDate · formatNumber
   │  ├─ cat.js            (161) GROUPS (6 nhóm danh mục) · normalizeName/normalizeKey · loadCategories · findByKey
   │  ├─ autocomplete.js   (158) normalizeVietnamese (bỏ dấu) · filterSuggestions · attachAutocomplete
   │  ├─ ui.js             (124) toast · setLoading · confirm2 · validateRequired
   │  ├─ csv.js            (42)  csvCell · toCsv · downloadCsv (UTF-8 BOM + CRLF)
   │  └─ sheet-grid.js     (554) Lưới nhập dạng bảng Excel (dùng ở hóa đơn, nhiều tab)
   └─ modules/
      ├─ auth/             auth.data (tài khoản+hash) · auth.ui (form login+session) · auth.roles (phân quyền)
      ├─ projects/         data · list · form · stats   → Tab 01 Công trình (HUB)
      ├─ hoadon/           data · quick · detail · list · trash · ui   → Tab 02 Hóa đơn
      ├─ chamcong/         calc · data · grid · week · salary · history · report · ui  → Tab 04 Chấm công
      ├─ tienung/          data · form · list · report · ui   → Tab 05 Tiền ứng
      ├─ doanhthu/         data · contract · subcontract · receipt · stats · report · debt · ui  → Tab 08 Doanh thu
      ├─ thietbi/          data · entry · transfer · tables · ui   → Tab 06 Thiết bị
      ├─ danhmuc/          data · ui   → Tab 07 Danh mục
      ├─ dashboard/        data · charts · cards · ui   → Tab 09 Tổng quan (100% derived)
      ├─ nhapxuat/         export · import · vision · ui   → Tab Sao lưu (xuất/nhập JSON+CSV)
      └─ backup/           backup.js   → snapshot nhanh trong IndexedDB
```

**Quy ước đặt tên file trong 1 tab** (lặp lại nhất quán — nắm 1 lần áp mọi tab):
- `*.data.js` — tầng dữ liệu: cache RAM + CRUD + hàm tính thuần. **KHÔNG đụng DOM.**
- `*.ui.js` — vỏ (shell): gọi `registerTab(id, render)`, vẽ nav sub-tab, điều phối các màn con.
- `*.list.js` / `*.form.js` / `*.<màn>.js` — từng màn UI con.
- `*.report.js` — thư viện hàm xuất (CSV/PNG), thường KHÔNG có màn riêng, nút gắn vào màn khác.
- **Quy ước độ dài: mỗi file ≤ ~400 dòng.** Vượt thì tách file (lý do nhiều file con như chamcong có 8 file).

## 4. Lưu trữ dữ liệu (IndexedDB) & mô hình bản ghi

**Cách lưu (quan trọng):** IndexedDB được dùng như **tủ khóa key-value 1 store** (`KV_STORE='kv'` trong DB `cpct_db` v1). Mỗi "kho" (STORE.XXX) là **1 KEY** trỏ tới **cả mảng/đối tượng** của kho đó (1 cục blob). `idbGet('invoices')` → toàn bộ mảng hóa đơn; `idbSet('invoices', [...])` ghi đè cả mảng. **Lọc theo năm/CT làm ở tầng trên (RAM), không query trong DB.**

**10 kho** (`STORE` trong [core/db.js](js/core/db.js:35) — nguồn sự thật, luôn tham chiếu `STORE.XXX`, không gõ chuỗi tay):

| Hằng | key | Dạng | Tab | Ghi chú |
|---|---|---|---|---|
| `PROJECTS` | projects | mảng | 01 | HUB — mọi tab vin vào |
| `INVOICES` | invoices | mảng | 02/03 | Hóa đơn / chi phí vật tư |
| `TIMESHEETS` | timesheets | mảng | 04 | 1 bản ghi = 1 tuần × 1 CT |
| `ADVANCES` | advances | mảng | 05 | Tiền ứng (thầu phụ + NCC) |
| `EQUIPMENT` | equipment | mảng | 06 | Tồn kho + luân chuyển |
| `CATEGORIES` | categories | **đối tượng** | 07 | 1 document {6 nhóm mảng} + field hệ thống |
| `CONTRACTS` | contracts | **đối tượng map** | 08 | `{[projectId]: record}` — 1 CT = 1 HĐ |
| `SUBCONTRACTS` | subcontracts | mảng | 08 | Nhiều HĐ thầu phụ / CT |
| `RECEIPTS` | receipts | mảng | 08 | Các đợt thu tiền |
| `USERS` | users | mảng | auth | Tài khoản + vai trò (mật khẩu chỉ local) |

⚠️ **3 kho KHÔNG phải mảng phẳng** — code đụng tới chúng phải xử lý riêng:
- `categories` = **1 document đối tượng** (6 mảng nhóm + `createdAt/updatedAt/deletedAt/deviceId`).
- `contracts` = **đối tượng map theo projectId** (lưu lại cùng CT = ghi đè).
- Các nơi gọi `load(store)` cho 2 kho này phải truyền `fallback = {}` (mặc định `load` trả `[]`).

**6 field hệ thống** (mọi bản ghi giao dịch, tạo qua `createRecord()` trong [store.js](js/core/store.js:60)):

```
id        crypto.randomUUID()  — khóa toàn cục
createdAt Date.now()           — không đổi
updatedAt Date.now()           — LWW so field này (markUpdated cập nhật mỗi lần sửa)
deletedAt null | timestamp     — null=sống, số=đã xóa mềm (tombstone)
deviceId  DEVICE_ID            — máy ghi gần nhất (LWW tie-break)
projectId 'COMPANY' | uuid CT  — liên kết tới công trình
```

**API store.js phải dùng** (đừng tự thao tác mảng thô): `load/save`, `createRecord`, `markUpdated`, `softDelete`, `restore`, `upsert`, `activeOnly`, `deletedOnly`, `getById`. Mỗi lần sửa nội dung bản ghi **bắt buộc gọi `markUpdated`** kẻo LWW chọn nhầm bản cũ.

## 5. Đồng bộ đám mây (Firestore REST + LWW)

`core/firebase.js` + `core/sync.js`. Firebase project **qlcp-renew** (region asia-southeast1). Dùng **REST thuần** (không SDK).

**Sharding tiết kiệm quota (gói Spark)** — chia nhỏ 1 document / kho / năm:
- Kho theo năm (`YEAR_STORES` = keys của `DATE_FIELD` = invoices, timesheets, advances, receipts, equipment) → `docYearCat(2026,'invoices')` = `cpct_data/y2026_invoices`.
- Kho nền (`META_STORES` = projects, categories, contracts, subcontracts, users) → `docMeta('projects')` = `cpct_data/meta_projects`.

**Luồng (doc 10):**
- **PUSH** = đọc cloud → `mergeById` với local → ghi đè doc (gộp để không đè mất dữ liệu máy khác). "Push ngầm" chỉ đẩy NĂM HIỆN TẠI + kho vừa đổi (debounce 800ms, flush khi ẩn tab). "Push đầy đủ" (nút 🔄 / sau import) đẩy mọi năm.
- **PULL** = tải cloud → THAY THẾ nguyên "lát năm" đó ở local.
- **Xung đột** (`resolveConflict`): tombstone ưu tiên (đã xóa không sống lại) → rồi `updatedAt` mới hơn thắng (`safeTs` chống lệch giờ máy: ts<2020→0, ts tương lai xa→kẹp về now).

**Hai kho document đặc biệt khi sync:**
- `categories` (object): dùng `mergeCategoryDocs` + `_pushCategories` (ghi dưới khóa `doc`, KHÔNG `records`). KHÔNG gọi `mergeById` thẳng (sẽ vỡ `.forEach`).
- `users`: mật khẩu KHÔNG lên cloud (`stripPassword`).

**Auth ẩn danh (FAIL-SOFT):** `ensureAuth()` ký Anonymous qua REST, giữ refreshToken ở localStorage `cpct_fb_refresh`. Nếu Console chưa bật Anonymous → `_authDisabled=true`, app vẫn chạy không token. `fbReady()=false` (chưa cấu hình) → mọi push/pull bỏ qua êm, thay đổi vẫn nhớ (dirty) để đẩy sau.

⚠️ **Còn cần làm trong Console (không thể tự động):** bật Anonymous Auth → Publish `firestore.rules` → hạn chế API key theo HTTP referrer. (Bật Anonymous TRƯỚC khi publish rules.)

## 6. Khởi động, điều hướng (router) & phân quyền

**Khởi động** ([app.js](js/app.js)): `start()` → `buildShell()` (dựng 2 màn login/app) → `startRoleObserver()` → `initAuth()` → có phiên → `showApp()` (mount topbar + `startRouter` + heartbeat) | chưa → `showLogin()`.

**Router** ([router.js](js/router.js)): mảng `TABS[]` khai báo thứ tự + `perm`. Module gọi `registerTab(id, renderFn)` để cắm hàm vẽ; `navigate(id)` đổi tab + đồng bộ `#hash` (F5 nhớ tab); tab bị ẩn theo quyền thì tự nhảy về tab hợp lệ đầu. **Mỗi module tab phải có side-effect import trong [app.js](js/app.js:25)** để chạy `registerTab`.

**Phân quyền** ([auth.roles.js](js/modules/auth/auth.roles.js)): 3 vai trò `admin` · `giamdoc` · `ketoan`.
- `PERM_ROLES`: `viewDashboard`/`viewDoanhThu` = admin+giamdoc; `manageTools` = admin. Quyền KHÔNG khai báo → mọi vai trò có.
- UI gắn `data-perm="x"` hoặc `data-role="admin,giamdoc"` → `MutationObserver` (`startRoleObserver`) tự ẩn/hiện class `.d-none` khi DOM đổi.
- `hasPermission(perm)` dùng cho logic; `setCurrentRole(role)` do auth.ui đẩy vào.

---

# PHẦN II — DỮ LIỆU & TIỆN ÍCH

## 7. Sơ đồ dữ liệu 10 kho (Data Model)

> Chỉ liệt kê field nghiệp vụ; mọi bản ghi giao dịch còn 6 field hệ thống (§4). Schema chi tiết: doc thiết kế tương ứng.

**projects** (Tab 01): `name`, `type`, `status` (active/completed/closed), `startDate`, `endDate`, `closedDate`, `investor` (Chủ đầu tư — Tab Doanh thu đọc realtime, KHÔNG lưu trùng). `COMPANY` là CT đặc biệt cho chi phí chung. CT `closed` (quyết toán) bị **khóa** — các tab chặn ghi (toast 🔒) qua `isProjectLocked`.

**invoices** (Tab 02): `date`, `category` (loại CP), `projectId`, `amount`, `note`, `supplier`, `performer`, `source` ('quick'|'detail'). Khi `source='detail'`: thêm `items[]` {name,unit,quantity,unitPrice,discount} + `totalDiscount`. `amount` chuẩn hóa qua `parseMoney`.

**timesheets** (Tab 04): `fromDate` (Chủ Nhật đầu tuần) + `toDate` (Thứ Bảy), `projectId`, `workers[]` {name,role,d0..d6,wage,allowance,retailInvoice,loanAmount,deduction,note,**debtBefore (đóng băng lúc lưu)**}. Khóa duy nhất = `fromDate`+`projectId`. Lương KHÔNG đẩy vào invoices — Tab 03/Dashboard đọc realtime qua `weekToLaborRow`.

**advances** (Tab 05): `date`, `type` ('subcontractor'|'supplier'), `partner`, `projectId`, `amount`, `note`. `partner` phải khớp danh mục nhóm tương ứng.

**equipment** (Tab 06): `date`, `name` (khớp danh mục equipment), `projectId` (`COMPANY`=Kho Tổng), `quantity`, `condition` (active/maintenance/repair), `note`. 1 dòng tồn = khóa gộp `projectId + name(không dấu) + condition` → CỘNG DỒN.

**categories** (Tab 07): document {6 nhóm: `costType`, `supplier`, `performer`, `subcontractor`, `worker` (có `role` C/T/P), `equipment`}, mỗi nhóm là mảng `[{id, name}]`. So trùng không dấu (`normalizeKey`). Đổi tên item → cascade ra các store dùng nó.

**contracts** (Tab 08): map `{[projectId]: {value, addonValue, extraValue, performer, note, date}}`. `contractTotal = value+addonValue+extraValue`.

**subcontracts** (Tab 08): mảng, `projectId`, `partner` (khớp danh mục subcontractor), `value`; nếu có `items[]` {name,unit,quantity,unitPrice} thì `value = Σ(SL×đơn giá)` (khóa); không items → nhập tay.

**receipts** (Tab 08): mảng, `date`, `projectId`, `amount`, `paymentType` ('advance'|'phase'|'settlement', mặc định phase), `performer`, `note`.

**users** (auth): `username`, `passwordHash`, `role`, `displayName`...

**Quan hệ chéo tab quan trọng:**
- Mọi giao dịch → `projectId` → projects.
- Tab 03/Dashboard chi phí = invoices (thật) + lương ảo (timesheets via `weekToLaborRow`) + subcontracts.value. Tiền ứng & thiết bị KHÔNG tính là chi phí.
- Công nợ thầu phụ = Σ subcontracts.value − Σ advances(subcontractor). Công nợ NCC = Σ advances(supplier) − Σ invoices có supplier.
- Lãi CT (doc 01): Đỏ=directCost+ứng−hóa đơn NCC; Xám=Đỏ+phân bổ chung; Lãi=thu−Đỏ.

## 8. Thư viện util dùng chung

| File | Hàm chính | Dùng khi |
|---|---|---|
| `fmt.js` | `formatMoney`/`parseMoney` (chấm hàng nghìn ↔ số), `formatDate`/`parseDate`, `formatNumber` | Mọi nơi hiện/đọc tiền & ngày |
| `year.js` | `DATE_FIELD{}`, `getRecordYear`, `filterByYear`, `activeYears` | Lọc theo năm topbar (năm 0 = mọi năm) |
| `cat.js` | `GROUPS` (6 nhóm), `normalizeName` (Title/UPPER), `normalizeKey`=bỏ dấu, `loadCategories`, `findByKey`, `listNames`, `addCategoryItem` | Mọi tab cần danh mục/autocomplete |
| `autocomplete.js` | `normalizeVietnamese` (bỏ dấu, lõi so trùng toàn app), `filterSuggestions`, `attachAutocomplete` | Ô nhập có gợi ý |
| `ui.js` | `toast(msg,type)`, `setLoading`, `confirm2(msg)` (Promise<bool>), `validateRequired` | Thông báo & xác nhận xóa |
| `csv.js` | `csvCell`, `toCsv`, `downloadCsv` (BOM `﻿` + CRLF, tự thêm .csv) | Xuất CSV (Excel mở đúng tiếng Việt) |
| `sheet-grid.js` | `createSheetGrid(container, opts)` → grid kiểu Excel (autocomplete/money/copyFromAbove/suggestFromAbove) | Nhập nhiều dòng (hóa đơn nhanh/chi tiết) |

⚠️ **`normalizeVietnamese` (alias `normalizeKey`) là lõi so trùng toàn app** — "Xi Măng" ≡ "xi mang" ≡ "XI MĂNG". Mọi so khớp tên (danh mục, công nhân, đối tác, tìm kiếm không dấu) đều qua nó. Đừng tự viết hàm bỏ dấu khác.

---

# PHẦN III — CÁC TAB NGHIỆP VỤ

## 9. Bản đồ từng tab

> Mỗi tab: file lõi + điểm vào (entry) + đặc thù cần biết khi sửa. Tất cả tab đều HOÀN CHỈNH.

### Tab 01 — Công trình (HUB) · `modules/projects/`
- `projects.data.js` — CRUD + `getProjectById/Name`, `getProjectOptions` (ghim COMPANY đầu, `excludeLocked`/`includeId`), `isProjectLocked`/`canDeleteProject`, phân bổ chi phí chung (`projectDays/projectWeight/allocateCompanyCost`). **Cache RAM → truy vấn đồng bộ.**
- `projects.stats.js` — pure `computeProjectFinance` (Đỏ/Xám/Lãi) + `getAllProjectsFinance(year)` (đọc 5 store 1 lần → Map) + `financialStatus`.
- `projects.list.js` (vẽ tab + KPI + lọc) · `projects.form.js` (modal thêm/sửa).
- **Sửa tab khác mà cần tên/option CT → gọi từ data.js này, đừng tự đọc store projects.**

### Tab 02 — Hóa đơn · `modules/hoadon/`  (shell 4 sub-tab)
- `hoadon.data.js` — `saveInvoice` (validate + chặn CT khóa), `findDuplicates` (Dice không dấu, exact≥0.99/similar≥0.70), `applyDiscount`, soft-delete/restore/trash.
- Sub-tab: `quick` (⚡ Nhập nhanh, sheet-grid 6 cột, dò trùng) · `detail` (📋 chi tiết, bảng mặt hàng tính 2 cấp) · `list` (📑 phân trang 20 + lọc) · `trash` (🗑 khôi phục).
- `hoadon.ui.js` điều phối + cross-edit (từ list bấm ✏️ → nhảy sub-tab theo `source`).

### Tab 04 — Chấm công · `modules/chamcong/`  (8 file)
- `chamcong.calc.js` — pure: `totalDays`, `laborPay`, `takeHome`, `debtAfter`, `calcDebtBefore` (Σ vay−trừ mọi tuần trước, không dấu), ngày `snapToSunday/sundayISO/weekLabel` (ISO local, KHÔNG toISOString).
- `chamcong.data.js` — `saveWeek` (**đóng băng debtBefore** mỗi worker, dedup bản trùng khóa), `getTimesheetWeeks` (lọc tuần giao thoa năm).
- `chamcong.grid.js` — lưới chuyên dụng (KHÔNG sheet-grid: cần cột tính read-only + ô ngày tô màu).
- `week` (📝 Sổ chấm công, auto-copy worker tuần trước) · `salary`+`history` (📊 Tổng lương/Lịch sử) · `report` (thư viện xuất phiếu lương PNG + CSV).

### Tab 05 — Tiền ứng · `modules/tienung/`  (shell 2 sub-tab)
- `tienung.data.js` — `ADVANCE_TYPES`, `saveAdvances` (batch, gom errors không chặn dòng hợp lệ), `sumAdvancesByProject/Partner`.
- `form` (mini-grid tự dựng, cột Loại `<select>` đổi nguồn autocomplete đối tác theo dòng) · `list` (📜 2 bảng riêng thầu phụ/NCC) · `report` (CSV + phiếu chi PNG).

### Tab 06 — Thiết bị · `modules/thietbi/`
- `thietbi.data.js` — cộng dồn theo khóa gộp, `transferEquipment` (luân chuyển: soft-delete nguồn → merge đích + phần còn lại), `deleteEquipment` CHỈ Kho Tổng.
- `entry` (nhập nhiều dòng) · `transfer` (modal luân chuyển) · `tables` (3 bảng: tại CT / Kho Tổng / thống kê).

### Tab 07 — Danh mục · `modules/danhmuc/`
- `danhmuc.data.js` — mutator có lưu + **CASCADE đổi tên** ra các store khác + `isItemInUse` (chặn xóa khi đang dùng). Lõi nhóm/chuẩn hóa ở `utils/cat.js` (KHÔNG chép lại).
- `danhmuc.ui.js` — lưới 6 thẻ, sửa tên tại chỗ, dropdown vai trò C/T/P (worker). **Cả 3 vai trò thao tác được** (theo doc 07, KHÔNG ẩn).

### Tab 08 — Doanh thu · `modules/doanhthu/`  (shell 3 sub-tab)
- `doanhthu.data.js` — 3 thực thể (contracts map / receipts / subcontracts) + derived `calcKpi`, `computeReceivables`, `calcDebtSubcontractor/Supplier` (all-time year:0 vì là số dư lũy kế).
- Modal: `contract` (HĐ chính, Chủ ĐT readonly realtime) · `subcontract` (bảng khối lượng động) · `receipt` (thanh tiến độ realtime).
- Màn: `stats` (📋 Khai báo/Thống kê — 3 bảng, LỐI VÀO mở các modal) · `report` (📈 Công nợ phải thu CĐT) · `debt` (🤝 Công nợ đối tác).
- ⚠️ `doanhthu.receiptlist.js` đã **xóa** (mồ côi). Nếu thấy tham chiếu → là rác cũ.

### Tab 09 — Dashboard · `modules/dashboard/`  (100% derived, KHÔNG store riêng)
- `dashboard.data.js` — `loadDashboard({year})` đọc DB 1 lần → các hàm thuần (`getCostRows`=invoice+labor+subcontract, `calcKpi`, `weeklyCost`, `monthlyCost`, `costByType`, `topProjects`).
- `dashboard.charts.js` — **SVG thuần, KHÔNG thư viện** (barChart stacked, pieChart). `cards.js` (KPI/khối) · `ui.js` (lọc, CSV).

### Tab Sao lưu · `modules/nhapxuat/` + `modules/backup/`  (perm manageTools)
- `nhapxuat.export.js` — `exportJsonBackup` (đủ 10 kho, giữ users/mật khẩu — file local) + `exportExcel` (CSV gộp).
- `nhapxuat.import.js` — `parseBackupFile`/`previewImport`/`applyImport` (**GỘP** LWW, KHÔNG ghi đè; users qua mergeUsers giữ mật khẩu).
- `nhapxuat.vision.js` — nạp file SAO LƯU SCHEMA CŨ ("Vision" v4): chuyển tên kho + field về schema mới, GHI ĐÈ kho nghiệp vụ + danh mục, GIỮ users (để kiểm thử dữ liệu thật). *(file mới, đang untracked trong git)*
- `backup.js` — snapshot nhanh trong IndexedDB (khóa `cpct_snapshots`, giữ 10 bản, KHÔNG đẩy cloud).

## 10. Quy ước chung giữa các tab

- **Năm:** topbar có ô chọn năm; đổi năm → `navigate(getActiveTab())` vẽ lại. Năm `0` = mọi năm.
- **Tìm kiếm:** luôn không dấu qua `normalizeKey`. Bộ lọc dùng sự kiện `input` (kể cả `<select>`) — khi test bằng `dispatchEvent` phải dùng `new Event('input')`.
- **Xóa:** luôn `confirm2()` → `softDelete` → bỏ khỏi cache RAM → dispatch event (vd `tienung:changed`) cho các màn liên quan refresh.
- **CT khóa:** mọi `save*` chặn CT đã quyết toán (`isProjectLocked` → toast 🔒).
- **Modal:** pattern overlay card (`div.position-fixed z-index:1100`, click nền tối = đóng), `escapeHtml` mọi chuỗi user nhập.
- **Tiền:** lưu số raw; hiện qua `formatMoney`; CSV xuất số raw để Excel cộng được.

---

# PHẦN IV — BẢO TRÌ

## 11. Quy tắc lập trình & cách thêm tính năng

**Quy tắc bất di bất dịch:**
1. Tham chiếu store qua `STORE.XXX`, KHÔNG gõ chuỗi tên kho.
2. Mọi sửa bản ghi → `markUpdated()`; mọi xóa → `softDelete()`. Không xóa cứng kho nghiệp vụ.
3. Phụ thuộc đi từ trên xuống (§2). Cần liên kết ngược → DI listener, KHÔNG import vòng.
4. File ≤ ~400 dòng — vượt thì tách màn/thư viện.
5. Logic tính toán = pure function nhận data, trả kết quả (để test không cần DOM).
6. So khớp/tìm kiếm tên → `normalizeVietnamese`. Tiền → `parseMoney`/`formatMoney`. CSV → `utils/csv.js`.

**Thêm 1 tab mới (checklist):**
1. Tạo `modules/<tab>/<tab>.data.js` (CRUD + pure, dùng `STORE`, `createRecord`...).
2. Tạo `<tab>.ui.js` gọi `registerTab('<id>', render)` (+ các màn con).
3. Thêm `{id, label, icon, perm?}` vào `TABS[]` ([router.js](js/router.js:25)).
4. Thêm side-effect `import './modules/<tab>/<tab>.ui.js'` vào [app.js](js/app.js).
5. Nếu kho mới: thêm vào `STORE` ([db.js](js/core/db.js:35)); nếu lọc theo năm → thêm vào `DATE_FIELD` ([year.js](js/utils/year.js:21)) (sync tự nhận YEAR_STORE).

**Cách test (không có test tự động):** preview server "static" cổng 5500, import động module với `?v=Date.now()` để bust cache ES module, seed → kiểm → backup/restore IndexedDB về sạch. Hoặc dùng `test.html`. Luôn xác minh **0 lỗi console** + **DB khôi phục sạch**.

## 12. Cạm bẫy đã biết (gotchas)

- **ES module cache theo URL:** sau khi sửa file, bản import không-query bị HTTP-cache cũ. Test phải `import('...?v=Date.now()')`. Sửa `firebase.js`/file được engine import thẳng → cần **HARD reload** (cả đồ thị module nạp lại config mới).
- **Hai instance module = 2 cache RAM riêng:** seed qua import động `?v=` thì app gốc KHÔNG thấy — phải RELOAD để app đọc lại từ IndexedDB.
- **`categories` & `contracts` KHÔNG phải mảng** — `load()` mặc định trả `[]`, phải truyền `fallback={}`. Sync 2 kho này có nhánh riêng (đừng `mergeById` thẳng → vỡ `.forEach`).
- **Ngày tháng:** dùng ISO local (`sundayISO`...), KHÔNG `toISOString()` (lệch múi giờ → sai tuần).
- **`<select>` lọc fire sự kiện `input`** chứ không phải `change` trong code này.
- **Bộ lọc tính lại KPI/tổng theo TẬP ĐANG LỌC** (search) ở nhiều màn — sửa logic lọc nhớ cập nhật cả KPI + chân bảng.
- **debtBefore (chấm công) đóng băng lúc lưu** — bản sao qua `cloneWorker` KHÔNG copy debtBefore (form hiện live); khi xuất CSV phải inject lại `calcDebtBefore(...)`.
- **Hóa đơn NCC supplier rỗng KHÔNG vào công nợ** (coi là chi phí lẻ).
- **Security Rules đang chờ user bật trong Console** — sync hiện chạy nhờ rule test-mode / API key public; chưa khóa theo tài khoản.
```
