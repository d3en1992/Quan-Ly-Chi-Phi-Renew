// Đọc / ghi cho tab Theo Dõi TB. Thêm / luân chuyển / sửa đi qua hàm trong kho (`save_equipment`, `transfer_equipment`,
// `edit_equipment`) để quy tắc gộp dòng của app cũ (cùng Nơi + Tên + Tình trạng + Thông tin máy → cộng số lượng) chạy trong 1 giao dịch.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { fetchLive } from '@/features/reports/api';

const sb = supabase as unknown as SupabaseClient;

const equipmentSchema = z.object({
  id: z.string(), name_id: z.string(), location: z.enum(['project', 'warehouse', 'scaffold']), project_id: z.string().nullable(),
  quantity: z.coerce.number(), condition: z.enum(['working', 'needs_maintenance', 'needs_repair']), date: z.string().nullable(), note: z.string().nullable(),
  created_by: z.string().nullable(), created_at: z.string().nullable(),
});
const projectSchema = z.object({ id: z.string(), name: z.string(), status: z.string(), is_company_overhead: z.boolean() });
const catalogSchema = z.object({ id: z.string(), name: z.string(), kind: z.string() });
const profileSchema = z.object({ id: z.string(), display_name: z.string() });

export type Equipment = z.infer<typeof equipmentSchema>;
export type EquipLocation = Equipment['location'];
export type EquipCondition = Equipment['condition'];
export type EquipProject = z.infer<typeof projectSchema>;

export const CONDITION: Record<EquipCondition, { label: string; tone: 'good' | 'warn' | 'bad' }> = {
  working: { label: 'Đang hoạt động', tone: 'good' },
  needs_maintenance: { label: 'Cần bảo trì', tone: 'warn' },
  needs_repair: { label: 'Cần sửa chữa', tone: 'bad' },
};
export const CONDITION_OPTS = (Object.keys(CONDITION) as EquipCondition[]).map((value) => ({ value, label: CONDITION[value].label }));
export const WAREHOUSE: Record<'warehouse' | 'scaffold', string> = { warehouse: 'Kho thiết bị', scaffold: 'Kho giàn giáo' };

/** Nơi đặt thiết bị dạng 1 chuỗi cho ô chọn: 'warehouse' | 'scaffold' | id công trình */
export type PlaceKey = string;
export const placeOf = (e: Pick<Equipment, 'location' | 'project_id'>): PlaceKey => (e.location === 'project' ? e.project_id ?? '' : e.location);
export const placeToArgs = (place: PlaceKey): { location: EquipLocation; projectId: string | null } =>
  place === 'warehouse' || place === 'scaffold' ? { location: place, projectId: null } : { location: 'project', projectId: place };

export type EquipData = {
  rows: Equipment[];
  names: { id: string; name: string }[];
  /** Công trình thật, xếp theo tên */
  projects: EquipProject[];
  nameOf: (id: string) => string;
  projectName: (id: string | null) => string;
  placeName: (e: Pick<Equipment, 'location' | 'project_id'>) => string;
  userName: (id: string | null) => string;
};

export const EQUIPMENT_KEY = ['equipment-data'] as const;

async function fetchEquipData(): Promise<EquipData> {
  const [rows, catalog, projects, profiles] = await Promise.all([
    fetchLive('equipment', equipmentSchema), fetchLive('catalog_items', catalogSchema), fetchLive('projects', projectSchema),
    fetchLive('profiles', profileSchema, false).catch(() => [] as z.infer<typeof profileSchema>[]),
  ]);
  const names = catalog.filter((c) => c.kind === 'equipment_name').sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  // Tên đã bị xóa khỏi danh mục vẫn phải hiện ở dòng thiết bị cũ → tra cả danh mục đã xóa khi thiếu
  const nameMap = new Map(catalog.map((c) => [c.id, c.name]));
  const missing = [...new Set(rows.map((r) => r.name_id).filter((id) => !nameMap.has(id)))];
  if (missing.length) {
    const { data } = await sb.from('catalog_items').select('id,name').in('id', missing);
    for (const c of (data ?? []) as { id: string; name: string }[]) nameMap.set(c.id, c.name);
  }
  const pj = new Map(projects.map((p) => [p.id, p.name]));
  const users = new Map(profiles.map((p) => [p.id, p.display_name]));
  const projectName = (id: string | null) => (id ? pj.get(id) ?? '—' : '—');
  return {
    rows, names,
    projects: projects.filter((p) => !p.is_company_overhead).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    nameOf: (id) => nameMap.get(id) ?? '(tên đã xóa)',
    projectName,
    placeName: (e) => (e.location === 'project' ? projectName(e.project_id) : WAREHOUSE[e.location]),
    userName: (id) => (id ? users.get(id) ?? '' : ''),
  };
}

