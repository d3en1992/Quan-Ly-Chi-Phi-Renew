// TN02 — dựng file Excel theo 3 kiểu gom (đặc tả mục 5):
//   per-project : sheet TONG HOP (khi > 1 công trình) + mỗi công trình 1 sheet, các loại xếp dọc; danh bạ xuất 1 lần ở TONG HOP
//   one-sheet   : 1 sheet "DU LIEU", mỗi loại 1 khối có cột CÔNG TRÌNH (copy sang chỗ khác / PivotTable)
//   per-dataset : mỗi loại 1 sheet, có cột CÔNG TRÌNH
// planSheets() là hàm thuần (có test: 3 kiểu cùng tổng số dòng). writeWorkbook() mới dùng ExcelJS (tải khi bấm Xuất).
import type { Workbook, Worksheet } from 'exceljs';
import { drawDauTrang, type DauTrang } from '@/lib/export/dau-trang';
import { colLetter, drawKhoi, FMT, setupPrint, type KhoiResult } from '@/lib/export/excel-khoi';
import { sheetName } from '@/lib/export/ten-file';
import type { Block, BlockCol } from './joinDatasets';
import { DATASET, type DatasetKey } from './registry';

export type GroupMode = 'per-project' | 'one-sheet' | 'per-dataset';
export const GROUP_MODE_LABEL: Record<GroupMode, string> = { 'per-project': 'Mỗi công trình 1 sheet', 'one-sheet': 'Gộp 1 sheet', 'per-dataset': 'Mỗi loại 1 sheet' };

export type SheetPlan = {
  name: string;
  kind: 'summary' | 'project' | 'shared' | 'all' | 'dataset';
  projectId?: string | null;
  blocks: Block[];
  /** Sheet TONG HOP: các công trình cần 1 dòng tổng hợp */
  summaryOf?: string[];
};

const PROJECT_COL: BlockCol = { key: 'project', label: 'CÔNG TRÌNH', width: 30, type: 'text', sum: false };

/** Khối con chỉ gồm các dòng thỏa điều kiện */
function subset(b: Block, keep: (i: number) => boolean): Block {
  const idx = b.rows.map((_, i) => i).filter(keep);
  return { ...b, rows: idx.map((i) => b.rows[i]!), projects: idx.map((i) => b.projects[i]!), dates: idx.map((i) => b.dates[i]!) };
}

/** Thêm cột CÔNG TRÌNH (đứng sau STT), sắp theo thứ tự công trình đã chọn rồi theo ngày */
function withProjectCol(b: Block, order: Map<string, number>, name: (id: string | null) => string): Block {
  if (b.shared) return b;
  const idx = b.rows.map((_, i) => i).sort((x, y) => {
    const px = order.get(b.projects[x] ?? '') ?? 1e9, py = order.get(b.projects[y] ?? '') ?? 1e9;
    return px - py || (b.dates[x]! < b.dates[y]! ? -1 : b.dates[x]! > b.dates[y]! ? 1 : x - y);
  });
  return {
    ...b, columns: [PROJECT_COL, ...b.columns],
    rows: idx.map((i) => [name(b.projects[i] ?? null) || '(không gán công trình)', ...b.rows[i]!]),
    projects: idx.map((i) => b.projects[i]!), dates: idx.map((i) => b.dates[i]!),
  };
}

/**
 * Chia khối vào sheet theo kiểu gom. `projectOrder` = công trình theo thứ tự chọn (Tất cả = theo tên).
 * Tổng số dòng mọi sheet = tổng số dòng các khối (không mất, không lặp).
 */
