// TN02 — ghi file Excel THẬT bằng ExcelJS trên snapshot, đọc lại để kiểm: số dòng trên màn = trong file (mục 9.1),
// dòng tổng là công thức SUBTOTAL (9.7), tên sheet đúng, dòng cảnh báo dữ liệu cá nhân. File mẫu lưu ở du-lieu/xuat-thu/ để anh mở xem.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { transformSnapshot } from '../../../scripts/legacy/transform.ts';
import { PRIVATE_WARNING } from '@/lib/export/dau-trang';
import { planSheets, workbookBlob, writeWorkbook, type GroupMode } from './buildWorkbook';
import { DEFAULT_FILTER, indexStore, selectRows, type ExportFilter, type Store } from './fetchDataset';
import { buildBlocks } from './joinDatasets';
import type { DatasetKey } from './registry';

const SNAP = join(process.cwd(), 'du-lieu', 'snapshot.json');
const OUT = join(process.cwd(), 'du-lieu', 'xuat-thu');
const ready = existsSync(SNAP);

describe.skipIf(!ready)('Ghi file Excel (ExcelJS) trên snapshot thật', () => {
  const store: Store = ready
    ? (transformSnapshot(JSON.parse(readFileSync(SNAP, 'utf8')), { companyId: '00000000-0000-0000-0000-000000000001', userIdByLegacyName: {} }).tables as unknown as Store)
    : {};
  const live = (t: string) => (store[t] ?? []).filter((r) => !r.deleted_at);
  const pid = (part: string) => (ready ? (live('projects').find((p) => String(p.name).startsWith(part))!.id as string) : '');
  const coSau = pid('CT Cô Sáu'), nhaTinh = pid('CT Nhà Tình');
  const ix = indexStore(store);
  const name = (id: string | null) => (id ? String(ix.byId('projects', id)?.name ?? '') : '');
  const meta = { company: 'Công ty Nguyễn Hữu', title: 'DỮ LIỆU XUẤT', filterText: 'thử', exportedBy: 'test', exportedAt: '12/11/2026', notes: ['Ghi chú thử'], privateWarning: false };

  async function make(keys: DatasetKey[], f: ExportFilter, mode: GroupMode, file: string, privateWarning = false) {
    const blocks = buildBlocks({ keys, timesheetMode: 'detail', includePrivate: false }, store, f);
    const plans = planSheets(blocks, mode, f.projectIds, name);
    const wb = await writeWorkbook(plans, { ...meta, privateWarning }, name);
    const buf = Buffer.from(await (await workbookBlob(wb)).arrayBuffer());
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, file), buf);
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as unknown as ArrayBuffer);
    return { back, plans, blocks };
  }

  it('(1)(7) Hóa đơn 1 công trình: số dòng trong file = số trên màn, dòng tổng là SUBTOTAL', async () => {
    const f: ExportFilter = { ...DEFAULT_FILTER, projectMode: 'selected', projectIds: [coSau] };
    const expected = selectRows('expenses', store, f).length;
    const { back } = await make(['expenses'], f, 'per-project', '01_HoaDon_CoSau.xlsx');
    expect(back.worksheets.map((w) => w.name)).toEqual(['CT Cô Sáu']);
    const ws = back.worksheets[0]!;
    let header = 0, total = 0;
    ws.eachRow((row, r) => {
      if (row.getCell(1).value === 'STT') header = r;
      if (row.getCell(2).value === 'TỔNG CỘNG' || row.getCell(1).value === 'TỔNG CỘNG') total = r;
    });
    expect(total - header - 1).toBe(expected);
    const amountCell = ws.getRow(total).getCell(ws.getRow(header).cellCount);
    expect(String((amountCell.value as { formula: string }).formula)).toMatch(/^SUBTOTAL\(9,/);
  });

  it('(5) 2 công trình × 3 kiểu gom: có TONG HOP, sheet công trình, cột CÔNG TRÌNH', async () => {
    const f: ExportFilter = { ...DEFAULT_FILTER, projectMode: 'selected', projectIds: [coSau, nhaTinh] };
    const keys: DatasetKey[] = ['expenses', 'expense_lines', 'timesheet_weeks', 'timesheet_lines', 'receipts', 'payments', 'subcontracts', 'equipment', 'workers'];
    const a = await make(keys, f, 'per-project', '02_2CT_MoiCT1Sheet.xlsx');
    expect(a.back.worksheets.map((w) => w.name)).toEqual(['TONG HOP', 'CT Cô Sáu', 'CT Nhà Tình']);
    const b = await make(keys, f, 'one-sheet', '03_2CT_Gop1Sheet.xlsx');
    expect(b.back.worksheets.map((w) => w.name)).toEqual(['DU LIEU']);
    const c = await make(keys, f, 'per-dataset', '04_2CT_MoiLoai1Sheet.xlsx');
    expect(c.back.worksheets.length).toBe(c.blocks.length);
    let hasProjectCol = false;
    c.back.worksheets[0]!.eachRow((row) => { if (row.getCell(1).value === 'STT' && row.getCell(2).value === 'CÔNG TRÌNH') hasProjectCol = true; });
    expect(hasProjectCol).toBe(true);
  });

  it('(8) có dữ liệu cá nhân → dòng đỏ cảnh báo ở sheet đầu', async () => {
    const { back } = await make(['workers'], DEFAULT_FILTER, 'per-dataset', '05_CanhBaoCaNhan.xlsx', true);
    expect(back.worksheets[0]!.getCell(1, 1).value).toBe(PRIVATE_WARNING);
  });
});
