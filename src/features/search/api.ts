// Ô tìm chung: đọc kết quả từ hàm kho public.search_all (RLS lọc theo quyền), gọi Edge Function search-assist (nút ✨ Tìm bằng AI).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { SEARCH_KINDS, type SearchAssistResponse, type SearchKind } from '@shared/search';
import { supabase } from '@/lib/supabase';

const sb = supabase as unknown as SupabaseClient;

const hitSchema = z.object({
  kind: z.enum(SEARCH_KINDS),
  id: z.string(),
  title: z.string().nullable().transform((v) => v ?? ''),
  sub: z.string().nullable().transform((v) => v ?? ''),
  amount: z.coerce.number().nullable(),
  date: z.string().nullable(),
  project_id: z.string().nullable(),
  extra: z.string().nullable(),
  total: z.coerce.number(),
});
export type SearchHit = z.infer<typeof hitSchema>;

export type SearchArgs = { text: string; terms: string[]; kinds: SearchKind[] };

export async function searchAll(a: SearchArgs, limit = 3, signal?: AbortSignal): Promise<SearchHit[]> {
  let q = sb.rpc('search_all', { p_q: a.text, p_terms: a.terms, p_kinds: a.kinds, p_limit: limit });
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw new Error(`Không tìm được: ${error.message}`);
  return z.array(hitSchema).parse(data ?? []);
}

/** Tìm khi gõ: tắt khi chữ < 2 ký tự; lượt cũ tự hủy khi gõ tiếp (signal); mạng chập chờn thử lại 2 lần; giữ kết quả cũ trong lúc chờ */
export function useGlobalSearch(args: SearchArgs | null) {
  return useQuery({
    queryKey: ['global-search', args],
    enabled: !!args && (args.text.length >= 2 || args.terms.length > 0),
    queryFn: ({ signal }) => searchAll(args!, 3, signal),
    staleTime: 60_000,
    retry: 2,
    placeholderData: keepPreviousData,
  });
}

/** Nút ✨ Tìm bằng AI — chỉ chạy khi bấm */
export async function askSearchAssist(q: string): Promise<SearchAssistResponse> {
  const { data, error } = await supabase.functions.invoke('search-assist', { body: { q } });
  if (error) {
    let msg = '';
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = String(b.error); } catch { /* không có lời báo */ }
    throw new Error(msg || 'AI chưa trả lời được (mạng yếu hoặc máy chủ AI bận) — bấm lại sau, kết quả tìm thường vẫn dùng được.');
  }
  return data as SearchAssistResponse;
}
