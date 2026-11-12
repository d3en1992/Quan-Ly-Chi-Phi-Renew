// TN02 — Dựng "khối" dữ liệu (chưa đụng Excel): mỗi loại 1 khối; ghép cha–con thành 1 khối (đặc tả 5.4);
// chấm công 2 kiểu: CHI TIẾT (tuần × công nhân) / GỘP (mỗi công nhân 1 dòng, số của Tổng lương tuần — src/lib/calc/payroll.ts).
// Mỗi dòng của khối nhớ công trình + ngày để buildWorkbook chia sheet / sắp xếp.
import {
  ALL_YEARS, buildPayrollIndex, calcSheetRow, exportLineNetPay, netPayLedgerItems, sheetTotals, weeklyPayroll,
  type PayrollLine, type PayWeek, type WageAdvance,
} from '@/lib/calc';
import { DATASET, DATASETS, EXPENSE_HEAD_COLS, GROUPS, type Cell, type ColType, type Column, type Ctx, type DatasetKey, type Row } from './registry';
import { dateOfRow, indexStore, projectOfRow, selectRows, type ExportFilter, type Memo, type Store, type StoreIndex } from './fetchDataset';

export type BlockCol = { key: string; label: string; width: number; type: ColType; sum: boolean };
export type Block = {
  id: string;
  /** Loại dữ liệu chính của khối (để tổng hợp / đếm) */
  dataset: DatasetKey;
  title: string;
  caption: string;
  columns: BlockCol[];
  rows: Cell[][];
  /** Công trình của từng dòng (null = không gán) */
  projects: (string | null)[];
  dates: string[];
  /** Danh bạ / danh mục dùng chung: xuất 1 lần, không chia theo công trình */
  shared: boolean;
};

export type TimesheetMode = 'detail' | 'grouped';
export type Selection = { keys: DatasetKey[]; timesheetMode: TimesheetMode; includePrivate: boolean };

const asCol = (c: Column): BlockCol => ({ key: c.key, label: c.label, width: c.width, type: c.type ?? 'text', sum: c.sum ?? c.type === 'money' });
const col = (key: string, label: string, width: number, type: ColType, sum = type === 'money'): BlockCol => ({ key, label, width, type, sum });

/** Loại thật sự sẽ xuất: bảng con tick một mình thì kéo theo bảng cha */
export function effectiveKeys(keys: readonly DatasetKey[]): DatasetKey[] {
  const set = new Set(keys);
  for (const k of keys) { const p = DATASET[k].parent; if (p) set.add(p); }
  return DATASETS.map((d) => d.key).filter((k) => set.has(k));
}

const num = (v: unknown) => Number(v) || 0;
const sortByDate = <T extends { date: string }>(xs: T[]) => xs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

type Built = { cells: Cell[]; project: string | null; date: string };

function finish(dataset: DatasetKey, title: string, caption: string, columns: BlockCol[], rows: Built[], shared = false): Block {
  sortByDate(rows);
  return {
    id: dataset, dataset, title, caption, columns, shared,
    rows: rows.map((r) => r.cells), projects: rows.map((r) => r.project), dates: rows.map((r) => r.date),
  };
}

export function buildBlocks(sel: Selection, store: Store, f: ExportFilter, priv?: Map<string, Row>): Block[] {
  const ix = indexStore(store);
  const ctx = ix.ctx(priv);
  const memo: Memo = new Map();
  const keys = new Set(effectiveKeys(sel.keys));
  const rowsOf = (k: DatasetKey) => selectRows(k, store, f, memo);
  const colsOf = (k: DatasetKey) => DATASET[k].columns.filter((c) => sel.includePrivate || !c.private);
  const out: Block[] = [];

  for (const g of GROUPS) {
    for (const ds of DATASETS.filter((d) => d.group === g.key && keys.has(d.key))) {
      const k = ds.key;
      if (ds.privateOnly && !sel.includePrivate) continue;
      // Bảng con đã được ghép vào khối của bảng cha
      if (ds.parent) continue;
      if (k === 'expenses' && keys.has('expense_lines')) { out.push(expenseJoin(rowsOf('expenses'), rowsOf('expense_lines'), ctx, ix)); continue; }
      if (k === 'payments' && keys.has('payment_allocations')) { out.push(paymentJoin(rowsOf('payments'), rowsOf('payment_allocations'), ctx, ix)); continue; }
      if (k === 'timesheet_weeks') { out.push(timesheetBlock(sel.timesheetMode, keys.has('timesheet_lines'), rowsOf('timesheet_weeks'), rowsOf('timesheet_lines'), store, ctx)); continue; }
      const cols = colsOf(k);
      const shared = ds.link.kind === 'related' || ds.link.kind === 'none' || k === 'projects';
      const rows = rowsOf(k).map((r) => ({ cells: cols.map((c) => c.value(r, ctx)), project: shared ? null : projectOfRow(k, r, ix), date: dateOfRow(k, r, ix) }));
      if (shared) rows.sort((a, b) => String(a.cells[0] ?? '').localeCompare(String(b.cells[0] ?? ''), 'vi'));
      out.push(finish(k, ds.label.toUpperCase(), ds.caption ?? '', cols.map(asCol), shared ? rows.map((r) => ({ ...r, date: '' })) : rows, shared));
    }
  }
  return out;
}

