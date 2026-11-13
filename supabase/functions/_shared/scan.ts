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
  /** Mô tả thêm cho AI nhận ra công trình / NCC (chủ đầu tư, địa chỉ, đang thi công, tên gọi khác…) — tên → mô tả */
  project_hints?: Record<string, string>;
  supplier_hints?: Record<string, string>;
  /** Để khớp công trình theo ghi chú bằng code (matchProjectByNote) */
  project_meta?: ProjectMeta[];
  /** Hôm nay (YYYY-MM-DD, giờ VN) — để AI đoán năm khi phiếu ghi thiếu */
  today?: string;
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

// Mẫu JSON viết thẳng trong câu lệnh (giống bot n8n) thay cho responseSchema: schema lồng nhiều tầng làm model lite
// điền nhầm ô (thử 13/11/2026: cả phiếu bị nhét vào supplier_phone), lại chậm hơn.
const TPL_INVOICE = ` "invoice": {
  "date": "YYYY-MM-DD",
  "invoice_no": "",
  "supplier_name": "",      // tên cửa hàng in ở đầu phiếu, ngắn gọn (vd "THÉP AN PHÚ")
  "supplier_address": "",   // 1 địa chỉ, ngắn
  "supplier_phone": "",     // 1 số điện thoại, chỉ chữ số
  "supplier_match": "",     // tên NCC trong DANH MỤC nếu cùng cửa hàng, không thì ""
  "project_match": "",      // tên công trình trong DANH MỤC
  "expense_type_match": "", // loại chi phí trong DANH MỤC
  "buyer_match": "",        // người mua trong DANH MỤC (theo ghi chú), không rõ thì ""
  "printed_total": 0,       // tổng tiền in / viết trên phiếu, đồng
  "lines": [{"name": "", "unit": "", "quantity": 0, "unit_price": 0, "amount": 0, "low_confidence": []}],
  "low_confidence": []      // tên các ô đầu phiếu đọc không chắc
 }`;
const TPL_ID = ` "id_card": {
  "full_name": "IN HOA CÓ DẤU", "id_number": "12 chữ số", "date_of_birth": "YYYY-MM-DD", "gender": "Nam hoặc Nữ",
  "hometown": "", "permanent_address": "", "id_issued_on": "YYYY-MM-DD", "id_issued_place": "",
  "contact_kind": "worker hoặc customer hoặc employee hoặc unknown",  // theo ghi chú: thợ → worker, khách → customer, nhân viên → employee
  "contact_match": "",      // tên trong DANH MỤC (Công nhân / Khách hàng / Nhân viên) nếu cùng người
  "low_confidence": []
 }`;
const TPL_CONTRACT = ` "contract": {
  "customer_name": "", "customer_full_name": "", "customer_address": "", "customer_phone": "",
  "value": 0, "date": "YYYY-MM-DD", "description": "",   // value = giá trị hợp đồng, đồng
  "customer_match": "", "project_match": "",            // tên trong DANH MỤC
  "low_confidence": []
 }`;
function jsonTemplate(kind: ScanRequestKind): string {
  if (kind === 'invoice') return `{\n "kind": "invoice",\n${TPL_INVOICE}\n}`;
  if (kind === 'id_card') return `{\n "kind": "id_card",\n${TPL_ID}\n}`;
  if (kind === 'contract') return `{\n "kind": "contract",\n${TPL_CONTRACT}\n}`;
  return `{\n "kind": "invoice hoặc id_card hoặc contract",\n  // CHỈ điền MỘT phần đúng với kind:\n${TPL_INVOICE},\n${TPL_ID},\n${TPL_CONTRACT}\n}`;
}

const list = (title: string, xs: string[], hints?: Record<string, string>) =>
  xs.length ? `${title}:\n${xs.slice(0, 400).map((x) => `- ${x}${hints?.[x] ? ` (${hints[x]})` : ''}`).join('\n')}` : '';

