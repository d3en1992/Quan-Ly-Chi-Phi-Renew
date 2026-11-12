// TỈ TRỌNG — test hàm thuần + so với `tytTongHop` của app cũ chạy trên cùng snapshot (so-chuan.json → tyTrong).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformSnapshot } from '../../../../scripts/legacy/transform.ts';
import {
  allocSummary, benchmarkControl, benchmarkFields, compareToBenchmark, defaultGroupOfType, defaultPillarOfType, floorAreaTotal, groupByWords,
  legacyBucketToGroup, readAllocConfig, readAllocStruct, ruleMatches, splitItems, typeGroupMatrix, type AllocItem, type AllocSource,
} from '../cost-allocation';
import { ALL_YEARS } from '../year';

describe('Tỉ trọng — hàm thuần', () => {
  it('tổng sàn = Σ KL × hệ số, bỏ dòng không tính, hệ số sai → 1', () => {
    expect(floorAreaTotal([{ kl: 60, heSo: 1 }, { kl: '51,1' }, { kl: 20, heSo: 0.5 }, { kl: 99, tinh: false }, { kl: 10, heSo: -1 }])).toBeCloseTo(60 + 51.1 + 10 + 10, 6);
    expect(floorAreaTotal(null)).toBe(0);
  });

  it('nhóm mặc định theo tên loại, đoán theo từ nguyên vẹn', () => {
    expect(defaultGroupOfType('Sắt Thép')).toBe(1);
    expect(defaultGroupOfType('Gạch Ốp Lát')).toBe(2);
    expect(defaultGroupOfType('Thiết Bị Gia Dụng')).toBe(3);
    expect(defaultGroupOfType('Mua Máy - Thiết Bị')).toBe(4);
    expect(defaultGroupOfType('Khác')).toBe(0);
    expect(groupByWords('thang máy gia đình')).toBe(3);
    expect(groupByWords('casong')).toBe(0); // "son" phải là từ nguyên vẹn
    expect(legacyBucketToGroup(2, 'thang máy')).toBe(3);
    expect(legacyBucketToGroup(2, 'xà bần')).toBe(4);
    expect(legacyBucketToGroup(3, '')).toBe(4);
  });

  it('trụ cột mặc định', () => {
    expect(defaultPillarOfType('Thi Công Sắt Thép')).toBe('sat');
    expect(defaultPillarOfType('Đổ Bê Tông')).toBe('bt');
    expect(defaultPillarOfType('Giải Khát')).toBe('quy');
    expect(defaultPillarOfType('Nhân Công')).toBe('nc');
    expect(defaultPillarOfType('Văn Phòng')).toBe('');
  });

  it('tách món: món cuối nhận phần lẻ, tổng khớp hóa đơn', () => {
    const parts = splitItems({ nd: 'x', tien: 1000, items: [{ name: 'a', amount: 333 }, { name: 'b', amount: 333 }, { name: 'c', amount: 334 }] });
    expect(parts.map((p) => p.tien).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(splitItems({ nd: 'x', tien: 500, items: [{ name: 'a', amount: 500 }] })).toEqual([{ ten: 'x', tien: 500, mon: false }]);
  });

  it('luật từ khóa: không dấu, có điều kiện loại', () => {
    const line = { loai: 'Vật Tư Điện Nước', doiTuong: 'CH A', nd: 'Mua bóng đèn' };
    expect(ruleMatches({ loai: 'Điện Nước', tuKhoa: 'bong den, o cam' }, line, { ten: 'Mua bóng đèn', mon: false })).toBe(true);
    expect(ruleMatches({ loai: 'Sắt', tuKhoa: 'bóng đèn' }, line, { ten: '', mon: false })).toBe(false);
    expect(ruleMatches({ loai: '', tuKhoa: '' }, line, { ten: '', mon: false })).toBe(false);
  });

  it('đọc cấu hình / phân nhóm đời cũ (rổ) → nhóm mới', () => {
    const cfg = readAllocConfig({ roLoai: { 'phu cap an uong': 1, khac: 2 }, roLuat: [{ id: 'rd0', tuKhoa: 'x', ro: 2 }, { id: 'q1', loai: '', tuKhoa: 'thang máy', ro: 2 }] });
    expect(cfg.nhomLoai).toEqual({ khac: 4 });
    expect(cfg.nhomLuat.length).toBe(6);
    expect(cfg.nhomLuat[5]).toMatchObject({ id: 'q1', nhom: 3 });
    expect(cfg.quyMuc).toBe(50000);
    expect(readAllocConfig(null).coBanGhi).toBe(false);
    const st = readAllocStruct({ roTay: { 'inv:1': 1, 'inv:2': 3 }, theoHdtp: { h1: { ro: 2 }, h2: { nhom: 3 }, h3: {} } }, () => 'thạch cao');
    expect(st).toEqual({ nhomTay: { 'inv:1': 1, 'inv:2': 4 }, theoHdtp: { h1: { nhom: 2 }, h2: { nhom: 3 } } });
  });

  const src = (over: Partial<AllocSource> = {}): AllocSource => ({
    expenses: [], expenseLines: new Map(), timesheetWeeks: [], timesheetLines: [], payments: [], paymentAllocations: [], subcontracts: [],
    catalogName: new Map([['t1', 'Sắt Thép'], ['t2', 'Vật Tư Điện Nước'], ['t3', 'Khác']]), supplierName: new Map([['s1', 'VLXD PHƯƠNG']]),
    workerName: new Map([['w1', 'BÍNH']]), subcontractorName: new Map([['tp1', 'TPDN BÉ']]), ...over,
  });

  it('hóa đơn mua nợ không tính; thay bằng phần tiền trả NCC đã chia cho công trình, xếp vào loại phổ biến nhất của NCC', () => {
    const r = allocSummary({
      projectId: 'p1', floorAreas: [{ kl: 100 }], years: ALL_YEARS, projectData: null, configData: null,
      src: src({
        expenses: [
          { id: 'e1', project_id: 'p1', date: '2026-01-05', amount: 3_000_000, paid_at_purchase: true, expense_type_id: 't1', supplier_id: null },
          { id: 'e2', project_id: 'p1', date: '2026-01-06', amount: 9_000_000, paid_at_purchase: false, expense_type_id: 't1', supplier_id: 's1' },
          { id: 'e3', project_id: 'p2', date: '2026-01-06', amount: 7_000_000, paid_at_purchase: true, expense_type_id: 't1', supplier_id: null },
        ],
        payments: [
          { id: 'pay1', kind: 'supplier_payment', date: '2026-02-01', amount: 5_000_000, project_id: null, supplier_id: 's1' },
          { id: 'pay2', kind: 'advance', date: '2026-02-02', amount: 2_000_000, project_id: 'p1', subcontractor_id: 'tp1' },
        ],
        paymentAllocations: [{ payment_id: 'pay1', expense_id: 'e2', project_id: 'p1', amount: 4_000_000 }, { payment_id: 'pay1', expense_id: null, project_id: 'p2', amount: 1_000_000 }],
        timesheetWeeks: [{ id: 'w', project_id: 'p1', week_start: '2026-01-04' }],
        timesheetLines: [{ week_id: 'w', worker_id: 'w1', day_units: [1, 1, 0.5, 0, 0, 0, 0], daily_wage: 400_000, allowance: 50_000, retail_purchase: 120_000 }],
      }),
    });
    expect(r.tongChi).toBe(3_000_000 + 4_000_000 + 2_000_000 + 1_050_000 + 120_000);
    expect(r.lines.map((l) => l.key).sort()).toEqual(['cc|2026-01-04|p1|BÍNH|hdml', 'cc|2026-01-04|p1|nhanCong', 'inv:e1', 'ung:pay1', 'ung:pay2']);
    expect(r.lines.find((l) => l.key === 'ung:pay1')!.loai).toBe('Sắt Thép');
    expect(r.theoTru).toEqual({ sat: 7_000_000, bt: 0, nc: 1_050_000, tp: 2_000_000, quy: 120_000, '': 0 });
    expect(r.theoNhom[1]).toBe(r.tongChi);
    expect(r.cpM2).toBe(r.tongChi / 100);
    const dm = benchmarkFields({ id: 'p1', name: 'CT A' }, r, 'Trọn vòng đời');
    expect(dm.ro1).toEqual({ sat: 70_000, bt: 0, nc: 10_500, tp: 20_000, quy: 1_200, khac: 0 });
    expect(dm.dgRo1).toBe(Math.round(r.tongChi / 100));
    expect(compareToBenchmark(r, dm)).toBeCloseTo(0, 6);
    const ks = benchmarkControl(dm, 100, r);
    expect(ks.soVuot).toBe(0);
    expect(ks.rows.find((x) => x.k === 'quy')!.ns).toBe(5_000_000);
  });

  it('thứ tự xếp nhóm: gán tay → HĐ thầu phụ → luật → loại; hóa đơn nhiều món tách theo món', () => {
    const r = allocSummary({
      projectId: 'p1', floorAreas: [], years: ALL_YEARS,
      projectData: { nhomTay: { 'inv:e1': 3 }, theoHdtp: { hd1: { nhom: 2 } } }, configData: { nhomLoai: { khac: 4 }, nhomLuat: [{ id: 'l1', loai: 'Điện Nước', tuKhoa: 'bóng đèn', nhom: 2 }] },
      src: src({
        expenses: [
          { id: 'e1', project_id: 'p1', date: '2026-01-05', amount: 1_000, paid_at_purchase: true, expense_type_id: 't1' },
          { id: 'e2', project_id: 'p1', date: '2026-01-05', amount: 3_000, paid_at_purchase: true, expense_type_id: 't2' },
          { id: 'e3', project_id: 'p1', date: '2026-01-05', amount: 500, paid_at_purchase: true, expense_type_id: 't3' },
          { id: 'e4', project_id: 'p1', date: null, amount: 999, paid_at_purchase: true, expense_type_id: 't3' },
        ],
        expenseLines: new Map<string, AllocItem[]>([['e2', [{ name: 'Ống nước', amount: 2_000 }, { name: 'Bóng đèn', amount: 1_000 }]]]),
        payments: [{ id: 'pay2', kind: 'progress', date: '2026-02-02', amount: 2_000, project_id: 'p1', subcontractor_id: 'tp1', subcontract_id: null }],
        subcontracts: [{ id: 'hd1', project_id: 'p1', subcontractor_id: 'tp1', date: '2026-01-01', value: 10_000, legacy_variation: 0 }],
      }),
    });
    expect(r.theoNhom).toEqual({ 0: 0, 1: 2_000, 2: 3_000, 3: 1_000, 4: 500 });
    expect(r.lines.find((l) => l.key === 'inv:e2')!.nhomNhieu).toBe(true);
    expect(r.cpM2).toBe(0);
    const m = typeGroupMatrix(r);
    expect(m.reduce((s, x) => s + x.tong, 0)).toBe(r.tongChi);
  });
});

// ══ So với code app cũ trên dữ liệu thật ═════════════════════════════
const DIR = join(process.cwd(), 'du-lieu');
const SNAP = join(DIR, 'snapshot.json');
const GOLD = join(DIR, 'so-chuan.json');
type GoldAlloc = {
  ten: string; tongChi: number; tongSan: number; theoNhom: Record<string, number>; theoTru: Record<string, number>;
  theoLoai: { loai: string; tien: number; soDong: number }[]; chuaNhom: number; khoan: { key: string; tien: number; loai: string; nhom: string }[];
};
const gold = existsSync(SNAP) && existsSync(GOLD) ? (JSON.parse(readFileSync(GOLD, 'utf8')) as { tyTrong?: Record<string, GoldAlloc> }) : null;
const ready = !!gold?.tyTrong;

describe.skipIf(!ready)('Tỉ trọng — khớp `tytTongHop` của app cũ (trọn vòng đời, mọi công trình)', () => {
  type Row = Record<string, unknown>;
  const load = () => {
    const snapshot = JSON.parse(readFileSync(SNAP, 'utf8')) as Record<string, unknown>;
    const t = transformSnapshot(snapshot, { companyId: '00000000-0000-0000-0000-000000000001', userIdByLegacyName: {} }).tables as unknown as Record<string, Row[]>;
    const live = <T,>(name: string) => (t[name] ?? []).filter((r) => !r.deleted_at) as unknown as T[];
    const names = (name: string) => new Map((t[name] ?? []).map((r) => [String(r.id), String(r.name)]));
    const expenseLines = new Map<string, AllocItem[]>();
    for (const l of live<Row>('expense_lines').slice().sort((a, b) => Number(a.position) - Number(b.position))) {
      const k = String(l.expense_id);
      const arr = expenseLines.get(k) ?? [];
      arr.push({ name: l.name as string, amount: Number(l.amount), quantity: Number(l.quantity), unit_price: Number(l.unit_price) });
      expenseLines.set(k, arr);
    }
    const source: AllocSource = {
      expenses: live('expenses'), expenseLines, timesheetWeeks: live('timesheet_weeks'), timesheetLines: live('timesheet_lines'),
      payments: live('payments'), paymentAllocations: live('payment_allocations'), subcontracts: live('subcontracts'),
      catalogName: names('catalog_items'), supplierName: names('suppliers'), workerName: names('workers'), subcontractorName: names('subcontractors'),
    };
    const allocs = live<{ kind: string; project_id: string | null; data: unknown }>('cost_allocations');
    return { source, allocs, projects: live<{ id: string; name: string; floor_areas: never[] }>('projects') };
  };
  const { source, allocs, projects } = ready ? load() : ({} as ReturnType<typeof load>);
  const config = ready ? allocs.find((a) => a.kind === 'config')?.data ?? null : null;
  const ids = ready ? Object.keys(gold!.tyTrong!) : [];

  it('đủ công trình', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(projects.some((p) => p.id === id), gold!.tyTrong![id]!.ten).toBe(true);
  });

  it('tổng chi, tổng sàn, 4 nhóm, 6 rổ, theo loại, từng khoản — lệch 0', () => {
    const diffs: string[] = [];
    for (const id of ids) {
      const g = gold!.tyTrong![id]!;
      const p = projects.find((x) => x.id === id)!;
      const r = allocSummary({ projectId: id, floorAreas: p.floor_areas, src: source, years: ALL_YEARS, projectData: allocs.find((a) => a.kind === 'project' && a.project_id === id)?.data ?? null, configData: config });
      const cmp = (label: string, a: number, b: number) => { if (Math.round(a) !== Math.round(b)) diffs.push(`${g.ten} · ${label}: mới ${a} ≠ cũ ${b}`); };
      cmp('tổng chi', r.tongChi, g.tongChi);
      if (Math.abs(r.tongSan - g.tongSan) > 1e-9) diffs.push(`${g.ten} · tổng sàn: ${r.tongSan} ≠ ${g.tongSan}`);
      for (const n of [0, 1, 2, 3, 4]) cmp(`nhóm ${n}`, r.theoNhom[n]!, g.theoNhom[String(n)] ?? 0);
      for (const k of ['sat', 'bt', 'nc', 'tp', 'quy'] as const) cmp(`rổ ${k}`, r.theoTru[k], g.theoTru[k] ?? 0);
      cmp('rổ khác', r.theoTru[''], g.theoTru.khac ?? 0);
      cmp('số khoản chưa xếp', r.chuaNhom.length, g.chuaNhom);
      const byType = new Map(r.theoLoai.map((o) => [o.loai.toLowerCase(), o]));
      for (const o of g.theoLoai) cmp(`loại ${o.loai}`, byType.get(o.loai.toLowerCase())?.tien ?? 0, o.tien);
      cmp('số loại', r.theoLoai.length, g.theoLoai.length);
      // từng khoản: cùng khóa (để nhomTay cũ còn dùng được), cùng tiền, cùng cách chia nhóm theo món
      const mine = new Map(r.lines.map((l) => [l.key, l]));
      cmp('số khoản', r.lines.length, g.khoan.length);
      for (const k of g.khoan) {
        const l = mine.get(k.key);
        if (!l) { diffs.push(`${g.ten} · thiếu khoản ${k.key} (${k.tien})`); continue; }
        if (l.tien !== k.tien) diffs.push(`${g.ten} · ${k.key}: ${l.tien} ≠ ${k.tien}`);
        const nhom = l.parts.map((pt) => pt.nhom + ':' + pt.tien).join(',');
        if (nhom !== k.nhom) diffs.push(`${g.ten} · ${k.key} nhóm: ${nhom} ≠ ${k.nhom}`);
      }
    }
    expect(diffs.slice(0, 40)).toEqual([]);
  });
});