export function planSheets(blocks: readonly Block[], mode: GroupMode, projectOrder: readonly string[], projectName: (id: string | null) => string): SheetPlan[] {
  const used = new Set<string>();
  const shared = blocks.filter((b) => b.shared);
  const own = blocks.filter((b) => !b.shared);
  // Công trình có dữ liệu, theo thứ tự chọn; công trình có dữ liệu nhưng không trong danh sách (Tất cả) theo tên
  const seen = new Set<string>();
  for (const b of own) for (const p of b.projects) if (p) seen.add(p);
  const order = [...projectOrder.filter((p) => seen.has(p)), ...[...seen].filter((p) => !projectOrder.includes(p)).sort((a, b) => projectName(a).localeCompare(projectName(b), 'vi'))];
  const orderIx = new Map(order.map((p, i) => [p, i]));

  if (mode === 'one-sheet') {
    return [{ name: sheetName('DU LIEU', used), kind: 'all', blocks: blocks.map((b) => withProjectCol(b, orderIx, projectName)) }];
  }
  if (mode === 'per-dataset') {
    return blocks.map((b) => ({ name: sheetName(DATASET[b.id as DatasetKey]?.sheet ?? b.title, used), kind: 'dataset' as const, blocks: [withProjectCol(b, orderIx, projectName)] }));
  }
  // per-project
  const plans: SheetPlan[] = [];
  const multi = order.length > 1;
  const summary: SheetPlan | null = multi || (!order.length && shared.length) ? { name: sheetName('TONG HOP', used), kind: 'summary', blocks: shared, summaryOf: order } : null;
  if (summary) plans.push(summary);
  for (const p of order) {
    const bs = own.map((b) => subset(b, (i) => b.projects[i] === p)).filter((b) => b.rows.length);
    plans.push({ name: sheetName(projectName(p) || 'Cong trinh', used), kind: 'project', projectId: p, blocks: bs });
  }
  const loose = own.map((b) => subset(b, (i) => !b.projects[i])).filter((b) => b.rows.length);
  if (loose.length) plans.push({ name: sheetName('Khong gan CT', used), kind: 'project', projectId: null, blocks: loose });
  if (!summary && shared.length) plans.push({ name: sheetName('Danh muc danh ba', used), kind: 'shared', blocks: shared });
  return plans;
}

/** Cột của sheet TONG HOP: [nhãn, loại dữ liệu, cột trong khối, kiểu] */
const SUMMARY_COLS: { label: string; dataset: DatasetKey | 'timesheet'; key: string | 'count'; money: boolean }[] = [
  { label: 'SỐ DÒNG HÓA ĐƠN', dataset: 'expenses', key: 'count', money: false },
  { label: 'TIỀN HÓA ĐƠN', dataset: 'expenses', key: 'amount', money: true },
  { label: 'SỐ CÔNG', dataset: 'timesheet', key: 'units', money: false },
  { label: 'TIỀN CÔNG', dataset: 'timesheet', key: 'wage', money: true },
  { label: 'HĐ THẦU PHỤ', dataset: 'subcontracts', key: 'value', money: true },
  { label: 'ĐÃ CHI TP + NCC', dataset: 'payments', key: 'amount', money: true },
  { label: 'THU TIỀN', dataset: 'receipts', key: 'amount', money: true },
  { label: 'THIẾT BỊ (SL)', dataset: 'equipment', key: 'quantity', money: false },
];

export type WriteMeta = DauTrang & { company: string };

/** Ghi workbook. Trả về số dòng dữ liệu đã ghi. `onProgress` theo khối. */
export async function writeWorkbook(plans: readonly SheetPlan[], meta: WriteMeta, projectName: (id: string | null) => string, onProgress?: (done: number, total: number) => void): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.exportedBy;
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const total = plans.reduce((s, p) => s + p.blocks.length, 0) || 1;
  let done = 0;
  // Ô tổng từng loại ở từng sheet công trình — để TONG HOP tham chiếu bằng công thức
  const refs = new Map<string, Map<string, { sheet: string; res: KhoiResult }>>();
  const sheets = new Map<string, Worksheet>();
  for (const p of plans) sheets.set(p.name, wb.addWorksheet(p.name, { properties: { defaultRowHeight: 16 } }));

  for (const [pi, p] of plans.entries()) {
    const ws = sheets.get(p.name)!;
    setupPrint(ws);
    const span = Math.max(...p.blocks.map((b) => b.columns.length + 1), p.kind === 'summary' ? SUMMARY_COLS.length + 2 : 6);
    const title = p.kind === 'project' ? `${meta.title} — ${p.projectId ? projectName(p.projectId) : 'KHÔNG GÁN CÔNG TRÌNH'}` : p.kind === 'summary' ? `${meta.title} — TỔNG HỢP` : meta.title;
    let r = drawDauTrang(ws, { ...meta, title }, span, pi === 0);
    if (p.kind === 'summary') r = reserveSummary(ws, r, p.summaryOf ?? []);
    const many = p.blocks.length > 1 || p.kind === 'summary';
    for (const [bi, b] of p.blocks.entries()) {
      const res = drawKhoi(ws, r, b, { index: bi + 1, autoFilter: !many, freeze: !many && p.kind !== 'summary' });
      r = res.endRow + 1;
      if (p.kind === 'project' && p.projectId) {
        const m = refs.get(p.projectId) ?? new Map();
        m.set(b.dataset === 'timesheet_lines' || b.dataset === 'timesheet_weeks' ? 'timesheet' : b.dataset, { sheet: p.name, res });
        refs.set(p.projectId, m);
      }
      onProgress?.(++done, total);
      await new Promise((ok) => setTimeout(ok, 0)); // nhường trình duyệt vẽ thanh tiến trình
    }
  }
  const sum = plans.find((p) => p.kind === 'summary');
  if (sum) fillSummary(sheets.get(sum.name)!, sum.summaryOf ?? [], refs, projectName);
  return wb;
}

