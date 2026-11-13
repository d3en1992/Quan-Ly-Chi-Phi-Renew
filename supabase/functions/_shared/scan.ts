// Chụp đa năng (GĐ9) — phần DÙNG CHUNG giữa Edge Function `scan-document` (Deno) và app (Vite):
// kiểu kết quả, JSON schema gửi Gemini, câu lệnh cho AI, và hàm chuẩn hóa kết quả AI trả về (hàm thuần, có test).
// Không import gì để chạy được ở cả hai nơi.

export type ScanKind = 'invoice' | 'id_card' | 'contract';
export type ScanRequestKind = 'auto' | ScanKind;

export type InvoiceLine = {
  name: string; unit: string; quantity: number; unit_price: number; amount: number;
  /** Ô AI không chắc trong dòng này: 'name' | 'unit' | 'quantity' | 'unit_price' | 'amount' */
  low_confidence: string[];
};
export type InvoiceScan = {
  date: string;              // YYYY-MM-DD hoặc ''
  invoice_no: string;
  supplier_name: string;     // tên cửa hàng in trên hóa đơn
  supplier_address: string;
  supplier_phone: string;
  /** Tên trong danh mục AI cho là khớp ('' = không khớp ai) */
  supplier_match: string;
  project_match: string;
  expense_type_match: string;
  buyer_match: string;
  printed_total: number;     // số TỔNG in trên hóa đơn (0 = không thấy)
  lines: InvoiceLine[];
  /** Ô đầu phiếu AI không chắc: date, invoice_no, supplier_name, supplier_address, supplier_phone, printed_total, project_match, expense_type_match */
  low_confidence: string[];
};
export type IdCardScan = {
  full_name: string; id_number: string; date_of_birth: string; gender: string;
  hometown: string; permanent_address: string; id_issued_on: string; id_issued_place: string;
  /** 'worker' | 'customer' | 'employee' | '' — theo ghi chú ("CCCD thợ Hiền" → worker) */
  contact_kind: string;
  /** Tên gọi trong danh bạ AI cho là cùng người ('' = không thấy) */
  contact_match: string;
  low_confidence: string[];
};
export type ContractScan = {
  customer_name: string; customer_full_name: string; customer_address: string; customer_phone: string;
  value: number; date: string; description: string;
  customer_match: string; project_match: string;
  low_confidence: string[];
};

export type ScanResult =
  | { kind: 'invoice'; invoice: InvoiceScan }
  | { kind: 'id_card'; id_card: IdCardScan }
  | { kind: 'contract'; contract: ContractScan };

export type ScanResponse = ScanResult & {
  /** 'gemini' = AI đọc thật · 'mock' = chưa có key, đọc từ fixtures */
  mode: 'gemini' | 'mock';
  model?: string;
  warning?: string;
};

/** Danh sách tên đưa kèm cho AI khớp */
export type ScanContext = {
  projects: string[]; expense_types: string[]; suppliers: string[]; buyers: string[];
  workers: string[]; customers: string[]; employees: string[];
};

// ───────────── JSON schema (dạng OpenAPI mà Gemini nhận) ─────────────

const S = (description?: string) => ({ type: 'STRING', ...(description ? { description } : {}) });
const N = (description?: string) => ({ type: 'NUMBER', ...(description ? { description } : {}) });
const LOW = { type: 'ARRAY', items: { type: 'STRING' }, description: 'Tên các ô đọc KHÔNG chắc (chữ mờ, viết tay khó đọc, bị che)' };

