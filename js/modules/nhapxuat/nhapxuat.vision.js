// ============================================================================
//  modules/nhapxuat/nhapxuat.vision.js  —  TẦNG TỔNG HỢP (Layer 7): Nhập VISION
// ----------------------------------------------------------------------------
//  @module nhapxuat.vision
//
//  NHIỆM VỤ: Nạp file SAO LƯU SCHEMA CŨ (bản "Vision", meta.version ~4) vào app
//  schema MỚI để KIỂM THỬ — xem dữ liệu thật có hiển thị đúng & chạy mượt không.
//
//  Khác nhapxuat.import (chỉ đọc file do CHÍNH app này xuất, cùng schema, GỘP theo
//  id), file Vision đổi cả TÊN KHO lẫn TÊN FIELD nên cần BỘ CHUYỂN ĐỔI:
//    • Kho:  inv_v3→invoices · cc_v2→timesheets · tb_v1→equipment · ung_v1→advances
//            thu_v1→receipts · projects_v1→projects
//    • Field (vd hóa đơn): ngay→date · loai→category · ncc→supplier · nguoi→performer
//            tien/thanhtien→amount · nd→note
//    • Danh mục: cat_* (MẢNG CHUỖI) → document { nhóm:[{id,name}] }
//
//  ÁP DỤNG = GHI ĐÈ (replace) toàn bộ kho nghiệp vụ + danh mục, GIỮ NGUYÊN `users`
//  (không xóa tài khoản đăng nhập). UI tự chụp 1 ảnh sao lưu TRƯỚC khi đè để hoàn tác.
//
//  CHUYỂN ĐỔI KHÔNG MẤT MÁT về mặt khóa hệ thống: giữ nguyên id/createdAt/updatedAt/
//  deletedAt/deviceId của bản ghi cũ (đồng bộ LWW + xóa-mềm vẫn đúng).
// ============================================================================

import { STORE } from '../../core/db.js';
import { save } from '../../core/store.js';
import { normalizeName, normalizeKey } from '../../utils/cat.js';

const WAREHOUSE_ID = 'COMPANY'; // Kho Tổng — trùng cost center COMPANY của Tab Công Trình

// num(x) — Ép số an toàn (chuỗi rỗng/sai → 0). Giữ thập phân (ngày công 0.5).
const num = (x) => Number(x) || 0;
// str(x) — Ép chuỗi đã trim.
const str = (x) => String(x ?? '').trim();

// sys(r) — Bê NGUYÊN 5 trường hệ thống từ bản ghi cũ (giữ id/mốc/xóa-mềm/thiết bị).
function sys(r) {
  return {
    id: r.id,
    createdAt: r.createdAt ?? Date.now(),
    updatedAt: r.updatedAt ?? r.createdAt ?? Date.now(),
    deletedAt: r.deletedAt ?? null,
    deviceId: r.deviceId ?? '',
  };
}

// normDays(d) — Mảng ngày công về đúng 7 phần tử số.
function normDays(d) {
  const out = [0, 0, 0, 0, 0, 0, 0];
  if (Array.isArray(d)) for (let i = 0; i < 7; i++) out[i] = num(d[i]);
  return out;
}

// ----------------------------------------------------------------------------
//  BẢNG TRA — giá trị enum cũ → mới.
// ----------------------------------------------------------------------------
// Tiền ứng: cũ có 3 loại nhưng schema MỚI chỉ có 2 (subcontractor/supplier).
//  'congnhan' (ứng công nhân) không có chỗ trong advances mới (app mới theo dõi
//  tạm ứng công nhân trong chấm công) → tạm xếp 'subcontractor' để vẫn hiện ra (gắn cờ).
const ADVANCE_TYPE_MAP = { thauphu: 'subcontractor', nhacungcap: 'supplier', congnhan: 'subcontractor' };

// Thu tiền: loaiThu cũ (tiếng Việt) → paymentType mới (advance/phase/settlement).
function mapPaymentType(loaiThu) {
  const k = normalizeKey(loaiThu);
  if (k.includes('tam ung') || k.includes('ung')) return 'advance';
  if (k.includes('quyet toan') || k.includes('tat toan')) return 'settlement';
  return 'phase'; // mặc định: thu theo giai đoạn
}

