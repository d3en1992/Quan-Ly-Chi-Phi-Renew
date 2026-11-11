// Chuyển snapshot JSON của app cũ → các dòng cho bảng mới (hàm THUẦN: không gọi mạng, không đọc file).
// Cùng một snapshot luôn cho cùng kết quả (id sinh cố định) → chạy lại bao nhiêu lần cũng như nhau.
// Quy tắc nghiệp vụ chép từ app cũ (../ban-dang-dung), ghi rõ hàm gốc ở từng đoạn.
import { createHash } from 'node:crypto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type L = Record<string, any>; // bản ghi app cũ (không có kiểu)
export type Row = Record<string, unknown>;

export const TABLE_ORDER = [
  'customers', 'workers', 'subcontractors', 'suppliers', 'contact_private', 'catalog_items', 'projects',
  'expenses', 'expense_lines', 'timesheet_weeks', 'timesheet_lines', 'wage_advances',
  'main_contracts', 'subcontracts', 'settlements', 'receipts',
  'payable_closures', 'payments', 'payment_allocations', 'equipment', 'cost_allocations',
] as const;
export type TableName = (typeof TABLE_ORDER)[number];

export interface Dropped { store: string; id: string; label: string; reason: string; /** bản ghi còn sống (chưa xóa) ở app cũ */ alive: boolean }
export interface LegacyCount { total: number; alive: number; softDeleted: number; purged: number }
export interface TransformOptions {
  companyId: string;
  /** Tên Người TH cũ → id tài khoản mới: 'TÌNH' → tinh, 'KS LAM' → lam, 'GIÁM ĐỐC' → chay */
  userIdByLegacyName: Record<string, string | null | undefined>;
}
export interface TransformResult {
  tables: Record<TableName, Row[]>;
  dropped: Dropped[];
  notes: string[];
  legacy: Record<string, LegacyCount>;
  /** Số bản ghi cũ đi vào từng bảng mới (để so với kho mới) */
  routed: Record<string, number>;
  /** Tổng tiền bản ghi CÒN SỐNG của app cũ (để so với kho mới) */
  legacySums: Record<string, number>;
  creditSuppliers: string[];
  exportedAt: string;
}

// ── id cố định ──────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid5(key: string): string {
  const h = createHash('sha1').update('qlcp-legacy-v1:' + key).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
/** Giữ nguyên id cũ nếu là UUID (để tham chiếu cũ trong tỉ trọng, so-chuan.json vẫn khớp); không thì sinh id cố định. */
const asId = (store: string, id: unknown): string =>
  typeof id === 'string' && UUID_RE.test(id) ? id.toLowerCase() : uuid5(`${store}:${String(id)}`);

// ── Hàm chép từ app cũ ──────────────────────────────────────────────
/** projects.model.js `_normProjName`: bỏ dấu, chữ thường, gộp khoảng trắng */
export const normProjName = (s: unknown): string =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** core.cloud-cats-ui.js `_catNormKey` */
export const catNormKey = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

export type CatType = 'loai' | 'ncc' | 'nguoi' | 'tp' | 'cn' | 'tbteb';
/** core.cloud-cats-ui.js `normalizeCatDisplayName`: loai / tbteb → Viết Hoa Chữ Đầu; còn lại → IN HOA */
export function normalizeCatDisplayName(type: CatType, name: unknown): string {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!n) return n;
  if (type === 'loai' || type === 'tbteb') {
    return n.toLowerCase().split(' ').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return n.toUpperCase();
}

/** projects.ui.js `ctDetectLoai` + `ctLoaiOf`: ưu tiên loaiCongTrinh, không có thì đọc tiền tố tên */
const CT_LOAI_RE = /^\s*\[?\s*(CT|SC|SN)\s*\]?(?![a-zà-ỹ])/i;
export function projectKindOf(p: L): 'new_build' | 'renovation' | 'small_repair' {
  const m = String(p.name ?? '').match(CT_LOAI_RE);
  const code = String(p.loaiCongTrinh || (m ? m[1]!.toUpperCase() : 'Khác')).toUpperCase();
  return code === 'CT' ? 'new_build' : code === 'SC' ? 'renovation' : 'small_repair';
}

/** sync.js `_safeTs` (mốc 2020-01-01) — dùng khi so bản mới / cũ của chấm công */
const TS_EPOCH = 1577836800000;
const safeTs = (ts: unknown, now: number): number => {
  const n = typeof ts === 'number' ? ts : parseInt(String(ts), 10) || 0;
  if (n < TS_EPOCH) return 0;
  if (n > now + 86400000) return now;
  return n;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: unknown): s is string => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const money = (v: unknown): number => Math.round(num(v));
const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s ? s : null;
};

const KHO_TB = 'KHO THIẾT BỊ CÔNG TY';
const KHO_GG = 'KHO VẬT TƯ GIÀN GIÁO';
const COMPANY_NAMES = new Set(['CÔNG TY', 'KHO TỔNG', KHO_TB, KHO_GG]);

