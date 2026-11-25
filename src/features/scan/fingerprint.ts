// Vân tay ảnh / tệp gửi AI (bảng image_fingerprints, migration …022): tính ở trình duyệt, ghi sau khi lưu phiếu, tìm khi gửi ảnh mới.
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { fetchAllPages } from '@/lib/fetch-pages';
import { formatDate, formatMoney } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { PreparedInput } from './api';
import { dhashOf, HASH_SIDE, matchFingerprint, type Fingerprint, type FpTable } from './duplicates';

const sb = supabase as unknown as SupabaseClient;
const TABLES = ['expenses', 'timesheet_weeks', 'payments', 'receipts', 'main_contracts', 'subcontracts'] as const;
const fpSchema = z.object({ sha: z.string(), dhash: z.string().nullable(), target_table: z.enum(TABLES), target_id: z.string() });

async function sha256(data: BufferSource): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Ảnh: SHA của điểm ảnh + dấu gần giống. PDF / Excel: SHA của tệp. Máy không tính được → null (bỏ qua kiểm tra ảnh) */
export async function fingerprintInput(input: PreparedInput): Promise<Fingerprint | null> {
  try {
    if (input.kind !== 'image') return { sha: await sha256(await input.blob.arrayBuffer()), dhash: null };
    const bmp = await createImageBitmap(input.image.blob);
    const read = (w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.imageSmoothingQuality = 'high';
      x.drawImage(bmp, 0, 0, w, h);
      return x.getImageData(0, 0, w, h).data;
    };
    const full = read(bmp.width, bmp.height);
    const small = read(HASH_SIDE + 1, HASH_SIDE);
    const gray = Array.from({ length: small.length / 4 }, (_, i) => small[i * 4]! * 0.299 + small[i * 4 + 1]! * 0.587 + small[i * 4 + 2]! * 0.114);
    bmp.close();
    return { sha: await sha256(full), dhash: dhashOf(gray) };
  } catch { return null; }
}

/** Ghi vân tay sau khi lưu phiếu. Hỏng thì bỏ qua — không được làm hỏng việc lưu phiếu */
export async function rememberFingerprint(fp: Fingerprint | null, table: FpTable, id: string): Promise<void> {
  if (!fp) return;
  const { error } = await sb.from('image_fingerprints').insert({ sha: fp.sha, dhash: fp.dhash, target_table: table, target_id: id });
  if (error) console.warn('Chưa ghi được vân tay ảnh:', error.message);
}

const LABEL: Record<FpTable, string> = {
  expenses: 'Hóa đơn', timesheet_weeks: 'Phiếu chấm công tuần', payments: 'Phiếu chi', receipts: 'Phiếu thu', main_contracts: 'Hợp đồng', subcontracts: 'Hợp đồng thầu phụ',
};
const DATE_COL: Record<FpTable, string> = { expenses: 'date', timesheet_weeks: 'week_start', payments: 'date', receipts: 'date', main_contracts: 'date', subcontracts: 'date' };
const MONEY_COL: Partial<Record<FpTable, string>> = { expenses: 'amount', payments: 'amount', receipts: 'amount', main_contracts: 'value', subcontracts: 'value' };

export type ImageWarning = { key: string; exact: boolean; label: string };

/** Ảnh / tệp này đã gắn phiếu nào chưa (phiếu đã xóa thì bỏ qua; phiếu không có quyền xem thì RLS không trả về) */
export function useImageWarnings(fp: Fingerprint | null) {
  return useQuery({
    queryKey: ['image-warnings', fp?.sha],
    enabled: !!fp,
    staleTime: 0,
    queryFn: async (): Promise<ImageWarning[]> => {
      const raw = await fetchAllPages<unknown>((withCount) => sb.from('image_fingerprints')
        .select('sha,dhash,target_table,target_id', withCount ? { count: 'exact' } : undefined).order('created_at', { ascending: false }) as never);
      const hits = matchFingerprint(fp!, z.array(fpSchema).parse(raw));
      const found = await Promise.all(hits.map(async (h): Promise<ImageWarning | null> => {
        const t = h.target_table, money = MONEY_COL[t];
        const { data } = await sb.from(t).select(`${DATE_COL[t]},${money ? `${money},` : ''}project:projects(name)`).eq('id', h.target_id).is('deleted_at', null).maybeSingle();
        if (!data) return null;
        const r = data as unknown as Record<string, unknown> & { project?: { name?: string } | null };
        return {
          key: h.target_id, exact: h.exact,
          label: [`${LABEL[t]} ${formatDate(String(r[DATE_COL[t]] ?? ''))}`, money ? `${formatMoney(Number(r[money]) || 0)} đ` : '', r.project?.name ?? ''].filter(Boolean).join(' · '),
        };
      }));
      return found.filter((x): x is ImageWarning => !!x);
    },
  });
}
