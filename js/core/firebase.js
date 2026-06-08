// ============================================================================
//  core/firebase.js  —  TẦNG HẠ TẦNG (Layer 1): Cầu nối Firestore qua REST
// ----------------------------------------------------------------------------
//  NHIỆM VỤ CỦA FILE NÀY (chỉ lo "đường ống" lên mây, CHƯA lo logic đồng bộ):
//   1. Giữ CẤU HÌNH Firebase (apiKey, projectId...) ở một chỗ duy nhất.
//   2. Gọi Firestore bằng REST (fetch) — KHÔNG dùng Firebase SDK nặng nề.
//        - cloudGet(docPath)          : ĐỌC 1 document trên mây → trả về object JS thuần.
//        - cloudSet(docPath, payload) : GHI ĐÈ 1 document trên mây bằng object JS thuần.
//   3. Dịch qua lại giữa "object JS thường" và "định dạng kỳ quặc của Firestore":
//        - toFirestore(obj)   : JS  ➜ Firestore (để GỬI lên).
//        - fromFirestore(doc) : Firestore ➜ JS (để ĐỌC về).
//   4. Đếm QUOTA (số lần đọc/ghi trong ngày) để cảnh báo sớm trước khi đụng trần
//      gói miễn phí Spark (50.000 read / 20.000 write mỗi ngày).
//   5. Tạo nhanh đường dẫn document chuẩn: docYearCat(năm, kho) và docMeta(tên).
//
//  KIẾN TRÚC (đã chốt — xem doc 10 & 11):
//   - IndexedDB là cache nhanh; CLOUD là nguồn chuẩn. Logic gộp LWW/tombstone nằm
//     ở core/sync.js (P4) — file này chỉ là lớp truyền tải thô.
//   - Sharding theo năm: 1 document / kho / năm, cộng vài document "meta" dùng chung.
//
//  ⚠️ CHƯA CÓ CẤU HÌNH: phần FIREBASE_CONFIG bên dưới đang ĐỂ TRỐNG.
//     App vẫn chạy OFFLINE đầy đủ. Khi nào anh dán config thật vào là sync bật được.
//     Nhớ BẬT Firestore Security Rules (không để public) để khỏi lộ key → mất quota.
// ============================================================================

// ----------------------------------------------------------------------------
//  1) CẤU HÌNH FIREBASE  —  ANH ĐIỀN VÀO ĐÂY SAU.
//  Lấy ở: Firebase Console → Project settings → mục "Your apps" → SDK config.
//  Chỉ cần 2 dòng apiKey + projectId là REST chạy được; authDomain để dành cho auth.
// ----------------------------------------------------------------------------
export const FIREBASE_CONFIG = {
  apiKey:     'AIzaSyBXkftHJHQLOilL-EVgyPq6NNl3UiIeaUg',
  projectId:  'qlcp-renew',
  authDomain: 'qlcp-renew.firebaseapp.com',
};

// Tên collection gốc chứa toàn bộ document của app trên Firestore (xem sơ đồ doc 10).
const ROOT_COLLECTION = 'cpct_data';

// ----------------------------------------------------------------------------
//  2) TOKEN ĐĂNG NHẬP — phục vụ Security Rules "phải đăng nhập mới được đọc/ghi".
//  App dùng auth RIÊNG (kho users), KHÔNG phải Firebase Auth → muốn khóa Rules theo
//  `request.auth != null` thì phải có 1 token Firebase. Cách nhẹ nhất: ĐĂNG NHẬP ẨN
//  DANH (Anonymous Auth) qua REST → lấy idToken gắn vào mọi request.
//
//  ensureAuth() tự lo: lần đầu signUp ẩn danh (giữ refreshToken trong localStorage để
//  lần sau dùng lại, khỏi tạo tài khoản ẩn danh mới), token gần hết hạn thì làm mới.
//  FAIL-SOFT: nếu Anonymous Auth CHƯA bật trong Console (hoặc lỗi mạng) → đi tiếp
//  KHÔNG token (app vẫn chạy như cũ với rule mở). Chỉ khi user đã (1) bật Anonymous
//  Auth + (2) deploy firestore.rules yêu cầu auth thì lớp này mới thành "khóa" thật.
//
//  setAuthToken(idToken): vẫn giữ cho tầng khác gắn token thủ công nếu cần.
// ----------------------------------------------------------------------------
const AUTH_REFRESH_KEY = 'cpct_fb_refresh';   // khóa lưu refreshToken trong localStorage
let _idToken      = null;     // idToken hiện hành (gắn vào header Authorization)
let _idTokenExp   = 0;        // mốc hết hạn (ms) — làm mới trước 60s
let _authDisabled = false;    // true khi Console CHƯA bật Anonymous Auth → thôi thử lại
let _authPromise  = null;     // khóa chống gọi đăng nhập song song nhiều lần