/** Hóa đơn + dòng vật tư: mỗi dòng vật tư 1 dòng, cột hóa đơn lặp lại. Hóa đơn không có dòng vật tư → 1 dòng, thành tiền = số tiền hóa đơn. */
function expenseJoin(expenses: Row[], lines: Row[], ctx: Ctx, ix: StoreIndex): Block {
  const byExp = new Map<unknown, Row[]>();
  for (const l of lines) { const a = byExp.get(l.expense_id); if (a) a.push(l); else byExp.set(l.expense_id, [l]); }
  const head = EXPENSE_HEAD_COLS;
  const lineCols = DATASET.expense_lines.columns;
  const rows: Built[] = [];
  for (const e of expenses) {
    const ls = (byExp.get(e.id) ?? []).sort((a, b) => num(a.position) - num(b.position));
    const base = head.map((c) => c.value(e, ctx));
    const project = projectOfRow('expenses', e, ix), date = dateOfRow('expenses', e, ix);
    if (!ls.length) rows.push({ cells: [...base, String(e.description ?? '') || null, null, null, null, null, num(e.amount)], project, date });
    else for (const l of ls) rows.push({ cells: [...base, ...lineCols.map((c) => c.value(l, ctx))], project, date });
  }
  return finish('expenses', 'HÓA ĐƠN + DÒNG VẬT TƯ', 'Mỗi dòng vật tư 1 dòng; hóa đơn nhập nhanh (không có dòng vật tư) = 1 dòng với thành tiền = số tiền hóa đơn',
    [...head.map(asCol), ...lineCols.map(asCol)], rows);
}

/** Phiếu chi + phần chia vào hóa đơn: mỗi phần chia 1 dòng; phiếu không chia (thầu phụ) → 1 dòng với số tiền phiếu */
function paymentJoin(payments: Row[], allocs: Row[], ctx: Ctx, ix: StoreIndex): Block {
  const byPay = new Map<unknown, Row[]>();
  for (const a of allocs) { const x = byPay.get(a.payment_id); if (x) x.push(a); else byPay.set(a.payment_id, [a]); }
  const head = DATASET.payments.columns.filter((c) => c.key !== 'amount');
  const allocCols = DATASET.payment_allocations.columns;
  const rows: Built[] = [];
  for (const p of payments) {
    const base = head.map((c) => c.value(p, ctx));
    const date = dateOfRow('payments', p, ix);
    const as = byPay.get(p.id) ?? [];
    if (!as.length) rows.push({ cells: [...base, null, num(p.amount)], project: (p.project_id as string | null) ?? null, date });
    else for (const a of as) rows.push({ cells: [...base, ...allocCols.map((c) => c.value(a, ctx))], project: (a.project_id as string | null) ?? null, date });
  }
  return finish('payments', 'PHIẾU CHI + CHIA TIỀN TRẢ NCC', 'Phiếu trả NCC: mỗi phần tiền chia vào 1 hóa đơn mua nợ là 1 dòng, công trình theo hóa đơn được trả',
    [...head.map(asCol), ...allocCols.map(asCol)], rows);
}

