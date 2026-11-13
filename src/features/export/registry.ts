// TN02 — Danh mục các loại dữ liệu xuất được. THÊM LOẠI MỚI = THÊM 1 OBJECT vào DATASETS, không sửa màn hình.
// Khai báo theo bảng THẬT trong kho (supabase/migrations …000003): mỗi loại = 1 bảng nghiệp vụ, cách lọc công trình, trường ngày, cột.
// Không có công thức tiền ở đây: cột tiền chỉ đọc nguyên số trong kho; số cần tính (lương, Thực lãnh) gọi src/lib/calc.
import type { ModuleKey } from '@/lib/permissions';

export type Row = Record<string, unknown>;

export type DatasetKey =
  | 'expenses' | 'expense_lines' | 'cost_allocations'
  | 'timesheet_weeks' | 'timesheet_lines' | 'wage_advances'
  | 'receipts' | 'payments' | 'payment_allocations' | 'subcontracts' | 'main_contracts' | 'settlements' | 'payable_closures'
  | 'equipment'
  | 'customers' | 'workers' | 'suppliers' | 'subcontractors' | 'employees' | 'catalog_items' | 'contact_private' | 'projects'
  | 'schedule_templates' | 'schedule_phases' | 'schedule_tasks' | 'schedule_notes';

export type GroupKey = 'chi-phi' | 'cham-cong' | 'tien' | 'khac' | 'danh-ba' | 'tien-do';

/** Thứ tự nhóm ở cột 2 — sắp theo tần suất dùng (đặc tả mục 1.6). `folded` = gấp lại mặc định. */
export const GROUPS: { key: GroupKey; label: string; tag?: string; folded?: boolean }[] = [
  { key: 'chi-phi', label: 'Chi phí', tag: 'hay xuất' },
  { key: 'cham-cong', label: 'Chấm công', tag: 'hay xuất' },
  { key: 'tien', label: 'Tiền & hợp đồng', tag: 'hay xuất' },
  { key: 'khac', label: 'Khác' },
  { key: 'danh-ba', label: 'Danh mục & danh bạ', tag: 'ít dùng', folded: true },
  { key: 'tien-do', label: 'Tiến độ', folded: true },
];

/**
 * Cách lọc theo công trình (đặc tả mục 4):
 * - direct  : bảng có cột công trình (nhóm A)
 * - via     : bảng con, công trình + ngày lấy theo bảng cha (nhóm B)
 * - related : danh bạ — "của công trình X" = đã có phát sinh ở X (nhóm C)
 * - none    : dùng chung, không lọc theo công trình
 */
export type ProjectLink =
  | { kind: 'direct'; field: string }
  | { kind: 'via'; parent: DatasetKey; fk: string }
  | { kind: 'related'; sources: { dataset: DatasetKey; field: string }[] }
  | { kind: 'none' };

export type ColType = 'money' | 'num' | 'dec' | 'date' | 'text' | 'bool';
export type Cell = string | number | null;

/** Tra tên thay cho mã (tải 1 lần, dùng cho mọi khối) */
export type Ctx = {
  name: (table: string, id: unknown) => string;
  /** Một dòng của bảng theo mã (hóa đơn của dòng vật tư, tuần của dòng công nhân…) */
  row: (table: string, id: unknown) => Row | undefined;
  /** SĐT / CCCD / STK theo mã người (chỉ có khi được phép xuất dữ liệu cá nhân) */
  priv: (ownerId: unknown) => Row | undefined;
};

export type Column = {
  key: string; label: string; width: number; type?: ColType;
  /** Dòng TỔNG CỘNG có cộng cột này không (mặc định: cột tiền) */
  sum?: boolean;
  /** Cột dữ liệu cá nhân — chỉ có khi tích "SĐT, CCCD, STK" */
  private?: boolean;
  value: (r: Row, c: Ctx) => Cell;
};