export function setAuthToken(idToken) {
  _idToken = idToken || null;
}

// Lưu/đọc refreshToken (bền qua các phiên) — bọc try/catch phòng localStorage bị chặn.
function _loadRefresh() {
  try { return localStorage.getItem(AUTH_REFRESH_KEY) || null; } catch { return null; }
}
function _saveRefresh(t) {
  try { if (t) localStorage.setItem(AUTH_REFRESH_KEY, t); } catch { /* bỏ qua */ }
}

// Ghi nhận bộ token mới (từ signUp hoặc refresh).
function _applyTokens(idToken, refreshToken, expiresInSec) {
  _idToken = idToken || null;
  _idTokenExp = Date.now() + (Number(expiresInSec) || 3600) * 1000;
  if (refreshToken) _saveRefresh(refreshToken);
}

// Đăng nhập ẨN DANH lần đầu (identitytoolkit accounts:signUp).
async function _signUpAnon() {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Console chưa bật Anonymous Auth → đánh dấu để khỏi thử lại cả phiên.
    if (res.status === 400 && /OPERATION_NOT_ALLOWED|ADMIN_ONLY_OPERATION/.test(detail)) {
      _authDisabled = true;
      console.warn('[firebase] Anonymous Auth CHƯA bật trong Console — chạy không token (rule phải đang mở).');
    }
    throw new Error(`signUp HTTP ${res.status}`);
  }
  const j = await res.json();
  _applyTokens(j.idToken, j.refreshToken, j.expiresIn);
}

// Làm mới idToken từ refreshToken (securetoken token endpoint).
async function _refreshIdToken(refreshToken) {
  const url = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  if (!res.ok) throw new Error(`refresh HTTP ${res.status}`);
  const j = await res.json();
  _applyTokens(j.id_token, j.refresh_token, j.expires_in);
}

// ensureAuth() — Bảo đảm có idToken còn hạn (nếu Anonymous Auth bật). FAIL-SOFT:
//  mọi lỗi → trả token hiện có (có thể null) để cloudGet/cloudSet vẫn chạy.
export async function ensureAuth() {
  if (!fbReady() || _authDisabled) return _idToken;
  if (_idToken && Date.now() < _idTokenExp - 60000) return _idToken;  // còn hạn
  if (_authPromise) return _authPromise;                              // đang lấy → chờ chung

  _authPromise = (async () => {
    try {
      const rt = _loadRefresh();
      if (rt) await _refreshIdToken(rt);   // có refreshToken cũ → làm mới
      else await _signUpAnon();            // chưa có → đăng nhập ẩn danh lần đầu
    } catch {
      // refresh hỏng (token bị thu hồi…) → thử signUp lại 1 lần; vẫn lỗi thì fail-soft.
      try { if (!_authDisabled) await _signUpAnon(); } catch { /* đi tiếp không token */ }
    }
    return _idToken;
  })();

  try { return await _authPromise; } finally { _authPromise = null; }
}

// ----------------------------------------------------------------------------
//  fbReady() — Đã đủ cấu hình để gọi mây chưa? (true/false)
//  sync.js LUÔN hỏi hàm này trước khi push/pull. Chưa điền config → false → app
//  chạy offline, không cố gọi mạng (tránh văng lỗi đỏ console).
// ----------------------------------------------------------------------------
export function fbReady() {
  return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}

// ----------------------------------------------------------------------------
//  3) ĐẾM QUOTA  —  Theo dõi số lần đọc/ghi trong NGÀY để cảnh báo sớm.
//  Lưu trong localStorage theo ngày; sang ngày mới tự đặt lại về 0.
//  Mục tiêu: thấy trước khi chạm trần Spark (đọc 50K / ghi 20K mỗi ngày).
// ----------------------------------------------------------------------------
const QUOTA_KEY    = 'cpct_quota';   // khóa lưu trong localStorage
const READ_LIMIT   = 50000;          // trần đọc/ngày của gói Spark
const WRITE_LIMIT  = 20000;          // trần ghi/ngày của gói Spark
const WARN_RATIO   = 0.8;            // chạm 80% trần thì cảnh báo console

