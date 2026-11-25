// Ảnh / tệp kèm phiếu chi, phiếu thu, hợp đồng chính (kho `documents`) và ảnh CCCD (kho `id-cards`) — migration …021.
// Ai đọc được phiếu thì mở được tệp của phiếu đó (RLS); CCCD cần thêm quyền "Xem SĐT, số CCCD".
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { PRIVATE_FK, type ContactKind } from '@/features/contacts/api';
import { MAX_PDF_BYTES, prepareImage, type PreparedInput } from '@/features/scan/api';

const sb = supabase as unknown as SupabaseClient;

export type AttachBucket = 'documents' | 'id-cards';
export type AttachTable = 'payments' | 'receipts' | 'main_contracts' | 'subcontracts';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_BYTES = 5 * 1024 * 1024;
/** Tệp đã sẵn sàng tải lên kho */
export type Doc = { blob: Blob; mime: string; ext: 'jpg' | 'pdf' | 'xlsx' };

/** Ảnh / PDF / Excel vừa gửi AI → tệp để lưu kèm */
export function docFromInput(input: PreparedInput | null): Doc | null {
  if (!input) return null;
  if (input.kind === 'image') return { blob: input.image.blob, mime: 'image/jpeg', ext: 'jpg' };
  return input.kind === 'pdf' ? { blob: input.blob, mime: 'application/pdf', ext: 'pdf' } : { blob: input.blob, mime: XLSX_MIME, ext: 'xlsx' };
}

/** Tệp người dùng chọn (nút "Thêm ảnh / tệp"): ảnh thì thu nhỏ; PDF, Excel giữ nguyên */
async function docFromFile(file: File): Promise<Doc> {
  const lower = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return { blob: (await prepareImage(file)).blob, mime: 'image/jpeg', ext: 'jpg' };
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
    if (file.size > MAX_PDF_BYTES) throw new Error('Tệp PDF lớn quá (trên 4,5 MB).');
    return { blob: file, mime: 'application/pdf', ext: 'pdf' };
  }
  if (lower.endsWith('.xlsx')) return { blob: file, mime: XLSX_MIME, ext: 'xlsx' };
  throw new Error('Chỉ lưu được ảnh, PDF hoặc Excel .xlsx.');
}

export async function uploadDoc(bucket: AttachBucket, companyId: string, doc: Doc): Promise<string> {
  if (doc.blob.size > MAX_BYTES) throw new Error('Tệp lớn quá (trên 5 MB) nên không lưu kèm được.');
  const path = `${companyId}/${new Date().getFullYear()}/${crypto.randomUUID()}.${doc.ext}`;
  // Bọc lại đúng loại tệp: một số máy để trống loại của file .xlsx
  const { error } = await sb.storage.from(bucket).upload(path, new Blob([doc.blob], { type: doc.mime }), { contentType: doc.mime, upsert: false });
  if (error) throw new Error(`Chưa lưu được ảnh / tệp: ${error.message}`);
  return path;
}

/** Gỡ tệp khỏi kho. Kho tự từ chối nếu còn phiếu gắn tệp, nên gọi khi lưu hỏng giữa chừng là an toàn. */
export async function removeDoc(bucket: AttachBucket, path: string): Promise<void> {
  await sb.storage.from(bucket).remove([path]).catch(() => undefined);
}

/** Link xem tệp (hết hạn sau 1 giờ) */
export function useDocUrl(bucket: AttachBucket, path: string) {
  return useQuery({
    queryKey: ['doc-url', bucket, path],
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
  });
}

const NO_EDIT = 'Không sửa được: dòng do người khác nhập hoặc đã bị xóa.';

/** Đọc danh sách mới nhất → sửa → ghi */
async function editPaths(table: string, column: string, id: string, edit: (old: string[]) => string[]): Promise<void> {
  const { data, error } = await sb.from(table).select(column).eq('id', id).single();
  if (error) throw new Error(error.message);
  const old = z.array(z.string()).nullable().parse((data as unknown as Record<string, unknown>)[column]) ?? [];
  const { data: done, error: e2 } = await sb.from(table).update({ [column]: edit(old) }).eq('id', id).select('id');
  if (e2) throw new Error(e2.message);
  if (!done?.length) throw new Error(NO_EDIT);
}
const add = (path: string) => (old: string[]) => (old.includes(path) ? old : [...old, path]);

export const attachToRow = (table: AttachTable, id: string, path: string) => editPaths(table, 'attachment_paths', id, add(path));

/** Gắn tệp vào hợp đồng chính đã có của công trình; trả về mã hợp đồng, chưa có thì null */
export async function attachToProjectContract(projectId: string, path: string): Promise<string | null> {
  const { data, error } = await sb.from('main_contracts').select('id').eq('project_id', projectId).is('deleted_at', null).limit(1);
  if (error) throw new Error(error.message);
  const id = (data as { id: string }[])[0]?.id;
  if (!id) return null;
  await attachToRow('main_contracts', id, path);
  return id;
}

export type PersonKind = Exclude<ContactKind, 'supplier'>;
async function privateRowId(kind: PersonKind, personId: string): Promise<string | null> {
  const { data, error } = await sb.from('contact_private').select('id').eq(PRIVATE_FK[kind], personId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id: string } | null)?.id ?? null;
}
/** Gắn ảnh CCCD vào hồ sơ; người chưa có dòng thông tin riêng thì tạo */
export async function attachIdImage(kind: PersonKind, personId: string, path: string): Promise<void> {
  const id = await privateRowId(kind, personId);
  if (id) return editPaths('contact_private', 'id_image_paths', id, add(path));
  const { error } = await sb.from('contact_private').insert({ [PRIVATE_FK[kind]]: personId, id_image_paths: [path] });
  if (error) throw new Error(error.message);
}

/** Nơi gắn tệp: một phiếu, hoặc hồ sơ một người (ảnh CCCD) */
export type AttachTarget = { bucket: 'documents'; table: AttachTable; id: string } | { bucket: 'id-cards'; kind: PersonKind; id: string };

export function useAddDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ target: t, file, companyId }: { target: AttachTarget; file: File; companyId: string }) => {
      const doc = await docFromFile(file);
      if (t.bucket === 'id-cards' && doc.ext !== 'jpg') throw new Error('CCCD chỉ lưu ảnh.');
      const path = await uploadDoc(t.bucket, companyId, doc);
      try { await (t.bucket === 'documents' ? attachToRow(t.table, t.id, path) : attachIdImage(t.kind, t.id, path)); }
      catch (e) { await removeDoc(t.bucket, path); throw e; }
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRemoveDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ target: t, path }: { target: AttachTarget; path: string }) => {
      const drop = (old: string[]) => old.filter((p) => p !== path);
      if (t.bucket === 'documents') await editPaths(t.table, 'attachment_paths', t.id, drop);
      else {
        const id = await privateRowId(t.kind, t.id);
        if (!id) throw new Error(NO_EDIT);
        await editPaths('contact_private', 'id_image_paths', id, drop);
      }
      await removeDoc(t.bucket, path);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}