export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['invoice', 'id_card', 'contract'] },
    invoice: {
      type: 'OBJECT',
      properties: {
        date: S('YYYY-MM-DD'), invoice_no: S(), supplier_name: S('Tên cửa hàng in ở đầu hóa đơn'), supplier_address: S(), supplier_phone: S(),
        supplier_match: S('Tên NCC trong danh sách có sẵn nếu cùng cửa hàng, không thì để trống'),
        project_match: S('Tên công trình trong danh sách, theo ghi chú'), expense_type_match: S('Loại chi phí trong danh sách'),
        buyer_match: S('Người mua trong danh sách, theo ghi chú'), printed_total: N('Số tổng in trên hóa đơn, đồng'),
        lines: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { name: S(), unit: S(), quantity: N(), unit_price: N('đồng'), amount: N('thành tiền, đồng'), low_confidence: LOW },
            required: ['name', 'quantity', 'unit_price', 'amount'],
          },
        },
        low_confidence: LOW,
      },
    },
    id_card: {
      type: 'OBJECT',
      properties: {
        full_name: S('IN HOA có dấu'), id_number: S('12 số'), date_of_birth: S('YYYY-MM-DD'), gender: S('Nam / Nữ'),
        hometown: S('Quê quán'), permanent_address: S('Nơi thường trú'), id_issued_on: S('YYYY-MM-DD'), id_issued_place: S(),
        contact_kind: { type: 'STRING', enum: ['worker', 'customer', 'employee', 'unknown'] }, // Gemini không nhận giá trị rỗng trong enum; 'unknown' → '' ở normalizeScan
        contact_match: S('Tên gọi trong danh bạ nếu cùng người'), low_confidence: LOW,
      },
    },
    contract: {
      type: 'OBJECT',
      properties: {
        customer_name: S('Tên gọi ngắn của chủ đầu tư'), customer_full_name: S(), customer_address: S(), customer_phone: S(),
        value: N('Giá trị hợp đồng, đồng'), date: S('YYYY-MM-DD'), description: S('Hạng mục / nội dung chính'),
        customer_match: S('Khách hàng trong danh sách nếu cùng người'), project_match: S('Công trình trong danh sách'), low_confidence: LOW,
      },
    },
  },
  required: ['kind'],
};

const KIND_TEXT: Record<ScanRequestKind, string> = {
  auto: 'Tự nhận loại giấy tờ: hóa đơn bán hàng (invoice), căn cước công dân (id_card) hay hợp đồng thi công (contract).',
  invoice: 'Đây là HÓA ĐƠN / phiếu giao hàng (invoice).',
  id_card: 'Đây là CĂN CƯỚC CÔNG DÂN (id_card). Đọc cả hai mặt nếu có.',
  contract: 'Đây là HỢP ĐỒNG thi công (contract).',
};

const list = (title: string, xs: string[]) => (xs.length ? `${title}: ${xs.slice(0, 400).join(' | ')}` : '');

/** Câu lệnh gửi kèm ảnh */
export function buildPrompt(kind: ScanRequestKind, note: string, ctx: ScanContext): string {
  return [
    'Bạn đọc giấy tờ của một công ty xây dựng ở Việt Nam. Trả về JSON đúng schema, chỉ điền phần của đúng loại giấy tờ.',
    KIND_TEXT[kind],
    'Tiền là số nguyên đồng (1.250.000 → 1250000). Ngày dạng YYYY-MM-DD. Không bịa: không đọc được thì để trống và ghi tên ô vào low_confidence.',
    'Ô nào chữ mờ / viết tay khó đọc / bị che thì ghi tên ô vào low_confidence (của dòng hoặc của đầu phiếu).',
    'Chỉ điền *_match bằng ĐÚNG một tên có trong danh sách dưới đây; không chắc thì để trống.',
    note.trim() ? `Ghi chú của người chụp: "${note.trim().slice(0, 500)}"` : '',
    list('Công trình', ctx.projects), list('Loại chi phí', ctx.expense_types), list('Nhà cung cấp', ctx.suppliers),
    list('Người mua', ctx.buyers), list('Công nhân', ctx.workers), list('Khách hàng', ctx.customers), list('Nhân viên', ctx.employees),
  ].filter(Boolean).join('\n');
}

