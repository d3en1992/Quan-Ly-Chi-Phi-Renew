// ============================================================================
//  core/db.js  —  TẦNG MÓNG (Layer 0): Lớp truy cập IndexedDB
// ----------------------------------------------------------------------------
//  NHIỆM VỤ CỦA FILE NÀY:
//   1. Định nghĩa TÊN các "kho dữ liệu" (STORE) dùng chung toàn app — đặt sạch,
//      tường minh, KHÔNG còn hậu tố cũ kiểu _v1/_v2/_v3.
//   2. Mở (hoặc tạo) cơ sở dữ liệu IndexedDB ngay trên trình duyệt để app chạy
//      được OFFLINE (không cần mạng).
//   3. Cung cấp 3 hàm cơ bản nhất: đọc (idbGet), ghi (idbSet), xóa (idbDelete).
//   4. Tạo & ghi nhớ DEVICE_ID (mã thiết bị) phục vụ đồng bộ LWW ở các tầng sau.
//
//  CÁCH LƯU DỮ LIỆU (quan trọng, dễ hiểu):
//   - Ta dùng IndexedDB như một "tủ khóa key-value": mỗi STORE là 1 chiếc CHÌA
//     (key), giá trị đi kèm là CẢ MẢNG/ĐỐI TƯỢNG dữ liệu của kho đó (1 cục blob).
//   - Ví dụ: idbGet('invoices') trả về toàn bộ mảng hóa đơn; idbSet('invoices', [...])
//     ghi đè lại toàn bộ mảng đó. Việc lọc theo năm/công trình sẽ làm ở tầng trên.
//   - Cách này đơn giản, khớp luồng load()/save() mà các tab đang thiết kế.
//
//  GHI CHÚ KỸ THUẬT: File dùng ES Module (export/import) nên PHẢI mở qua HTTP
//  (ví dụ Live Server của VS Code), KHÔNG mở trực tiếp bằng đường dẫn file://.
// ============================================================================

// --- Tên & phiên bản cơ sở dữ liệu IndexedDB (đặt sạch, không hậu tố version) ---
const DB_NAME = 'cpct_db';      // cpct = Chi Phí Công Trình
const DB_VERSION = 1;           // tăng số này mỗi khi đổi cấu trúc store (nâng cấp DB)

// Tên của MỘT object store kiểu key-value duy nhất bên trong DB.
// Mọi STORE bên dưới chỉ là các "key" nằm trong store này.
const KV_STORE = 'kv';

// ----------------------------------------------------------------------------
//  DANH SÁCH 10 KHO DỮ LIỆU — nguồn sự thật duy nhất về tên store toàn app.
//  Mọi nơi khác PHẢI tham chiếu qua STORE.XXX (không gõ chuỗi tay) để tránh sai chính tả.
// ----------------------------------------------------------------------------
export const STORE = {
  PROJECTS:     'projects',     // Tab 01 — Công trình (dữ liệu nền, các tab khác "vin" vào)
  INVOICES:     'invoices',     // Tab 02/03 — Hóa đơn / chi phí vật tư
  TIMESHEETS:   'timesheets',   // Tab 04 — Chấm công (lưu theo từng tuần)
  ADVANCES:     'advances',     // Tab 05 — Tiền ứng (thầu phụ + nhà cung cấp)
  EQUIPMENT:    'equipment',    // Tab 06 — Thiết bị (tồn kho + nhật ký luân chuyển)
  CATEGORIES:   'categories',   // Tab 07 — Danh mục dùng chung (NCC, công nhân, loại CP...)
  CONTRACTS:    'contracts',    // Tab 08 — Hợp đồng chính (1 công trình = 1 hợp đồng)
  SUBCONTRACTS: 'subcontracts', // Tab 08 — Hợp đồng thầu phụ (nhiều dòng/CT)
  RECEIPTS:     'receipts',     // Tab 08 — Các đợt thu tiền (doanh thu thực nhận)
  USERS:        'users',        // Đăng nhập — danh sách tài khoản + phân quyền
};

