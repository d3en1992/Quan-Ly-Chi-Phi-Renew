// Thùng Rác: đọc bản ghi đã xóa mềm (deleted_at ≠ null) của mọi loại dữ liệu; khôi phục / xóa vĩnh viễn qua hàm trong kho
// (`trash_restore` kéo theo dòng con bị xóa cùng lúc; `trash_purge` cần quyền purge_trash). RLS tự lọc theo quyền của tài khoản.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { calcTimesheetRow } from '@/lib/calc';
import type { ModuleKey } from '@/lib/permissions';
import { syncSupplierAllocations } from '@/features/payments/api';

const sb = supabase as unknown as SupabaseClient;

export type TrashTab = 'all' | 'expense' | 'timesheet' | 'advance' | 'receipt' | 'main_contract' | 'subcontract' | 'settlement' | 'other';
export const TRASH_TABS: { key: TrashTab; label: string }[] = [
  { key: 'all', label: 'TẤT CẢ' }, { key: 'expense', label: 'HÓA ĐƠN' }, { key: 'timesheet', label: 'CHẤM CÔNG' }, { key: 'advance', label: 'TIỀN ỨNG' },
  { key: 'receipt', label: 'THU TIỀN' }, { key: 'main_contract', label: 'HĐ CHÍNH' }, { key: 'subcontract', label: 'HĐ THẦU PHỤ' }, { key: 'settlement', label: 'QUYẾT TOÁN' },
  { key: 'other', label: 'KHÁC' },
];

export type TrashRow = {
  /** khóa duy nhất: bảng + id */
  key: string;
  table: string;
  id: string;
  tab: Exclude<TrashTab, 'all'>;
  /** nhãn loại: "Hóa đơn", "Tuần chấm công"… */
  type: string;
  content: string;
  project: string;
  amount: number | null;
  deletedAt: string;
  deletedBy: string;
  createdBy: string | null;
  /** các mục có quyền sửa bảng này (để ẩn / hiện nút) */
  modules: ModuleKey[];
};

type Raw = Record<string, unknown> & { id: string; deleted_at: string; deleted_by: string | null; created_by: string | null };
type Ctx = {
  project: (id: unknown) => string; worker: (id: unknown) => string; supplier: (id: unknown) => string; subcontractor: (id: unknown) => string;
  catalog: (id: unknown) => string; weekPay: Map<string, number>;
};
type Def = {
  table: string; tab: TrashRow['tab']; type: string | ((r: Raw) => string); modules: ModuleKey[]; cols: string;
  filter?: (q: ReturnType<SupabaseClient['from']> extends infer _ ? any : never) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  describe: (r: Raw, c: Ctx) => { content: string; project?: string; amount?: number | null };
};

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const n = (v: unknown) => Number(v) || 0;
const dm = (iso: unknown) => { const t = s(iso); return t.length >= 10 ? `${t.slice(8, 10)}/${t.slice(5, 7)}` : ''; };
const addDays = (iso: string, d: number) => { const [y, m, dd] = iso.split('-').map(Number) as [number, number, number]; return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10); };
const PAY_KIND: Record<string, string> = { advance: 'Tạm ứng thầu phụ', progress: 'Thanh toán đợt thầu phụ', supplier_payment: 'Trả nợ NCC' };
const RECEIPT_KIND: Record<string, string> = { advance: 'Thu tạm ứng', stage: 'Thu giai đoạn', settlement: 'Thu quyết toán', other: 'Thu khác' };
const SETTLE_KIND: Record<string, string> = { increase: 'Tăng', decrease: 'Giảm', replace: 'Thay thế' };
const CATALOG_KIND: Record<string, string> = { expense_type: 'Loại chi phí', person: 'Người mua', equipment_name: 'Tên thiết bị', unit: 'Đơn vị tính' };
const PLACE: Record<string, string> = { warehouse: 'Kho thiết bị', scaffold: 'Kho giàn giáo' };
const named = (table: string, type: string, modules: ModuleKey[]): Def => ({ table, tab: 'other', type, modules, cols: 'name', describe: (r) => ({ content: s(r.name) }) });