// Sheet TONG HOP: chừa chỗ cho bảng tổng hợp (mỗi công trình 1 dòng), điền công thức sau khi đã ghi các sheet công trình
const SUMMARY_START = new WeakMap<Worksheet, number>();
function reserveSummary(ws: Worksheet, r: number, projects: string[]): number {
  SUMMARY_START.set(ws, r);
  return projects.length ? r + projects.length + 4 : r;
}

function fillSummary(ws: Worksheet, projects: string[], refs: Map<string, Map<string, { sheet: string; res: KhoiResult }>>, projectName: (id: string | null) => string) {
  if (!projects.length) return;
  let r = SUMMARY_START.get(ws)!;
  const nCols = SUMMARY_COLS.length + 2;
  ws.mergeCells(r, 1, r, nCols);
  const t = ws.getCell(r, 1);
  t.value = 'TỔNG HỢP THEO CÔNG TRÌNH (số lấy bằng công thức từ dòng TỔNG CỘNG của từng sheet)';
  t.font = { bold: true, size: 12 };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  r++;
  const head = ws.getRow(r);
  ['STT', 'CÔNG TRÌNH', ...SUMMARY_COLS.map((c) => c.label)].forEach((l, i) => {
    const c = head.getCell(i + 1);
    c.value = l; c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  head.height = 30;
  ws.getColumn(2).width = Math.max(ws.getColumn(2).width ?? 0, 34);
  for (let i = 3; i <= nCols; i++) ws.getColumn(i).width = Math.max(ws.getColumn(i).width ?? 0, 15);
  r++;
  const first = r;
  projects.forEach((p, i) => {
    const row = ws.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = projectName(p);
    SUMMARY_COLS.forEach((c, j) => {
      const ref = refs.get(p)?.get(c.dataset);
      const cell = row.getCell(j + 3);
      cell.numFmt = c.money ? FMT.money : c.key === 'count' ? FMT.money : FMT.dec;
      if (!ref) return;
      if (c.key === 'count') { cell.value = ref.res.rowCount; return; }
      const L = ref.res.colOf(c.key);
      if (!L || !ref.res.totalRow) return;
      cell.value = { formula: `'${ref.sheet}'!${L}${ref.res.totalRow}` };
    });
    r++;
  });
  const tr = ws.getRow(r);
  tr.getCell(2).value = 'TỔNG CỘNG';
  for (let i = 1; i <= nCols; i++) {
    const c = tr.getCell(i);
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
    if (i >= 3) {
      const L = colLetter(i);
      c.value = { formula: `SUM(${L}${first}:${L}${r - 1})` };
      c.numFmt = SUMMARY_COLS[i - 3]!.money || SUMMARY_COLS[i - 3]!.key === 'count' ? FMT.money : FMT.dec;
    }
  }
}

/** Ghi workbook ra Blob để tải về */
export async function workbookBlob(wb: Workbook): Promise<Blob> {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