// ───────────── Chuẩn hóa kết quả AI ─────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** Tiền / số AI trả có thể là "1.250.000" hoặc 1250000 → số nguyên đồng, không âm */
export function toMoney(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  const digits = str(v).replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

/** Số lượng: "2,5" → 2.5 */
export function toQuantity(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const n = Number(str(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Ngày: YYYY-MM-DD hoặc dd/mm/yyyy → YYYY-MM-DD; sai → '' */
export function toIsoDate(v: unknown): string {
  const s = str(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]!; mo = +m[2]!; d = +m[3]!; } else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (!m) return '';
    d = +m[1]!; mo = +m[2]!; y = +m[3]!;
  }
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Chỉ giữ tên *_match nếu nó có thật trong danh sách (AI hay "sáng tác") */
function pick(v: unknown, allowed: readonly string[]): string {
  const s = str(v);
  if (!s) return '';
  const low = s.toLowerCase();
  return allowed.find((a) => a.toLowerCase() === low) ?? '';
}

export function normalizeScan(raw: unknown, ctx: ScanContext, fallbackKind: ScanRequestKind = 'auto'): ScanResult {
  const r = isObj(raw) ? raw : {};
  let kind = str(r.kind) as ScanKind;
  if (!['invoice', 'id_card', 'contract'].includes(kind)) {
    kind = fallbackKind !== 'auto' ? fallbackKind : isObj(r.id_card) ? 'id_card' : isObj(r.contract) ? 'contract' : 'invoice';
  }
  if (kind === 'id_card') {
    const c = isObj(r.id_card) ? r.id_card : {};
    const ck = str(c.contact_kind);
    const pool = ck === 'customer' ? ctx.customers : ck === 'employee' ? ctx.employees : ctx.workers;
    return {
      kind, id_card: {
        full_name: str(c.full_name).toUpperCase(), id_number: str(c.id_number).replace(/\D/g, ''), date_of_birth: toIsoDate(c.date_of_birth),
        gender: str(c.gender), hometown: str(c.hometown), permanent_address: str(c.permanent_address),
        id_issued_on: toIsoDate(c.id_issued_on), id_issued_place: str(c.id_issued_place),
        contact_kind: ['worker', 'customer', 'employee'].includes(ck) ? ck : '', contact_match: pick(c.contact_match, pool),
        low_confidence: strs(c.low_confidence),
      },
    };
  }
  if (kind === 'contract') {
    const c = isObj(r.contract) ? r.contract : {};
    return {
      kind, contract: {
        customer_name: str(c.customer_name), customer_full_name: str(c.customer_full_name), customer_address: str(c.customer_address),
        customer_phone: str(c.customer_phone), value: toMoney(c.value), date: toIsoDate(c.date), description: str(c.description),
        customer_match: pick(c.customer_match, ctx.customers), project_match: pick(c.project_match, ctx.projects),
        low_confidence: strs(c.low_confidence),
      },
    };
  }
  const i = isObj(r.invoice) ? r.invoice : {};
  const lines = Array.isArray(i.lines) ? i.lines.filter(isObj) : [];
  return {
    kind: 'invoice', invoice: {
      date: toIsoDate(i.date), invoice_no: str(i.invoice_no), supplier_name: str(i.supplier_name).replace(/\s+/g, ' '),
      supplier_address: str(i.supplier_address), supplier_phone: str(i.supplier_phone),
      supplier_match: pick(i.supplier_match, ctx.suppliers), project_match: pick(i.project_match, ctx.projects),
      expense_type_match: pick(i.expense_type_match, ctx.expense_types), buyer_match: pick(i.buyer_match, ctx.buyers),
      printed_total: toMoney(i.printed_total),
      lines: lines.map((l) => ({
        name: str(l.name), unit: str(l.unit), quantity: toQuantity(l.quantity), unit_price: toMoney(l.unit_price), amount: toMoney(l.amount),
        low_confidence: strs(l.low_confidence),
      })).filter((l) => l.name || l.amount || l.unit_price),
      low_confidence: strs(i.low_confidence),
    },
  };
}

/** Chế độ giả lập: chọn fixture theo loại + ghi chú (không cần key) */
export function pickFixture(kind: ScanRequestKind, note: string): string {
  const n = note.toLowerCase();
  if (kind === 'id_card' || /cccd|căn cước|can cuoc/.test(n)) return 'cccd';
  if (kind === 'contract' || /hợp đồng|hop dong/.test(n)) return 'hop-dong';
  if (/mờ|mo\b|blur/.test(n)) return 'hoa-don-chu-mo';
  return 'hoa-don-ncc-moi';
}

export const SCAN_FIXTURES = ['hoa-don-ncc-moi', 'hoa-don-chu-mo', 'cccd', 'hop-dong'] as const;
