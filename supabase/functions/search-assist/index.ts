// Edge Function search-assist — nút "✨ Tìm bằng AI" của ô tìm chung (tai-lieu/DE-XUAT-TIM-KIEM.md).
// Nhận câu tìm → gửi Gemini kèm danh sách tên vật tư (không trùng, đọc bằng quyền người gọi) + tên công trình
// → AI trả TỪ KHÓA (tên ghi khác: dây điện ↔ cáp 1.5, CV 2.5, Cadivi) + nhóm nên tìm. App tự tìm lại bằng public.search_all.
// AI không trả lời, không tính tiền, không đọc kho trực tiếp. Chỉ chạy khi người dùng bấm nút.
//
// Key: secret GEMINI_API_KEY (gói miễn phí) — không có → GIẢ LẬP bằng bảng SYNONYMS (_shared/search.ts).
// Model: secret GEMINI_SEARCH_MODELS (mặc định model lite rẻ / nhanh nhất), xoay tua khi hết lượt.
// Gọi: supabase.functions.invoke('search-assist', { body: { q } })
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildSearchPrompt, mockAssist, normalizeAssist, type SearchAssistResponse } from '../_shared/search.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (...names: string[]) => names.map((n) => Deno.env.get(n)).find(Boolean) ?? '';

const DEFAULT_MODELS = 'gemini-3.5-flash-lite,gemini-3.1-flash-lite';
const PER_MODEL_TIMEOUT_MS = 15_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Chỉ nhận POST' });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY'), {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (userErr || !userData.user) return json(401, { error: 'Chưa đăng nhập' });

    const body = (await req.json().catch(() => ({}))) as { q?: string };
    const q = String(body.q ?? '').trim().slice(0, 200);
    if (!q) return json(400, { error: 'Chưa có chữ cần tìm.' });

    // Danh sách tên đọc bằng phiên người gọi → RLS lọc theo quyền (không có quyền Chi phí thì danh sách trống)
    const [vocabRes, projRes] = await Promise.all([
      caller.rpc('search_vocab', { p_limit: 2500 }),
      caller.from('projects').select('name').is('deleted_at', null).limit(500),
    ]);
    const vocab = ((vocabRes.data ?? []) as { name: string }[]).map((r) => r.name);
    const projects = ((projRes.data ?? []) as { name: string }[]).map((r) => r.name);

    const key = env('GEMINI_API_KEY', 'GEMINI_API_KEY_PAID');
    if (!key) {
      const resp: SearchAssistResponse = { ...mockAssist(q, vocab), mode: 'mock' };
      return json(200, resp);
    }

    const models = (env('GEMINI_SEARCH_MODELS') || DEFAULT_MODELS).split(',').map((m) => m.trim()).filter(Boolean);
    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: buildSearchPrompt(vocab, projects) }] },
      contents: [{ role: 'user', parts: [{ text: `Câu tìm: ${q}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1, thinkingConfig: { thinkingLevel: 'minimal' } },
    });
    const fails: string[] = [];
    for (const model of models) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: payload,
          signal: AbortSignal.timeout(PER_MODEL_TIMEOUT_MS),
        });
        if (!res.ok) { fails.push(`${model}:${res.status}`); continue; }
        const out = await res.json();
        const answer: string = (out?.candidates?.[0]?.content?.parts ?? [])
          .filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? '').join('')
          .replace(/^\s*```(json)?/i, '').replace(/```\s*$/, '');
        const resp: SearchAssistResponse = { ...normalizeAssist(JSON.parse(answer), q), mode: 'gemini', model };
        return json(200, resp);
      } catch {
        fails.push(`${model}:lỗi`);
      }
    }
    console.error('search-assist: mọi model lỗi', fails.join(' → '));
    // AI lỗi / hết lượt → vẫn trả từ khóa giả lập để người dùng có kết quả
    const resp: SearchAssistResponse = { ...mockAssist(q, vocab), mode: 'mock', explain: 'AI đang bận — tìm bằng bảng tên gọi khác có sẵn' };
    return json(200, resp);
  } catch (e) {
    console.error(e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
