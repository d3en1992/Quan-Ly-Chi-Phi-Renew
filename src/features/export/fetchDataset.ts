// TN02 — Lọc dữ liệu 1 loại theo bộ lọc (đặc tả mục 4: HAI CHỖ DỄ SAI). Hàm thuần trên "kho tạm" đã tải về trình duyệt,
// có test Vitest trên dữ liệu thật (snapshot) trước khi làm giao diện. Tải kho: `loadStore()` (qua RLS của chính người dùng).
//
// Nhóm A (direct)  : lọc thẳng theo cột công trình.
// Nhóm B (via)     : bảng con → công trình + ngày + còn sống theo BẢNG CHA (dòng vật tư theo hóa đơn, dòng CN theo tuần…).
// Nhóm C (related) : danh bạ → "của công trình X" = có phát sinh ở X (theo các bảng nguồn đã lọc cùng bộ lọc).
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { DATASET, TABLES, type Ctx, type DatasetKey, type Row } from './registry';

export type Store = Record<string, Row[]>;

export type TimeFilter =
  | { mode: 'all' }
  | { mode: 'year'; year: number }
  | { mode: 'month'; ym: string } // YYYY-MM
  | { mode: 'range'; from: string; to: string }; // YYYY-MM-DD, gồm 2 đầu

export type ExportFilter = {
  /** all = mọi công trình · selected = các công trình tick · none = dòng không gán công trình */
  projectMode: 'all' | 'selected' | 'none';
  projectIds: string[];
  time: TimeFilter;
  includeDeleted: boolean;
  /** Danh bạ (nhóm C) chỉ lấy người đã có phát sinh ở công trình đã chọn */
  contactsByProject: boolean;
};

export const DEFAULT_FILTER: ExportFilter = { projectMode: 'all', projectIds: [], time: { mode: 'all' }, includeDeleted: false, contactsByProject: true };

/** Khoảng ngày [from, to] của bộ lọc thời gian; null = không lọc */
export function timeRange(t: TimeFilter): [string, string] | null {
  switch (t.mode) {
    case 'all': return null;
    case 'year': return [`${t.year}-01-01`, `${t.year}-12-31`];
    case 'month': {
      const [y, m] = t.ym.split('-').map(Number) as [number, number];
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return [`${t.ym}-01`, `${t.ym}-${String(last).padStart(2, '0')}`];
    }
    case 'range': return t.from && t.to ? [t.from <= t.to ? t.from : t.to, t.from <= t.to ? t.to : t.from] : t.from ? [t.from, '9999-12-31'] : t.to ? ['0000-01-01', t.to] : null;
  }
}

const day = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '');
const alive = (r: Row) => !r.deleted_at;

/** Bộ nhớ tạm cho một lần tính (đếm cả cột 2 hoặc xuất 1 file) — tránh lọc lại bảng cha nhiều lần */
export type Memo = Map<string, Row[]>;

/** Dòng của 1 loại dữ liệu sau khi lọc công trình + thời gian + đã xóa */
export function selectRows(key: DatasetKey, store: Store, f: ExportFilter, memo: Memo = new Map()): Row[] {
  const hit = memo.get(key);
  if (hit) return hit;
  const ds = DATASET[key];
  const all = store[ds.table] ?? [];
  const range = timeRange(f.time);
  const ids = new Set(f.projectIds);
  let out: Row[];

  if (ds.link.kind === 'via') {
    // Nhóm B: cha phải qua bộ lọc (công trình + ngày + còn sống); con chỉ cần còn sống và thuộc cha
    const parents = new Set(selectRows(ds.link.parent, store, f, memo).map((p) => p.id));
    const fk = ds.link.fk;
    out = all.filter((r) => (f.includeDeleted || alive(r)) && parents.has(r[fk]));
  } else {
    out = all.filter((r) => {
      if (!f.includeDeleted && !alive(r)) return false;
      if (range && ds.dateField) {
        const d = day(r[ds.dateField]);
        if (!d || d < range[0] || d > range[1]) return false;
      }
      if (ds.link.kind === 'direct') {
        const p = r[ds.link.field];
        if (f.projectMode === 'selected') return ids.has(p as string);
        if (f.projectMode === 'none') return p == null;
      }
      return true;
    });
    if (ds.link.kind === 'related') out = filterRelated(key, out, store, f, memo);
  }
  memo.set(key, out);
  return out;
}