/** Câu lệnh hệ thống (systemInstruction) — học theo bot Telegram n8n "Bot ghi chi phí công trình V4" (mục "Gom danh mục") */
export function buildPrompt(kind: ScanRequestKind, note: string, ctx: ScanContext): string {
  return [
    'Bạn là trợ lý đọc chứng từ cho một công ty xây nhà phố ở Việt Nam (Công ty Nguyễn Hữu). Đọc ảnh và trả về JSON theo MẪU bên dưới.',
    ctx.today ? `Hôm nay là ${ctx.today}.` : '',
    KIND_TEXT[kind],
    '',
    'QUY TẮC SỐ (rất quan trọng với phiếu viết tay):',
    '- Tiền là số nguyên đồng (1.250.000 → 1250000).',
    '- Phiếu viết tay ở Việt Nam thường VIẾT TẮT, bỏ 3 số 0 cuối, kèm ký hiệu Đ / đ / D / k / n / dấu gạch: "313Đ" = 313000, "10.642Đ" = 10642000, "31.321Đ" = 31321000, "18,5" = 18500, "3tr2" = 3200000, "1tr5" = 1500000.',
    '- LUÔN kiểm tra: số lượng × đơn giá = thành tiền ở TỪNG dòng, và tổng các dòng = tổng in trên phiếu. Chọn cách hiểu số (nghìn hay đồng) sao cho các phép tính KHỚP. Đơn giá vật liệu xây dựng hiếm khi dưới 1.000 đ.',
    '- Nếu đọc xong vẫn không khớp thì vẫn ghi đúng từng số đọc được, điền printed_total và ghi ô nghi sai vào low_confidence.',
    '- Ngày dạng YYYY-MM-DD, ghi ĐÚNG ngày trên chứng từ (Việt Nam ghi ngày/tháng/năm). Thiếu năm thì lấy năm gần nhất không vượt quá hôm nay. Không có ngày thì để trống.',
    '- unit (đơn vị tính) viết thường: cái, bao, xe, kg, m, m2, m3, cây, viên, cuộn, lon, thùng, khối… Ô ĐVT ghi " hoặc // (ditto) thì để trống.',
    '',
    'QUY TẮC TÊN:',
    '- Các ô *_match PHẢI chép ĐÚNG Y một tên trong DANH MỤC bên dưới (giữ dấu, chữ hoa, ngoặc). Không chắc thì để trống. Tuyệt đối không bịa tên mới.',
    '- Ô "Khách hàng" trên phiếu của cửa hàng thường là tên NGƯỜI MUA / chủ nhà, KHÔNG phải tên công trình. Xác định công trình theo ghi chú của người chụp, hoặc địa chỉ giao hàng, hoặc tên chủ đầu tư / tên gọi khác trong ngoặc của danh mục.',
    '- Tên gọi giống nhiều công trình thì ưu tiên công trình ĐANG THI CÔNG.',
    '- KHÔNG ĐOÁN công trình: không có căn cứ rõ (ghi chú, địa chỉ giao hàng, tên chủ nhà trùng chủ đầu tư) thì project_match = "".',
    '- Nhà cung cấp: tên cửa hàng in ở đầu phiếu, SĐT, tên gọi khác trong danh mục. Loại dịch vụ chung chung (xe ba gát, xe tải, thợ…) KHÔNG đủ để đoán.',
    '- Mỗi hóa đơn chọn 1 loại chi phí hợp với phần lớn hàng (vd sắt thép → loại có chữ Sắt Thép).',
    '- Ô nào chữ mờ / viết tay khó đọc / bị che thì ghi tên ô vào low_confidence (của dòng hoặc của đầu phiếu).',
    '',
    note.trim() ? `GHI CHÚ CỦA NGƯỜI CHỤP (ưu tiên khi chọn công trình, loại chi phí, người mua): "${note.trim().slice(0, 500)}"` : 'Người chụp không ghi chú.',
    '',
    'TRẢ VỀ MỘT đối tượng JSON đúng mẫu dưới đây, không viết gì khác (không giải thích, không ```):',
    jsonTemplate(kind),
    '',
    'DANH MỤC',
    list('Công trình', ctx.projects, ctx.project_hints), list('Loại chi phí', ctx.expense_types), list('Nhà cung cấp', ctx.suppliers, ctx.supplier_hints),
    list('Người mua', ctx.buyers), list('Công nhân', ctx.workers), list('Khách hàng', ctx.customers), list('Nhân viên', ctx.employees),
  ].filter((x) => x !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
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

// ───────────── Khớp công trình theo ghi chú (không giao cho AI: model lite hay bỏ qua ghi chú) ─────────────

export type ProjectMeta = { name: string; status?: string | null; owner_name?: string | null; aliases?: string[] | null };

/** Bỏ dấu, chữ thường, gom khoảng trắng: "Cô Phụng" → "co phung" */
export function foldVi(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Các cách gọi 1 công trình: tên đầy đủ, tên bỏ tiền tố CT/SC/SN và phần trong ngoặc, chủ đầu tư, tên gọi khác */
function projectKeys(p: ProjectMeta): string[] {
  const core = p.name.replace(/\(.*?\)/g, ' ').replace(/^\s*(CT|SC|SN|NB)\b\s*-?\s*/i, ' ').split(/\s+-\s+/)[0] ?? '';
  const keys = [p.name, core, p.owner_name ?? '', ...(p.aliases ?? [])].map(foldVi);
  return [...keys, ...keys.map((k) => k.replace(/^nha /, ''))].filter((k) => k.length >= 4);
}

/**
 * Ghi chú nhắc tới đúng 1 công trình → tên công trình đó; nhiều công trình khớp thì ưu tiên công trình đang thi công,
 * vẫn còn nhiều (hoặc không khớp) → ''. Khớp nguyên cụm từ (ranh giới từ), không phân biệt dấu.
 */
export function matchProjectByNote(note: string, projects: readonly ProjectMeta[]): string {
  const n = ` ${foldVi(note)} `;
  if (n.trim().length < 3) return '';
  // Điểm = độ dài cụm khớp dài nhất ("tinh dang" thắng "tinh"); chỉ giữ các công trình điểm cao nhất
  const scored = projects.map((p) => ({ p, score: Math.max(0, ...projectKeys(p).filter((k) => n.includes(` ${k} `)).map((k) => k.length)) }));
  const best = Math.max(0, ...scored.map((x) => x.score));
  if (!best) return '';
  const hits = scored.filter((x) => x.score === best).map((x) => x.p);
  if (hits.length === 1) return hits[0]!.name;
  const active = hits.filter((p) => p.status === 'active');
  return active.length === 1 ? active[0]!.name : '';
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
