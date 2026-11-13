// Danh Mục (loại chi phí, người mua, tên thiết bị, đơn vị tính, giai đoạn mẫu) + thông tin công ty + sao lưu / khôi phục.
// Đổi tên: chỉ sửa 1 dòng trong catalog_items — mọi nơi khác tham chiếu bằng id nên tự hiện tên mới.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ACCESS_QUERY_KEY } from '@/app/auth';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/fetch-pages';
import { normalizeName } from '@/features/projects/logic';
import { REPORT_DATA_KEY } from '@/features/reports/api';

const sb = supabase as unknown as SupabaseClient;

export type CatalogKind = 'expense_type' | 'person' | 'equipment_name' | 'unit' | 'template';
export const CATALOG_GROUPS: { kind: CatalogKind; label: string; hint: string }[] = [
  { kind: 'expense_type', label: 'Loại chi phí', hint: 'tên tự viết hoa chữ đầu' },
  { kind: 'person', label: 'Người mua', hint: 'tên tự viết HOA' },
  { kind: 'equipment_name', label: 'Tên thiết bị', hint: 'tên tự viết hoa chữ đầu' },
  { kind: 'unit', label: 'Đơn vị tính', hint: 'gõ thường, VD: m2, kg, bao' },
  { kind: 'template', label: 'Giai đoạn / hạng mục mẫu', hint: 'mẫu dùng cho Tiến Độ' },
];

/** Chuẩn hóa tên hiển thị như app cũ (`normalizeCatDisplayName`): loại chi phí / thiết bị = Viết Hoa Chữ Đầu, người mua = VIẾT HOA */
export function normalizeCatalogName(kind: CatalogKind, raw: string): string {
  const v = raw.trim().replace(/\s+/g, ' ');
  if (!v) return v;
  if (kind === 'expense_type' || kind === 'equipment_name') return v.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  if (kind === 'person') return v.toUpperCase();
  if (kind === 'unit') return v.toLowerCase();
  return v;
}

const itemSchema = z.object({ id: z.string(), name: z.string(), updated_at: z.string(), sort_order: z.number().optional(), extra: z.string().nullable().optional() });
export type CatalogRow = z.infer<typeof itemSchema>;

export const CATALOG_KEY = ['catalog'] as const;

/** Danh sách + số khoản đang dùng của 1 nhóm */
export function useCatalogGroup(kind: CatalogKind) {
  return useQuery({
    queryKey: [...CATALOG_KEY, kind],
    staleTime: 15_000,
    queryFn: async (): Promise<{ rows: CatalogRow[]; usage: Map<string, number> }> => {
      if (kind === 'template') {
        const { data, error } = await sb.from('schedule_templates').select('id,name,updated_at,project_kind').eq('kind', 'phases').is('deleted_at', null).order('name');
        if (error) throw new Error(error.message);
        const rows = z.array(z.object({ id: z.string(), name: z.string(), updated_at: z.string(), project_kind: z.string().nullable() })).parse(data ?? []).map((r) => ({ id: r.id, name: r.name, updated_at: r.updated_at, extra: r.project_kind }));
        return { rows, usage: new Map() };
      }
      const { data, error } = await sb.from('catalog_items').select('id,name,updated_at,sort_order').eq('kind', kind).is('deleted_at', null).order('name');
      if (error) throw new Error(`Không đọc được danh mục: ${error.message}`);
      const rows = z.array(itemSchema).parse(data ?? []);
      const usage = new Map<string, number>();
      const bump = (k: string | null | undefined) => { if (k) usage.set(k, (usage.get(k) ?? 0) + 1); };
      if (kind === 'expense_type' || kind === 'person') {
        const col = kind === 'expense_type' ? 'expense_type_id' : 'buyer_id';
        const ex = await fetchAllPages<Record<string, string | null>>((c) => sb.from('expenses').select(col, c ? { count: 'exact' } : undefined).is('deleted_at', null).order('id'));
        for (const r of ex) bump(r[col]);
      } else if (kind === 'equipment_name') {
        const { data: eq, error: e2 } = await sb.from('equipment').select('name_id').is('deleted_at', null).range(0, 4999);
        if (e2) throw new Error(e2.message);
        for (const r of (eq ?? []) as { name_id: string }[]) bump(r.name_id);
      } else {
        const byName = new Map(rows.map((r) => [normalizeName(r.name), r.id]));
        const ln = await fetchAllPages<{ unit: string | null }>((c) => sb.from('expense_lines').select('unit', c ? { count: 'exact' } : undefined).is('deleted_at', null).order('id'));
        for (const r of ln) bump(byName.get(normalizeName(r.unit)));
      }
      return { rows, usage };
    },
  });
}