export function transformSnapshot(snapshot: L, opts: TransformOptions): TransformResult {
  const d: L = snapshot.data ?? snapshot;
  const exportedMs: number = num(snapshot.meta?.exportedAt) || Date.UTC(2026, 10, 2);
  const companyId = opts.companyId;
  const dropped: Dropped[] = [];
  const notes: string[] = [];
  const routed: Record<string, number> = {};
  const legacy: Record<string, LegacyCount> = {};
  const tables = Object.fromEntries(TABLE_ORDER.map((t) => [t, [] as Row[]])) as Record<TableName, Row[]>;
  const route = (key: string, n = 1) => { routed[key] = (routed[key] ?? 0) + n; };
  const drop = (store: string, r: L, label: string, reason: string) =>
    dropped.push({ store, id: String(r?.id ?? ''), label, reason, alive: !!r && !r.purgedAt && !r.deletedAt && r.cancelled !== true });

  const iso = (ms: unknown, fallback: number = exportedMs): string => {
    const n = typeof ms === 'number' && Number.isFinite(ms) && ms > Date.UTC(2015, 0, 1) ? ms : fallback;
    return new Date(n).toISOString();
  };
  const isPurged = (r: L) => !!r?.purgedAt;
  const isDeleted = (r: L) => !!r?.deletedAt || r?.cancelled === true; // tienung.core.js: cancelled = đã xóa
  const deletedAt = (r: L): string | null =>
    isDeleted(r) ? iso(typeof r.deletedAt === 'number' ? r.deletedAt : r.updatedAt, num(r.updatedAt) || exportedMs) : null;
  const userOf = (name: unknown): string | null => opts.userIdByLegacyName[String(name ?? '').trim().toUpperCase()] ?? null;
  const base = (id: string, r: L, createdBy: string | null = null): Row => ({
    id,
    company_id: companyId,
    created_at: iso(r.createdAt ?? r.updatedAt),
    updated_at: iso(r.updatedAt ?? r.createdAt),
    deleted_at: deletedAt(r),
    created_by: createdBy,
  });
  const arr = (key: string): L[] => (Array.isArray(d[key]) ? (d[key] as L[]).filter((r) => r && typeof r === 'object') : []);
  const countStore = (key: string, list: L[]) => {
    legacy[key] = {
      total: list.length,
      alive: list.filter((r) => !isPurged(r) && !isDeleted(r)).length,
      softDeleted: list.filter((r) => !isPurged(r) && isDeleted(r)).length,
      purged: list.filter(isPurged).length,
    };
  };
  /** Bỏ bia mộ (đã xóa vĩnh viễn ở app cũ) + bản trùng id. Trả về các bản ghi còn dùng. */
  const usable = (key: string, label: (r: L) => string): L[] => {
    const list = arr(key);
    countStore(key, list);
    const seen = new Set<string>();
    return list.filter((r) => {
      if (isPurged(r)) { drop(key, r, label(r), 'Bia mộ: đã xóa vĩnh viễn ở app cũ'); return false; }
      const id = String(r.id ?? '');
      if (!id) { drop(key, r, label(r), 'Không có id'); return false; }
      if (seen.has(id)) { drop(key, r, label(r), 'Trùng id với bản ghi khác'); return false; }
      seen.add(id);
      return true;
    });
  };

  // ════════ Khách hàng ════════
  const customerIds = new Set<string>();
  {
    const names = new Set<string>();
    for (const c of usable('customers_v1', (r) => String(r.name ?? ''))) {
      const name = text(c.name);
      if (!name) { drop('customers_v1', c, '', 'Không có tên'); continue; }
      const key = name.toLowerCase();
      if (!isDeleted(c) && names.has(key)) { drop('customers_v1', c, name, 'Trùng tên với khách hàng khác'); continue; }
      if (!isDeleted(c)) names.add(key);
      const id = asId('customers_v1', c.id);
      customerIds.add(id);
      tables.customers.push({ ...base(id, c), name, full_name: null, address: text(c.address), email: text(c.email), tax_code: text(c.taxCode), note: text(c.note) });
      route('customers_v1→customers');
      if (text(c.phone)) {
        tables.contact_private.push({
          ...base(uuid5(`contact:customer:${id}`), c), customer_id: id, worker_id: null, employee_id: null, subcontractor_id: null,
          phone: text(c.phone), id_number: null, id_issued_on: null, id_issued_place: null, date_of_birth: null, gender: null,
          hometown: null, permanent_address: null, bank_account: null, bank_name: null, bank_holder: null,
        });
      }
    }
  }

  // ════════ Danh mục (cat_items_v1) ════════
  // App cũ nhận diện danh mục THEO TÊN (recCatName → tên; _lnNccDaUng, _hdtpUngAlloc so tên),
  // nên ở đây gộp theo tên đã chuẩn hóa: mỗi tên 1 dòng. Mục đã xóa ở app cũ:
  //   • không bản ghi nào dùng → bỏ;  • còn bản ghi dùng → giữ, đánh dấu archived (ẩn khỏi gợi ý).
  const catItems: L = d.cat_items_v1 && typeof d.cat_items_v1 === 'object' ? d.cat_items_v1 : {};
  const catOrder: Record<CatType, string[]> = {
    loai: d.cat_loai ?? [], ncc: d.cat_ncc ?? [], nguoi: d.cat_nguoi ?? [], tp: d.cat_tp ?? [], cn: d.cat_cn ?? [], tbteb: d.cat_tbteb ?? [],
  };
  const cnRoles: L = d.cat_cn_roles && typeof d.cat_cn_roles === 'object' ? d.cat_cn_roles : {};
  const roleOf = (v: unknown): 'C' | 'T' | 'P' | null => (v === 'C' || v === 'T' || v === 'P' ? v : null);

  function makeCatalog(type: CatType, target: TableName, makeRow: (name: string) => Row) {
    const items: L[] = (Array.isArray(catItems[type]) ? (catItems[type] as L[]) : []).filter((i) => i && i.id && text(i.name));
    const byId = new Map<string, L>(items.map((i) => [String(i.id), i]));
    const rowByKey = new Map<string, Row>();
    const order = new Map<string, number>((catOrder[type] ?? []).map((n, i) => [normalizeCatDisplayName(type, n).toLowerCase(), i]));
    const store = `cat_items_v1.${type}`;
    legacy[store] = { total: items.length, alive: items.filter((i) => !i.isDeleted).length, softDeleted: items.filter((i) => i.isDeleted).length, purged: 0 };
    let renamed = 0;
    const add = (id: string, rawName: string, src: L | null, archived: boolean): Row => {
      const name = normalizeCatDisplayName(type, rawName);
      if (name !== rawName) renamed++;
      const key = name.toLowerCase();
      const ts = src?.updatedAt;
      const row: Row = {
        id, company_id: companyId, created_at: iso(ts), updated_at: iso(ts), deleted_at: null, created_by: null,
        ...makeRow(name), name, archived,
      };
      if (target === 'catalog_items') row.sort_order = order.has(key) ? order.get(key)! + 1 : 1000 + rowByKey.size;
      rowByKey.set(key, row);
      tables[target].push(row);
      return row;
    };
    for (const it of items.filter((i) => !i.isDeleted)) {
      const key = normalizeCatDisplayName(type, it.name).toLowerCase();
      if (rowByKey.has(key)) { dropped.push({ store, id: String(it.id), label: String(it.name), reason: 'Trùng tên với mục khác đang dùng (gộp làm một)', alive: true }); continue; }
      add(asId(store, it.id), String(it.name).trim(), it, false);
      route(`${store}→${target}`);
    }
    // Tên có trong mảng cat_* cũ nhưng thiếu trong cat_items_v1
    for (const n of catOrder[type] ?? []) {
      const key = normalizeCatDisplayName(type, n).toLowerCase();
      if (key && !rowByKey.has(key)) { add(uuid5(`cat:${type}:${key}`), String(n), null, false); notes.push(`Danh mục ${type}: thêm "${n}" (có trong mảng cat_* cũ, thiếu trong cat_items_v1)`); }
    }
    const usedDeleted = new Set<string>();
    /** id danh mục mới của 1 bản ghi: ưu tiên id cũ → tên; không có thì theo chữ ghi trên bản ghi */
    const ref = (id: unknown, fallbackText: unknown): string | null => {
      const it = id ? byId.get(String(id)) : undefined;
      const raw = text(it?.name) ?? text(fallbackText);
      if (!raw) return null;
      const key = normalizeCatDisplayName(type, raw).toLowerCase();
      const hit = rowByKey.get(key);
      if (hit) return hit.id as string;
      if (it) { usedDeleted.add(String(it.id)); return add(asId(store, it.id), raw, it, true).id as string; }
      notes.push(`Danh mục ${type}: tạo mới "${raw}" vì bản ghi có dùng nhưng danh mục không có`);
      return add(uuid5(`cat:${type}:${key}`), raw, null, false).id as string;
    };
    const finish = () => {
      for (const it of items.filter((i) => i.isDeleted)) {
        if (usedDeleted.has(String(it.id))) { route(`${store}→${target} (đã xóa nhưng còn bản ghi dùng → lưu trữ)`); continue; }
        const key = normalizeCatDisplayName(type, it.name).toLowerCase();
        dropped.push({ store, id: String(it.id), label: String(it.name),
          reason: rowByKey.has(key) && !rowByKey.get(key)!.archived ? 'Mục đã xóa ở app cũ, trùng tên với mục đang dùng' : 'Mục đã xóa ở app cũ, không bản ghi nào dùng', alive: false });
      }
      if (renamed) notes.push(`Danh mục ${type}: ${renamed} tên được chuẩn hóa cách viết hoa (normalizeCatDisplayName)`);
    };
    return { ref, finish, rowByKey };
  }

  const catLoai = makeCatalog('loai', 'catalog_items', () => ({ kind: 'expense_type' }));
  const catNguoi = makeCatalog('nguoi', 'catalog_items', () => ({ kind: 'person' }));
  const catTb = makeCatalog('tbteb', 'catalog_items', () => ({ kind: 'equipment_name' }));
  const catNcc = makeCatalog('ncc', 'suppliers', () => ({ address: null, phone: null, buys_on_credit: false, note: null }));
  const catTp = makeCatalog('tp', 'subcontractors', () => ({ field: null, contact_person: null, note: null }));
  const catCn = makeCatalog('cn', 'workers', (name) => ({ role: roleOf(cnRoles[name]), full_name: null, note: null }));

  // ════════ Công trình ════════
  const projectIdOf = new Map<string, string>(); // id cũ → id mới (mọi công trình đã chuyển, kể cả đã xóa mềm)
  const liveProjects: { id: string; name: string; norm: string; aliases: string[] }[] = [];
  const COMPANY_PROJECT_ID = uuid5('project:COMPANY');
  {
    const VALID_STATUS = new Set(['planning', 'active', 'completed', 'closed']);
    const years: L = d.cat_ct_years && typeof d.cat_ct_years === 'object' ? d.cat_ct_years : {};
    const liveNames = new Set<string>();
    for (const p of usable('projects_v1', (r) => String(r.name ?? ''))) {
      const name = text(p.name);
      if (!name) { drop('projects_v1', p, '', 'Không có tên'); continue; }
      if (!VALID_STATUS.has(p.status)) { drop('projects_v1', p, name, `Trạng thái không hợp lệ: ${p.status} (_isValidProject)`); continue; }
      const id = asId('projects_v1', p.id);
      const live = !isDeleted(p);
      if (live) {
        if (liveNames.has(name.toLowerCase())) { drop('projects_v1', p, name, 'Trùng tên với công trình khác'); continue; }
        liveNames.add(name.toLowerCase());
        liveProjects.push({ id, name, norm: normProjName(name), aliases: Array.isArray(p.aliases) ? p.aliases.map(String) : [] });
      }
      projectIdOf.set(String(p.id), id);
      const custId = p.customerId && customerIds.has(asId('customers_v1', p.customerId)) ? asId('customers_v1', p.customerId) : null;
      const k = p.heSoTiTrong;
      const year = Number.isInteger(p.createdYear) ? p.createdYear : Number.isInteger(years[name]) ? years[name] : null;
      tables.projects.push({
        ...base(id, p), name, kind: projectKindOf(p), status: p.status, is_company_overhead: false,
        customer_id: custId, owner_name: text(p.chuDauTu), address: text(p.note), scope_note: text(p.hangMuc),
        cost_weight_k: typeof k === 'number' && Number.isFinite(k) && k >= 0 ? k : null, // getProjectK: thiếu → mặc định 1 lúc tính
        floor_areas: Array.isArray(p.khoiLuong) ? p.khoiLuong : [],
        start_date: isDate(p.startDate) ? p.startDate : null, start_date_user_edited: p.startDateUserEdited === true,
        end_date: isDate(p.endDate) ? p.endDate : null, completed_date: isDate(p.completedDate) ? p.completedDate : null,
        closed_date: isDate(p.closedDate) ? p.closedDate : null, created_year: year,
        aliases: Array.isArray(p.aliases) ? p.aliases.map(String) : [], note: null,
      });
      route('projects_v1→projects');
    }
    // CÔNG TY (chi phí chung) — app cũ là hằng PROJECT_COMPANY id 'COMPANY', không nằm trong projects_v1
    tables.projects.push({
      id: COMPANY_PROJECT_ID, company_id: companyId, created_at: iso(exportedMs), updated_at: iso(exportedMs), deleted_at: null, created_by: null,
      name: 'CÔNG TY', kind: null, status: 'active', is_company_overhead: true, customer_id: null, owner_name: null, address: null,
      scope_note: null, cost_weight_k: null, floor_areas: [], start_date: null, start_date_user_edited: false, end_date: null,
      completed_date: null, closed_date: null, created_year: null, aliases: [], note: 'Chi phí chung của công ty',
    });
  }
  /** projects.model.js `findProjectIdByName` + `findProjectByAlias`: tên đặc biệt → khớp đúng → khớp không dấu → tên cũ */
  const findProjectIdByName = (name: unknown): string | null => {
    const n = String(name ?? '').trim();
    if (!n) return null;
    if (COMPANY_NAMES.has(n)) return COMPANY_PROJECT_ID;
    const exact = liveProjects.find((p) => p.name === n);
    if (exact) return exact.id;
    const nn = normProjName(n);
    const fuzzy = liveProjects.find((p) => p.norm === nn);
    if (fuzzy) return fuzzy.id;
    const old = liveProjects.find((p) => p.aliases.includes(nn));
    return old ? old.id : null;
  };
  let linkedByName = 0;
  const resolveProject = (r: L, nameField: string): string | null => {
    const pid = r.projectId || r.ctPid;
    if (pid === 'COMPANY') return COMPANY_PROJECT_ID;
    if (pid && projectIdOf.has(String(pid))) return projectIdOf.get(String(pid))!;
    const byName = findProjectIdByName(r[nameField]);
    if (byName) linkedByName++;
    return byName;
  };

  // ════════ Chi trả / ứng (ung_v1) — đọc trước để biết NCC nào mua nợ ở công trình nào ════════
  const ungAll = usable('ung_v1', (r) => `${r.ngay} ${r.loai} ${r.tp} ${r.tien}`);
  type Ung = { r: L; loai: 'thauphu' | 'nhacungcap' | 'congnhan'; projectId: string | null; partyId: string | null };
  const ungs: Ung[] = [];
  for (const r of ungAll) {
    const loai: Ung['loai'] = r.loai === 'nhacungcap' ? 'nhacungcap' : r.loai === 'congnhan' ? 'congnhan' : 'thauphu'; // thiếu loai → thầu phụ (stampCatIds)
    const cat = loai === 'nhacungcap' ? catNcc : loai === 'congnhan' ? catCn : catTp;
    ungs.push({ r, loai, projectId: resolveProject(r, 'congtrinh'), partyId: cat.ref(r.tpId, r.tp) });
  }
  // _lnUngCT: nccSet = NCC từng có phiếu ứng (chưa xóa) ở công trình đó — xét TOÀN BỘ lịch sử
  const creditPairs = new Set<string>(); // `${projectId}|${supplierId}`
  const creditSupplierIds = new Set<string>();
  for (const u of ungs) {
    if (u.loai !== 'nhacungcap' || isDeleted(u.r) || !u.partyId) continue;
    creditSupplierIds.add(u.partyId);
    if (u.projectId) creditPairs.add(`${u.projectId}|${u.partyId}`);
  }

  // ════════ Hóa đơn (inv_v3) ════════
  const legacySums: Record<string, number> = {};
  const addSum = (k: string, v: number) => { legacySums[k] = (legacySums[k] ?? 0) + v; };
  const expenseById = new Map<string, Row>();
  for (const inv of usable('inv_v3', (r) => `${r.ngay} ${r.congtrinh} ${r.tien}`)) {
    const label = `${inv.ngay} · ${inv.congtrinh} · ${inv.nd ?? ''} · ${inv.tien}`;
    const projectId = resolveProject(inv, 'congtrinh');
    if (!projectId) { drop('inv_v3', inv, label, 'Không xác định được công trình (id và tên đều không khớp)'); continue; }
    if (!isDate(inv.ngay)) { drop('inv_v3', inv, label, 'Ngày không hợp lệ'); continue; }
    const typeId = catLoai.ref(inv.loaiId, inv.loai);
    if (!typeId) { drop('inv_v3', inv, label, 'Không có loại chi phí'); continue; }
    const supplierId = catNcc.ref(inv.nccId, inv.ncc);
    const id = asId('inv_v3', inv.id);
    const amount = money(inv.thanhtien || inv.tien); // app cũ luôn đọc (thanhtien || tien)
    const row: Row = {
      ...base(id, inv, userOf(inv.nguoi)),
      project_id: projectId, date: inv.ngay, expense_type_id: typeId, supplier_id: supplierId,
      buyer_id: catNguoi.ref(inv.nguoiId, inv.nguoi),             // hóa đơn cũ: Người mua = Người TH cũ
      // Mục 4F điểm 6: NCC từng có phiếu ứng NCC ở CÙNG công trình → chưa tích Đã TT; còn lại → đã tích
      paid_at_purchase: !(supplierId && creditPairs.has(`${projectId}|${supplierId}`)),
      description: String(inv.nd ?? ''), amount, invoice_no: text(inv.soHD),
      source: inv.source === 'quick' || inv.source === 'detail' ? inv.source : 'import',
      receipt_image_path: null,
    };
    tables.expenses.push(row);
    expenseById.set(id, row);
    route('inv_v3→expenses');
    if (!isDeleted(inv)) addSum('inv_v3', amount);
    (Array.isArray(inv.items) ? (inv.items as L[]) : []).forEach((it, i) => {
      if (!it || typeof it !== 'object') return;
      tables.expense_lines.push({
        id: uuid5(`line:${id}:${i}`), company_id: companyId, created_at: row.created_at, updated_at: row.updated_at,
        deleted_at: row.deleted_at, created_by: row.created_by, expense_id: id, position: i,
        name: String(it.ten ?? ''), unit: text(it.dv), quantity: num(it.sl), unit_price: money(it.dongia),
        discount: text(it.ck), amount: money(it.thanhtien), note: text(it.nguoith) ? `Người TH: ${text(it.nguoith)}` : null,
      });
      route('inv_v3.items→expense_lines');
    });
  }

  // ════════ Chấm công (cc_v2) ════════
  {
    const all = arr('cc_v2');
    countStore('cc_v2', all);
    legacy['cc_v2.workers'] = { total: 0, alive: 0, softDeleted: 0, purged: 0 };
    // sync.js `normalizeCC`: 1 tuần + 1 công trình = 1 bản ghi, giữ bản mới nhất (hòa thì bản xóa thắng)
    const byKey = new Map<string, { r: L; projectId: string }>();
    for (const r of all) {
      const label = `${r.fromDate} · ${r.ct}`;
      if (isPurged(r)) { drop('cc_v2', r, label, 'Bia mộ: đã xóa vĩnh viễn ở app cũ'); continue; }
      const from = r.fromDate || r.from;
      if (!isDate(from)) { drop('cc_v2', r, label, 'Không có ngày đầu tuần (fromDate)'); continue; }
      if (new Date(from + 'T00:00:00Z').getUTCDay() !== 0) { drop('cc_v2', r, label, 'Ngày đầu tuần không phải Chủ nhật'); continue; }
      const projectId = resolveProject(r, 'ct');
      if (!projectId) { drop('cc_v2', r, label, 'Không xác định được công trình'); continue; }
      const key = `${from}__${projectId}`;
      const prev = byKey.get(key);
      if (!prev) { byKey.set(key, { r, projectId }); continue; }
      const prevTs = safeTs(prev.r.updatedAt || prev.r.createdAt, exportedMs);
      const ts = safeTs(r.updatedAt || r.createdAt, exportedMs);
      if (ts > prevTs || (ts === prevTs && isDeleted(r) && !isDeleted(prev.r))) {
        drop('cc_v2', prev.r, `${prev.r.fromDate} · ${prev.r.ct}`, 'Trùng tuần + công trình: giữ bản mới hơn (normalizeCC)');
        byKey.set(key, { r, projectId });
      } else {
        drop('cc_v2', r, label, 'Trùng tuần + công trình: giữ bản mới hơn (normalizeCC)');
      }
    }
    for (const { r, projectId } of byKey.values()) {
      const id = asId('cc_v2', r.id);
      const week: Row = { ...base(id, r), project_id: projectId, week_start: r.fromDate || r.from, note: null };
      tables.timesheet_weeks.push(week);
      route('cc_v2→timesheet_weeks');
      const seenWorker = new Set<string>();
      (Array.isArray(r.workers) ? (r.workers as L[]) : []).forEach((wk, i) => {
        legacy['cc_v2.workers']!.total++;
        if (isDeleted(r)) legacy['cc_v2.workers']!.softDeleted++; else legacy['cc_v2.workers']!.alive++;
        const label = `${r.fromDate} · ${r.ct} · ${wk?.name ?? ''}`;
        const workerId = wk ? catCn.ref(wk.cnId, wk.name) : null;
        if (!workerId) { dropped.push({ store: 'cc_v2.workers', id: `${r.id}#${i}`, label, reason: 'Dòng công nhân không có tên', alive: !isDeleted(r) }); return; }
        if (seenWorker.has(workerId)) { dropped.push({ store: 'cc_v2.workers', id: `${r.id}#${i}`, label, reason: 'Công nhân lặp lại trong cùng tuần + công trình', alive: !isDeleted(r) }); return; }
        seenWorker.add(workerId);
        const days = Array.from({ length: 7 }, (_, k) => num(Array.isArray(wk.d) ? wk.d[k] : 0));
        tables.timesheet_lines.push({
          id: uuid5(`ccline:${id}:${workerId}`), company_id: companyId, created_at: week.created_at, updated_at: week.updated_at,
          deleted_at: week.deleted_at, created_by: null, week_id: id, worker_id: workerId, position: i, role: roleOf(wk.role),
          day_units: days, daily_wage: money(wk.luong), allowance: money(wk.phucap), retail_purchase: money(wk.hdmuale),
          debt_deduction: money(wk.tru), legacy_loan: money(wk.loanAmount), note: text(wk.nd),
        });
        route('cc_v2.workers→timesheet_lines');
        if (!isDeleted(r)) {
          // tienich.js `buildInvoices`: lương tuần = Σ (tổng công × lương/ngày + phụ cấp); HĐ mua lẻ tính riêng
          addSum('cc_v2.luong', days.reduce((a, v) => a + v, 0) * num(wk.luong) + num(wk.phucap));
          addSum('cc_v2.hdmuale', num(wk.hdmuale) > 0 ? num(wk.hdmuale) : 0);
        }
      });
    }
  }

  // ════════ HĐ thầu phụ (thauphu_v1) ════════
  const contractsByPair = new Map<string, string[]>(); // `${subcontractorId}|${projectId}` → id HĐ còn sống
  const contractPair = new Map<string, string>();
  for (const h of usable('thauphu_v1', (r) => `${r.ngay} ${r.congtrinh} ${r.thauphu}`)) {
    const label = `${h.ngay} · ${h.congtrinh} · ${h.thauphu} · ${h.giaTri}`;
    const projectId = resolveProject(h, 'congtrinh');
    const subId = catTp.ref(h.thauphuId, h.thauphu);
    if (!projectId) { drop('thauphu_v1', h, label, 'Không xác định được công trình'); continue; }
    if (!subId) { drop('thauphu_v1', h, label, 'Không có tên thầu phụ'); continue; }
    const id = asId('thauphu_v1', h.id);
    tables.subcontracts.push({
      ...base(id, h), project_id: projectId, subcontractor_id: subId, date: isDate(h.ngay) ? h.ngay : null,
      value: money(h.giaTri), legacy_variation: money(h.phatSinh), quantity: h.sl == null ? null : num(h.sl),
      unit_price: h.donGia == null ? null : money(h.donGia), items: Array.isArray(h.items) ? h.items : [], description: text(h.nd),
    });
    route('thauphu_v1→subcontracts');
    if (!isDeleted(h)) {
      const pair = `${subId}|${projectId}`;
      contractPair.set(id, pair);
      contractsByPair.set(pair, [...(contractsByPair.get(pair) ?? []), id]);
      addSum('thauphu_v1', money(h.giaTri) + money(h.phatSinh));
    }
  }

  // ════════ ung_v1 → wage_advances / payments / payable_closures ════════
  const closures = new Map<string, { id: string; recs: Ung[] }>();
  let advancesNoContract = 0;
  let advancesMultiContract = 0;
  for (const u of ungs) {
    const r = u.r;
    const label = `${r.ngay} · ${u.loai} · ${r.tp} · ${r.congtrinh} · ${r.tien}`;
    if (!isDate(r.ngay)) { drop('ung_v1', r, label, 'Ngày không hợp lệ'); continue; }
    if (!u.partyId) { drop('ung_v1', r, label, 'Không có tên đối tác / công nhân'); continue; }
    const id = asId('ung_v1', r.id);
    const amount = money(r.tien);
    const createdBy = userOf(r.nguoi);
    if (u.loai === 'congnhan') {
      // chamcong.core.js `_ccKind`: thiếu cnKind → coi là ứng
      tables.wage_advances.push({
        ...base(id, r, createdBy), worker_id: u.partyId, project_id: u.projectId, date: r.ngay,
        direction: r.cnKind === 'tra' ? 'repay' : 'advance', amount, counts_in_net_pay: r.tinhVaoThucLanh === true, note: text(r.nd),
      });
      route('ung_v1(congnhan)→wage_advances');
      if (!isDeleted(r)) addSum(r.cnKind === 'tra' ? 'ung_v1.congnhan.tra' : 'ung_v1.congnhan.ung', amount);
      continue;
    }
    if (!u.projectId) { drop('ung_v1', r, label, 'Không xác định được công trình'); continue; }
    let closureId: string | null = null;
    if (r.autoSettle && r.settleId) {
      const cid = uuid5(`closure:${r.settleId}`);
      closureId = cid;
      const c = closures.get(cid) ?? { id: cid, recs: [] };
      c.recs.push(u);
      closures.set(cid, c);
    }
    if (u.loai === 'thauphu') {
      // congno.hdtp.js `_hdtpUngAlloc`: phiếu gắn thẳng HĐ (hdtpId) nếu còn cùng cặp TP × CT;
      // cặp chỉ có 1 HĐ → gắn HĐ đó; nhiều HĐ → để trống, app chia cũ nhất trước lúc xem (GĐ7); không có HĐ → theo công trình.
      const pair = `${u.partyId}|${u.projectId}`;
      const direct = r.hdtpId ? asId('thauphu_v1', r.hdtpId) : null;
      const list = contractsByPair.get(pair) ?? [];
      let subcontractId: string | null = null;
      if (direct && contractPair.get(direct) === pair) subcontractId = direct;
      else if (list.length === 1) subcontractId = list[0]!;
      else if (!isDeleted(r)) { if (list.length === 0) advancesNoContract++; else advancesMultiContract++; }
      tables.payments.push({
        ...base(id, r, createdBy), kind: 'advance', date: r.ngay, amount, subcontractor_id: u.partyId, subcontract_id: subcontractId,
        supplier_id: null, project_id: u.projectId, allocation_mode: 'fifo', closure_id: closureId, note: text(r.nd),
      });
      route('ung_v1(thauphu)→payments');
      if (!isDeleted(r)) addSum('ung_v1.thauphu', amount);
    } else {
      // Phiếu ứng NCC cũ: GIỮ công trình cũ, chỉ chia vào hóa đơn của chính công trình ấy (mục 4J "dữ liệu cũ")
      tables.payments.push({
        ...base(id, r, createdBy), kind: 'supplier_payment', date: r.ngay, amount, subcontractor_id: null, subcontract_id: null,
        supplier_id: u.partyId, project_id: u.projectId, allocation_mode: 'project', closure_id: closureId, note: text(r.nd),
      });
      route('ung_v1(nhacungcap)→payments');
      if (!isDeleted(r)) addSum('ung_v1.nhacungcap', amount);
    }
  }
  if (advancesNoContract) notes.push(`${advancesNoContract} phiếu ứng thầu phụ không có HĐ thầu phụ cùng thầu phụ + công trình → gắn theo công trình (subcontract_id trống)`);
  if (advancesMultiContract) notes.push(`${advancesMultiContract} phiếu ứng thầu phụ thuộc cặp thầu phụ + công trình có NHIỀU HĐ → subcontract_id trống, app chia cũ nhất trước như _hdtpUngAlloc`);

  // Tất toán (congno.tattoan.js): mỗi settleId = 1 lần tất toán; hủy = xóa mềm phiếu cùng settleId
  for (const c of closures.values()) {
    const first = c.recs[0]!;
    const r = first.r;
    const allDeleted = c.recs.every((x) => isDeleted(x.r));
    const delAt = allDeleted ? c.recs.map((x) => deletedAt(x.r)!).sort().at(-1)! : null;
    tables.payable_closures.push({
      id: c.id, company_id: companyId, created_at: iso(r.createdAt ?? r.updatedAt), updated_at: iso(r.updatedAt ?? r.createdAt),
      deleted_at: delAt, created_by: userOf(r.nguoi),
      party_kind: first.loai === 'nhacungcap' ? 'supplier' : 'subcontractor',
      subcontractor_id: first.loai === 'thauphu' ? first.partyId : null, supplier_id: first.loai === 'nhacungcap' ? first.partyId : null,
      project_id: first.projectId, closed_on: r.ngay, amount: c.recs.reduce((s, x) => s + money(x.r.tien), 0),
      closed_by_name: text(r.nguoi) ?? text(r.settledBy), note: text(r.nd), undone_at: delAt,
    });
    route('ung_v1(autoSettle)→payable_closures');
  }
  // Tất toán phải được chèn trước payments (khóa ngoại closure_id) — TABLE_ORDER đã xếp đúng.

  // Chia phiếu chi NCC cũ vào hóa đơn mua nợ của CÙNG công trình, cũ nhất trước (ngày → thời điểm tạo → id)
  {
    const cmp = (a: Row, b: Row) =>
      String(a.date).localeCompare(String(b.date)) || String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id));
    const group = <T extends Row>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const x of rows) { const k = `${x.project_id}|${x.supplier_id}`; m.set(k, [...(m.get(k) ?? []), x]); }
      return m;
    };
    const pays = group(tables.payments.filter((p) => p.kind === 'supplier_payment' && !p.deleted_at));
    const invs = group(tables.expenses.filter((e) => !e.deleted_at && e.supplier_id && e.paid_at_purchase === false));
    let rest = 0;
    for (const [key, list] of pays) {
      const queue = (invs.get(key) ?? []).slice().sort(cmp).map((e) => ({ e, left: e.amount as number }));
      let qi = 0;
      for (const p of list.slice().sort(cmp)) {
        let left = p.amount as number;
        const put = (expenseId: string | null, amt: number) => tables.payment_allocations.push({
          id: uuid5(`alloc:${p.id}:${expenseId ?? 'rest'}`), company_id: companyId, created_at: p.created_at, updated_at: p.updated_at,
          deleted_at: null, created_by: p.created_by, payment_id: p.id, expense_id: expenseId, project_id: p.project_id, amount: amt,
        });
        while (left > 0 && qi < queue.length) {
          const q = queue[qi]!;
          if (q.left <= 0) { qi++; continue; }
          const amt = Math.min(left, q.left);
          put(q.e.id as string, amt);
          q.left -= amt; left -= amt;
        }
        // Trả dư so với hóa đơn mua nợ của công trình: vẫn là tiền đã chi của công trình (app cũ cộng nguyên phiếu ứng vào A)
        if (left !== 0) { put(null, left); rest++; }
      }
    }
    if (rest) notes.push(`${rest} phiếu chi NCC cũ có phần tiền không còn hóa đơn mua nợ nào ở cùng công trình để chia (trả dư / trả trước) → ghi 1 dòng chia không gắn hóa đơn, vẫn tính là đã trả của công trình đó`);
  }
  // Bật Mua nợ cho NCC từng có tiền ứng (mục 4F điểm 4)
  const creditSuppliers: string[] = [];
  for (const s of tables.suppliers) if (creditSupplierIds.has(s.id as string)) { s.buys_on_credit = true; creditSuppliers.push(s.name as string); }

  // ════════ Quyết toán (quyettoan_v1) ════════
  const settlementIds = new Set<string>();
  for (const q of usable('quyettoan_v1', (r) => `${r.ngay} ${r.congtrinh} ${r.giaTri}`)) {
    const label = `${q.ngay} · ${q.congtrinh} · ${q.giaTri}`;
    const projectId = resolveProject(q, 'congtrinh');
    if (!projectId) { drop('quyettoan_v1', q, label, 'Không xác định được công trình'); continue; }
    if (!isDate(q.ngay)) { drop('quyettoan_v1', q, label, 'Ngày không hợp lệ'); continue; }
    const id = asId('quyettoan_v1', q.id);
    // quyettoan.core.js `qtLoaiOf`: thiếu loai → suy theo dấu giaTri
    const kind = q.loai === 'thaythe' ? 'replace' : q.loai === 'giam' ? 'decrease' : q.loai === 'tang' ? 'increase' : num(q.giaTri) < 0 ? 'decrease' : 'increase';
    tables.settlements.push({ ...base(id, q, userOf(q.nguoi)), project_id: projectId, date: q.ngay, kind, amount: Math.abs(money(q.giaTri)), is_final: q.chot === true, note: text(q.nd) });
    settlementIds.add(id);
    route('quyettoan_v1→settlements');
  }

  // ════════ Thu tiền (thu_v1) ════════
  for (const t of usable('thu_v1', (r) => `${r.ngay} ${r.congtrinh} ${r.tien}`)) {
    const label = `${t.ngay} · ${t.congtrinh} · ${t.tien}`;
    const projectId = resolveProject(t, 'congtrinh');
    if (!projectId) { drop('thu_v1', t, label, 'Không xác định được công trình'); continue; }
    if (!isDate(t.ngay)) { drop('thu_v1', t, label, 'Ngày không hợp lệ'); continue; }
    const kind = t.loaiThu === 'tamung' ? 'advance' : t.loaiThu === 'giaidoan' ? 'stage' : t.loaiThu === 'quyettoan' ? 'settlement' : 'other';
    const sid = t.qtId ? asId('quyettoan_v1', t.qtId) : null;
    tables.receipts.push({
      ...base(asId('thu_v1', t.id), t, userOf(t.nguoi)), project_id: projectId, date: t.ngay, amount: money(t.tien), kind,
      is_auto: t.auto === true, settlement_id: sid && settlementIds.has(sid) ? sid : null, note: text(t.nd),
    });
    route('thu_v1→receipts');
    if (!isDeleted(t)) addSum('thu_v1', money(t.tien));
  }

  // ════════ HĐ chính (hopdong_v1: map khóa = projectId hoặc tên công trình đời cũ) ════════
  {
    const map: L = d.hopdong_v1 && typeof d.hopdong_v1 === 'object' ? d.hopdong_v1 : {};
    const entries = Object.entries(map).filter(([, h]) => h && typeof h === 'object') as [string, L][];
    legacy.hopdong_v1 = {
      total: entries.length, alive: entries.filter(([, h]) => !isPurged(h) && !isDeleted(h)).length,
      softDeleted: entries.filter(([, h]) => !isPurged(h) && isDeleted(h)).length, purged: entries.filter(([, h]) => isPurged(h)).length,
    };
    const liveByProject = new Map<string, Row>();
    for (const [key, h] of entries) {
      const label = `${key} · ${h.giaTri}`;
      if (isPurged(h)) { dropped.push({ store: 'hopdong_v1', id: key, label, reason: 'Bia mộ: đã xóa vĩnh viễn ở app cũ', alive: false }); continue; }
      const projectId = projectIdOf.get(key) ?? (h.projectId && projectIdOf.get(String(h.projectId))) ?? findProjectIdByName(key);
      if (!projectId) { dropped.push({ store: 'hopdong_v1', id: key, label, reason: 'Không xác định được công trình', alive: !isDeleted(h) }); continue; }
      const prev = !isDeleted(h) ? liveByProject.get(projectId) : undefined;
      if (prev) {
        // qtHdGocCuaCT cộng MỌI khóa khớp công trình → gộp giá trị vào 1 hợp đồng
        prev.value = (prev.value as number) + money(h.giaTri);
        prev.extra_value = (prev.extra_value as number) + money(h.giaTriphu);
        prev.legacy_variation = (prev.legacy_variation as number) + money(h.phatSinh);
        prev.items = [...(prev.items as unknown[]), ...(Array.isArray(h.items) ? h.items : [])];
        notes.push(`HĐ chính: công trình ${projectId} có 2 khóa trong hopdong_v1 → gộp giá trị (như qtHdGocCuaCT)`);
        route('hopdong_v1→main_contracts (gộp)');
        continue;
      }
      const row: Row = {
        ...base(uuid5(`main-contract:${key}`), h, userOf(h.nguoi)), project_id: projectId, date: isDate(h.ngay) ? h.ngay : null,
        value: money(h.giaTri), extra_value: money(h.giaTriphu), legacy_variation: money(h.phatSinh),
        quantity: h.sl == null ? null : num(h.sl), unit_price: h.donGia == null ? null : money(h.donGia),
        items: Array.isArray(h.items) ? h.items : [], customer_name: text(h.khachHang), description: text(h.nd),
      };
      tables.main_contracts.push(row);
      if (!isDeleted(h)) { liveByProject.set(projectId, row); addSum('hopdong_v1', money(h.giaTri) + money(h.giaTriphu) + money(h.phatSinh)); }
      route('hopdong_v1→main_contracts');
    }
  }

  // ════════ Thiết bị (tb_v1) ════════
  {
    const CONDITION: Record<string, string> = { 'Đang hoạt động': 'working', 'Cần bảo trì': 'needs_maintenance', 'Cần sửa chữa': 'needs_repair' };
    const liveByKey = new Map<string, Row>();
    for (const t of usable('tb_v1', (r) => `${r.ct} · ${r.ten} · ${r.soluong}`)) {
      const label = `${t.ct} · ${t.ten} · SL ${t.soluong}`;
      const nameId = catTb.ref(t.tenId, t.ten);
      if (!nameId) { drop('tb_v1', t, label, 'Không có tên thiết bị'); continue; }
      // thietbi.js `migrateTbData`: ct là tên kho hoặc projectId = COMPANY → kho; thiếu `kho` → Kho Vật Tư Giàn Giáo
      const khoByName = t.ct === 'KHO TỔNG' ? 'GG' : t.ct === KHO_TB ? 'TB' : t.ct === KHO_GG ? 'GG' : null;
      let location: 'project' | 'warehouse' | 'scaffold';
      let projectId: string | null = null;
      if (khoByName || t.projectId === 'COMPANY') {
        const kho = t.kho === 'TB' || t.kho === 'GG' ? t.kho : khoByName ?? 'GG';
        location = kho === 'TB' ? 'warehouse' : 'scaffold';
      } else {
        projectId = resolveProject(t, 'ct');
        if (!projectId) { drop('tb_v1', t, label, 'Không xác định được công trình / kho'); continue; }
        if (projectId === COMPANY_PROJECT_ID) { projectId = null; location = 'scaffold'; } else location = 'project';
      }
      const condition = CONDITION[String(t.tinhtrang ?? '').trim()] ?? 'working';
      const note = text(t.ghichu);
      // migrateTbData phase 2: gộp dòng trùng Nơi + Tên + Tình trạng + Thông tin máy (cộng số lượng)
      const key = `${location}|${projectId}|${nameId}|${condition}|${(note ?? '').replace(/\s+/g, ' ').toLowerCase()}`;
      const prev = !isDeleted(t) ? liveByKey.get(key) : undefined;
      if (prev) {
        prev.quantity = (prev.quantity as number) + num(t.soluong);
        if (iso(t.updatedAt) > (prev.updated_at as string)) { prev.updated_at = iso(t.updatedAt); if (isDate(t.ngay)) prev.date = t.ngay; }
        drop('tb_v1', t, label, 'Trùng nơi + tên + tình trạng + thông tin máy → cộng số lượng vào dòng trước (migrateTbData)');
        continue;
      }
      const row: Row = { ...base(asId('tb_v1', t.id), t), name_id: nameId, location, project_id: projectId, quantity: num(t.soluong), condition, date: isDate(t.ngay) ? t.ngay : null, note };
      tables.equipment.push(row);
      if (!isDeleted(t)) liveByKey.set(key, row);
      route('tb_v1→equipment');
      if (!isDeleted(t)) addSum('tb_v1.soluong', num(t.soluong));
    }
  }

  // ════════ Tỉ trọng (tytrong_v1) — giữ nguyên jsonb ════════
  {
    const META = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy', 'deviceId', 'projectId', 'purgedAt']);
    const liveProject = new Set<string>();
    let liveConfig = false;
    const list = usable('tytrong_v1', (r) => `${r.kind ?? 'phân bổ'} ${r.ten ?? r.projectId ?? ''}`)
      .slice().sort((a, b) => num(b.updatedAt) - num(a.updatedAt) || String(a.id).localeCompare(String(b.id))); // bản mới nhất thắng khi trùng
    for (const t of list) {
      const label = `${t.kind ?? 'phân bổ'} · ${t.ten ?? t.projectId ?? ''}`;
      const kind = t.kind === 'dinhmuc' ? 'benchmark' : t.kind === 'cauhinh' ? 'config' : 'project';
      let projectId: string | null = null;
      if (kind === 'project') {
        projectId = t.projectId ? projectIdOf.get(String(t.projectId)) ?? null : null;
        if (!projectId) { drop('tytrong_v1', t, label, 'Bản phân bổ không gắn được công trình'); continue; }
        if (!isDeleted(t)) {
          if (liveProject.has(projectId)) { drop('tytrong_v1', t, label, 'Công trình đã có bản phân bổ mới hơn'); continue; }
          liveProject.add(projectId);
        }
      }
      if (kind === 'config' && !isDeleted(t)) {
        if (liveConfig) { drop('tytrong_v1', t, label, 'Đã có bản cấu hình rổ mới hơn'); continue; }
        liveConfig = true;
      }
      const data: L = {};
      for (const [k, v] of Object.entries(t)) if (!META.has(k)) data[k] = v;
      tables.cost_allocations.push({ ...base(asId('tytrong_v1', t.id), t), kind, project_id: projectId, name: text(t.ten), data });
      route('tytrong_v1→cost_allocations');
    }
  }

  catLoai.finish(); catNguoi.finish(); catTb.finish(); catNcc.finish(); catTp.finish(); catCn.finish();
  if (linkedByName) notes.push(`${linkedByName} bản ghi không có projectId hợp lệ → gắn công trình theo tên (findProjectIdByName + aliases)`);

  // Khóa bị bỏ hẳn (KẾ HOẠCH mục 4)
  for (const [key, why] of [
    ['import_lots_v1', 'Lô nhập gói công trình — app mới không dùng'],
    ['trash_v1', 'Thùng rác đời cũ — app mới dùng deleted_at'],
    ['cat_ct_years', 'Đã chuyển thành projects.created_year'],
  ] as const) {
    const v = d[key];
    const n = Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;
    notes.push(`Bỏ khóa \`${key}\` (${n} phần tử): ${why}`);
  }
  const drafts = ['inv_v3', 'cc_v2', 'ung_v1', 'thu_v1', 'tb_v1', 'thauphu_v1', 'quyettoan_v1']
    .reduce((s, k) => s + arr(k).filter((r) => r.draft === true || r.importLot).length, 0);
  notes.push(`Cờ nháp / lô nhập (draft, importLot): ${drafts} bản ghi mang cờ — cờ bị bỏ, bản ghi vẫn chuyển`);

  // Sắp xếp theo id cho ổn định
  for (const t of TABLE_ORDER) tables[t].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return { tables, dropped, notes, legacy, routed, legacySums, creditSuppliers: creditSuppliers.sort(), exportedAt: iso(exportedMs) };
}