/** Nhóm C: chọn tất cả công trình hoặc tắt "lọc theo CT" → cả danh bạ; ngược lại chỉ người có phát sinh */
function filterRelated(key: DatasetKey, rows: Row[], store: Store, f: ExportFilter, memo: Memo): Row[] {
  if (f.projectMode === 'all' || !f.contactsByProject) return rows;
  if (key === 'contact_private') {
    const owners = new Set<unknown>();
    for (const k of ['workers', 'customers', 'subcontractors'] as const) for (const r of selectRows(k, store, f, memo)) owners.add(r.id);
    for (const r of selectRows('employees', store, f, memo)) owners.add(r.id);
    return rows.filter((r) => owners.has(r.worker_id ?? r.customer_id ?? r.subcontractor_id ?? r.employee_id));
  }
  const link = DATASET[key].link;
  if (link.kind !== 'related') return rows;
  const used = new Set<unknown>();
  for (const src of link.sources) for (const r of selectRows(src.dataset, store, f, memo)) if (r[src.field] != null) used.add(r[src.field]);
  return rows.filter((r) => used.has(r.id));
}

/** Công trình của một dòng (để chia sheet / thêm cột CÔNG TRÌNH); null = không gán / danh bạ */
export function projectOfRow(key: DatasetKey, row: Row, store: StoreIndex): string | null {
  const ds = DATASET[key];
  if (ds.link.kind === 'direct') return (row[ds.link.field] as string | null) ?? null;
  if (ds.link.kind === 'via') {
    if (key === 'payment_allocations') return (row.project_id as string | null) ?? null; // phần chia thuộc công trình của hóa đơn
    const parent = store.byId(DATASET[ds.link.parent].table, row[ds.link.fk]);
    return parent ? projectOfRow(ds.link.parent, parent, store) : null;
  }
  return null;
}

/** Ngày của một dòng (để sắp xếp); bảng con lấy ngày bảng cha */
export function dateOfRow(key: DatasetKey, row: Row, store: StoreIndex): string {
  const ds = DATASET[key];
  if (ds.link.kind === 'via') {
    const parent = store.byId(DATASET[ds.link.parent].table, row[ds.link.fk]);
    return parent ? dateOfRow(ds.link.parent, parent, store) : '';
  }
  return ds.dateField ? day(row[ds.dateField]) : '';
}

/** Tra nhanh theo mã + tên hiển thị */
export type StoreIndex = { byId: (table: string, id: unknown) => Row | undefined; ctx: (priv?: Map<string, Row>) => Ctx };

export function indexStore(store: Store): StoreIndex {
  const maps = new Map<string, Map<unknown, Row>>();
  const mapOf = (t: string) => {
    let m = maps.get(t);
    if (!m) { m = new Map((store[t] ?? []).map((r) => [r.id, r])); maps.set(t, m); }
    return m;
  };
  const byId = (t: string, id: unknown) => (id == null ? undefined : mapOf(t).get(id));
  const nameOf = (t: string, id: unknown) => {
    const r = byId(t, id);
    if (!r) return '';
    return String(r.name ?? r.full_name ?? '');
  };
  return {
    byId,
    ctx: (priv) => ({ name: nameOf, row: byId, priv: (owner) => (owner == null ? undefined : priv?.get(String(owner))) }),
  };
}

/** Số bản ghi từng loại theo bộ lọc (cột 2) */
export function countAll(keys: readonly DatasetKey[], store: Store, f: ExportFilter): Record<string, number> {
  const memo: Memo = new Map();
  return Object.fromEntries(keys.map((k) => [k, selectRows(k, store, f, memo).length]));
}

// ───────────── Tải kho (trình duyệt, qua RLS) ─────────────

const sb = supabase as unknown as SupabaseClient;
const PAGE = 1000;

/** Tải 1 bảng, 1.000 dòng mỗi lượt tới hết (gồm cả dòng đã xóa mềm — lọc ở trên) */
export async function fetchTable(table: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select('*').order('id').range(from, from + PAGE - 1);
    if (error) {
      if (error.code === '42501' || error.code === 'PGRST301') return out; // không có quyền đọc bảng này
      throw new Error(`Không đọc được ${table}: ${error.message}`);
    }
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return out;
  }
}

export async function loadStore(tables: readonly string[] = TABLES, onProgress?: (done: number, total: number) => void): Promise<Store> {
  const store: Store = {};
  let done = 0;
  await Promise.all(tables.map(async (t) => {
    store[t] = await fetchTable(t);
    onProgress?.(++done, tables.length);
  }));
  return store;
}

/** SĐT / CCCD / STK đầy đủ — hàm kho kiểm quyền "Xem SĐT, số CCCD" (không có → lỗi 403) và ghi nhật ký */
export async function loadPrivate(note: Record<string, unknown>): Promise<Map<string, Row>> {
  const { data, error } = await sb.rpc('export_contact_private', { note });
  if (error) throw new Error(error.code === '42501' ? 'Tài khoản không có quyền xuất SĐT / CCCD / số tài khoản.' : error.message);
  const map = new Map<string, Row>();
  for (const r of (data ?? []) as Row[]) {
    const owner = r.worker_id ?? r.customer_id ?? r.employee_id ?? r.subcontractor_id;
    if (owner) map.set(String(owner), r);
  }
  return map;
}