// Chuỗi ngày hôm nay dạng 'YYYY-MM-DD' (mốc để reset bộ đếm mỗi ngày).
function _today() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Đọc bộ đếm hiện tại; nếu khác ngày (hoặc chưa có) thì khởi tạo lại từ 0.
function _loadQuota() {
  let q = null;
  try { q = JSON.parse(localStorage.getItem(QUOTA_KEY) || 'null'); } catch { q = null; }
  if (!q || q.date !== _today()) q = { date: _today(), reads: 0, writes: 0 };
  return q;
}

// getQuota() — Trả về tình hình quota hôm nay (để màn hình sync hiển thị nếu cần).
export function getQuota() {
  const q = _loadQuota();
  return { ...q, readLimit: READ_LIMIT, writeLimit: WRITE_LIMIT };
}

// Tăng bộ đếm sau mỗi lần gọi mây thành công; chạm ngưỡng 80% thì cảnh báo.
function _bumpQuota(kind /* 'read' | 'write' */) {
  const q = _loadQuota();
  if (kind === 'read')  q.reads  += 1;
  if (kind === 'write') q.writes += 1;
  try { localStorage.setItem(QUOTA_KEY, JSON.stringify(q)); } catch { /* hết chỗ lưu → bỏ qua */ }

  if (q.reads === Math.floor(READ_LIMIT * WARN_RATIO)) {
    console.warn(`[firebase] ĐỌC đã dùng ${q.reads}/${READ_LIMIT} hôm nay (≥80% trần Spark).`);
  }
  if (q.writes === Math.floor(WRITE_LIMIT * WARN_RATIO)) {
    console.warn(`[firebase] GHI đã dùng ${q.writes}/${WRITE_LIMIT} hôm nay (≥80% trần Spark).`);
  }
}

// ----------------------------------------------------------------------------
//  4) ĐƯỜNG DẪN DOCUMENT CHUẨN  —  để gọi nơi khác khỏi gõ chuỗi tay (tránh sai).
//   - docYearCat(2026, 'invoices') ➜ 'cpct_data/y2026_invoices'  (kho có sharding theo năm)
//   - docMeta('projects')          ➜ 'cpct_data/meta_projects'   (kho nền dùng chung)
// ----------------------------------------------------------------------------
export function docYearCat(year, cat) {
  return `${ROOT_COLLECTION}/y${year}_${cat}`;
}

export function docMeta(name) {
  return `${ROOT_COLLECTION}/meta_${name}`;
}

// URL REST đầy đủ tới 1 document, đã kèm ?key= API key.
function _docUrl(docPath) {
  const base = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
  return `${base}/${docPath}?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`;
}

// Header chung: kèm token đăng nhập nếu đã có (cho Security Rules theo tài khoản).
function _headers() {
  const h = { 'Content-Type': 'application/json' };
  if (_idToken) h.Authorization = `Bearer ${_idToken}`;
  return h;
}

// ----------------------------------------------------------------------------
//  5) DỊCH OBJECT JS  ➜  ĐỊNH DẠNG FIRESTORE  (toFirestore)
//  Firestore không nhận thẳng {a:1}; phải bọc kiểu từng giá trị, ví dụ:
//     1500000   ➜ { integerValue: "1500000" }   (số nguyên gửi DƯỚI DẠNG CHUỖI)
//     1.5       ➜ { doubleValue: 1.5 }
//     "abc"     ➜ { stringValue: "abc" }
//     true      ➜ { booleanValue: true }
//     null      ➜ { nullValue: null }
//     [ ... ]   ➜ { arrayValue: { values: [ ... ] } }
//     { ... }   ➜ { mapValue:   { fields: { ... } } }
//  Hàm _wrapValue lo 1 giá trị; toFirestore lo cả object cấp ngoài cùng (trả {fields}).
// ----------------------------------------------------------------------------
function _wrapValue(v) {
  if (v === null || v === undefined) return { nullValue: null };

  const t = typeof v;
  if (t === 'boolean') return { booleanValue: v };
  if (t === 'string')  return { stringValue: v };
  if (t === 'number') {
    if (!Number.isFinite(v)) return { nullValue: null };          // NaN/Infinity → null cho an toàn
    return Number.isInteger(v)
      ? { integerValue: String(v) }                              // số nguyên: Firestore yêu cầu chuỗi
      : { doubleValue: v };                                      // số lẻ: để nguyên
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(_wrapValue) } };
  }
  if (t === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = _wrapValue(val);
    return { mapValue: { fields } };
  }
  // Kiểu lạ (function, symbol...) — không nên xảy ra với dữ liệu app → coi như null.
  return { nullValue: null };
}