// Thiết bị: tinhtrang cũ lẫn lộn (có dòng là TEXT tình trạng, có dòng là GIÁ TIỀN).
const VALID_CONDITIONS = new Set(['active', 'maintenance', 'repair']);
function mapCondition(tinhtrang) {
  const raw = str(tinhtrang);
  if (VALID_CONDITIONS.has(raw)) return { condition: raw, leftover: '' };
  const k = normalizeKey(raw);
  if (k.includes('sua')) return { condition: 'repair', leftover: '' };
  if (k.includes('bao tri')) return { condition: 'maintenance', leftover: '' };
  if (k.includes('hoat dong')) return { condition: 'active', leftover: '' };
  // Không nhận ra (vd "530000" là giá tiền) → coi 'active', giữ lại giá trị gốc vào ghi chú.
  return { condition: 'active', leftover: raw && /\d/.test(raw) ? raw : '' };
}

// Công trình: status hợp lệ ở schema mới.
const VALID_STATUS = new Set(['planning', 'active', 'completed', 'closed']);
const VALID_PTYPE = new Set(['CT', 'SC', 'OTHER']);

// ----------------------------------------------------------------------------
//  CHUYỂN ĐỔI TỪNG BẢN GHI
// ----------------------------------------------------------------------------
function convInvoice(r) {
  const source = r.source === 'detail' ? 'detail' : 'quick';
  const out = {
    ...sys(r),
    date: str(r.ngay),
    projectId: r.projectId ?? null,
    category: str(r.loai),
    amount: num(r.thanhtien != null ? r.thanhtien : r.tien),
    note: str(r.nd),
    performer: str(r.nguoi),
    supplier: str(r.ncc),
    source,
  };
  if (source === 'detail') {
    out.items = Array.isArray(r.items) ? r.items : [];
    out.totalDiscount = r.totalDiscount || '';
  }
  return out;
}

function convWorker(w, rolesMap) {
  // Worker cũ trong chấm công KHÔNG có field role → tra từ cat_cn_roles (khóa = tên gốc).
  const role = rolesMap && rolesMap[w.name];
  return {
    name: str(w.name),
    role: (role === 'C' || role === 'T' || role === 'P') ? role : (str(w.role) || 'C'),
    wage: num(w.luong),
    days: normDays(w.d),
    allowance: num(w.phucap),
    retailInvoice: num(w.hdmuale),
    loanAmount: num(w.loanAmount),
    deduction: num(w.tru),
    note: str(w.nd),
    debtBefore: num(w.debtBefore),
  };
}

function convWeek(r, rolesMap) {
  return {
    ...sys(r),
    projectId: r.projectId ?? null,
    fromDate: str(r.fromDate),
    toDate: str(r.toDate),
    workers: (Array.isArray(r.workers) ? r.workers : []).map((w) => convWorker(w, rolesMap)),
  };
}

function convAdvance(r, stat) {
  if (r.loai === 'congnhan') stat.advanceWorker++;
  return {
    ...sys(r),
    date: str(r.ngay),
    type: ADVANCE_TYPE_MAP[r.loai] || 'subcontractor',
    partner: str(r.tp),
    projectId: r.projectId ?? null,
    amount: num(r.tien),
    note: str(r.nd),
  };
}

function convEquipment(r, stat) {
  const { condition, leftover } = mapCondition(r.tinhtrang);
  if (leftover) stat.equipPrice++;
  if (r.projectId == null) stat.equipNoProject++;
  const note = [str(r.ghichu), leftover ? `(giá trị cũ: ${leftover})` : ''].filter(Boolean).join(' ');
  return {
    ...sys(r),
    projectId: r.projectId ?? WAREHOUSE_ID,
    name: str(r.ten),
    quantity: num(r.soluong),
    condition,
    note,
    date: str(r.ngay),
  };
}

function convReceipt(r) {
  return {
    ...sys(r),
    projectId: r.projectId ?? null,
    amount: num(r.tien),
    // schema cũ phần lớn KHÔNG có loaiThu → suy ra từ nội dung (vd "Ứng…" → tạm ứng).
    paymentType: mapPaymentType(r.loaiThu || r.nd),
    performer: str(r.nguoi),
    note: str(r.nd),
    date: str(r.ngay),
  };
}

// convItem(it) — 1 dòng khối lượng HĐ: name giữ nguyên · donVi→unit · sl→quantity · donGia→unitPrice.
function convItem(it) {
  return {
    name: str(it.name),
    unit: str(it.donVi),
    quantity: num(it.sl),
    unitPrice: num(it.donGia),
  };
}