/** Số mục của từng nhóm (cột trái) */
export function useCatalogCounts() {
  return useQuery({
    queryKey: [...CATALOG_KEY, 'counts'],
    staleTime: 15_000,
    queryFn: async (): Promise<Partial<Record<CatalogKind, number>>> => {
      const [items, tpl] = await Promise.all([
        sb.from('catalog_items').select('kind').is('deleted_at', null).range(0, 4999),
        sb.from('schedule_templates').select('id', { count: 'exact', head: true }).eq('kind', 'phases').is('deleted_at', null),
      ]);
      if (items.error) throw new Error(items.error.message);
      const out: Partial<Record<CatalogKind, number>> = { template: tpl.count ?? 0 };
      for (const r of (items.data ?? []) as { kind: CatalogKind }[]) out[r.kind] = (out[r.kind] ?? 0) + 1;
      return out;
    },
  });
}

function friendly(e: { message: string; code?: string }): Error {
  if (e.code === '23505') return new Error('Tên này đã có trong danh mục.');
  if (e.code === '42501') return new Error('Bạn không có quyền thực hiện thao tác này.');
  return new Error(e.message);
}

function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: CATALOG_KEY }), qc.invalidateQueries({ queryKey: REPORT_DATA_KEY })]);
}

export function useAddCatalogItem(kind: CatalogKind) {
  const done = useRefresh();
  return useMutation({
    mutationFn: async (rawName: string) => {
      const name = normalizeCatalogName(kind, rawName);
      if (!name) throw new Error('Vui lòng nhập tên.');
      const { error } = kind === 'template'
        ? await sb.from('schedule_templates').insert({ kind: 'phases', name, data: [] })
        : await sb.from('catalog_items').insert({ kind, name });
      if (error) throw friendly(error);
      return name;
    },
    onSuccess: done,
  });
}

export function useRenameCatalogItem(kind: CatalogKind) {
  const done = useRefresh();
  return useMutation({
    mutationFn: async ({ id, name: raw }: { id: string; name: string }) => {
      const name = normalizeCatalogName(kind, raw);
      if (!name) throw new Error('Vui lòng nhập tên.');
      const { error } = await sb.from(kind === 'template' ? 'schedule_templates' : 'catalog_items').update({ name }).eq('id', id);
      if (error) throw friendly(error);
      return name;
    },
    onSuccess: done,
  });
}

export function useDeleteCatalogItem(kind: CatalogKind) {
  const done = useRefresh();
  return useMutation({
    mutationFn: async ({ id, used }: { id: string; used: number }) => {
      if (used > 0) throw new Error(`Đang dùng trong ${used} khoản — không xóa được. Đổi tên nếu muốn sửa.`);
      const { error } = await sb.from(kind === 'template' ? 'schedule_templates' : 'catalog_items').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw friendly(error);
    },
    onSuccess: done,
  });
}