const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DETAIL_COLS: BlockCol[] = [col('week', 'TUẦN (CN)', 11, 'date'), col('worker', 'CÔNG NHÂN', 14, 'text'), col('role', 'T/P', 5, 'text'),
  ...DAY_LABELS.map((d, i) => col(`d${i}`, d, 5, 'dec', true)), col('units', 'TỔNG CÔNG', 9, 'dec', true), col('daily', 'LƯƠNG / NGÀY', 12, 'money', false),
  col('wage', 'TIỀN CÔNG', 15, 'money'), col('allow', 'PHỤ CẤP', 12, 'money'), col('retail', 'HĐ MUA LẺ', 12, 'money'),
  col('loan', 'ỨNG (SỔ CŨ)', 12, 'money'), col('deduct', 'TRỪ NỢ (SỔ CŨ)', 12, 'money'), col('net', 'THỰC LÃNH', 15, 'money'), col('note', 'GHI CHÚ', 26, 'text')];

/**
 * Chấm công. Mỗi công trình tính riêng (như tab Tổng lương lọc theo công trình) để cả 3 kiểu gom file cho cùng số.
 * CHI TIẾT: mỗi (tuần, công nhân) 1 dòng + dòng phiếu ứng / trả "tính vào Thực lãnh" → Σ Thực lãnh = kiểu GỘP (test).
 */