export function useEquipData() {
  return useQuery({ queryKey: EQUIPMENT_KEY, queryFn: fetchEquipData, staleTime: 30_000 });
}

function friendly(e: { message: string; code?: string }): Error {
  if (e.code === '42501') return new Error(/quyền|người khác/.test(e.message) ? e.message : 'Bạn không có quyền thực hiện thao tác này.');
  if (e.code === '23503') return new Error('Công trình hoặc tên thiết bị vừa chọn không còn tồn tại. Tải lại trang rồi thử lại.');
  return new Error(e.message);
}
function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }), qc.invalidateQueries({ queryKey: ['trash'] }), qc.invalidateQueries({ queryKey: ['catalog'] })]);
}

export type NewEquipRow = { nameId: string; quantity: number; condition: EquipCondition; note: string };

export function useSaveEquipment() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { place: PlaceKey; date: string; rows: NewEquipRow[] }) => {
      if (!v.place) throw new Error('Chọn công trình hoặc kho.');
      if (!v.rows.length) throw new Error('Chưa có dòng thiết bị nào để lưu.');
      const { location, projectId } = placeToArgs(v.place);
      const { error } = await sb.rpc('save_equipment', {
        p_location: location, p_project_id: projectId, p_date: v.date || null,
        p_rows: v.rows.map((r) => ({ name_id: r.nameId, quantity: r.quantity, condition: r.condition, note: r.note.trim() || null })),
      });
      if (error) throw friendly(error);
    },
    onSuccess: refresh,
  });
}

export function useTransferEquipment() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { id: string; place: PlaceKey; quantity: number; condition: EquipCondition; date: string; note: string }) => {
      if (!v.place) throw new Error('Chọn nơi chuyển đến.');
      const { location, projectId } = placeToArgs(v.place);
      const { error } = await sb.rpc('transfer_equipment', {
        p_id: v.id, p_location: location, p_project_id: projectId, p_qty: v.quantity, p_condition: v.condition, p_date: v.date || null, p_note: v.note.trim() || null,
      });
      if (error) throw friendly(error);
    },
    onSuccess: refresh,
  });
}

export function useEditEquipment() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { id: string; quantity: number; condition: EquipCondition; note: string }) => {
      const { data, error } = await sb.rpc('edit_equipment', { p_id: v.id, p_quantity: v.quantity, p_condition: v.condition, p_note: v.note.trim() || null });
      if (error) throw friendly(error);
      return { merged: data !== v.id };
    },
    onSuccess: refresh,
  });
}

export function useDeleteEquipment() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.from('equipment').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Không xóa được: dòng do người khác nhập (cần quyền "Sửa / xóa dòng người khác nhập").');
    },
    onSuccess: refresh,
  });
}

/** Thêm tên thiết bị mới vào danh mục (viết hoa chữ đầu mỗi từ như danh mục cũ). Trả về mục vừa tạo. */
export function useCreateEquipmentName() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (raw: string): Promise<{ id: string; name: string }> => {
      const name = raw.trim().replace(/\s+/g, ' ').replace(/(^|\s)(\p{L})/gu, (_m, s: string, c: string) => s + c.toUpperCase());
      if (!name) throw new Error('Nhập tên thiết bị.');
      const { data, error } = await sb.from('catalog_items').insert({ kind: 'equipment_name', name }).select('id,name').single();
      if (error) throw friendly(error);
      return data as { id: string; name: string };
    },
    onSuccess: refresh,
  });
}
