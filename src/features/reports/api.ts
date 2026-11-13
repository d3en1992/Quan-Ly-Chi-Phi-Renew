// Đọc dữ liệu cho các báo cáo chỉ xem (Lợi Nhuận, Dashboard, Thống Kê CP/HĐ).
// Tải MỌI NĂM một lần (vài nghìn dòng), lọc năm và tính bằng công thức trong src/lib/calc — đúng bộ công thức
// đã so với app cũ. RLS trong kho tự lọc theo quyền và phạm vi công trình của tài khoản.
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type { CalcData, CalcSubcontract } from '@/lib/calc';

const money = z.coerce.number();
const date = z.string().nullable();

const projectSchema = z.object({
  id: z.string(), name: z.string(), is_company_overhead: z.boolean(), start_date: date, end_date: date,
  cost_weight_k: z.coerce.number().nullable(), created_year: z.number().nullable(),
  kind: z.string().nullable(), status: z.string().nullable(), customer_id: z.string().nullable(), owner_name: z.string().nullable(),
});
const expenseSchema = z.object({
  id: z.string(), project_id: z.string(), date, amount: money, paid_at_purchase: z.boolean(), supplier_id: z.string().nullable(),
  expense_type_id: z.string().nullable(), buyer_id: z.string().nullable(), description: z.string().nullable(), invoice_no: z.string().nullable(),
  source: z.string().nullable(), created_by: z.string().nullable(), created_at: z.string().nullable(), receipt_image_path: z.string().nullable(),
});
const weekSchema = z.object({ id: z.string(), project_id: z.string(), week_start: z.string() });
const lineSchema = z.object({
  week_id: z.string(), worker_id: z.string().nullable(), day_units: z.array(z.coerce.number().nullable().transform((v) => v ?? 0)),
  daily_wage: money, allowance: money, retail_purchase: money, note: z.string().nullable(),
});
const paymentSchema = z.object({
  id: z.string(), kind: z.string(), date, amount: money, project_id: z.string().nullable(), supplier_id: z.string().nullable(),
  subcontractor_id: z.string().nullable(), subcontract_id: z.string().nullable(), created_at: z.string().nullable(),
});
const allocationSchema = z.object({ payment_id: z.string(), expense_id: z.string().nullable(), project_id: z.string().nullable(), amount: money });
const receiptSchema = z.object({ project_id: z.string(), date, amount: money });
const contractSchema = z.object({ project_id: z.string(), date, value: money, extra_value: money, legacy_variation: money });
const settlementSchema = z.object({ id: z.string(), project_id: z.string(), date, kind: z.string(), amount: money, created_at: z.string().nullable() });
const subcontractSchema = z.object({
  id: z.string(), project_id: z.string(), subcontractor_id: z.string(), date, value: money, legacy_variation: money, created_at: z.string().nullable(), description: z.string().nullable(),
});
const namedSchema = z.object({ id: z.string(), name: z.string() });
const catalogSchema = z.object({ id: z.string(), name: z.string(), kind: z.string() });
const profileSchema = z.object({ id: z.string(), display_name: z.string() });

export type ReportProject = z.infer<typeof projectSchema>;
export type ReportExpense = z.infer<typeof expenseSchema>;

const cols = (s: z.ZodObject<z.ZodRawShape>) => Object.keys(s.shape).join(',');

