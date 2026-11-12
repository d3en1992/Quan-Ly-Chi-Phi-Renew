// TN02 — kiểm tra lọc dữ liệu trên DỮ LIỆU THẬT (du-lieu/snapshot.json = snapshot 12/11/2026, chuyển bằng transform của GĐ2).
// Thiếu file (máy khác) → bỏ qua. Các mục kiểm tra bắt buộc ở đặc tả mục 9: (1)(2)(3)(4)(5)(6).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformSnapshot } from '../../../scripts/legacy/transform.ts';
import { sumAmounts } from '@/lib/calc';
import { countAll, DEFAULT_FILTER, selectRows, timeRange, type ExportFilter, type Store } from './fetchDataset';
import { buildBlocks, effectiveKeys, totalRows, type Block } from './joinDatasets';
import { DATASETS, type DatasetKey } from './registry';
import { planSheets } from './buildWorkbook';

const SNAP = join(process.cwd(), 'du-lieu', 'snapshot.json');
const ready = existsSync(SNAP);

function load(): Store {
  const snapshot = JSON.parse(readFileSync(SNAP, 'utf8')) as Record<string, unknown>;
  return transformSnapshot(snapshot, { companyId: '00000000-0000-0000-0000-000000000001', userIdByLegacyName: {} }).tables as unknown as Store;
}

describe('timeRange — lọc thời gian (mục 4.4)', () => {
  it('năm / tháng / khoảng gồm 2 đầu', () => {
    expect(timeRange({ mode: 'all' })).toBeNull();
    expect(timeRange({ mode: 'year', year: 2025 })).toEqual(['2025-01-01', '2025-12-31']);
    expect(timeRange({ mode: 'month', ym: '2025-02' })).toEqual(['2025-02-01', '2025-02-28']);
    expect(timeRange({ mode: 'month', ym: '2024-02' })).toEqual(['2024-02-01', '2024-02-29']);
    expect(timeRange({ mode: 'range', from: '2025-06-30', to: '2025-06-01' })).toEqual(['2025-06-01', '2025-06-30']);
  });
});