// ----------------------------------------------------------------------------
//  DEVICE_ID — Mã định danh CHIẾC MÁY này.
//  Dùng cho đồng bộ LWW (Last-Write-Win): khi 2 máy cùng sửa 1 bản ghi, ta biết
//  bản ghi mới nhất do máy nào tạo ra. Lưu vĩnh viễn trong localStorage để mã
//  KHÔNG đổi giữa các lần mở app trên cùng máy.
// ----------------------------------------------------------------------------
export const DEVICE_ID = (() => {
  const KEY = 'cpct_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {                       // lần đầu chạy trên máy này → tạo mã mới
    id = crypto.randomUUID();      // ví dụ: "3f2a...-...-..." (chuẩn UUID v4)
    localStorage.setItem(KEY, id); // ghi nhớ để lần sau dùng lại
  }
  return id;
})();

// ----------------------------------------------------------------------------
//  openDB() — Mở (hoặc tạo lần đầu) cơ sở dữ liệu. Trả về Promise<IDBDatabase>.
//  Chỉ mở MỘT lần rồi dùng lại (cache trong biến _dbPromise) để tránh mở trùng.
// ----------------------------------------------------------------------------
let _dbPromise = null; // bộ nhớ đệm: giữ promise mở DB sau lần gọi đầu tiên

export function openDB() {
  if (_dbPromise) return _dbPromise; // đã mở rồi → trả lại ngay, không mở lại

  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    // Chạy khi DB chưa tồn tại HOẶC khi DB_VERSION tăng lên → cần tạo/nâng cấp cấu trúc.
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      // Nếu chưa có store key-value thì tạo mới. Để key nằm NGOÀI giá trị
      // (out-of-line) nên khi ghi ta truyền key riêng: put(value, key).
      if (!database.objectStoreNames.contains(KV_STORE)) {
        database.createObjectStore(KV_STORE);
      }
    };

    req.onsuccess = () => resolve(req.result);   // mở thành công → trả handle DB
    req.onerror   = () => reject(req.error);      // lỗi (vd: trình duyệt chặn IndexedDB)
  });

  return _dbPromise;
}

// ----------------------------------------------------------------------------
//  idbGet(key) — Đọc nguyên cục dữ liệu của 1 kho theo key.
//  Trả về: dữ liệu đã lưu, hoặc null nếu kho đó chưa có gì.
// ----------------------------------------------------------------------------
export async function idbGet(key) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = database.transaction(KV_STORE, 'readonly'); // mở giao dịch chỉ-đọc
    const req = tx.objectStore(KV_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);       // không có → null
    req.onerror   = () => reject(req.error);
  });
}

// ----------------------------------------------------------------------------
//  idbSet(key, value) — Ghi ĐÈ nguyên cục dữ liệu của 1 kho theo key.
//  Trả về: true khi ghi xong.
// ----------------------------------------------------------------------------
export async function idbSet(key, value) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(KV_STORE, 'readwrite'); // mở giao dịch đọc-ghi
    tx.objectStore(KV_STORE).put(value, key);               // put(giá trị, key)
    tx.oncomplete = () => resolve(true);                    // giao dịch hoàn tất
    tx.onerror    = () => reject(tx.error);
  });
}

// ----------------------------------------------------------------------------
//  idbDelete(key) — Xóa HẲN 1 kho khỏi DB (ít dùng).
//  Lưu ý: trong app, xóa bản ghi thường là XÓA MỀM (đặt deletedAt) ở tầng trên,
//  không xóa cứng bằng hàm này.
// ----------------------------------------------------------------------------
export async function idbDelete(key) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(KV_STORE, 'readwrite');
    tx.objectStore(KV_STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => reject(tx.error);
  });
}

// ----------------------------------------------------------------------------
//  db — Tham chiếu tới promise mở DB.
//  Mục đích: tiện gõ trong Console (F12) để KIỂM TRA nhanh là DB mở được
//  (theo Phiếu Test P1). Ví dụ:  await db  → trả về đối tượng IDBDatabase.
// ----------------------------------------------------------------------------
export const db = openDB();