const DEFS: Def[] = [
  { table: 'expenses', tab: 'expense', type: 'Hóa đơn', modules: ['expenses'], cols: 'project_id,date,amount,description,supplier_id',
    describe: (r, c) => ({ content: [dm(r.date), s(r.description) || 'Hóa đơn', c.supplier(r.supplier_id)].filter(Boolean).join(' · '), project: c.project(r.project_id), amount: n(r.amount) }) },
  { table: 'timesheet_weeks', tab: 'timesheet', type: 'Tuần chấm công', modules: ['timesheets'], cols: 'project_id,week_start',
    describe: (r, c) => ({ content: `CN ${dm(r.week_start)} – T7 ${dm(addDays(s(r.week_start), 6))}`, project: c.project(r.project_id), amount: c.weekPay.get(r.id) ?? null }) },
  { table: 'wage_advances', tab: 'advance', type: 'Ứng lương', modules: ['timesheets'], cols: 'project_id,worker_id,date,direction,amount,note', filter: (q) => q.is('source_week_id', null),
    describe: (r, c) => ({ content: [dm(r.date), r.direction === 'repay' ? 'Trả nợ' : 'Ứng tiền', c.worker(r.worker_id), s(r.note)].filter(Boolean).join(' · '), project: c.project(r.project_id), amount: n(r.amount) }) },
  { table: 'payments', tab: 'advance', type: (r) => PAY_KIND[s(r.kind)] ?? 'Phiếu chi', modules: ['payments'], cols: 'project_id,kind,date,amount,supplier_id,subcontractor_id,note', filter: (q) => q.is('closure_id', null),
    describe: (r, c) => ({ content: [dm(r.date), c.supplier(r.supplier_id) || c.subcontractor(r.subcontractor_id), s(r.note)].filter(Boolean).join(' · '), project: c.project(r.project_id), amount: n(r.amount) }) },
  { table: 'payable_closures', tab: 'advance', type: 'Tất toán thầu phụ', modules: ['payables'], cols: 'project_id,subcontractor_id,closed_on,amount,note',
    describe: (r, c) => ({ content: [dm(r.closed_on), c.subcontractor(r.subcontractor_id), s(r.note)].filter(Boolean).join(' · '), project: c.project(r.project_id), amount: n(r.amount) }) },
  { table: 'receipts', tab: 'receipt', type: (r) => RECEIPT_KIND[s(r.kind)] ?? 'Phiếu thu', modules: ['revenue', 'settlements'], cols: 'project_id,date,amount,kind,note', filter: (q) => q.eq('is_auto', false),
    describe: (r, c) => ({ content: [dm(r.date), s(r.note)].filter(Boolean).join(' · ') || 'Phiếu thu', project: c.project(r.project_id), amount: n(r.amount) }) },
  { table: 'main_contracts', tab: 'main_contract', type: 'HĐ chính', modules: ['revenue'], cols: 'project_id,date,value,extra_value,legacy_variation,description',
    describe: (r, c) => ({ content: [dm(r.date), s(r.description)].filter(Boolean).join(' · ') || 'Hợp đồng chính', project: c.project(r.project_id), amount: n(r.value) + n(r.extra_value) + n(r.legacy_variation) }) },
  { table: 'subcontracts', tab: 'subcontract', type: 'HĐ thầu phụ', modules: ['payables'], cols: 'project_id,subcontractor_id,date,value,legacy_variation,description',
    describe: (r, c) => ({ content: [dm(r.date), c.subcontractor(r.subcontractor_id), s(r.description)].filter(Boolean).join(' · '), project: c.project(r.project_id), amount: n(r.value) + n(r.legacy_variation) }) },
  { table: 'settlements', tab: 'settlement', type: (r) => `Quyết toán · ${SETTLE_KIND[s(r.kind)] ?? ''}`, modules: ['settlements'], cols: 'project_id,date,kind,amount,note',
    describe: (r, c) => ({ content: [dm(r.date), s(r.note)].filter(Boolean).join(' · ') || 'Quyết toán', project: c.project(r.project_id), amount: n(r.amount) }) },
  { table: 'equipment', tab: 'other', type: 'Thiết bị', modules: ['equipment'], cols: 'project_id,name_id,location,quantity,note',
    describe: (r, c) => ({ content: `${c.catalog(r.name_id)} × ${n(r.quantity).toLocaleString('vi-VN')}${r.note ? ` · ${s(r.note)}` : ''}`, project: r.location === 'project' ? c.project(r.project_id) : PLACE[s(r.location)] ?? '' }) },
  { table: 'projects', tab: 'other', type: 'Công trình', modules: ['projects'], cols: 'name', describe: (r) => ({ content: s(r.name), project: s(r.name) }) },
  { table: 'cost_allocations', tab: 'other', type: 'Định mức', modules: ['cost_allocation'], cols: 'name,kind', filter: (q) => q.eq('kind', 'benchmark'), describe: (r) => ({ content: s(r.name) || 'Định mức' }) },
  named('customers', 'Khách hàng', ['contacts']), named('workers', 'Công nhân', ['contacts', 'timesheets']),
  { table: 'employees', tab: 'other', type: 'Nhân viên', modules: ['contacts'], cols: 'full_name', describe: (r) => ({ content: s(r.full_name) }) },
  named('suppliers', 'Nhà cung cấp', ['contacts', 'catalog', 'expenses']), named('subcontractors', 'Thầu phụ', ['contacts', 'catalog']),
  { table: 'catalog_items', tab: 'other', type: (r) => `Danh mục · ${CATALOG_KIND[s(r.kind)] ?? ''}`, modules: ['catalog'], cols: 'name,kind', describe: (r) => ({ content: s(r.name) }) },
];