describe.skipIf(!ready)('Xuất dữ liệu trên snapshot thật', () => {
  const store = ready ? load() : ({} as Store);
  const live = (t: string) => (store[t] ?? []).filter((r) => !r.deleted_at);
  const pid = (part: string) => live('projects').find((p) => String(p.name).startsWith(part))!.id as string;
  const coSau = ready ? pid('CT Cô Sáu') : '';
  const nhaTinh = ready ? pid('CT Nhà Tình') : '';
  const both: ExportFilter = { ...DEFAULT_FILTER, projectMode: 'selected', projectIds: [coSau, nhaTinh] };

  it('(1) đếm hóa đơn: Cô Sáu + Nhà Tình = tổng 2 công trình', () => {
    const a = selectRows('expenses', store, { ...both, projectIds: [coSau] }).length;
    const b = selectRows('expenses', store, { ...both, projectIds: [nhaTinh] }).length;
    expect(b).toBe(201);
    expect(a).toBeGreaterThanOrEqual(209); // đặc tả ghi 210; GĐ2 gộp 1 bản trùng nên kho còn 209
    expect(selectRows('expenses', store, both).length).toBe(a + b);
    expect(countAll(['expenses'], store, both).expenses).toBe(a + b);
  });

  it('(2) nhóm B: dòng vật tư của Cô Sáu chỉ thuộc hóa đơn của Cô Sáu', () => {
    const f = { ...both, projectIds: [coSau] };
    const exp = new Set(selectRows('expenses', store, f).map((e) => e.id));
    const lines = selectRows('expense_lines', store, f);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => exp.has(l.expense_id))).toBe(true);
    const nhaTinhExp = new Set(selectRows('expenses', store, { ...both, projectIds: [nhaTinh] }).map((e) => e.id));
    expect(lines.some((l) => nhaTinhExp.has(l.expense_id))).toBe(false);
  });

  it('(3) nhóm C: công nhân theo công trình ít hơn cả danh bạ; "Lấy tất cả" = đủ', () => {
    const all = live('workers').length;
    const byCt = selectRows('workers', store, both).length;
    expect(byCt).toBeGreaterThan(0);
    expect(byCt).toBeLessThan(all);
    expect(selectRows('workers', store, { ...both, contactsByProject: false }).length).toBe(all);
    expect(selectRows('workers', store, DEFAULT_FILTER).length).toBe(all);
  });

  it('(4) lọc năm 2025 chỉ ra dòng 2025; khoảng 01/06–30/06/2025 đúng biên', () => {
    const y = selectRows('expenses', store, { ...DEFAULT_FILTER, time: { mode: 'year', year: 2025 } });
    expect(y.length).toBeGreaterThan(0);
    expect(y.every((e) => String(e.date).startsWith('2025-'))).toBe(true);
    const r = selectRows('expenses', store, { ...DEFAULT_FILTER, time: { mode: 'range', from: '2025-06-01', to: '2025-06-30' } });
    const expect6 = live('expenses').filter((e) => String(e.date) >= '2025-06-01' && String(e.date) <= '2025-06-30').length;
    expect(r.length).toBe(expect6);
    // dòng vật tư lấy ngày của hóa đơn cha
    const lines = selectRows('expense_lines', store, { ...DEFAULT_FILTER, time: { mode: 'year', year: 2025 } });
    const ids = new Set(y.map((e) => e.id));
    expect(lines.every((l) => ids.has(l.expense_id))).toBe(true);
  });

  it('(5) ba kiểu gom: tổng số dòng bằng nhau', () => {
    const keys = DATASETS.filter((d) => !d.privateOnly).map((d) => d.key);
    const blocks = buildBlocks({ keys, timesheetMode: 'detail', includePrivate: false }, store, both);
    const n = totalRows(blocks);
    const rowsIn = (mode: 'per-project' | 'one-sheet' | 'per-dataset') => planSheets(blocks, mode, both.projectIds, (id) => id ?? '')
      .flatMap((s) => s.blocks).reduce((a, b) => a + b.rows.length, 0);
    expect(rowsIn('per-project')).toBe(n);
    expect(rowsIn('one-sheet')).toBe(n);
    expect(rowsIn('per-dataset')).toBe(n);
  });

  it('(6) chấm công: tổng Thực lãnh kiểu chi tiết = kiểu gộp (lệch 0)', () => {
    const net = (b: Block) => { const i = b.columns.findIndex((c) => c.key === 'net'); return sumAmounts(b.rows.map((r) => Number(r[i]) || 0)); };
    for (const f of [both, DEFAULT_FILTER, { ...DEFAULT_FILTER, time: { mode: 'year' as const, year: 2025 } }]) {
      const sel = (m: 'detail' | 'grouped') => buildBlocks({ keys: ['timesheet_lines'], timesheetMode: m, includePrivate: false }, store, f).find((b) => b.dataset === 'timesheet_lines')!;
      const d = sel('detail'), g = sel('grouped');
      expect(g.rows.length).toBeGreaterThan(0);
      expect(net(d)).toBe(net(g));
    }
  });

  it('bảng con tick một mình kéo theo bảng cha', () => {
    expect(effectiveKeys(['expense_lines'])).toEqual(['expenses', 'expense_lines']);
    const blocks = buildBlocks({ keys: ['expense_lines'], timesheetMode: 'detail', includePrivate: false }, store, both);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.title).toContain('DÒNG VẬT TƯ');
  });

  it('khối hóa đơn + dòng vật tư: hóa đơn không có dòng vẫn có mặt', () => {
    const f = { ...both, projectIds: [coSau] };
    const b = buildBlocks({ keys: ['expense_lines'], timesheetMode: 'detail', includePrivate: false }, store, f)[0]!;
    const withLines = new Set(selectRows('expense_lines', store, f).map((l) => l.expense_id));
    const noLines = selectRows('expenses', store, f).filter((e) => !withLines.has(e.id)).length;
    expect(b.rows.length).toBe(selectRows('expense_lines', store, f).length + noLines);
  });

  it('mọi loại dữ liệu đều đếm được, không lỗi', () => {
    const keys = DATASETS.map((d) => d.key) as DatasetKey[];
    const c = countAll(keys, store, both);
    for (const k of keys) expect(c[k]).toBeGreaterThanOrEqual(0);
  });
});
