// Kiểu dữ liệu tối thiểu mà các công thức cần. Dòng đọc từ Supabase (src/types/db.ts) khớp sẵn các kiểu này.
// MỌI danh sách đưa vào công thức phải là bản ghi CÒN SỐNG (deleted_at = null) — lớp api lọc trước.

/** Ngày dạng 'YYYY-MM-DD' */
export type IsoDate = string;

export type CalcProject = {
  id: string;
  name: string;
  is_company_overhead: boolean;
  start_date: IsoDate | null;
  end_date: IsoDate | null;
  cost_weight_k: number | null;
  created_year: number | null;
};

export type CalcExpense = {
  id: string;
  project_id: string;
  date: IsoDate | null;
  amount: number;
  paid_at_purchase: boolean;
  supplier_id?: string | null;
  expense_type_id?: string | null;
  buyer_id?: string | null;
  description?: string | null;
  invoice_no?: string | null;
  source?: string | null;
  created_at?: string | null;
};

export type CalcTimesheetWeek = { id: string; project_id: string; week_start: IsoDate };

export type CalcTimesheetLine = {
  week_id: string;
  worker_id?: string | null;
  day_units: number[];
  daily_wage: number;
  allowance: number;
  retail_purchase: number;
  note?: string | null;
};

export type PaymentKind = 'advance' | 'progress' | 'supplier_payment';

export type CalcPayment = {
  id: string;
  kind: PaymentKind | string;
  date: IsoDate | null;
  amount: number;
  project_id: string | null;
  supplier_id?: string | null;
  subcontractor_id?: string | null;
  subcontract_id?: string | null;
  created_at?: string | null;
  note?: string | null;
};

export type CalcPaymentAllocation = {
  payment_id: string;
  expense_id: string | null;
  project_id: string | null;
  amount: number;
};

export type CalcReceipt = { project_id: string; date: IsoDate | null; amount: number };

export type CalcMainContract = {
  project_id: string;
  date: IsoDate | null;
  value: number;
  extra_value: number;
  legacy_variation: number;
};

export type SettlementKind = 'increase' | 'decrease' | 'replace';

export type CalcSettlement = {
  id: string;
  project_id: string;
  date: IsoDate | null;
  kind: SettlementKind | string;
  amount: number;
  created_at?: string | null;
};

export type CalcSubcontract = {
  id: string;
  project_id: string;
  subcontractor_id: string;
  date: IsoDate | null;
  value: number;
  legacy_variation: number;
  created_at?: string | null;
  description?: string | null;
};

/** Toàn bộ dữ liệu một lần tính báo cáo cần */
export type CalcData = {
  projects: CalcProject[];
  expenses: CalcExpense[];
  timesheetWeeks: CalcTimesheetWeek[];
  timesheetLines: CalcTimesheetLine[];
  payments: CalcPayment[];
  paymentAllocations: CalcPaymentAllocation[];
  receipts: CalcReceipt[];
  mainContracts: CalcMainContract[];
  settlements: CalcSettlement[];
};

/** Một dòng chi phí đã gộp: hóa đơn nhập tay HOẶC dòng sinh ra từ chấm công (như `buildInvoices` app cũ) */
export type CostEntry = {
  id: string;
  project_id: string;
  date: IsoDate | null;
  amount: number;
  /** true = tiền đã chi lúc mua (vào cột A). Dòng từ chấm công luôn true. */
  paid_at_purchase: boolean;
  /** 'wage' = lương tuần, 'retail' = HĐ mua lẻ trong chấm công, còn lại = nguồn của hóa đơn */
  source: string;
  expense?: CalcExpense;
  week_id?: string;
  worker_id?: string | null;
};