export type Dataset = {
  key: DatasetKey;
  label: string;
  /** Tên sheet khi "Mỗi loại 1 sheet" (không dấu cho chắc với Excel cũ) */
  sheet: string;
  group: GroupKey;
  table: string;
  permModule: ModuleKey;
  link: ProjectLink;
  /** Trường ngày để lọc thời gian; bảng con lấy ngày bảng cha; không có = không lọc thời gian */
  dateField?: string;
  /** Bảng con: tick một mình thì kéo theo bảng cha, ghép thành 1 khối */
  parent?: DatasetKey;
  /** Nhãn ngắn ở cột 2 */
  tag?: string;
  /** Chỉ hiện với quyền "Xem SĐT, số CCCD" */
  privateOnly?: boolean;
  /** Chú thích dưới tiêu đề khối */
  caption?: string;
  columns: Column[];
};

// ───────────── nhãn mã → chữ ─────────────
const L = {
  payKind: { advance: 'Tạm ứng TP', progress: 'Thanh toán đợt TP', supplier_payment: 'Trả nợ NCC' } as Record<string, string>,
  rcKind: { advance: 'Tạm ứng', stage: 'Giai đoạn', settlement: 'Quyết toán', other: 'Khác' } as Record<string, string>,
  stKind: { increase: 'Tăng', decrease: 'Giảm', replace: 'Thay thế' } as Record<string, string>,
  loc: { project: 'Tại công trình', warehouse: 'Kho thiết bị', scaffold: 'Kho giàn giáo' } as Record<string, string>,
  cond: { working: 'Đang hoạt động', needs_maintenance: 'Cần bảo trì', needs_repair: 'Cần sửa chữa' } as Record<string, string>,
  pStatus: { planning: 'Chuẩn bị', active: 'Đang thi công', completed: 'Hoàn thành', closed: 'Đã quyết toán' } as Record<string, string>,
  pKind: { new_build: 'CT', renovation: 'SC', small_repair: 'SN' } as Record<string, string>,
  role: { C: 'Chính', T: 'Thợ', P: 'Phụ' } as Record<string, string>,
  catKind: { expense_type: 'Loại chi phí', person: 'Người mua', equipment_name: 'Tên thiết bị', unit: 'Đơn vị tính' } as Record<string, string>,
  mode: { fifo: 'Cũ nhất trước', project: 'Trong công trình', manual: 'Chọn tay' } as Record<string, string>,
};
const lab = (m: Record<string, string>, v: unknown) => (v == null ? '' : m[String(v)] ?? String(v));

// ───────────── dựng cột cho gọn ─────────────
const s = (v: unknown): Cell => (v == null || v === '' ? null : String(v));
const n = (v: unknown): Cell => (v == null || v === '' ? null : Number(v));
const txt = (key: string, label: string, width = 18, get?: (r: Row, c: Ctx) => unknown): Column => ({ key, label, width, type: 'text', value: (r, c) => s(get ? get(r, c) : r[key]) });
const date = (key: string, label = 'NGÀY', get?: (r: Row, c: Ctx) => unknown): Column => ({ key, label, width: 11, type: 'date', value: (r, c) => s(get ? get(r, c) : r[key]) });
const money = (key: string, label: string, get?: (r: Row, c: Ctx) => unknown, width = 15): Column => ({ key, label, width, type: 'money', value: (r, c) => n(get ? get(r, c) : r[key]) });
const dec = (key: string, label: string, get?: (r: Row, c: Ctx) => unknown, sum = false): Column => ({ key, label, width: 9, type: 'dec', sum, value: (r, c) => n(get ? get(r, c) : r[key]) });
const bool = (key: string, label: string, get?: (r: Row) => unknown): Column => ({ key, label, width: 9, type: 'bool', value: (r) => ((get ? get(r) : r[key]) ? 'Có' : '') });
const ref = (key: string, label: string, table: string, width = 22): Column => ({ key, label, width, type: 'text', value: (r, c) => s(c.name(table, r[key])) });
const note = (key = 'note', label = 'GHI CHÚ'): Column => txt(key, label, 30);
const priv = (key: string, label: string, width = 16): Column => ({ key: `priv_${key}`, label, width, type: key.endsWith('_on') || key === 'date_of_birth' ? 'date' : 'text', private: true, value: (r, c) => s(c.priv(r.id)?.[key]) });
const PRIVATE_COLS = [priv('phone', 'SĐT', 14), priv('id_number', 'SỐ CCCD', 15), priv('date_of_birth', 'NGÀY SINH'), priv('hometown', 'QUÊ QUÁN', 18), priv('permanent_address', 'NƠI THƯỜNG TRÚ', 30), priv('bank_account', 'SỐ TÀI KHOẢN', 18), priv('bank_name', 'NGÂN HÀNG', 14)];

