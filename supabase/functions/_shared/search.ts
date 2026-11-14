// Tìm kiếm chung — phần DÙNG CHUNG giữa app (ô tìm thanh trên) và Edge Function `search-assist` (nút "Tìm bằng AI").
// Hàm thuần, có test (src/features/search/search.test.ts). Đề xuất: tai-lieu/DE-XUAT-TIM-KIEM.md.

/** Nhóm kết quả — trùng `kind` mà hàm kho public.search_all trả về */
export const SEARCH_KINDS = [
  'project', 'contact', 'shop', 'expense', 'subcontract', 'payment', 'timesheet', 'equipment', 'main_contract', 'receipt',
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const isSearchKind = (v: unknown): v is SearchKind => typeof v === 'string' && (SEARCH_KINDS as readonly string[]).includes(v);

/** Bỏ dấu tiếng Việt, chữ thường, ký tự lạ → khoảng trắng (giống public.search_norm trong kho) */
export function searchNorm(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();
}

/** Cụm từ chỉ NHÓM trong câu tìm ("chấm công nhà chú Thị" → nhóm Chấm công, tìm "nhà chú Thị"). Dài trước, ngắn sau. */
const KIND_PHRASES: [string, SearchKind[]][] = [
  ['so cham cong', ['timesheet']], ['bang cham cong', ['timesheet']], ['cham cong', ['timesheet']],
  ['hop dong thau phu', ['subcontract']], ['hd thau phu', ['subcontract']], ['hdtp', ['subcontract']],
  ['hop dong chinh', ['main_contract']], ['hd chinh', ['main_contract']],
  ['phieu chi', ['payment']], ['tam ung', ['payment']],
  ['phieu thu', ['receipt']], ['thu tien', ['receipt']],
  ['thiet bi', ['equipment']],
  ['cua hang', ['shop']],
  ['hoa don', ['expense']], ['chi phi', ['expense']], ['vat tu', ['expense']],
  ['so dien thoai', ['contact', 'shop']], ['sdt', ['contact', 'shop']], ['danh ba', ['contact']], ['lien he', ['contact']],
];
/** Từ đệm đầu câu khi NÓI ("tìm giúp anh …", "cho em xem …") */
// "anh / em" chỉ bỏ khi đi sau "giúp / cho" — "anh Tư", "em Hùng" là tên người, giữ nguyên
const FILLER = /^(?:(?:tim kiem|tim|kiem|tra cuu|tra|xem|coi)\s+)?(?:(?:giup|cho)\s+(?:anh|em|minh|toi)\s+)?(?:(?:xem|coi|voi)\s+)?/;

/**
 * Tách câu tìm thành chữ cần tìm + nhóm (miễn phí, không cần AI).
 * Bỏ hết chữ chỉ nhóm mà không còn gì → giữ nguyên câu, tìm mọi nhóm.
 */
export function parseQuery(raw: string): { text: string; kinds: SearchKind[] } {
  const norm = ` ${searchNorm(raw)} `;
  const kinds = new Set<SearchKind>();
  let rest = norm;
  for (const [phrase, ks] of KIND_PHRASES) {
    const pat = ` ${phrase} `;
    if (rest.includes(pat)) {
      ks.forEach((k) => kinds.add(k));
      rest = rest.split(pat).join(' ');
    }
  }
  rest = rest.trim().replace(FILLER, '').replace(/\s+/g, ' ').trim();
  if (!rest) return { text: norm.trim().replace(FILLER, '').trim() || norm.trim(), kinds: [] };
  return { text: rest, kinds: [...kinds] };
}

/** Kết quả nút "Tìm bằng AI": từ khóa thêm (tên ghi khác) + nhóm nên tìm + chữ chính (đã bỏ chữ thừa) */
export type SearchAssist = { text: string; terms: string[]; kinds: SearchKind[]; explain: string };
export type SearchAssistResponse = SearchAssist & { mode: 'mock' | 'gemini'; model?: string };

/** Tên hay ghi khác nhau trong nghề — dùng cho chế độ GIẢ LẬP (chưa có key) và làm gợi ý cho AI */
export const SYNONYMS: string[][] = [
  ['day dien', 'cap dien', 'cap', 'cv', 'cvv', 'cadivi', 'day don', 'day doi', 'day 1.5', 'day 2.5', 'day 4.0'],
  ['xi mang', 'xm', 'ha tien', 'insee', 'nghi son'],
  ['sat', 'thep', 'sat phi', 'thep phi', 'd10', 'd12', 'd16', 'sat hop'],
  ['gach', 'gach ong', 'gach the', 'gach dinh', 'gach men', 'gach op', 'gach lat'],
  ['ong nuoc', 'ong pvc', 'ong ppr', 'binh minh', 'ong 21', 'ong 27', 'ong 34', 'ong 60', 'ong 90'],
  ['son', 'son nuoc', 'son lot', 'son phu', 'bot tret', 'jotun', 'dulux', 'kova'],
  ['cat', 'cat xay', 'cat to', 'cat vang', 'cat bt'],
  ['da', 'da 1x2', 'da 4x6', 'da mi'],
  ['chong tham', 'sika', 'kova ct', 'flinkote'],
  ['ton', 'ton lanh', 'ton la', 'ton song'],
  ['den', 'bong den', 'led', 'den led', 'mang den'],
  ['cong tac', 'o cam', 'mat', 'de noi', 'cb', 'aptomat', 'mcb'],
  ['keo', 'silicon', 'keo dan gach', 'keo cha ron'],
  ['van khuon', 'cop pha', 'copha', 'coppha', 'van ep'],
];

/** Chế độ giả lập: mở rộng từ khóa bằng bảng SYNONYMS, chỉ giữ tên có trong danh sách tên vật tư (vocab) nếu có */
export function mockAssist(q: string, vocab: string[] = []): SearchAssist {
  const { text, kinds } = parseQuery(q);
  const words = ` ${text} `;
  const vocabNorm = vocab.map(searchNorm);
  const terms = new Set<string>();
  for (const group of SYNONYMS) {
    const hit = group.find((w) => words.includes(` ${w} `));
    if (!hit) continue;
    const others = text.replace(new RegExp(`(^| )${hit.replace('.', '\\.')}( |$)`), ' ').trim();
    for (const w of group) {
      if (w === hit) continue;
      const term = `${w} ${others}`.trim();
      if (!vocab.length || vocabNorm.some((v) => ` ${v} `.includes(` ${w} `))) terms.add(term);
    }
  }
  return { text, terms: [...terms].slice(0, 12), kinds: kinds.length ? kinds : terms.size ? ['expense'] : [], explain: terms.size ? 'Tìm thêm tên ghi khác (giả lập)' : '' };
}

/** Câu lệnh cho AI: chỉ trả JSON từ khóa — AI KHÔNG trả lời, KHÔNG tính tiền */
export function buildSearchPrompt(vocab: string[], projects: string[]): string {
  return [
    'Bạn giúp TÌM KIẾM trong app quản lý chi phí công trình xây dựng (tiếng Việt). Người dùng gõ hoặc nói một câu tìm.',
    'Việc của bạn: hiểu ý và trả về TỪ KHÓA để app tự tìm trong kho. KHÔNG trả lời câu hỏi, KHÔNG bịa số liệu.',
    '',
    'Trả về DUY NHẤT một JSON: {"text": string, "terms": string[], "kinds": string[], "explain": string}',
    '- text: phần chữ chính cần tìm, bỏ chữ thừa ("tìm giúp anh", "cho em xem"), bỏ chữ chỉ nhóm ("chấm công", "phiếu chi"…). Giữ tên công trình / người.',
    '- terms: tối đa 12 cụm từ khóa KHÁC mà dữ liệu có thể ghi (tên gọi khác, viết tắt, quy cách, thương hiệu) — mỗi cụm 1–4 từ.',
    '  Ưu tiên lấy đúng chữ có trong DANH SÁCH TÊN VẬT TƯ bên dưới. Nếu câu có tên công trình / người thì ghép vào cuối mỗi cụm.',
    '  Ví dụ "dây điện nhà chú Thị" → ["cap 1.5 chu thi", "cadivi chu thi", "cv 2.5 chu thi"].',
    '- kinds: nhóm nên tìm, chọn trong: project (công trình), contact (danh bạ: khách, thầu phụ, NCC, công nhân, nhân viên), shop (cửa hàng),',
    '  expense (hóa đơn / chi phí / vật tư), subcontract (HĐ thầu phụ), payment (phiếu chi, tạm ứng), timesheet (sổ chấm công),',
    '  equipment (thiết bị, máy móc), main_contract (HĐ chính), receipt (phiếu thu). Không chắc thì để [] (tìm mọi nhóm).',
    '- explain: 1 câu ngắn tiếng Việt, vd "Tìm thêm cáp, CV, Cadivi (dây điện)".',
    '',
    `CÔNG TRÌNH: ${projects.slice(0, 300).join(' | ')}`,
    '',
    `DANH SÁCH TÊN VẬT TƯ / LOẠI CHI PHÍ / THIẾT BỊ (hay dùng trước): ${vocab.join(' | ')}`,
  ].join('\n');
}

/** Kiểm tra JSON AI trả về → SearchAssist (bỏ cái lạ, giới hạn số lượng) */
export function normalizeAssist(raw: unknown, q: string): SearchAssist {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const fallback = parseQuery(q);
  const text = typeof o.text === 'string' && searchNorm(o.text) ? searchNorm(o.text) : fallback.text;
  const terms = Array.isArray(o.terms)
    ? [...new Set(o.terms.filter((t): t is string => typeof t === 'string').map(searchNorm).filter((t) => t.length >= 3 && t !== text))].slice(0, 12) // bỏ cụm quá ngắn ("xi") — ra quá nhiều dòng
    : [];
  const kinds = Array.isArray(o.kinds) ? [...new Set(o.kinds.filter(isSearchKind))] : fallback.kinds;
  const explain = typeof o.explain === 'string' ? o.explain.slice(0, 160) : '';
  return { text, terms, kinds, explain };
}
