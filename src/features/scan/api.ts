// Chụp đa năng (GĐ9): thu nhỏ ảnh ở trình duyệt, gọi Edge Function `scan-document`, tải ảnh hóa đơn lên kho `receipts`,
// thêm / bổ sung NCC. Key Gemini nằm ở Supabase, không bao giờ ở đây.
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScanRequestKind, ScanResponse } from '@shared/scan';
import { supabase } from '@/lib/supabase';
import { LOOKUPS_KEY } from '@/features/expenses/api';
import { CONTACTS_KEY } from '@/features/contacts/api';

const sb = supabase as unknown as SupabaseClient;

export const MAX_SIDE = 1600;
export const RECEIPT_BUCKET = 'receipts';

export type PreparedImage = { blob: Blob; base64: string; mime: string; width: number; height: number };

/** Thu nhỏ ảnh (cạnh dài ≤ 1600px), nén JPEG — gửi AI nhanh, lưu kho nhẹ (~200–400 KB) */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không xử lý được ảnh.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Không nén được ảnh.'))), 'image/jpeg', 0.85));
  const base64 = await new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => fail(new Error('Không đọc được ảnh.'));
    r.readAsDataURL(blob);
  });
  return { blob, base64, mime: 'image/jpeg', width, height };
}

/** Gọi AI đọc ảnh. Lỗi trả về câu tiếng Việt từ hàm máy chủ. */
export async function scanDocument(input: { image: PreparedImage; note: string; kind: ScanRequestKind }): Promise<ScanResponse> {
  const { data, error } = await supabase.functions.invoke('scan-document', {
    body: { image_base64: input.image.base64, mime_type: input.image.mime, note: input.note, kind: input.kind },
  });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { msg = ((await ctx.json()) as { error?: string }).error ?? msg; } catch { /* giữ thông báo gốc */ }
    }
    throw new Error(msg);
  }
  return data as ScanResponse;
}

/** Tải ảnh hóa đơn lên kho riêng của công ty: `<company_id>/<năm>/<uuid>.jpg` */
export async function uploadReceipt(companyId: string, blob: Blob, date: string): Promise<string> {
  const path = `${companyId}/${date.slice(0, 4) || 'khac'}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(RECEIPT_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`Chưa lưu được ảnh hóa đơn: ${error.message}`);
  return path;
}

export async function removeReceipt(path: string): Promise<void> {
  await sb.storage.from(RECEIPT_BUCKET).remove([path]);
}

/** Link xem ảnh hóa đơn (hết hạn sau 1 giờ) */
export function useReceiptUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['receipt-url', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb.storage.from(RECEIPT_BUCKET).createSignedUrl(path!, 3600);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
  });
}

export type SupplierChange =
  | { kind: 'new'; name: string; address: string; phone: string }
  | { kind: 'patch'; id: string; address?: string; phone?: string };

/** Thêm NCC mới (tên in hoa như danh mục) hoặc bổ sung địa chỉ / SĐT cho NCC có sẵn */
export function useSupplierChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: SupplierChange): Promise<{ id: string; name: string; address: string | null; phone: string | null; buys_on_credit: boolean; archived: boolean }> => {
      if (c.kind === 'new') {
        const name = c.name.trim().replace(/\s+/g, ' ').toUpperCase();
        if (!name) throw new Error('Chưa có tên nhà cung cấp.');
        const { data, error } = await sb.from('suppliers')
          .insert({ name, address: c.address.trim() || null, phone: c.phone.trim() || null })
          .select('id,name,address,phone,buys_on_credit,archived').single();
        if (error) throw new Error(error.code === '23505' ? `Nhà cung cấp "${name}" đã có trong danh mục.` : error.message);
        return data as never;
      }
      const patch: Record<string, string> = {};
      if (c.address?.trim()) patch.address = c.address.trim();
      if (c.phone?.trim()) patch.phone = c.phone.trim();
      const { data, error } = await sb.from('suppliers').update(patch).eq('id', c.id).select('id,name,address,phone,buys_on_credit,archived').single();
      if (error) throw new Error(error.message);
      return data as never;
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: LOOKUPS_KEY }), qc.invalidateQueries({ queryKey: CONTACTS_KEY })]),
  });
}

/** Trình duyệt có nhận giọng nói (Chrome Android / máy tính) không */
export function speechSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return typeof window !== 'undefined' && !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}