// Cột của hóa đơn — dùng lại cho khối ghép "Hóa đơn + dòng vật tư"
export const EXPENSE_HEAD_COLS: Column[] = [
  date('date'), ref('expense_type_id', 'LOẠI CHI PHÍ', 'catalog_items', 18), ref('supplier_id', 'NHÀ CUNG CẤP', 'suppliers', 24),
  ref('buyer_id', 'NGƯỜI MUA', 'catalog_items', 12), bool('paid_at_purchase', 'ĐÃ TT'),
];

export const DATASETS: Dataset[] = [
  // ───── CHI PHÍ ─────
  {
    key: 'expenses', label: 'Hóa đơn chi phí', sheet: 'Hoa don', group: 'chi-phi', table: 'expenses', permModule: 'expense_stats',
    link: { kind: 'direct', field: 'project_id' }, dateField: 'date',
    caption: 'Mọi hóa đơn (kể cả mua nợ) — tổng cao hơn phần hóa đơn ở tab Lợi Nhuận (Lợi Nhuận chỉ tính hóa đơn Đã TT + tiền đã trả NCC)',
    columns: [...EXPENSE_HEAD_COLS, txt('description', 'NỘI DUNG', 40), txt('source', 'NGUỒN', 9, (r) => lab({ quick: 'Nhanh', detail: 'Chi tiết', scan: 'Ảnh', import: 'Excel' }, r.source)), money('amount', 'SỐ TIỀN')],
  },
  {
    key: 'expense_lines', label: 'Dòng vật tư', sheet: 'Dong vat tu', group: 'chi-phi', table: 'expense_lines', permModule: 'expense_stats',
    link: { kind: 'via', parent: 'expenses', fk: 'expense_id' }, parent: 'expenses', tag: 'kèm HĐ',
    columns: [txt('name', 'TÊN VẬT TƯ', 34), txt('unit', 'ĐVT', 7), dec('quantity', 'SL'), money('unit_price', 'ĐƠN GIÁ', undefined, 13), txt('discount', 'CK', 7), money('amount', 'THÀNH TIỀN')],
  },
  {
    key: 'cost_allocations', label: 'Tỉ trọng / phân bổ', sheet: 'Ti trong', group: 'chi-phi', table: 'cost_allocations', permModule: 'cost_allocation',
    link: { kind: 'direct', field: 'project_id' }, caption: 'Cấu hình nhóm / rổ / định mức (dạng JSON như app cũ) — bảng này không có ngày',
    columns: [txt('kind', 'LOẠI', 12, (r) => lab({ project: 'Theo công trình', benchmark: 'Định mức', config: 'Cấu hình rổ' }, r.kind)), txt('name', 'TÊN', 24), txt('data', 'DỮ LIỆU', 60, (r) => JSON.stringify(r.data ?? {}).slice(0, 30000))],
  },

  // ───── CHẤM CÔNG ─────
  {
    key: 'timesheet_weeks', label: 'Tuần chấm công', sheet: 'Cham cong - tuan', group: 'cham-cong', table: 'timesheet_weeks', permModule: 'timesheets',
    link: { kind: 'direct', field: 'project_id' }, dateField: 'week_start',
    columns: [date('week_start', 'TUẦN (CN)'), note()],
  },
  {
    key: 'timesheet_lines', label: 'Dòng công nhân', sheet: 'Cham cong - dong', group: 'cham-cong', table: 'timesheet_lines', permModule: 'timesheets',
    link: { kind: 'via', parent: 'timesheet_weeks', fk: 'week_id' }, parent: 'timesheet_weeks', tag: 'kèm tuần',
    columns: [ref('worker_id', 'CÔNG NHÂN', 'workers', 14)],
  },
  {
    key: 'wage_advances', label: 'Tạm ứng lương', sheet: 'Tam ung luong', group: 'cham-cong', table: 'wage_advances', permModule: 'timesheets',
    link: { kind: 'direct', field: 'project_id' }, dateField: 'date',
    columns: [date('date'), ref('worker_id', 'CÔNG NHÂN', 'workers', 14), txt('direction', 'LOẠI', 8, (r) => (r.direction === 'repay' ? 'Trả' : 'Ứng')),
      money('advance', 'ỨNG', (r) => (r.direction === 'repay' ? null : r.amount), 13), money('repay', 'TRẢ', (r) => (r.direction === 'repay' ? r.amount : null), 13),
      bool('counts_in_net_pay', 'TÍNH VÀO TL'), note()],
  },

  // ───── TIỀN & HỢP ĐỒNG ─────
  {
    key: 'receipts', label: 'Phiếu thu', sheet: 'Phieu thu', group: 'tien', table: 'receipts', permModule: 'revenue',
    link: { kind: 'direct', field: 'project_id' }, dateField: 'date',
    columns: [date('date'), txt('kind', 'LOẠI THU', 12, (r) => lab(L.rcKind, r.kind)), note('note', 'NỘI DUNG'), money('amount', 'SỐ TIỀN')],
  },
  {
    key: 'payments', label: 'Phiếu chi (TP / NCC)', sheet: 'Phieu chi', group: 'tien', table: 'payments', permModule: 'payments',
    link: { kind: 'direct', field: 'project_id' }, dateField: 'date',
    columns: [date('date'), txt('kind', 'LOẠI', 16, (r) => lab(L.payKind, r.kind)), txt('party', 'THẦU PHỤ / NCC', 26, (r, c) => (r.subcontractor_id ? c.name('subcontractors', r.subcontractor_id) : c.name('suppliers', r.supplier_id))),
      txt('allocation_mode', 'CÁCH CHIA', 14, (r) => (r.kind === 'supplier_payment' ? lab(L.mode, r.allocation_mode) : '')), note('note', 'NỘI DUNG'), money('amount', 'SỐ TIỀN')],
  },
  {
    key: 'payment_allocations', label: 'Chia tiền trả NCC', sheet: 'Chia tien NCC', group: 'tien', table: 'payment_allocations', permModule: 'payables',
    link: { kind: 'via', parent: 'payments', fk: 'payment_id' }, parent: 'payments', tag: 'kèm phiếu chi',
    caption: 'Mỗi dòng = phần tiền của phiếu chi được chia vào 1 hóa đơn mua nợ (cũ nhất trước); không có hóa đơn = phần trả dư',
    columns: [txt('expense', 'HÓA ĐƠN ĐƯỢC TRẢ', 34, (r, c) => {
      const e = r.expense_id ? c.row('expenses', r.expense_id) : undefined;
      return e ? `${String(e.date ?? '').split('-').reverse().join('/')} · ${String(e.description ?? '').slice(0, 60)}` : r.expense_id ? '' : '(trả dư / trả trước)';
    }), money('amount', 'SỐ TIỀN CHIA')],
  },
  {
    key: 'subcontracts', label: 'HĐ thầu phụ', sheet: 'HD thau phu', group: 'tien', table: 'subcontracts', permModule: 'payables',
    link: { kind: 'direct', field: 'project_id' }, dateField: 'date',
    columns: [date('date'), ref('subcontractor_id', 'THẦU PHỤ', 'subcontractors', 24), txt('description', 'NỘI DUNG', 34), money('value', 'GIÁ TRỊ HĐ'), money('legacy_variation', 'PHÁT SINH CŨ')],
  },
  {
    key: 'main_contracts', label: 'Hợp đồng chính', sheet: 'HD chinh', group: 'tien', table: 'main_contracts', permModule: 'revenue',
    link: { kind: 'direct', field: 'project_id' }, dateField: 'date',
    columns: [date('date'), txt('customer_name', 'CHỦ ĐẦU TƯ', 24), txt('description', 'NỘI DUNG', 34), money('value', 'GIÁ TRỊ HĐ'), money('extra_value', 'GIÁ TRỊ PHỤ'), money('legacy_variation', 'PHÁT SINH CŨ')],
  },
  {
    key: 'settlements', label: 'Quyết toán', sheet: 'Quyet toan', group: 'tien', table: 'settlements', permModule: 'settlements',
    link: { kind: 'direct', field: 'project_id' }, dateField: 'date',
    columns: [date('date'), txt('kind', 'LOẠI', 10, (r) => lab(L.stKind, r.kind)), bool('is_final', 'CHỐT'), note(), money('amount', 'SỐ TIỀN')],
  },
  {
    key: 'payable_closures', label: 'Tất toán công nợ', sheet: 'Tat toan', group: 'tien', table: 'payable_closures', permModule: 'payables',
    link: { kind: 'direct', field: 'project_id' }, dateField: 'closed_on',
    columns: [date('closed_on'), txt('party', 'THẦU PHỤ / NCC', 26, (r, c) => (r.subcontractor_id ? c.name('subcontractors', r.subcontractor_id) : c.name('suppliers', r.supplier_id))),
      txt('undone', 'ĐÃ HOÀN TÁC', 10, (r) => (r.undone_at ? 'Có' : '')), note(), money('amount', 'SỐ TIỀN')],
  },

  // ───── KHÁC ─────
  {
    key: 'equipment', label: 'Thiết bị', sheet: 'Thiet bi', group: 'khac', table: 'equipment', permModule: 'equipment',
    link: { kind: 'direct', field: 'project_id' }, dateField: 'date',
    columns: [ref('name_id', 'TÊN THIẾT BỊ', 'catalog_items', 26), txt('location', 'NƠI', 14, (r) => lab(L.loc, r.location)), dec('quantity', 'SỐ LƯỢNG', undefined, true),
      txt('condition', 'TÌNH TRẠNG', 14, (r) => lab(L.cond, r.condition)), date('date', 'NGÀY'), note('note', 'THÔNG TIN MÁY')],
  },

  // ───── DANH MỤC & DANH BẠ (nhóm C) ─────
  {
    key: 'customers', label: 'Khách hàng', sheet: 'Khach hang', group: 'danh-ba', table: 'customers', permModule: 'contacts',
    link: { kind: 'related', sources: [{ dataset: 'projects', field: 'customer_id' }] }, tag: 'lọc theo CT',
    columns: [txt('name', 'TÊN GỌI', 18), txt('full_name', 'HỌ TÊN', 24), txt('address', 'ĐỊA CHỈ', 30), txt('tax_code', 'MST', 12), note(), ...PRIVATE_COLS.slice(0, 2)],
  },
  {
    key: 'workers', label: 'Công nhân', sheet: 'Cong nhan', group: 'danh-ba', table: 'workers', permModule: 'contacts',
    link: { kind: 'related', sources: [{ dataset: 'timesheet_lines', field: 'worker_id' }, { dataset: 'wage_advances', field: 'worker_id' }] }, tag: 'lọc theo CT',
    columns: [txt('name', 'TÊN GỌI', 14), txt('role', 'T/P', 6, (r) => lab(L.role, r.role)), txt('full_name', 'HỌ TÊN (CCCD)', 24), bool('archived', 'NGHỈ'), note(), ...PRIVATE_COLS],
  },
  {
    key: 'suppliers', label: 'Nhà cung cấp', sheet: 'Nha cung cap', group: 'danh-ba', table: 'suppliers', permModule: 'contacts',
    link: { kind: 'related', sources: [{ dataset: 'expenses', field: 'supplier_id' }, { dataset: 'payments', field: 'supplier_id' }] }, tag: 'lọc theo CT',
    columns: [txt('name', 'TÊN', 28), txt('address', 'ĐỊA CHỈ', 32), txt('phone', 'SĐT CỬA HÀNG', 14), bool('buys_on_credit', 'MUA NỢ'), note()],
  },
  {
    key: 'subcontractors', label: 'Thầu phụ', sheet: 'Thau phu', group: 'danh-ba', table: 'subcontractors', permModule: 'contacts',
    link: { kind: 'related', sources: [{ dataset: 'subcontracts', field: 'subcontractor_id' }, { dataset: 'payments', field: 'subcontractor_id' }] }, tag: 'lọc theo CT',
    columns: [txt('name', 'TÊN', 26), txt('field', 'LĨNH VỰC', 16), txt('contact_person', 'NGƯỜI LIÊN HỆ', 16), note(), ...PRIVATE_COLS.slice(0, 1)],
  },
  {
    key: 'employees', label: 'Nhân viên', sheet: 'Nhan vien', group: 'danh-ba', table: 'employees', permModule: 'contacts', link: { kind: 'none' },
    columns: [txt('full_name', 'HỌ TÊN', 24), txt('title', 'CHỨC DANH', 16), date('started_on', 'NGÀY VÀO LÀM'), bool('archived', 'NGHỈ'), note(), ...PRIVATE_COLS.slice(0, 2)],
  },
  {
    key: 'catalog_items', label: 'Danh mục (loại CP, người mua, thiết bị, ĐVT)', sheet: 'Danh muc', group: 'danh-ba', table: 'catalog_items', permModule: 'catalog', link: { kind: 'none' },
    columns: [txt('kind', 'NHÓM', 14, (r) => lab(L.catKind, r.kind)), txt('name', 'TÊN', 30), bool('archived', 'NGỪNG DÙNG')],
  },
  {
    key: 'contact_private', label: 'SĐT / CCCD / STK', sheet: 'Du lieu ca nhan', group: 'danh-ba', table: 'contact_private', permModule: 'contacts',
    link: { kind: 'related', sources: [] }, tag: 'cần quyền', privateOnly: true,
    columns: [
      txt('owner', 'NGƯỜI', 24, (r, c) => c.name('workers', r.worker_id) || c.name('customers', r.customer_id) || c.name('employees', r.employee_id) || c.name('subcontractors', r.subcontractor_id)),
      txt('group', 'NHÓM', 11, (r) => (r.worker_id ? 'Công nhân' : r.customer_id ? 'Khách hàng' : r.employee_id ? 'Nhân viên' : 'Thầu phụ')),
      txt('phone', 'SĐT', 14), txt('id_number', 'SỐ CCCD', 15), date('id_issued_on', 'NGÀY CẤP'), date('date_of_birth', 'NGÀY SINH'), txt('gender', 'GIỚI TÍNH', 8),
      txt('hometown', 'QUÊ QUÁN', 18), txt('permanent_address', 'NƠI THƯỜNG TRÚ', 30), txt('bank_account', 'SỐ TÀI KHOẢN', 18), txt('bank_name', 'NGÂN HÀNG', 14), txt('bank_holder', 'CHỦ TÀI KHOẢN', 20),
    ],
  },
  {
    key: 'projects', label: 'Công trình', sheet: 'Cong trinh', group: 'danh-ba', table: 'projects', permModule: 'projects',
    link: { kind: 'direct', field: 'id' }, dateField: 'start_date',
    columns: [txt('name', 'TÊN CÔNG TRÌNH', 34), txt('kind', 'LOẠI', 6, (r) => (r.is_company_overhead ? 'CTY' : lab(L.pKind, r.kind))), txt('status', 'TRẠNG THÁI', 13, (r) => lab(L.pStatus, r.status)),
      ref('customer_id', 'KHÁCH HÀNG', 'customers', 18), txt('address', 'ĐỊA CHỈ', 30), date('start_date', 'BẮT ĐẦU'), date('end_date', 'KẾT THÚC'), dec('cost_weight_k', 'HỆ SỐ K')],
  },

  // ───── TIẾN ĐỘ (GĐ12) ─────
  {
    key: 'schedule_templates', label: 'Mẫu giai đoạn', sheet: 'Mau giai doan', group: 'tien-do', table: 'schedule_templates', permModule: 'schedule', link: { kind: 'none' },
    columns: [txt('name', 'TÊN MẪU', 24), txt('project_kind', 'LOẠI CT', 8, (r) => lab(L.pKind, r.project_kind)), bool('is_default', 'MẶC ĐỊNH'), txt('data', 'NỘI DUNG', 60, (r) => JSON.stringify(r.data ?? []).slice(0, 30000))],
  },
  {
    key: 'schedule_phases', label: 'Giai đoạn thi công', sheet: 'Giai doan', group: 'tien-do', table: 'schedule_phases', permModule: 'schedule',
    link: { kind: 'direct', field: 'project_id' },
    // ngày bắt đầu / kết thúc của giai đoạn là số tính ra từ các việc bên trong (không lưu)
    columns: [txt('name', 'GIAI ĐOẠN', 26), dec('position', 'THỨ TỰ'), note()],
  },
  {
    key: 'schedule_tasks', label: 'Việc thi công', sheet: 'Viec', group: 'tien-do', table: 'schedule_tasks', permModule: 'schedule',
    link: { kind: 'direct', field: 'project_id' }, dateField: 'start_date',
    columns: [txt('name', 'VIỆC', 28), ref('phase_id', 'GIAI ĐOẠN', 'schedule_phases', 20), date('start_date', 'BẮT ĐẦU'), date('end_date', 'KẾT THÚC'), dec('progress_pct', '% XONG'),
      txt('status', 'TRẠNG THÁI', 10, (r) => ({ todo: 'Chưa làm', doing: 'Đang làm', paused: 'Tạm dừng', done: 'Xong' } as Record<string, string>)[String(r.status)] ?? ''),
      txt('kind', 'LOẠI', 6, (r) => (r.kind === 'milestone' ? 'Mốc' : 'Việc')), txt('assignee', 'PHỤ TRÁCH', 14), txt('blocker', 'VƯỚNG MẮC', 24), note()],
  },
  {
    key: 'schedule_notes', label: 'Ghi chú tiến độ', sheet: 'Ghi chu tien do', group: 'tien-do', table: 'schedule_notes', permModule: 'schedule',
    link: { kind: 'direct', field: 'project_id' }, dateField: 'date',
    columns: [date('date'), ref('task_id', 'VIỆC', 'schedule_tasks', 24), dec('progress_pct', '% LÚC GHI'), txt('content', 'NỘI DUNG', 50), dec('images', 'SỐ ẢNH', (r) => (Array.isArray(r.image_paths) ? r.image_paths.length : 0))],
  },
];

export const DATASET: Record<DatasetKey, Dataset> = Object.fromEntries(DATASETS.map((d) => [d.key, d])) as Record<DatasetKey, Dataset>;

/** Các bảng cần tải (gồm bảng chỉ dùng để tra tên) */
export const TABLES = [...new Set([...DATASETS.map((d) => d.table)])];