function timesheetBlock(mode: TimesheetMode, withLines: boolean, weeks: Row[], lines: Row[], store: Store, ctx: Ctx): Block {
  const advances = (store.wage_advances ?? []).filter((a) => !a.deleted_at).map((a) => ({
    id: String(a.id), worker_id: String(a.worker_id), project_id: (a.project_id as string | null) ?? null, date: String(a.date ?? ''),
    direction: String(a.direction), amount: num(a.amount), counts_in_net_pay: !!a.counts_in_net_pay, note: (a.note as string | null) ?? null,
  })) satisfies WageAdvance[];
  const toLine = (l: Row): PayrollLine & { worker_id: string } => ({
    id: String(l.id), week_id: String(l.week_id), worker_id: String(l.worker_id), day_units: (l.day_units as number[]).map(Number),
    daily_wage: num(l.daily_wage), allowance: num(l.allowance), retail_purchase: num(l.retail_purchase), debt_deduction: num(l.debt_deduction),
    legacy_loan: num(l.legacy_loan), role: (l.role as string | null) ?? null, position: num(l.position),
  });
  const weekById = new Map(weeks.map((w) => [w.id, w]));
  const byProject = new Map<string, { weeks: PayWeek[]; lines: ReturnType<typeof toLine>[] }>();
  for (const w of weeks) {
    const p = String(w.project_id);
    if (!byProject.has(p)) byProject.set(p, { weeks: [], lines: [] });
    byProject.get(p)!.weeks.push({ id: String(w.id), project_id: p, week_start: String(w.week_start) });
  }
  for (const l of lines) {
    const w = weekById.get(l.week_id);
    if (w) byProject.get(String(w.project_id))!.lines.push(toLine(l));
  }
  const worker = (id: unknown) => ctx.name('workers', id);
  const rows: Built[] = [];

  if (mode === 'detail' && !withLines) {
    // Chỉ tick "Tuần chấm công": mỗi tuần 1 dòng, tổng của sổ
    for (const [p, g] of byProject) for (const w of g.weeks) {
      const ls = g.lines.filter((l) => l.week_id === w.id);
      const t = sheetTotals(ls.map((l) => ({ day_units: l.day_units, daily_wage: l.daily_wage, allowance: l.allowance, retail_purchase: l.retail_purchase, deduction: l.debt_deduction })));
      rows.push({ cells: [w.week_start, ls.length, t.dayUnits, t.wage, t.allowance, t.retail, t.netPay, String(weekById.get(w.id)?.note ?? '') || null], project: p, date: w.week_start });
    }
    return finish('timesheet_weeks', 'TUẦN CHẤM CÔNG', 'Mỗi tuần 1 dòng (tổng của sổ). Năm tính theo ngày Chủ nhật đầu tuần — tab Lợi Nhuận tính lương vào năm của thứ Bảy.',
      [col('week', 'TUẦN (CN)', 11, 'date'), col('n', 'SỐ NGƯỜI', 8, 'num', true), col('units', 'TỔNG CÔNG', 9, 'dec', true), col('wage', 'TIỀN CÔNG', 15, 'money'),
        col('allow', 'PHỤ CẤP', 13, 'money'), col('retail', 'HĐ MUA LẺ', 13, 'money'), col('net', 'THỰC LÃNH SỔ', 15, 'money'), col('note', 'GHI CHÚ', 24, 'text')], rows);
  }

  if (mode === 'grouped') {
    for (const [p, g] of byProject) {
      const pix = buildPayrollIndex(g.weeks, g.lines, advances);
      for (const r of weeklyPayroll(pix, { years: ALL_YEARS })) {
        rows.push({
          cells: [worker(r.workerId), r.role, r.from, r.to, r.dayUnits, r.wage, r.allowance, r.retail, r.legacyLoan, r.legacyDeduction, r.ledgerAdj, r.avgDaily, r.netPay],
          project: p, date: r.from,
        });
      }
    }
    return finish('timesheet_lines', 'TỔNG LƯƠNG (GỘP THEO CÔNG NHÂN)', 'Mỗi công nhân 1 dòng cho mỗi công trình — cùng cách tính tab Tổng lương tuần. Năm theo ngày Chủ nhật đầu tuần.',
      [col('worker', 'CÔNG NHÂN', 14, 'text'), col('role', 'T/P', 5, 'text'), col('from', 'TỪ NGÀY', 11, 'date'), col('to', 'ĐẾN NGÀY', 11, 'date'),
        col('units', 'TỔNG CÔNG', 9, 'dec', true), col('wage', 'TIỀN CÔNG', 15, 'money'), col('allow', 'PHỤ CẤP', 13, 'money'), col('retail', 'HĐ MUA LẺ', 13, 'money'),
        col('loan', 'ỨNG (SỔ CŨ)', 12, 'money'), col('deduct', 'TRỪ NỢ (SỔ CŨ)', 12, 'money'), col('ledger', 'ỨNG/TRẢ TÍNH VÀO TL', 15, 'money'), col('avg', 'BQ / CÔNG', 12, 'money', false), col('net', 'THỰC LÃNH', 15, 'money')], rows);
  }

  // CHI TIẾT
  for (const [p, g] of byProject) {
    const wk = new Map(g.weeks.map((w) => [w.id, w]));
    for (const l of g.lines) {
      const w = wk.get(l.week_id)!;
      const s = calcSheetRow({ day_units: l.day_units, daily_wage: l.daily_wage, allowance: l.allowance, retail_purchase: l.retail_purchase, deduction: l.debt_deduction });
      rows.push({
        cells: [w.week_start, worker(l.worker_id), l.role ?? null, ...l.day_units.map((d) => d || null), s.dayUnits, l.daily_wage, s.wage, l.allowance, l.retail_purchase,
          l.legacy_loan, l.debt_deduction, exportLineNetPay(l), null],
        project: p, date: w.week_start,
      });
    }
    // Phiếu ứng / trả "tính vào Thực lãnh" trong khoảng làm việc của từng người ở công trình này
    const pix = buildPayrollIndex(g.weeks, g.lines, advances);
    for (const r of weeklyPayroll(pix, { years: ALL_YEARS })) {
      for (const it of netPayLedgerItems(pix, r.workerId, r.from, r.to)) {
        const cells: Cell[] = new Array<Cell>(DETAIL_COLS.length).fill(null);
        cells[0] = it.advance.date; cells[1] = worker(r.workerId);
        cells[DETAIL_COLS.length - 2] = it.amount;
        cells[DETAIL_COLS.length - 1] = `${it.advance.direction === 'repay' ? 'Trả' : 'Ứng'} tính vào thực lãnh${it.advance.note ? ` · ${it.advance.note}` : ''}`;
        rows.push({ cells, project: p, date: it.advance.date });
      }
    }
  }
  return finish('timesheet_lines', 'CHẤM CÔNG (CHI TIẾT TUẦN × CÔNG NHÂN)', 'Mỗi người mỗi tuần 1 dòng + dòng phiếu ứng / trả tính vào thực lãnh. Năm theo ngày Chủ nhật đầu tuần (tab Lợi Nhuận tính lương vào năm của thứ Bảy).',
    DETAIL_COLS, rows);
}

/** Tổng số dòng sẽ ghi ra file */
export const totalRows = (blocks: readonly Block[]) => blocks.reduce((s, b) => s + b.rows.length, 0);
