// Edge Function scan-document — Trợ lý AI (nút AI; trước là Chụp đa năng GĐ9, KẾ HOẠCH mục 4D, 4G).
// Nhận ảnh (đã thu nhỏ ≤ 1600px) / PDF / ghi âm (WAV) / chữ (Excel đã đổi ra chữ) + ghi chú + loại, gửi Gemini (mẫu JSON trong câu lệnh),
// kèm danh mục công trình / loại chi phí / NCC / thầu phụ / khách hàng để AI khớp tên. Trả kết quả + ô AI không chắc.
// Loại: invoice (hóa đơn / sổ cộng tiền), advance (tiền ứng thầu phụ), receipt (thu tiền khách), contract (hợp đồng / dự toán),
// material_list (danh sách vật tư cần mua — không lưu), id_card (chỉ nút Chụp CCCD ở Danh Bạ).
//
// Key Gemini: Supabase secret GEMINI_API_KEY (hóa đơn, gói miễn phí) và GEMINI_API_KEY_PAID (CCCD, gói trả tiền — Google không
// dùng dữ liệu). Không có key → chế độ GIẢ LẬP: trả fixtures/*.json (để làm và test giao diện). Key không bao giờ tới trình duyệt.
// Ảnh KHÔNG được lưu ở đây (CCCD đọc xong là bỏ; ảnh hóa đơn do app tự tải lên Storage lúc bấm Lưu).
//
// Gọi: supabase.functions.invoke('scan-document', { body: { files: [{ mime_type, data }], text?, note, kind, fixture? } })
//      (cách cũ { image_base64, mime_type } vẫn nhận)
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  applyProjectGuess, buildPrompt, normalizeScan, pickFixture, promptKinds, SCAN_FIXTURES, scanExtras, supplierRecentProjects,
  type ExpenseHistoryRow, type KindPermissions, type ScanContext, type ScanKind, type ScanRequestKind, type ScanResponse,
} from '../_shared/scan.ts';
import fxInvoiceNew from './fixtures/hoa-don-ncc-moi.json' with { type: 'json' };
import fxInvoiceBlur from './fixtures/hoa-don-chu-mo.json' with { type: 'json' };
import fxIdCard from './fixtures/cccd.json' with { type: 'json' };
import fxContract from './fixtures/hop-dong.json' with { type: 'json' };
import fxAdvance from './fixtures/tien-ung.json' with { type: 'json' };
import fxReceipt from './fixtures/thu-tien.json' with { type: 'json' };
import fxMaterials from './fixtures/vat-tu.json' with { type: 'json' };

