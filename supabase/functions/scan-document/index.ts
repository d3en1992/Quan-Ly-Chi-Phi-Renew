// Edge Function scan-document — Chụp đa năng (GĐ9, KẾ HOẠCH mục 4D, 4G).
// Nhận ảnh (đã thu nhỏ ≤ 1600px, base64) + ghi chú + loại (auto / invoice / id_card / contract), gửi Gemini với JSON schema,
// kèm danh sách công trình / loại chi phí / NCC / người mua / công nhân / khách hàng để AI khớp tên. Trả kết quả + ô AI không chắc.
//
// Key Gemini: Supabase secret GEMINI_API_KEY (hóa đơn, gói miễn phí) và GEMINI_API_KEY_PAID (CCCD, gói trả tiền — Google không
// dùng dữ liệu). Không có key → chế độ GIẢ LẬP: trả fixtures/*.json (để làm và test giao diện). Key không bao giờ tới trình duyệt.
// Ảnh KHÔNG được lưu ở đây (CCCD đọc xong là bỏ; ảnh hóa đơn do app tự tải lên Storage lúc bấm Lưu).
//
// Gọi: supabase.functions.invoke('scan-document', { body: { image_base64, mime_type, note, kind, fixture? } })
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildPrompt, matchProjectByNote, normalizeScan, pickFixture, SCAN_FIXTURES,
  type ScanContext, type ScanRequestKind, type ScanResponse,
} from '../_shared/scan.ts';
import fxInvoiceNew from './fixtures/hoa-don-ncc-moi.json' with { type: 'json' };
import fxInvoiceBlur from './fixtures/hoa-don-chu-mo.json' with { type: 'json' };
import fxIdCard from './fixtures/cccd.json' with { type: 'json' };
import fxContract from './fixtures/hop-dong.json' with { type: 'json' };

