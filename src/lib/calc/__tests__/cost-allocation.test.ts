// TỈ TRỌNG — test hàm thuần + so với `tytTongHop` của app cũ chạy trên cùng snapshot (so-chuan.json → tyTrong).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformSnapshot } from '../../../../scripts/legacy/transform.ts';
import {
  allocSummary, benchmarkControl, benchmarkFields, compareBenchmarks, defaultGroupOfType, defaultPillarOfType, floorAreaTotal, groupByWords,
  legacyBucketToGroup, readAllocConfig, readAllocStruct, ruleMatches, splitItems, typeGroupMatrix, type AllocItem, type AllocSource,
} from '../cost-allocation';
import { buildProfitIndex, profitContext } from '../profit';
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
    expect(['Thiết Kế - Xin Phép', 'Thiết Kế / Xin Phép', 'Sửa Máy', 'Chi Phí Chung'].map(defaultGroupOfType)).toEqual([1, 1, 1, 1]);
    expect(['Thi Công Trần Thạch Cao', 'Thi công thạch cao'].map(defaultGroupOfType)).toEqual([2, 2]);
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

  it('luật mặc định gạch ốp, xà bần áp mọi loại; luật đã lưu chưa sửa thì tự theo, đã sửa thì giữ', () => {
    const gach = 'gạch ốp, gạch lát, gạch men, gạch granite, đá hoa cương, granite, marble, sàn gỗ';
    const xaBan = 'xà bần, giải khát, đô thị, giữ công trình';
    expect(readAllocConfig(null).nhomLuat.filter((l) => l.id === 'nd1' || l.id === 'nd4').map((l) => [l.tuKhoa, l.loai])).toEqual([[gach, ''], [xaBan, '']]);
    const saved = readAllocConfig({ nhomLuat: [
      { id: 'nd1', loai: 'Vật Liệu Xây Dựng', tuKhoa: gach, nhom: 2 }, { id: 'nd4', loai: 'Khác', tuKhoa: xaBan, nhom: 1 },
      { id: 'nd4', loai: 'Khác', tuKhoa: 'xà bần', nhom: 1 }, { id: 'q1', loai: 'Khác', tuKhoa: xaBan, nhom: 1 },
    ] });
    expect(saved.nhomLuat.map((l) => l.loai)).toEqual(['', '', 'Khác', 'Khác']);
  });

  it('đọc cấu hình / phân nhóm đời cũ (rổ) → nhóm mới', () => {
    const cfg = readAllocConfig({ roLoai: { 'phu cap an uong': 1, khac: 2 }, roLuat: [{ id: 'rd0', tuKhoa: 'x', ro: 2 }, { id: 'q1', loai: '', tuKhoa: 'thang máy', ro: 2 }] });
    expect(cfg.nhomLoai).toEqual({ khac: 4 });
    expect(cfg.nhomLuat.length).toBe(6);
    expect(cfg.nhomLuat[5]).toMatchObject({ id: 'q1', nhom: 3 });
    expect(readAllocConfig(null).coBanGhi).toBe(false);
    const st = readAllocStruct({ roTay: { 'inv:1': 1, 'inv:2': 3 }, theoHdtp: { h1: { ro: 2 }, h2: { nhom: 3 }, h3: {} } }, () => 'thạch cao');
    expect(st).toEqual({ nhomTay: { 'inv:1': 1, 'inv:2': 4 }, theoHdtp: { h1: { nhom: 2 }, h2: { nhom: 3 } } });
  });

  const src = (over: Partial<AllocSource> = {}): AllocSource => ({
    expenses: [], expenseLines: new Map(), timesheetWeeks: [], timesheetLines: [], payments: [], projects: [], now: Date.UTC(2026, 10, 24), subcontracts: [],
    catalogName: new Map([['t1', 'Sắt Thép'], ['t2', 'Vật Tư Điện Nước'], ['t3', 'Khác']]), supplierName: new Map([['s1', 'VLXD PHƯƠNG']]),
    workerName: new Map([['w1', 'BÍNH']]), subcontractorName: new Map([['tp1', 'TPDN BÉ']]), ...over,
  });

  it('tính mọi hóa đơn kể cả mua nợ; tiền trả NCC không tính; thầu phụ chưa có HĐ thì lấy tiền đã trả', () => {
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
        timesheetWeeks: [{ id: 'w', project_id: 'p1', week_start: '2026-01-04' }],
        timesheetLines: [{ week_id: 'w', worker_id: 'w1', day_units: [1, 1, 0.5, 0, 0, 0, 0], daily_wage: 400_000, allowance: 50_000, retail_purchase: 120_000 }],
      }),
    });
    expect(r.tongChi).toBe(3_000_000 + 9_000_000 + 2_000_000 + 1_050_000 + 120_000);
    expect(r.lines.map((l) => l.key).sort()).toEqual(['cc|2026-01-04|p1|BÍNH|hdml', 'cc|2026-01-04|p1|nhanCong', 'inv:e1', 'inv:e2', 'ung:pay2']);
    expect(r.theoTru).toEqual({ sat: 12_000_000, bt: 0, nc: 1_050_000, tp: 2_000_000, quy: 120_000, '': 0 });
    expect(r.theoNhom[1]).toBe(r.tongChi);
    expect(r.cpM2).toBe(r.tongChi / 100);
    const dm = benchmarkFields({ id: 'p1', name: 'CT A' }, r, 'Trọn vòng đời');
    expect(dm.ro1).toEqual({ sat: 120_000, bt: 0, nc: 10_500, tp: 20_000, quy: 1_200, khac: 0 });
    expect(dm.dgRo1).toBe(Math.round(r.tongChi / 100));
    const ks = benchmarkControl(dm, 100, r);
    expect(ks.soVuot).toBe(0);
    expect(ks.rows.find((x) => x.k === 'quy')!.ns).toBe(120_000);
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
    expect(r.theoNhom).toEqual({ 0: 0, 1: 2_000, 2: 11_000, 3: 1_000, 4: 500 });
    expect(r.lines.find((l) => l.key === 'inv:e2')!.nhomNhieu).toBe(true);
    expect(r.cpM2).toBe(0);
    const m = typeGroupMatrix(r);
    expect(m.reduce((s, x) => s + x.tong, 0)).toBe(r.tongChi);
    expect(r.daTraHdtp.get('hd1')).toBe(2_000);
  });

  it('thầu phụ lấy giá trị HĐ (gồm phát sinh), không lấy tiền đã trả; mỗi HĐ theo nhóm riêng; HĐ chưa có giá trị thì lấy tiền đã trả', () => {
    const pay = (id: string, subId: string, hd: string | null, amount: number) => ({ id, kind: 'advance', date: '2026-02-02', amount, project_id: 'p1', subcontractor_id: subId, subcontract_id: hd });
    const run = (years: typeof ALL_YEARS) => allocSummary({
      projectId: 'p1', floorAreas: [], years, projectData: { theoHdtp: { hd1: { nhom: 2 } } }, configData: null,
      src: src({
        payments: [pay('a', 'tp1', 'hd1', 25), pay('b', 'tp1', null, 7), pay('c', 'tp1', 'hd0', 5), pay('d', 'tpX', null, 3)],
        subcontracts: [
          { id: 'hd1', project_id: 'p1', subcontractor_id: 'tp1', date: '2026-01-01', value: 20, legacy_variation: 1 },
          { id: 'hd2', project_id: 'p1', subcontractor_id: 'tp1', date: '2025-01-01', value: 100, legacy_variation: 0 },
          { id: 'hd0', project_id: 'p1', subcontractor_id: 'tp1', date: null, value: 0, legacy_variation: 0 },
        ],
      }),
    });
    const r = run(ALL_YEARS);
    expect(Object.fromEntries(r.lines.map((l) => [l.key, l.tien]))).toEqual({ 'hdtp:hd1': 21, 'hdtp:hd2': 100, 'ung:c': 5, 'ung:d': 3 });
    expect(r.lines.find((l) => l.key === 'hdtp:hd2')!.nhomChinh).toBe(1);
    expect(r.lines.find((l) => l.key === 'hdtp:hd1')!.nhomChinh).toBe(2);
    expect(run([2026]).tongChi).toBe(21 + 5 + 3); // HĐ ký 2025 không tính vào năm 2026
  });

  it('thầu phụ thạch cao mặc định Nhóm 2, trừ khi chọn nhóm ở HĐ', () => {
    const run = (configData: unknown, projectData: unknown = null) => allocSummary({
      projectId: 'p1', floorAreas: [], years: ALL_YEARS, projectData, configData,
      src: src({ subcontracts: [{ id: 'h', project_id: 'p1', subcontractor_id: 'tp1', date: '2026-01-01', value: 9, legacy_variation: 0, description: 'Thi công thạch cao.' }] }),
    });
    expect(run(null).theoNhom[2]).toBe(9);
    expect(run({ nhomLoai: { 'thau phu': 1 } }).theoNhom[2]).toBe(9);
    expect(run(null, { theoHdtp: { h: { nhom: 1 } } }).theoNhom[1]).toBe(9);
  });

  it('so sánh định mức: % so với mục đầu, gộp loại trùng tên khác hoa thường, phần chưa xếp, nhóm lệch nhất', () => {
    const r = compareBenchmarks([
      { dgTong: 1000, dgNhom: { 1: 800, 2: 100, 3: 0, 4: 100 }, dgRo1: 800, dgLoai: { 'Sắt Thép': 400, 'Cũ': 0 } },
      { dgTong: 1500, dgNhom: { 1: 900, 2: 500, 3: 0, 4: 0 }, dgRo1: 900, dgLoai: { 'SẮT THÉP': 300, 'Thầu Phụ': 700 } },
      { dgTong: 900, dgNhom: {}, dgRo1: 895, dgLoai: {} }, // định mức đời cũ chỉ có dgRo1
    ]);
    expect(r.total.diffPct).toEqual([null, 50, -10]);
    expect(r.groups.map((g) => [g.key, g.values])).toEqual([['1', [800, 900, 895]], ['2', [100, 500, 0]], ['3', [0, 0, 0]], ['4', [100, 0, 0]], ['0', [0, 100, 0]]]);
    expect(r.groups[2]!.diffPct).toEqual([null, null, null]);
    expect(r.types.map((t) => [t.label, t.values])).toEqual([['Thầu Phụ', [0, 700, 0]], ['Sắt Thép', [400, 300, 0]]]);
    expect(r.topGroup).toEqual([null, { group: 2, delta: 400 }, { group: 2, delta: -100 }]);
    expect(compareBenchmarks([]).total.values).toEqual([]);
  });

  it('chi phí chung phân bổ theo ngày × k, mặc định Nhóm 1, gán tay được', () => {
    const proj = (id: string, k: number, company = false) => ({ id, name: id, is_company_overhead: company, start_date: company ? null : '2026-01-01', end_date: company ? null : '2026-01-31', cost_weight_k: k, created_year: 2026 });
    const run = (projectData: unknown) => allocSummary({
      projectId: 'p1', floorAreas: [], years: ALL_YEARS, projectData, configData: null,
      src: src({
        projects: [proj('cty', 1, true), proj('p1', 1), proj('p2', 2)],
        expenses: [{ id: 'e', project_id: 'cty', date: '2026-01-05', amount: 1_000, paid_at_purchase: false, expense_type_id: 't3' }],
      }),
    });
    const r = run(null);
    expect(r.theoLoai).toEqual([{ loai: 'Chi Phí Chung', tien: 333, soDong: 1 }]);
    expect(r.theoNhom[1]).toBe(333);
    expect(run({ nhomTay: { 'cpc:p1': 4 } }).theoNhom[4]).toBe(333);
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

describe.skipIf(!ready)('Tỉ trọng — khớp `tytTongHop` của app cũ (phần hóa đơn đã trả + chấm công; phần còn lại cố ý khác app cũ)', () => {
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
      payments: live('payments'), projects: live('projects'), now: Date.now(), subcontracts: live('subcontracts'),
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

  it('tổng sàn + từng khoản hóa đơn / chấm công (cùng khóa, tiền, nhóm) — lệch 0; tổng = hóa đơn + HĐ thầu phụ + chi phí chung', () => {
    const diffs: string[] = [];
    for (const id of ids) {
      const g = gold!.tyTrong![id]!;
      const p = projects.find((x) => x.id === id)!;
      const r = allocSummary({ projectId: id, floorAreas: p.floor_areas, src: source, years: ALL_YEARS, projectData: allocs.find((a) => a.kind === 'project' && a.project_id === id)?.data ?? null, configData: config });
      const cmp = (label: string, a: number, b: number) => { if (Math.round(a) !== Math.round(b)) diffs.push(`${g.ten} · ${label}: mới ${a} ≠ cũ ${b}`); };
      if (Math.abs(r.tongSan - g.tongSan) > 1e-9) diffs.push(`${g.ten} · tổng sàn: ${r.tongSan} ≠ ${g.tongSan}`);
      const sumKind = (k: string) => r.lines.reduce((t, l) => t + (l.kind === k ? l.tien : 0), 0);
      cmp('hóa đơn', sumKind('inv'), source.expenses.reduce((t, e) => t + (e.project_id === id && e.date ? e.amount : 0), 0));
      cmp('HĐ thầu phụ', sumKind('hdtp'), r.contracts.reduce((t, c) => t + c.giaTri, 0));
      const ctx = profitContext(buildProfitIndex({ ...source, projects: [...source.projects], expenses: [...source.expenses], timesheetWeeks: [...source.timesheetWeeks], timesheetLines: [...source.timesheetLines], payments: [], paymentAllocations: [], receipts: [], mainContracts: [], settlements: [] }), ALL_YEARS, source.now);
      cmp('chi phí chung', sumKind('cpc'), ctx.overheadByProject.get(id) ?? 0);
      cmp('tổng 4 nhóm', [0, 1, 2, 3, 4].reduce((t, n) => t + r.theoNhom[n]!, 0), r.tongChi);
      // từng khoản: cùng khóa (để nhomTay cũ còn dùng được), cùng tiền, cùng cách chia nhóm theo món
      const mine = new Map(r.lines.map((l) => [l.key, l]));
      for (const k of g.khoan) {
        if (k.key.startsWith('ung:')) continue; // tiền trả thầu phụ / NCC: app mới không tính theo tiền trả nữa
        const l = mine.get(k.key);
        if (!l) { diffs.push(`${g.ten} · thiếu khoản ${k.key} (${k.tien})`); continue; }
        if (l.tien !== k.tien) diffs.push(`${g.ten} · ${k.key}: ${l.tien} ≠ ${k.tien}`);
        if (/^(thiết kế|sửa máy)/i.test(k.loai)) continue; // đổi nhóm mặc định 4 → 1 (24/11/2026)
        if (l.parts.some((pt) => pt.nhomRef === 'nd1' || pt.nhomRef === 'nd4')) continue; // 2 luật mặc định nay áp mọi loại
        const nhom = l.parts.map((pt) => pt.nhom + ':' + pt.tien).join(',');
        if (nhom !== k.nhom) diffs.push(`${g.ten} · ${k.key} nhóm: ${nhom} ≠ ${k.nhom}`);
      }
    }
    expect(diffs.slice(0, 40)).toEqual([]);
  });
});