// convContract(projectId, r) — 1 HĐ chính cũ (hopdong_v1) → bản ghi map mới.
//  Cũ keyed theo projectId, KHÔNG có id → dùng chính projectId làm id (1 CT = 1 HĐ).
//  giaTri→value · giaTriphu→addonValue · phatSinh→extraValue · nguoi→performer · ngay→date.
function convContract(projectId, r) {
  return {
    id: r.id ?? projectId,
    createdAt: r.createdAt ?? Date.now(),
    updatedAt: r.updatedAt ?? r.createdAt ?? Date.now(),
    deletedAt: r.deletedAt ?? null,
    deviceId: r.deviceId ?? '',
    projectId,
    value: num(r.giaTri),
    addonValue: num(r.giaTriphu),
    extraValue: num(r.phatSinh),
    performer: str(r.nguoi),
    note: str(r.nd),
    date: str(r.ngay),
  };
}

// convSubcontract(r) — 1 HĐ thầu phụ cũ (thauphu_v1) → bản ghi mới.
//  thauphu→partner · giaTri→value (giữ nguyên giá đã chốt) · items đổi field · nd→note.
function convSubcontract(r) {
  const items = (Array.isArray(r.items) ? r.items : []).map(convItem).filter((it) => it.name);
  return {
    ...sys(r),
    projectId: r.projectId ?? null,
    partner: str(r.thauphu),
    value: num(r.giaTri),
    items,
    note: str(r.nd),
    date: str(r.ngay),
  };
}

function convProject(r) {
  return {
    ...sys(r),
    name: str(r.name),
    type: VALID_PTYPE.has(r.type) ? r.type : 'CT',
    status: VALID_STATUS.has(r.status) ? r.status : 'active',
    startDate: str(r.startDate),
    endDate: r.endDate || null,
    closedDate: r.closedDate || null,
    investor: str(r.chuDauTu),
    note: str(r.note),
  };
}

// ----------------------------------------------------------------------------
//  DANH MỤC — cat_* (mảng chuỗi) → 1 nhóm trong document, chuẩn hóa + chống trùng.
// ----------------------------------------------------------------------------
const CAT_MAP = {
  cat_loai: 'costType',
  cat_ncc: 'supplier',
  cat_nguoi: 'performer',
  cat_tp: 'subcontractor',
  cat_cn: 'worker',
  cat_tbteb: 'equipment',
  // cat_ct (tên công trình) KHÔNG phải nhóm danh mục → bỏ qua.
};

const VALID_ROLES = new Set(['C', 'T', 'P']);

function buildCatGroup(rawArr, group, rolesMap) {
  const out = [];
  const seen = new Set();
  for (const raw of (Array.isArray(rawArr) ? rawArr : [])) {
    const name = normalizeName(group, raw);
    if (!name) continue;
    const key = normalizeKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const item = { id: crypto.randomUUID(), name };
    if (group === 'worker') {
      // schema mới: công nhân có vai trò C/T/P. Lấy từ cat_cn_roles cũ (khóa = tên gốc), mặc định Chính.
      const role = rolesMap ? rolesMap[raw] : '';
      item.role = VALID_ROLES.has(role) ? role : 'C';
    }
    out.push(item);
  }
  return out;
}

function convCategories(data) {
  const now = Date.now();
  const doc = { createdAt: now, updatedAt: now, deletedAt: null, deviceId: '' };
  for (const k of ['costType', 'supplier', 'performer', 'subcontractor', 'worker', 'equipment']) doc[k] = [];
  const rolesMap = (data.cat_cn_roles && typeof data.cat_cn_roles === 'object') ? data.cat_cn_roles : {};
  for (const [oldKey, group] of Object.entries(CAT_MAP)) {
    doc[group] = buildCatGroup(data[oldKey], group, group === 'worker' ? rolesMap : null);
  }
  return doc;
}

// ----------------------------------------------------------------------------
//  parseVisionFile(file) — Đọc file → { meta, data } + KIỂM TRA đúng schema cũ.
//   Nhận diện bằng meta.version (số) HOẶC có ít nhất 1 khóa kho cũ (vd inv_v3).
// ----------------------------------------------------------------------------
const OLD_KEYS = ['inv_v3', 'cc_v2', 'tb_v1', 'ung_v1', 'thu_v1', 'projects_v1'];

export async function parseVisionFile(file) {
  if (!file) throw new Error('Chưa chọn file.');
  let text;
  try { text = await file.text(); } catch { throw new Error('Không đọc được nội dung file.'); }
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('File không phải JSON hợp lệ.'); }
  if (!obj || typeof obj !== 'object' || !obj.data || typeof obj.data !== 'object') {
    throw new Error('Cấu trúc file không đúng (thiếu "data").');
  }
  const hasOldKey = OLD_KEYS.some((k) => obj.data[k] != null);
  if (!hasOldKey) {
    throw new Error('Không nhận ra schema Vision (không thấy kho cũ kiểu inv_v3/cc_v2…). '
      + 'Nếu đây là file app hiện tại, hãy dùng mục “📥 Nhập từ file JSON”.');
  }
  return { meta: obj.meta || {}, data: obj.data };
}