const FIXTURES: Record<string, unknown> = {
  'hoa-don-ncc-moi': fxInvoiceNew, 'hoa-don-chu-mo': fxInvoiceBlur, cccd: fxIdCard, 'hop-dong': fxContract,
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const env = (...names: string[]) => {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  return '';
};

type Body = { image_base64?: string; mime_type?: string; note?: string; kind?: ScanRequestKind; fixture?: string };
const KINDS: ScanRequestKind[] = ['auto', 'invoice', 'id_card', 'contract'];
/** Thứ tự xoay tua mặc định — model đầu đọc tốt nhất; mỗi model gói miễn phí có lượt riêng (≈ 5 lần/phút, 20 lần/ngày) */
// Model lite lên đầu (anh Tình chốt 13/11/2026: nhanh, đọc đủ chính xác, nhiều lượt/phút); bản 2.5 đã ngừng cho key mới
const DEFAULT_MODELS = 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash,gemini-3.7-flash';
/** Mức "suy nghĩ" của Gemini 3: minimal = nhanh nhất (giống bot n8n). Đổi bằng secret GEMINI_THINKING (minimal/low/medium/high) */
const DEFAULT_THINKING = 'minimal';
const PER_MODEL_TIMEOUT_MS = 30_000;
const TOTAL_BUDGET_MS = 110_000;
const MAX_BASE64 = 4_500_000; // ~3,3 MB ảnh — ảnh đã thu nhỏ 1600px chỉ khoảng 200–500 KB

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Chỉ nhận POST' });

  try {
    const url = env('SUPABASE_URL');
    const anonKey = env('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');
    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: userData, error: userErr } = await caller.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (userErr || !userData.user) return json(401, { error: 'Chưa đăng nhập' });

    const body = (await req.json().catch(() => ({}))) as Body;
    const kind: ScanRequestKind = KINDS.includes(body.kind as ScanRequestKind) ? (body.kind as ScanRequestKind) : 'auto';
    const note = String(body.note ?? '').slice(0, 500);

    // Quyền: hóa đơn cần Nhập ở Nhập Chi Phí; CCCD cần Nhập ở Danh Bạ + "Xem SĐT, số CCCD"; hợp đồng cần Nhập ở Doanh Thu
    const can = async (fn: 'has_permission' | 'has_special', args: Record<string, string>) => {
      const { data } = await caller.rpc(fn, args);
      return data === true;
    };
    const canInvoice = await can('has_permission', { module: 'expenses', level: 'add' });
    const canIdCard = (await can('has_permission', { module: 'contacts', level: 'add' })) && (await can('has_special', { flag: 'see_contact_ids' }));
    const canContract = await can('has_permission', { module: 'revenue', level: 'add' });
    const allowed = kind === 'invoice' ? canInvoice : kind === 'id_card' ? canIdCard : kind === 'contract' ? canContract : canInvoice || canIdCard || canContract;
    if (!allowed) return json(403, { error: 'Tài khoản không có quyền dùng chức năng chụp này.' });

    const ctx = await loadContext(caller);
    const freeKey = env('GEMINI_API_KEY');
    const paidKey = env('GEMINI_API_KEY_PAID');

    // ---------- Giả lập ----------
    if (!freeKey && !paidKey) {
      const name = body.fixture && (SCAN_FIXTURES as readonly string[]).includes(body.fixture) ? body.fixture : pickFixture(kind, note);
      const result = normalizeScan(FIXTURES[name], ctx, kind);
      const resp: ScanResponse = { ...result, mode: 'mock', warning: 'Chưa có key Gemini — đang dùng dữ liệu mẫu (giả lập).' };
      return checkKindAllowed(resp, canInvoice, canIdCard, canContract) ?? json(200, resp);
    }

    // ---------- Gemini thật ----------
    const image = String(body.image_base64 ?? '');
    if (!image) return json(400, { error: 'Chưa có ảnh' });
    if (image.length > MAX_BASE64) return json(413, { error: 'Ảnh quá lớn — thử chụp lại.' });
    const mime = /^image\/(jpeg|png|webp)$/.test(String(body.mime_type)) ? String(body.mime_type) : 'image/jpeg';

    // CCCD (hoặc chưa biết loại) → ưu tiên key trả tiền để Google không dùng ảnh giấy tờ cá nhân
    const privacy = kind === 'id_card' || kind === 'auto';
    const key = privacy ? paidKey || freeKey : freeKey || paidKey;
    const warning = privacy && !paidKey ? 'Chưa có GEMINI_API_KEY_PAID — ảnh này được đọc bằng key miễn phí.' : undefined;
    // Xoay tua model (giống bot n8n): model nào hết lượt (429) / quá tải (503) / không dùng được (404…) / treo → chuyển model sau.
    // Đổi danh sách bằng secret GEMINI_MODELS="model-a,model-b,…" (không cần sửa code).
    const models = (env('GEMINI_MODELS', 'GEMINI_MODEL') || DEFAULT_MODELS).split(',').map((m) => m.trim()).filter(Boolean);

    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: buildPrompt(kind, note, ctx) }] },
      contents: [{ role: 'user', parts: [
        { text: note.trim() ? `Ảnh chứng từ. Ghi chú của người chụp: ${note.trim()}` : 'Ảnh chứng từ, không có ghi chú.' },
        { inline_data: { mime_type: mime, data: image } },
      ] }],
      generationConfig: {
        responseMimeType: 'application/json', temperature: 0.1, // không gửi responseSchema — mẫu JSON nằm trong câu lệnh
        thinkingConfig: { thinkingLevel: env('GEMINI_THINKING') || DEFAULT_THINKING },
      },
    });
    const started = Date.now();
    const fails: { model: string; status: number }[] = [];
    for (const model of models) {
      if (Date.now() - started > TOTAL_BUDGET_MS) break; // hàm máy chủ bị cắt ở ~150 giây
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: payload,
          signal: AbortSignal.timeout(PER_MODEL_TIMEOUT_MS),
        });
      } catch {
        fails.push({ model, status: 504 }); // treo quá lâu / mất mạng
        continue;
      }
      if (!res.ok) {
        console.error('Gemini lỗi', model, res.status, (await res.text()).slice(0, 300));
        fails.push({ model, status: res.status });
        continue;
      }
      const out = await res.json();
      const text: string = (out?.candidates?.[0]?.content?.parts ?? [])
        .filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? '').join('')
        .replace(/^\s*```(json)?/i, '').replace(/```\s*$/, '');
      let raw: unknown;
      try { raw = JSON.parse(text); } catch {
        fails.push({ model, status: 422 }); // trả về không phải JSON → thử model khác
        continue;
      }
      if (fails.length) console.log('Đổi model', fails.map((f) => `${f.model}:${f.status}`).join(' → '), '→', model);
      const result = normalizeScan(raw, ctx, kind);
      // Ghi chú nhắc đúng 1 công trình → dùng công trình đó (chắc hơn AI); không thì giữ AI chọn
      const byNote = matchProjectByNote(note, ctx.project_meta ?? []);
      if (byNote && result.kind === 'invoice') result.invoice.project_match = byNote;
      // AI tự chọn công trình (không dựa vào ghi chú) → tô vàng để người dùng xem lại
      if (!byNote && result.kind === 'invoice' && result.invoice.project_match && !result.invoice.low_confidence.includes('project_match')) {
        result.invoice.low_confidence.push('project_match');
      }
      if (byNote && result.kind === 'contract') result.contract.project_match = byNote;
      const resp: ScanResponse = { ...result, mode: 'gemini', model, warning };
      return checkKindAllowed(resp, canInvoice, canIdCard, canContract) ?? json(200, resp);
    }
    // Mọi model đều lỗi
    const codes = fails.map((f) => f.status);
    if (codes.length && codes.every((c) => c === 429 || c === 404 || c === 403)) {
      return json(429, { error: 'Hết lượt AI miễn phí của tất cả mô hình. Đợi 1 phút (hoặc đến mai) rồi thử lại, hoặc nhập tay.' });
    }
    if (codes.some((c) => c === 503 || c === 500 || c === 504)) {
      return json(503, { error: 'AI của Google đang quá tải. Đợi một lát rồi bấm lại.' });
    }
    return json(502, { error: `AI đọc ảnh lỗi (${codes.join(', ') || 'không có mô hình'}). Thử lại hoặc nhập tay.` });
  } catch (e) {
    console.error(e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});