/** Đọc hết bản ghi CÒN SỐNG của 1 bảng (PostgREST trả tối đa 1000 dòng / lần), kiểm tra bằng Zod. */
export async function fetchLive<S extends z.ZodObject<z.ZodRawShape>>(table: string, schema: S, softDelete = true): Promise<z.infer<S>[]> {
  const out: z.infer<S>[] = [];
  const orderBy = 'id' in schema.shape ? 'id' : Object.keys(schema.shape)[0]!;
  for (let from = 0; ; from += 1000) {
    // Tên bảng là chuỗi động nên bỏ kiểm tra kiểu của supabase-js ở đây; dữ liệu trả về được Zod kiểm tra ngay bên dưới.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from(table).select(cols(schema));
    if (softDelete) q = q.is('deleted_at', null);
    const { data, error } = await q.order(orderBy).range(from, from + 999);
    if (error) throw new Error(`Không đọc được bảng ${table}: ${error.message}`);
    const rows = z.array(schema).parse(data ?? []);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export type ReportData = CalcData & {
  projects: ReportProject[];
  expenses: ReportExpense[];
  subcontracts: CalcSubcontract[];
  supplierName: Map<string, string>;
  catalogName: Map<string, string>;
  customerName: Map<string, string>;
  workerName: Map<string, string>;
  subcontractorName: Map<string, string>;
  profileName: Map<string, string>;
  projectById: Map<string, ReportProject>;
  /** Lúc tải dữ liệu — "bây giờ" để tính số ngày thi công của công trình chưa kết thúc */
  loadedAt: number;
};

const toMap = (rows: { id: string; name: string }[]) => new Map(rows.map((r) => [r.id, r.name]));

export async function fetchReportData(): Promise<ReportData> {
  const [projects, expenses, timesheetWeeks, payments, receipts, mainContracts, settlements, subcontracts, suppliers, catalog, customers, workers] =
    await Promise.all([
      fetchLive('projects', projectSchema), fetchLive('expenses', expenseSchema), fetchLive('timesheet_weeks', weekSchema),
      fetchLive('payments', paymentSchema), fetchLive('receipts', receiptSchema), fetchLive('main_contracts', contractSchema),
      fetchLive('settlements', settlementSchema), fetchLive('subcontracts', subcontractSchema), fetchLive('suppliers', namedSchema),
      fetchLive('catalog_items', catalogSchema), fetchLive('customers', namedSchema), fetchLive('workers', namedSchema),
    ]);
  const subcontractors = await fetchLive('subcontractors', namedSchema);
  const [timesheetLines, paymentAllocations, profiles] = await Promise.all([
    fetchLive('timesheet_lines', lineSchema), fetchLive('payment_allocations', allocationSchema),
    // Tên tài khoản: tài khoản không được xem danh sách tài khoản thì bỏ trống cột này, không coi là lỗi
    fetchLive('profiles', profileSchema, false).catch(() => [] as z.infer<typeof profileSchema>[]),
  ]);
  // Dòng con của tuần / phiếu đã vào Thùng rác thì không tính
  const weekIds = new Set(timesheetWeeks.map((w) => w.id));
  const payIds = new Set(payments.map((p) => p.id));
  return {
    projects, expenses, timesheetWeeks, payments, receipts, mainContracts, settlements, subcontracts,
    timesheetLines: timesheetLines.filter((l) => weekIds.has(l.week_id)),
    paymentAllocations: paymentAllocations.filter((a) => payIds.has(a.payment_id)),
    supplierName: toMap(suppliers), catalogName: toMap(catalog), customerName: toMap(customers), workerName: toMap(workers), subcontractorName: toMap(subcontractors),
    profileName: new Map(profiles.map((p) => [p.id, p.display_name])),
    projectById: new Map(projects.map((p) => [p.id, p])),
    loadedAt: Date.now(),
  };
}

const expenseLineSchema = z.object({
  id: z.string(), position: z.number(), name: z.string().nullable(), unit: z.string().nullable(), quantity: z.coerce.number().nullable(),
  unit_price: z.coerce.number().nullable(), discount: z.string().nullable(), amount: money, note: z.string().nullable(),
});
export type ExpenseLine = z.infer<typeof expenseLineSchema>;

/** Dòng vật tư của MỘT hóa đơn — chỉ tải khi bấm xem chi tiết */
export function useExpenseLines(expenseId: string | null) {
  return useQuery({
    queryKey: ['expense-lines', expenseId],
    enabled: !!expenseId,
    queryFn: async (): Promise<ExpenseLine[]> => {
      const { data, error } = await supabase.from('expense_lines').select(cols(expenseLineSchema)).eq('expense_id', expenseId!).is('deleted_at', null).order('position');
      if (error) throw new Error(`Không đọc được dòng vật tư: ${error.message}`);
      return z.array(expenseLineSchema).parse(data ?? []);
    },
  });
}

export const REPORT_DATA_KEY = ['report-data'] as const;

/** Dữ liệu báo cáo dùng chung cho 3 màn (tải 1 lần, giữ 1 phút; đổi tab không tải lại). */
export function useReportData() {
  return useQuery({ queryKey: REPORT_DATA_KEY, queryFn: fetchReportData, staleTime: 60_000 });
}