/** Nạp danh sách Đơn vị tính từ các ĐVT đã gõ trong dòng vật tư (app cũ không có danh mục này) */
export function useImportUnits() {
  const done = useRefresh();
  return useMutation({
    mutationFn: async () => {
      const seen = new Map<string, string>();
      const lines = await fetchAllPages<{ unit: string | null }>((c) => sb.from('expense_lines').select('unit', c ? { count: 'exact' } : undefined).is('deleted_at', null).order('id'));
      for (const r of lines) { const n = normalizeCatalogName('unit', r.unit ?? ''); if (n) seen.set(normalizeName(n), n); }
      const { data: have } = await sb.from('catalog_items').select('name').eq('kind', 'unit').is('deleted_at', null);
      const existing = new Set(((have ?? []) as { name: string }[]).map((r) => normalizeName(r.name)));
      const fresh = [...seen].filter(([k]) => !existing.has(k)).map(([, name]) => ({ kind: 'unit', name }));
      if (fresh.length) {
        const { error } = await sb.from('catalog_items').insert(fresh);
        if (error) throw friendly(error);
      }
      return fresh.length;
    },
    onSuccess: done,
  });
}

/** Thông tin công ty (Admin sửa được) */
export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { name?: string; short_name?: string | null; logo_url?: string | null } }) => {
      const { data, error } = await sb.from('companies').update(patch).eq('id', id).select('id');
      if (error) throw friendly(error);
      if (!data || data.length === 0) throw new Error('Chỉ Admin được sửa thông tin công ty.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCESS_QUERY_KEY }),
  });
}

// ---------------- Sao lưu ----------------
const backupSchema = z.object({
  id: z.string(), kind: z.string(), note: z.string().nullable(), size_bytes: z.coerce.number(), counts: z.record(z.number()).catch({}), created_at: z.string(),
});
export type BackupRow = z.infer<typeof backupSchema>;
export const BACKUPS_KEY = ['backups'] as const;

export function useBackups() {
  return useQuery({
    queryKey: BACKUPS_KEY,
    queryFn: async (): Promise<BackupRow[]> => {
      const { data, error } = await sb.from('backups').select('id,kind,note,size_bytes,counts,created_at').order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error(`Không đọc được danh sách sao lưu: ${error.message}`);
      return z.array(backupSchema).parse(data ?? []);
    },
  });
}

export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note?: string) => {
      const { error } = await sb.rpc('create_backup', { p_kind: 'manual', p_note: note ?? null });
      if (error) throw friendly(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BACKUPS_KEY }),
  });
}

export function useDeleteBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('backups').delete().eq('id', id);
      if (error) throw friendly(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BACKUPS_KEY }),
  });
}

/** Tải toàn bộ dữ liệu hiện tại thành file JSON (không lưu trong kho) */
export async function downloadSnapshot(): Promise<{ name: string; counts: Record<string, number> }> {
  const { data, error } = await sb.rpc('export_company_snapshot');
  if (error) throw friendly(error);
  return saveJson(data, 'sao-luu');
}

export async function downloadBackup(id: string): Promise<{ name: string; counts: Record<string, number> }> {
  const { data, error } = await sb.rpc('get_backup_data', { p_id: id });
  if (error) throw friendly(error);
  return saveJson(data, 'sao-luu');
}

function saveJson(data: unknown, prefix: string) {
  const snap = data as { taken_at?: string; tables?: Record<string, unknown[]> };
  const stamp = (snap.taken_at ?? new Date().toISOString()).slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const name = `${prefix}-${stamp}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { name, counts: Object.fromEntries(Object.entries(snap.tables ?? {}).map(([k, v]) => [k, v.length])) };
}

/** Khôi phục từ bản trong kho (backupId) hoặc từ file JSON đã tải lên (data). Tự lưu 1 bản "trước khi khôi phục". */
export function useRestore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (src: { backupId: string } | { data: unknown }) => {
      let data: unknown;
      if ('backupId' in src) {
        const r = await sb.rpc('get_backup_data', { p_id: src.backupId });
        if (r.error) throw friendly(r.error);
        data = r.data;
      } else data = src.data;
      const { error } = await sb.rpc('restore_backup', { p_data: data });
      if (error) throw friendly(error);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}