const FIXTURES: Record<string, unknown> = {
  'hoa-don-ncc-moi': fxInvoiceNew, 'hoa-don-chu-mo': fxInvoiceBlur, cccd: fxIdCard, 'hop-dong': fxContract,
  'tien-ung': fxAdvance, 'thu-tien': fxReceipt, 'vat-tu': fxMaterials,
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

type InFile = { mime_type?: string; data?: string };
type Body = { image_base64?: string; mime_type?: string; files?: InFile[]; text?: string; note?: string; kind?: ScanRequestKind; fixture?: string };
const KINDS: ScanRequestKind[] = ['auto', 'invoice', 'advance', 'receipt', 'contract', 'material_list', 'id_card'];
/** Loại tệp Gemini đọc được: ảnh, PDF, âm thanh (app đổi ghi âm sang WAV) */
const MIME_OK = /^(image\/(jpeg|png|webp)|application\/pdf|audio\/(wav|x-wav|webm|ogg|mp4|mpeg|aac|flac))$/;
const KIND_LABEL: Record<ScanKind, string> = {
  invoice: 'hóa đơn', advance: 'tiền ứng thầu phụ', receipt: 'thu tiền khách', contract: 'hợp đồng', material_list: 'danh sách vật tư', id_card: 'CCCD',
};
/** Thứ tự xoay tua mặc định — model đầu đọc tốt nhất; mỗi model gói miễn phí có lượt riêng (≈ 5 lần/phút, 20 lần/ngày) */
// Model lite lên đầu (anh Tình chốt 13/11/2026: nhanh, đọc đủ chính xác, nhiều lượt/phút); bản 2.5 đã ngừng cho key mới
const DEFAULT_MODELS = 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash,gemini-3.7-flash';
/** Mức "suy nghĩ" của Gemini 3: minimal = nhanh nhất (giống bot n8n). Đổi bằng secret GEMINI_THINKING (minimal/low/medium/high) */
const DEFAULT_THINKING = 'minimal';
const PER_MODEL_TIMEOUT_MS = 30_000;
const TOTAL_BUDGET_MS = 110_000;
const MAX_BASE64 = 7_000_000; // tổng các tệp ~5 MB — ảnh đã thu nhỏ 1600px chỉ 200–500 KB, ghi âm 60 giây ~2 MB

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

    // Quyền theo loại: hóa đơn = Nhập ở Chi phí; tiền ứng = Nhập ở Phiếu chi; thu tiền / hợp đồng = Nhập ở Doanh thu;
    // danh sách vật tư = ai nhập được hóa đơn hoặc phiếu chi; CCCD = Nhập ở Danh Bạ + "Xem SĐT, số CCCD"
    const can = async (fn: 'has_permission' | 'has_special', args: Record<string, string>) => {
      const { data } = await caller.rpc(fn, args);
      return data === true;
    };
    const [canInvoice, canPayments, canRevenue, canContacts, canSeeIds] = await Promise.all([
      can('has_permission', { module: 'expenses', level: 'add' }), can('has_permission', { module: 'payments', level: 'add' }),
      can('has_permission', { module: 'revenue', level: 'add' }), can('has_permission', { module: 'contacts', level: 'add' }),
      can('has_special', { flag: 'see_contact_ids' }),
    ]);
    const perms: KindPermissions = {
      invoice: canInvoice, advance: canPayments, receipt: canRevenue, contract: canRevenue,
      material_list: canInvoice || canPayments, id_card: canContacts && canSeeIds,
    };
    const allowed = kind === 'auto' ? promptKinds('auto', perms).some((k) => perms[k]) : !!perms[kind];
    if (!allowed) return json(403, { error: 'Tài khoản không có quyền dùng chức năng này.' });

    const ctx = await loadContext(caller);
    const freeKey = env('GEMINI_API_KEY');
    const paidKey = env('GEMINI_API_KEY_PAID');

    // ---------- Giả lập ----------
    if (!freeKey && !paidKey) {
      const name = body.fixture && (SCAN_FIXTURES as readonly string[]).includes(body.fixture) ? body.fixture : pickFixture(kind, `${note} ${body.text ?? ''}`);
      const raw = FIXTURES[name];
      const result = applyProjectGuess(normalizeScan(raw, ctx, kind), note, ctx);
      const resp: ScanResponse = { ...result, ...scanExtras(raw), mode: 'mock', warning: 'Chưa có key Gemini — đang dùng dữ liệu mẫu (giả lập).' };
      return checkKindAllowed(resp, perms) ?? json(200, resp);
    }

    // ---------- Gemini thật ----------
    const files: InFile[] = [...(body.files ?? []), ...(body.image_base64 ? [{ mime_type: body.mime_type, data: body.image_base64 }] : [])]
      .filter((f) => f && typeof f.data === 'string' && f.data.length > 0).slice(0, 4);
    const text = String(body.text ?? '').slice(0, 60_000);
    if (!files.length && !text.trim() && !note.trim()) return json(400, { error: 'Chưa có ảnh, tệp, ghi âm hay lời nhắn nào.' });
    if (files.reduce((n, f) => n + f.data!.length, 0) > MAX_BASE64) return json(413, { error: 'Tệp quá lớn — gửi ảnh / PDF nhỏ hơn, hoặc ghi âm ngắn hơn.' });
    const bad = files.find((f) => !MIME_OK.test(String(f.mime_type)));
    if (bad) return json(415, { error: `Chưa đọc được loại tệp ${bad.mime_type || '(không rõ)'} — gửi ảnh, PDF hoặc Excel .xlsx.` });
    const hasAudio = files.some((f) => String(f.mime_type).startsWith('audio/'));
    const hasDoc = files.some((f) => !String(f.mime_type).startsWith('audio/'));

    // CCCD → ưu tiên key trả tiền để Google không dùng ảnh giấy tờ cá nhân; các loại khác dùng key miễn phí
    const privacy = kind === 'id_card';
    const key = privacy ? paidKey || freeKey : freeKey || paidKey;
    const warning = privacy && !paidKey ? 'Chưa có GEMINI_API_KEY_PAID — ảnh này được đọc bằng key miễn phí.' : undefined;
    // Xoay tua model (giống bot n8n): model nào hết lượt (429) / quá tải (503) / không dùng được (404…) / treo → chuyển model sau.
    // Đổi danh sách bằng secret GEMINI_MODELS="model-a,model-b,…" (không cần sửa code).
    const models = (env('GEMINI_MODELS', 'GEMINI_MODEL') || DEFAULT_MODELS).split(',').map((m) => m.trim()).filter(Boolean);

    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: buildPrompt(kind, note, ctx, perms) }] },
      contents: [{ role: 'user', parts: [
        { text: [
          hasDoc ? 'Người dùng gửi ảnh / tệp chứng từ.' : '',
          hasAudio ? 'Người dùng gửi GHI ÂM giọng nói (tiếng Việt) — nghe kỹ, chép lời vào transcript.' : '',
          note.trim() ? `Ghi chú / lời nhắn: ${note.trim()}` : '',
          text.trim() ? `Nội dung chữ (dán / từ tệp Excel):\n${text}` : '',
        ].filter(Boolean).join('\n') || 'Không có lời nhắn.' },
        ...files.map((f) => ({ inline_data: { mime_type: f.mime_type === 'audio/x-wav' ? 'audio/wav' : f.mime_type, data: f.data } })),
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
      // Công trình: ghi chú > hóa đơn đã lưu gần đây (NCC hay giao cho đâu + địa chỉ trên phiếu) > AI tự đoán; không theo ghi chú → tô vàng
      const extras = scanExtras(raw);
      const result = applyProjectGuess(normalizeScan(raw, ctx, kind), `${note} ${text.slice(0, 500)}`, ctx, extras.transcript);
      const resp: ScanResponse = { ...result, ...extras, mode: 'gemini', model, warning };
      return checkKindAllowed(resp, perms) ?? json(200, resp);
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

/** AI tự nhận ra loại mà người này không có quyền → không trả dữ liệu */
function checkKindAllowed(r: ScanResponse, perms: KindPermissions): Response | null {
  if (perms[r.kind]) return null;
  return json(403, { error: `Đây là ${KIND_LABEL[r.kind]} — tài khoản không có quyền nhập loại này.` });
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
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // giờ Việt Nam
  const since = new Date(Date.parse(today) - 90 * 86_400_000).toISOString().slice(0, 10);
  const [projectRows, expense_types, buyers, supplierRows, workers, customers, employees, expenseRows, subRows] = await Promise.all([
    rows('projects', 'name, status, owner_name, address, aliases, note'), // gửi cả CT đã đóng (dữ liệu trạng thái hay chưa cập nhật) — AI ưu tiên CT đang thi công
    names('catalog_items', 'name', (q) => q.eq('kind', 'expense_type').eq('archived', false)),
    names('catalog_items', 'name', (q) => q.eq('kind', 'person').eq('archived', false)),
    rows('suppliers', 'name, phone, note', (q) => q.eq('archived', false)),
    names('workers', 'name', (q) => q.eq('archived', false)),
    names('customers'),
    names('employees', 'full_name', (q) => q.eq('archived', false)),
    // Hóa đơn chi phí 90 ngày gần nhất có NCC — đoán công trình theo "NCC này hay giao cho đâu" (RLS lọc theo phạm vi công trình)
    rows('expenses', 'date, description, project:projects(name), supplier:suppliers(name)',
      (q) => q.gte('date', since).not('supplier_id', 'is', null).order('date', { ascending: false })),
    rows('subcontractors', 'name, field, contact_person', (q) => q.eq('archived', false)),
  ]);
  const recent_expenses: ExpenseHistoryRow[] = expenseRows.map((r) => ({
    date: String(r.date ?? ''),
    project: String((r.project as { name?: string } | null)?.name ?? ''),
    supplier: String((r.supplier as { name?: string } | null)?.name ?? ''),
    note: String(r.description ?? '').slice(0, 120),
  })).filter((r) => r.date && r.project && r.supplier);
  const recentBySupplier = supplierRecentProjects(recent_expenses);
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
    const bits = [short(r.phone, 30) && `SĐT ${short(r.phone, 30)}`, short(r.note, 60), recentBySupplier[name] ?? ''].filter(Boolean);
    if (name && bits.length) supplier_hints[name] = bits.join('; ');
    return name;
  }).filter(Boolean);
  const project_meta = projectRows.map((r) => ({
    name: String(r.name ?? ''), status: String(r.status ?? ''), owner_name: short(r.owner_name),
    aliases: Array.isArray(r.aliases) ? r.aliases.map(String) : [], address: short(r.address, 120),
  })).filter((p) => p.name);
  const subcontractor_hints: Record<string, string> = {};
  const subcontractors = subRows.map((r) => {
    const name = String(r.name ?? '');
    const bits = [short(r.field, 40), short(r.contact_person, 40) && `liên hệ: ${short(r.contact_person, 40)}`].filter(Boolean);
    if (name && bits.length) subcontractor_hints[name] = bits.join('; ');
    return name;
  }).filter(Boolean);
  return {
    projects, expense_types, suppliers, buyers, workers, customers, employees, subcontractors, subcontractor_hints,
    project_hints, supplier_hints, project_meta, recent_expenses, today,
  };
}