/** AI tự nhận ra loại mà người này không có quyền (ví dụ CCCD với tài khoản không xem được CCCD) → không trả dữ liệu */
function checkKindAllowed(r: ScanResponse, inv: boolean, id: boolean, ct: boolean): Response | null {
  const ok = r.kind === 'invoice' ? inv : r.kind === 'id_card' ? id : ct;
  if (ok) return null;
  const what = r.kind === 'invoice' ? 'hóa đơn' : r.kind === 'id_card' ? 'CCCD' : 'hợp đồng';
  return json(403, { error: `Ảnh này là ${what} — tài khoản không có quyền nhập loại này.` });
}

/** Danh sách tên cho AI khớp — đọc bằng chính phiên của người gọi (RLS lọc theo quyền) */
async function loadContext(sb: ReturnType<typeof createClient>): Promise<ScanContext> {
  const rows = async (table: string, cols: string, filter?: (q: any) => any) => {
    let q = sb.from(table).select(cols).is('deleted_at', null).limit(2000);
    if (filter) q = filter(q);
    const { data } = await q;
    return (data ?? []) as Record<string, unknown>[];
  };
  const names = async (table: string, col = 'name', filter?: (q: any) => any) =>
    (await rows(table, col, filter)).map((r) => String(r[col] ?? '')).filter(Boolean);
  const [projectRows, expense_types, buyers, supplierRows, workers, customers, employees] = await Promise.all([
    rows('projects', 'name, status, owner_name, address, aliases, note'), // gửi cả CT đã đóng (dữ liệu trạng thái hay chưa cập nhật) — AI ưu tiên CT đang thi công
    names('catalog_items', 'name', (q) => q.eq('kind', 'expense_type').eq('archived', false)),
    names('catalog_items', 'name', (q) => q.eq('kind', 'person').eq('archived', false)),
    rows('suppliers', 'name, phone, note', (q) => q.eq('archived', false)),
    names('workers', 'name', (q) => q.eq('archived', false)),
    names('customers'),
    names('employees', 'full_name', (q) => q.eq('archived', false)),
  ]);
  const short = (v: unknown, n = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const project_hints: Record<string, string> = {};
  const projects = projectRows.map((r) => {
    const name = String(r.name ?? '');
    const bits = [
      r.status === 'active' ? 'ĐANG THI CÔNG' : r.status === 'completed' ? 'đã xong' : r.status === 'closed' ? 'đã đóng' : '',
      short(r.owner_name) && `chủ đầu tư: ${short(r.owner_name)}`,
      short(r.address) && `địa chỉ: ${short(r.address)}`,
      Array.isArray(r.aliases) && r.aliases.length ? `tên gọi khác: ${r.aliases.slice(0, 5).join(', ')}` : '',
      short(r.note, 60),
    ].filter(Boolean);
    if (name && bits.length) project_hints[name] = bits.join('; ');
    return name;
  }).filter(Boolean);
  const supplier_hints: Record<string, string> = {};
  const suppliers = supplierRows.map((r) => {
    const name = String(r.name ?? '');
    const bits = [short(r.phone, 30) && `SĐT ${short(r.phone, 30)}`, short(r.note, 60)].filter(Boolean);
    if (name && bits.length) supplier_hints[name] = bits.join('; ');
    return name;
  }).filter(Boolean);
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // giờ Việt Nam
  const project_meta = projectRows.map((r) => ({
    name: String(r.name ?? ''), status: String(r.status ?? ''), owner_name: short(r.owner_name),
    aliases: Array.isArray(r.aliases) ? r.aliases.map(String) : [],
  })).filter((p) => p.name);
  return { projects, expense_types, suppliers, buyers, workers, customers, employees, project_hints, supplier_hints, project_meta, today };
}