export function toFirestore(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj || {})) fields[k] = _wrapValue(v);
  return { fields };
}

// ----------------------------------------------------------------------------
//  6) DỊCH ĐỊNH DẠNG FIRESTORE  ➜  OBJECT JS  (fromFirestore) — chiều ngược lại.
//  Nhận nguyên document REST trả về ({ name, fields, ... }) → object JS thuần.
//  Document không có field nào (rỗng) → trả {} cho gọn.
// ----------------------------------------------------------------------------
function _unwrapValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue'    in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('stringValue'  in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);   // chuỗi → số
  if ('doubleValue'  in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;        // giữ nguyên chuỗi ISO (app không dùng kiểu này)
  if ('arrayValue'   in v) return (v.arrayValue.values || []).map(_unwrapValue);
  if ('mapValue'     in v) {
    const out = {};
    const f = v.mapValue.fields || {};
    for (const [k, val] of Object.entries(f)) out[k] = _unwrapValue(val);
    return out;
  }
  return null; // kiểu Firestore khác (geoPoint, reference...) — app không dùng
}

export function fromFirestore(doc) {
  const out = {};
  const f = (doc && doc.fields) || {};
  for (const [k, v] of Object.entries(f)) out[k] = _unwrapValue(v);
  return out;
}

// ----------------------------------------------------------------------------
//  7) cloudGet(docPath) — ĐỌC 1 document trên mây.
//  Trả về:
//     - object JS thuần         nếu document tồn tại,
//     - null                    nếu document CHƯA tồn tại (HTTP 404 — bình thường khi mới tạo),
//  Ném lỗi nếu chưa cấu hình hoặc gặp lỗi mạng/HTTP khác (để sync.js biết mà báo đỏ).
// ----------------------------------------------------------------------------
export async function cloudGet(docPath) {
  if (!fbReady()) throw new Error('[firebase] Chưa có cấu hình (apiKey/projectId) — không thể đọc mây.');

  await ensureAuth();   // gắn idToken (nếu Anonymous Auth bật) — fail-soft nếu chưa bật
  const res = await fetch(_docUrl(docPath), { method: 'GET', headers: _headers() });
  _bumpQuota('read');

  if (res.status === 404) return null;                 // document chưa có → coi như rỗng
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`[firebase] Lỗi đọc ${docPath}: HTTP ${res.status} ${detail}`);
  }
  const doc = await res.json();
  return fromFirestore(doc);
}

// ----------------------------------------------------------------------------
//  8) cloudSet(docPath, payload) — GHI ĐÈ 1 document trên mây bằng object JS thuần.
//  Dùng PATCH (Firestore: PATCH không kèm updateMask = thay TOÀN BỘ document) → khớp
//  triết lý "đọc-gộp-ghi" của sync (đã gộp LWW ở local rồi mới ghi đè cả cục).
//  Trả về object JS vừa ghi (đọc lại từ phản hồi) để tiện kiểm chứng.
// ----------------------------------------------------------------------------
export async function cloudSet(docPath, payload) {
  if (!fbReady()) throw new Error('[firebase] Chưa có cấu hình (apiKey/projectId) — không thể ghi mây.');

  await ensureAuth();   // gắn idToken (nếu Anonymous Auth bật) — fail-soft nếu chưa bật
  const body = JSON.stringify(toFirestore(payload));
  const res = await fetch(_docUrl(docPath), { method: 'PATCH', headers: _headers(), body });
  _bumpQuota('write');

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`[firebase] Lỗi ghi ${docPath}: HTTP ${res.status} ${detail}`);
  }
  const doc = await res.json();
  return fromFirestore(doc);
}
