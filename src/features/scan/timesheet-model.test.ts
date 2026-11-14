import { describe, expect, it } from 'vitest';
import {
  applyProjectGuess, buildPrompt, guessProjectFromCrew, matchWorker, normalizeScan, pickFixture, promptKinds, toDayUnit, workerRecentProjects,
  type ScanContext, type TimesheetHistoryRow,
} from '@shared/scan';
import fxTimesheet from '../../../supabase/functions/scan-document/fixtures/cham-cong.json';
import { checkPurchaseTotal, defaultWeekStart, lastWage, purchaseNote, purchaseSum, timesheetFromScan, withPurchases } from './timesheet-model';

const A = 'SC nhà A Phượng';
const T = 'SC nhà Tình';
const N = 'CT A Nhật';
const history: TimesheetHistoryRow[] = [
  // Toán: trước làm nhà Tình (nhiều tuần), tuần gần nhất chuyển qua nhà A Phượng
  { week_start: '2026-10-11', project: T, worker: 'TOÁN', first: true }, { week_start: '2026-10-18', project: T, worker: 'TOÁN', first: true },
  { week_start: '2026-10-25', project: T, worker: 'TOÁN', first: true }, { week_start: '2026-11-01', project: A, worker: 'TOÁN', first: true },
  { week_start: '2026-11-01', project: A, worker: 'TÂM' }, { week_start: '2026-10-25', project: T, worker: 'BÌNH' },
  // Tổ Sơn làm nhà A Nhật
  { week_start: '2026-11-01', project: N, worker: 'SƠN', first: true }, { week_start: '2026-11-01', project: N, worker: 'DƯƠNG' },
  { week_start: '2026-11-01', project: N, worker: 'NHƯ' },
  // Sơn Heo ở tổ khác
  { week_start: '2026-11-01', project: T, worker: 'SƠN HEO' },
];
const ctx: ScanContext = {
  projects: [A, T, N], expense_types: [], suppliers: [], buyers: [], customers: [], employees: [],
  workers: ['TOÁN', 'TÂM', 'BÌNH', 'SƠN', 'SƠN HEO', 'DƯƠNG', 'NHƯ', 'HIỀN'],
  project_meta: [{ name: A, status: 'active', owner_name: 'A Phượng' }, { name: T, status: 'active', owner_name: 'Tình' }, { name: N, status: 'active', owner_name: 'A Nhật' }],
  recent_timesheets: history, today: '2026-11-14',
};
const raw = (rows: { name: string; worker_match?: string; days?: unknown[]; role?: string; low_confidence?: string[] }[], extra: Record<string, unknown> = {}) =>
  ({ kind: 'timesheet', timesheet: { week_start: '', project_match: '', rows, purchases: [], purchase_total: 0, note: '', ...extra } });

