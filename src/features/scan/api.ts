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

const blobToBase64 = (blob: Blob) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => fail(new Error('Không đọc được tệp.'));
  r.readAsDataURL(blob);
});

/** Tệp gửi AI: ảnh (đã thu nhỏ), PDF, ghi âm (WAV) — hoặc Excel đã đổi ra chữ */
export type AiFile = { mime: string; base64: string };
export type PreparedInput =
  | { kind: 'image'; name: string; image: PreparedImage }
  | { kind: 'pdf'; name: string; file: AiFile }
  | { kind: 'sheet'; name: string; text: string };

export const MAX_PDF_BYTES = 4_500_000;
export const ACCEPT_FILES = 'image/*,application/pdf,.pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Excel .xlsx → chữ (mỗi trang tính: các dòng có dữ liệu, ô cách nhau bằng " | "), tối đa ~50.000 ký tự */
export async function sheetToText(file: Blob): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const out: string[] = [];
  for (const ws of wb.worksheets) {
    // Bỏ trang ẩn và trang "Compatibility Report" Excel tự thêm (có ngày cũ làm AI đọc nhầm)
    if ((ws.state && ws.state !== 'visible') || /compatibility report/i.test(ws.name)) continue;
    out.push(`=== Trang tính: ${ws.name}`);
    ws.eachRow((row, i) => {
      const cells = (row.values as unknown[]).slice(1).map((c) => {
        const v = c && typeof c === 'object' ? ((c as { result?: unknown; text?: unknown; richText?: { text: string }[] }).result
          ?? (c as { text?: unknown }).text ?? (c as { richText?: { text: string }[] }).richText?.map((t) => t.text).join('')) : c;
        return typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v ?? '').replace(/\s+/g, ' ').trim();
      });
      // Ô gộp lặp lại cùng chữ → giữ 1 lần
      const uniq = cells.filter((c, k) => c && c !== cells[k - 1]);
      if (uniq.length) out.push(`${i}: ${uniq.join(' | ')}`);
    });
  }
  return out.join('\n').slice(0, 50_000);
}

/** Ảnh / PDF / Excel người dùng chọn → dạng gửi được cho AI. File .xls đời cũ thì báo đổi sang .xlsx / PDF. */
export async function prepareInput(file: File): Promise<PreparedInput> {
  const name = file.name || 'tệp';
  const lower = name.toLowerCase();
  if (file.type.startsWith('image/')) return { kind: 'image', name, image: await prepareImage(file) };
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
    if (file.size > MAX_PDF_BYTES) throw new Error('Tệp PDF lớn quá (trên 4,5 MB) — gửi bản nhỏ hơn hoặc chụp trang cần đọc.');
    return { kind: 'pdf', name, file: { mime: 'application/pdf', base64: await blobToBase64(file) } };
  }
  if (lower.endsWith('.xlsx')) return { kind: 'sheet', name, text: await sheetToText(file) };
  if (lower.endsWith('.xls')) throw new Error('File Excel đời cũ (.xls) chưa đọc được — anh mở rồi lưu lại thành .xlsx hoặc PDF rồi gửi.');
  throw new Error('Chỉ gửi được ảnh, PDF hoặc Excel .xlsx.');
}

/** Ghi âm (webm / mp4 của trình duyệt) → WAV 16 kHz 1 kênh — định dạng Gemini chắc chắn nghe được, ~32 KB / giây */
export async function audioToWav(blob: Blob): Promise<AiFile> {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const rate = 16_000;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const buf = new ArrayBuffer(44 + pcm.length * 2);
    const v = new DataView(buf);
    const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i]!)) * 0x7fff, true);
    return { mime: 'audio/wav', base64: await blobToBase64(new Blob([buf], { type: 'audio/wav' })) };
  } finally {
    void ctx.close();
  }
}

/** Trình duyệt ghi âm được không (cần HTTPS hoặc localhost) */
export function recordingSupported(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Gọi AI đọc ảnh / tệp / ghi âm / chữ. Lỗi trả về câu tiếng Việt từ hàm máy chủ. */
export async function askAssistant(input: { files: AiFile[]; text?: string; note: string; kind: ScanRequestKind }): Promise<ScanResponse> {
  const { data, error } = await supabase.functions.invoke('scan-document', {
    body: { files: input.files.map((f) => ({ mime_type: f.mime, data: f.base64 })), text: input.text ?? '', note: input.note, kind: input.kind },
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

/** Gọi AI đọc ảnh (cách cũ — 1 ảnh). Lỗi trả về câu tiếng Việt từ hàm máy chủ. */
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