/** Bảng không đọc được (thiếu quyền) → coi như trống, không làm hỏng cả màn */
async function readAll(table: string, cols: string, apply: (q: any) => any = (q) => q): Promise<Record<string, unknown>[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(sb.from(table).select(cols)).order('id').range(from, from + 999);
    if (error) return out;
    out.push(...((data ?? []) as Record<string, unknown>[]));
    if ((data ?? []).length < 1000) return out;
  }
}

export const TRASH_KEY = ['trash'] as const;

async function fetchTrash(): Promise<TrashRow[]> {
  const [raws, projects, workers, suppliers, subcontractors, catalog, profiles] = await Promise.all([
    Promise.all(DEFS.map((d) => readAll(d.table, `id,deleted_at,deleted_by,created_by,${d.cols}`, (q) => (d.filter ? d.filter(q) : q).not('deleted_at', 'is', null)) as Promise<Raw[]>)),
    readAll('projects', 'id,name'), readAll('workers', 'id,name'), readAll('suppliers', 'id,name'), readAll('subcontractors', 'id,name'), readAll('catalog_items', 'id,name'),
    readAll('profiles', 'id,display_name'),
  ]);
  const map = (rows: Record<string, unknown>[], col = 'name') => { const m = new Map(rows.map((r) => [s(r.id), s(r[col])])); return (id: unknown) => (id ? m.get(s(id)) ?? '' : ''); };
  const user = map(profiles, 'display_name');

  // Tiền của tuần chấm công đã xóa = Σ thực lãnh các dòng bị xóa CÙNG LÚC với tuần
  const weeks = raws[DEFS.findIndex((d) => d.table === 'timesheet_weeks')] ?? [];
  const weekPay = new Map<string, number>();
  if (weeks.length) {
    const deletedAt = new Map(weeks.map((w) => [w.id, Date.parse(w.deleted_at)]));
    const lines = await readAll('timesheet_lines', 'week_id,day_units,daily_wage,allowance,retail_purchase,deleted_at', (q) => q.in('week_id', weeks.map((w) => w.id)).not('deleted_at', 'is', null));
    for (const l of lines) {
      const wk = s(l.week_id);
      if (Date.parse(s(l.deleted_at)) !== deletedAt.get(wk)) continue;
      const pay = calcTimesheetRow({ day_units: ((l.day_units as unknown[]) ?? []).map(n), daily_wage: n(l.daily_wage), allowance: n(l.allowance), retail_purchase: n(l.retail_purchase) }).netPay;
      weekPay.set(wk, (weekPay.get(wk) ?? 0) + pay);
    }
  }
  const ctx: Ctx = { project: map(projects), worker: map(workers), supplier: map(suppliers), subcontractor: map(subcontractors), catalog: map(catalog), weekPay };

  const out: TrashRow[] = [];
  DEFS.forEach((d, i) => {
    for (const r of raws[i] ?? []) {
      const x = d.describe(r, ctx);
      out.push({
        key: `${d.table}:${r.id}`, table: d.table, id: r.id, tab: d.tab, type: typeof d.type === 'function' ? d.type(r) : d.type,
        content: x.content, project: x.project ?? '', amount: x.amount ?? null, deletedAt: r.deleted_at, deletedBy: user(r.deleted_by), createdBy: r.created_by, modules: d.modules,
      });
    }
  });
  return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export function useTrash() {
  return useQuery({ queryKey: TRASH_KEY, queryFn: fetchTrash, staleTime: 15_000 });
}

/** Hóa đơn / phiếu chi đổi → chia lại tiền trả NCC (mục 4J) để công nợ và lãi / lỗ đúng ngay */
async function afterChange(tables: Iterable<string>) {
  const t = new Set(tables);
  if (t.has('expenses') || t.has('payments')) await syncSupplierAllocations().catch(() => undefined);
}

export function useRestoreTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Pick<TrashRow, 'table' | 'id'>) => {
      const { error } = await sb.rpc('trash_restore', { p_table: row.table, p_id: row.id });
      if (error) throw new Error(error.message);
      await afterChange([row.table]);
    },
    onSettled: () => qc.invalidateQueries(),
  });
}

/** Xóa vĩnh viễn 1 hoặc nhiều bản ghi. Trả về số đã xóa và lỗi đầu tiên (nếu có) — bản ghi lỗi được bỏ qua, làm tiếp. */
export function usePurgeTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Pick<TrashRow, 'table' | 'id'>[]): Promise<{ done: number; firstError: string | null }> => {
      let done = 0, firstError: string | null = null;
      for (const r of rows) {
        const { error } = await sb.rpc('trash_purge', { p_table: r.table, p_id: r.id });
        if (error) firstError ??= error.message; else done++;
      }
      await afterChange(rows.map((r) => r.table));
      if (!done && firstError) throw new Error(firstError);
      return { done, firstError };
    },
    onSettled: () => qc.invalidateQueries(),
  });
}