describe('_shared/scan — phiếu chấm công: chuẩn hóa', () => {
  it('ô ngày: x / 1 = 1 công, o / 0 / trống = 0, "/" = nửa công, số lẻ tăng ca giữ nguyên', () => {
    expect(['x', 'X', 1, '1', true].map(toDayUnit)).toEqual([1, 1, 1, 1, 1]);
    expect(['o', 'O', 0, '', null, undefined, '-'].map(toDayUnit)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(['/', '1/2', 0.5, '0,5'].map(toDayUnit)).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(['1,30', '1,3', 1.2].map(toDayUnit)).toEqual([1.3, 1.3, 1.2]);
    expect([12, -1, 'abc'].map(toDayUnit)).toEqual([0, 0, 0]); // đọc sai → 0
  });

  it('luôn đủ 7 ô CN..T7, đổi tên cột không chắc thành số thứ tự, bỏ dòng không tên, bỏ khoản mua 0 đ', () => {
    const r = normalizeScan(raw(
      [{ name: ' Sơn ', role: 'c', days: [0, 'x', 'x'], low_confidence: ['T5', 'name', 'linh tinh'] }, { name: '', days: [1, 1, 1, 1, 1, 1, 1] }],
      { purchases: [{ name: 'Nước uống', amount: '180.000' }, { name: 'gạch', amount: 0 }], purchase_total: '390000' },
    ), ctx);
    if (r.kind !== 'timesheet') throw new Error('sai loại');
    expect(r.timesheet.rows).toHaveLength(1);
    expect(r.timesheet.rows[0]).toMatchObject({ name: 'Sơn', role: 'C', days: [0, 1, 1, 0, 0, 0, 0], low_confidence: ['4', 'name'] });
    expect(r.timesheet.purchases).toEqual([{ name: 'Nước uống', amount: 180000 }]);
    expect(r.timesheet.purchase_total).toBe(390000);
  });

  it('câu lệnh: có luật chấm công + danh mục Công nhân kèm "gần đây làm"; chỉ khi được phép', () => {
    const withHints = { ...ctx, worker_hints: workerRecentProjects(history) };
    const p = buildPrompt('auto', '', withHints, { invoice: true, timesheet: true });
    expect(p).toContain('PHIẾU CHẤM CÔNG:');
    expect(p).toContain(`- TOÁN (cai; gần đây làm: ${A}, tuần 01/11)`);
    expect(buildPrompt('auto', '', withHints, { invoice: true })).not.toContain('PHIẾU CHẤM CÔNG:');
    expect(promptKinds('auto', { timesheet: true })).toEqual(['timesheet']);
    expect(pickFixture('auto', 'chấm công tuần này')).toBe('cham-cong');
  });
});

describe('_shared/scan — phiếu chấm công: đoán công trình theo tổ thợ', () => {
  it('lấy công trình của TUẦN GẦN NHẤT (Toán: trước nhà Tình, nay nhà A Phượng → A Phượng)', () => {
    expect(guessProjectFromCrew(['TOÁN', 'TÂM', 'BÌNH'], history, '2026-11-14')).toBe(A);
    expect(guessProjectFromCrew(['SƠN', 'DƯƠNG', 'NHƯ'], history, '2026-11-14')).toBe(N);
  });
  it('cai (người đầu phiếu) nặng hơn thợ; không ai có lịch sử → không đoán; ngang nhau → không đoán', () => {
    expect(guessProjectFromCrew(['TOÁN', 'BÌNH', 'SƠN HEO'], history, '2026-11-14')).toBe(A); // cai 3 phiếu A > 2 phiếu Tình
    expect(guessProjectFromCrew(['HIỀN', ''], history, '2026-11-14')).toBe('');
    expect(guessProjectFromCrew(['HIỀN', 'TÂM', 'BÌNH'], history, '2026-11-14')).toBe(''); // 1 – 1
  });
  it('lịch sử quá 120 ngày không tính', () => {
    expect(guessProjectFromCrew(['SƠN'], history, '2027-06-01')).toBe('');
  });

  it('khớp tên: trùng không dấu; nhiều người cùng tên → người trong tổ của công trình; không dùng 1 người 2 dòng', () => {
    const none = new Set<string>();
    expect(matchWorker('Dương', ctx.workers, none, none)).toBe('DƯƠNG');
    expect(matchWorker('son', ctx.workers, none, none)).toBe('SƠN');          // trùng hẳn thắng "SƠN HEO"
    expect(matchWorker('Sơn', ctx.workers, none, new Set(['SƠN']))).toBe('SƠN HEO'); // dòng "Sơn" thứ hai
    expect(matchWorker('Thanh', ['THANH LÉ', 'THANH BC'], none, none)).toBe('');
    expect(matchWorker('Thanh', ['THANH LÉ', 'THANH BC'], new Set(['THANH LÉ']), none)).toBe('THANH LÉ');
    expect(matchWorker('Khoa', ctx.workers, none, none)).toBe('');
  });

  it('applyProjectGuess: ghi chú > tổ thợ > AI; tên chưa khớp và công trình đoán đều tô vàng', () => {
    const scan = () => normalizeScan(raw([{ name: 'Sơn' }, { name: 'dương', worker_match: 'DƯƠNG' }, { name: 'Như', worker_match: 'HIỀN' }, { name: 'Khoa' }]), ctx);
    const byCrew = applyProjectGuess(scan(), '', ctx);
    if (byCrew.kind !== 'timesheet') throw new Error('sai loại');
    expect(byCrew.timesheet.project_match).toBe(N);
    expect(byCrew.timesheet.project_by).toBe('crew');
    expect(byCrew.timesheet.low_confidence).toContain('project_match');
    // AI khớp "Như" → "HIỀN" (không giống tên viết) bị bỏ, code khớp lại đúng NHƯ
    expect(byCrew.timesheet.rows.map((r) => r.worker_match)).toEqual(['SƠN', 'DƯƠNG', 'NHƯ', '']);
    expect(byCrew.timesheet.rows[3]!.low_confidence).toContain('name');
    expect(byCrew.timesheet.rows[0]!.low_confidence).not.toContain('name');

    const byNote = applyProjectGuess(scan(), 'chấm công nhà Tình', ctx);
    if (byNote.kind !== 'timesheet') throw new Error('sai loại');
    expect(byNote.timesheet.project_match).toBe(T);
    expect(byNote.timesheet.project_by).toBe('note');
    expect(byNote.timesheet.low_confidence).not.toContain('project_match');
  });

  it('phiếu mẫu (giả lập): Toán, Tâm, Bình → nhà A Phượng, 2 khoản mua', () => {
    const r = applyProjectGuess(normalizeScan(fxTimesheet, ctx, 'auto'), '', ctx);
    if (r.kind !== 'timesheet') throw new Error('sai loại');
    expect(r.timesheet.project_match).toBe(A);
    expect(r.timesheet.rows.map((x) => x.worker_match)).toEqual(['TOÁN', 'TÂM', 'BÌNH']);
    expect(r.timesheet.rows[0]!.days).toEqual([1.3, 1, 1, 1, 1, 1, 1]);
    expect(r.timesheet.rows[0]!.low_confidence).toContain('0');
    expect(r.timesheet.purchases).toHaveLength(2);
  });
});

describe('nút AI — phiếu chấm công → bảng nháp', () => {
  const workers = [{ id: 'w1', name: 'TOÁN', role: 'C' }, { id: 'w2', name: 'TÂM', role: 'P' }, { id: 'w3', name: 'BÌNH', role: 'T' }];
  const weeks = [{ id: 'k1', project_id: 'pT', week_start: '2026-10-25' }, { id: 'k2', project_id: 'pA', week_start: '2026-11-01' }, { id: 'k3', project_id: 'pT', week_start: '2026-11-01' }];
  const lines = [
    { week_id: 'k1', worker_id: 'w1', daily_wage: 550000 }, { week_id: 'k2', worker_id: 'w1', daily_wage: 600000 },
    { week_id: 'k3', worker_id: 'w2', daily_wage: 380000 }, { week_id: 'k2', worker_id: 'w2', daily_wage: 400000 },
  ];

  it('tuần mặc định: CN / T2 / T3 → tuần trước, từ T4 → tuần này', () => {
    expect(defaultWeekStart('2026-11-14')).toBe('2026-11-08'); // thứ Bảy
    expect(defaultWeekStart('2026-11-11')).toBe('2026-11-08'); // thứ Tư
    expect(defaultWeekStart('2026-11-15')).toBe('2026-11-08'); // Chủ nhật → tuần vừa xong
    expect(defaultWeekStart('2026-11-17')).toBe('2026-11-08'); // thứ Ba
  });

  it('lương/ngày = lần chấm gần nhất; cùng tuần thì ưu tiên đúng công trình', () => {
    expect(lastWage('w1', 'pA', weeks, lines)).toBe(600000);
    expect(lastWage('w2', 'pA', weeks, lines)).toBe(400000);
    expect(lastWage('w2', 'pT', weeks, lines)).toBe(380000);
    expect(lastWage('w3', 'pA', weeks, lines)).toBe(0);
  });

  it('điền tên, vai trò, lương; tô vàng tên chưa có trong danh bạ, số công lẻ, lương trống', () => {
    const r = applyProjectGuess(normalizeScan({ ...fxTimesheet, timesheet: { ...fxTimesheet.timesheet, rows: [...fxTimesheet.timesheet.rows, { name: 'Thọ', worker_match: '', role: 'T', days: [0, 1, 1, 1, 1, 1, 1], low_confidence: [] }] } }, ctx), '', ctx);
    if (r.kind !== 'timesheet') throw new Error('sai loại');
    const d = timesheetFromScan(r.timesheet, { workers, weeks, lines }, 'pA', '2026-11-14');
    expect(d.weekStart).toBe('2026-11-08');
    expect(d.rows.map((x) => [x.name, x.role, x.wage])).toEqual([['TOÁN', 'C', 600000], ['TÂM', 'P', 400000], ['BÌNH', 'T', 0], ['THỌ', 'T', 0]]);
    const k = d.rows.map((x) => x.key);
    expect(d.unsure).toContain(`${k[0]}:0`);      // 1,3 công
    expect(d.unsure).toContain(`${k[2]}:wage`);   // Bình chưa có lương
    expect(d.unsure).toContain(`${k[3]}:name`);   // Thọ chưa có trong danh bạ
    expect(d.unsure).not.toContain(`${k[0]}:name`);
  });

  it('mua lẻ: cộng hết vào người đầu phiếu, nội dung liệt kê từng khoản; so với số tổng ghi trên phiếu', () => {
    const r = normalizeScan(fxTimesheet, ctx);
    if (r.kind !== 'timesheet') throw new Error('sai loại');
    const d = timesheetFromScan(r.timesheet, { workers, weeks, lines }, 'pA', '2026-11-14');
    expect(purchaseSum(d.purchases)).toBe(130000);
    expect(purchaseNote(d.purchases)).toBe('Đinh đóng lưới + đinh thép 80.000; Đinh đóng làm mòn 50.000');
    const full = withPurchases(d.rows, d.purchases, 'Tăng ca bốc ngói 30 phút');
    expect(full.map((x) => x.retail)).toEqual([130000, 0, 0]);
    expect(full[0]!.note).toBe('Đinh đóng lưới + đinh thép 80.000; Đinh đóng làm mòn 50.000 · Tăng ca bốc ngói 30 phút');
    expect(withPurchases(d.rows, [], '').map((x) => x.retail)).toEqual([0, 0, 0]);
    expect(checkPurchaseTotal(d.purchases, 0)).toEqual({ status: 'none' });
    expect(checkPurchaseTotal(d.purchases, 130000)).toEqual({ status: 'match', written: 130000 });
    expect(checkPurchaseTotal(d.purchases, 150000)).toEqual({ status: 'diff', written: 150000, gap: 20000 });
  });
});