// ----------------------------------------------------------------------------
//  convertVision(parsed) — Chuyển TOÀN BỘ sang schema mới + thống kê/cảnh báo.
//   Trả { stores:{...}, counts:{...}, warnings:[...] }.
//   stores: object sẵn sàng GHI ĐÈ (KHÔNG gồm users — cố ý giữ tài khoản local).
// ----------------------------------------------------------------------------
export function convertVision(parsed) {
  const data = parsed.data || {};
  const arr = (k) => (Array.isArray(data[k]) ? data[k] : []);
  const stat = { advanceWorker: 0, equipPrice: 0, equipNoProject: 0 };

  const rolesMap = (data.cat_cn_roles && typeof data.cat_cn_roles === 'object') ? data.cat_cn_roles : {};
  const projects = arr('projects_v1').map(convProject);
  const invoices = arr('inv_v3').map(convInvoice);
  const timesheets = arr('cc_v2').map((r) => convWeek(r, rolesMap));
  const advances = arr('ung_v1').map((r) => convAdvance(r, stat));
  const equipment = arr('tb_v1').map((r) => convEquipment(r, stat));
  const receipts = arr('thu_v1').map(convReceipt);
  const subcontracts = arr('thauphu_v1').map(convSubcontract);
  const categories = convCategories(data);

  // HĐ chính cũ (hopdong_v1) là ĐỐI TƯỢNG { projectId: record } → map mới cùng dạng.
  const rawHd = (data.hopdong_v1 && typeof data.hopdong_v1 === 'object') ? data.hopdong_v1 : {};
  const contracts = {};
  for (const [pid, rec] of Object.entries(rawHd)) {
    if (rec && typeof rec === 'object') contracts[pid] = convContract(pid, rec);
  }

  const stores = {
    [STORE.PROJECTS]: projects,
    [STORE.INVOICES]: invoices,
    [STORE.TIMESHEETS]: timesheets,
    [STORE.ADVANCES]: advances,
    [STORE.EQUIPMENT]: equipment,
    [STORE.RECEIPTS]: receipts,
    [STORE.CATEGORIES]: categories,
    [STORE.CONTRACTS]: contracts,
    [STORE.SUBCONTRACTS]: subcontracts,
  };

  const catCount = Object.values(CAT_MAP)
    .reduce((s, g) => s + (categories[g] ? categories[g].length : 0), 0);

  const counts = {
    projects: projects.length,
    contracts: Object.keys(contracts).length,
    subcontracts: subcontracts.length,
    invoices: invoices.length,
    timesheets: timesheets.length,
    advances: advances.length,
    equipment: equipment.length,
    receipts: receipts.length,
    categories: catCount,
  };

  const warnings = [];
  if (stat.advanceWorker) {
    warnings.push(`${stat.advanceWorker} khoản ứng “công nhân” (loại cũ không có ở schema mới) `
      + 'đã tạm xếp vào nhóm “Thầu phụ”.');
  }
  if (stat.equipPrice) {
    warnings.push(`${stat.equipPrice} dòng thiết bị có “tình trạng” là số tiền (schema cũ khác nghĩa) `
      + '→ đặt tình trạng “Đang hoạt động”, giữ giá trị gốc trong ghi chú.');
  }
  if (stat.equipNoProject) {
    warnings.push(`${stat.equipNoProject} dòng thiết bị không có công trình → xếp vào Kho Tổng.`);
  }
  warnings.push('Tài khoản đăng nhập KHÔNG có trong file Vision → được GIỮ NGUYÊN (không bị ghi đè).');

  return { stores, counts, warnings };
}

// ----------------------------------------------------------------------------
//  applyVisionImport(converted) — GHI ĐÈ các kho bằng dữ liệu đã chuyển (mỗi save
//  tự lên lịch đẩy đồng bộ). KHÔNG đụng STORE.USERS. Trả tổng số bản ghi đã nạp.
// ----------------------------------------------------------------------------
export async function applyVisionImport(converted) {
  const stores = converted.stores || {};
  for (const [name, value] of Object.entries(stores)) {
    await save(name, value);
  }
  return Object.values(converted.counts || {}).reduce((s, n) => s + n, 0);
}
