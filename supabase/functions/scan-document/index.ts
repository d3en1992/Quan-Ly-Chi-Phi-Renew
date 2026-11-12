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
  buildPrompt, GEMINI_RESPONSE_SCHEMA, normalizeScan, pickFixture, SCAN_FIXTURES,
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
    const model = env('GEMINI_MODEL') || 'gemini-2.5-flash';

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(kind, note, ctx) }, { inline_data: { mime_type: mime, data: image } }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_RESPONSE_SCHEMA, temperature: 0 },
      }),
    });
    if (res.status === 429) return json(429, { error: 'Hết lượt AI miễn phí hôm nay. Anh nhập tay giúp em nhé.' });
    if (!res.ok) {
      console.error('Gemini lỗi', res.status, (await res.text()).slice(0, 500));
      return json(502, { error: `AI đọc ảnh lỗi (${res.status}). Thử lại hoặc nhập tay.` });
    }
    const out = await res.json();
    const text: string = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    let raw: unknown = {};
    try { raw = JSON.parse(text); } catch { return json(502, { error: 'AI trả kết quả không đọc được. Thử chụp lại rõ hơn.' }); }
    const resp: ScanResponse = { ...normalizeScan(raw, ctx, kind), mode: 'gemini', model, warning };
    return checkKindAllowed(resp, canInvoice, canIdCard, canContract) ?? json(200, resp);
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
  const names = async (table: string, col = 'name', filter?: (q: any) => any) => {
    let q = sb.from(table).select(col).is('deleted_at', null).limit(2000);
    if (filter) q = filter(q);
    const { data } = await q;
    return ((data ?? []) as Record<string, unknown>[]).map((r) => String(r[col] ?? '')).filter(Boolean);
  };
  const [projects, expense_types, buyers, suppliers, workers, customers, employees] = await Promise.all([
    names('projects', 'name', (q) => q.neq('status', 'closed')),
    names('catalog_items', 'name', (q) => q.eq('kind', 'expense_type').eq('archived', false)),
    names('catalog_items', 'name', (q) => q.eq('kind', 'person').eq('archived', false)),
    names('suppliers', 'name', (q) => q.eq('archived', false)),
    names('workers', 'name', (q) => q.eq('archived', false)),
    names('customers'),
    names('employees', 'full_name', (q) => q.eq('archived', false)),
  ]);
  return { projects, expense_types, suppliers, buyers, workers, customers, employees };
}
