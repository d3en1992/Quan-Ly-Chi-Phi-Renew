// Khớp tên thợ theo tuần trước (ví dụ thật anh Tình 25/11/2026) + cảnh báo trùng.
import { describe, expect, it } from 'vitest';
import { applyProjectGuess, matchRoster, normalizeScan, projectCrew, type ScanContext, type TimesheetHistoryRow } from '@shared/scan';
import { dhashDistance, dhashOf, HASH_SIDE, likelyDuplicates, matchFingerprint, recordSimilarity, type DupRecord } from './duplicates';
import { aliasesToRemember, rosterForProject } from './timesheet-model';

const HUYNH = 'CT A Huynh (PTH, TP)', NHUT = 'CT A Nhựt (205 Thoại Ngọc Hầu, TP)', DANG = 'SC Nhà Tình Đăng';
const week = (week_start: string, project: string, names: string[]): TimesheetHistoryRow[] => names.map((worker, i) => ({ week_start, project, worker, first: i === 0 }));
const history = [
  ...week('2026-11-15', HUYNH, ['LONG', 'HIỀN', 'SƠN MT', 'LOAN']), ...week('2026-11-15', NHUT, ['SƠN', 'THIỆN', 'DƯƠNG']),
  ...week('2026-11-15', DANG, ['TOÁN', 'C TÂM', 'THANH L']), ...week('2026-10-18', NHUT, ['SƠN', 'SƠN MT', 'THIỆN']),
];
const workers = ['LONG', 'HIỀN', 'SƠN', 'SƠN MT', 'LOAN', 'THIỆN', 'DƯƠNG', 'TOÁN', 'C TÂM', 'THANH L', 'THANH MỚI', 'THANH Q', 'THANH TM'];
const aliases = { 'son heo': 'SƠN MT', 'son coc': 'SƠN' };
const ctx: ScanContext = {
  projects: [HUYNH, NHUT, DANG], expense_types: [], suppliers: [], buyers: [], customers: [], employees: [], workers,
  project_meta: [HUYNH, NHUT, DANG].map((name) => ({ name, status: 'active' })), recent_timesheets: history, worker_aliases: aliases, today: '2026-11-25',
};
const scan = (names: string[], note = '', ai: Record<string, string> = {}) => {
  const r = applyProjectGuess(normalizeScan({ kind: 'timesheet', timesheet: { rows: names.map((name) => ({ name, worker_match: ai[name] ?? '', days: [0, 1] })) } }, ctx), note, ctx);
  if (r.kind !== 'timesheet') throw new Error('sai loại');
  return { project: r.timesheet.project_match, names: r.timesheet.rows.map((x) => x.worker_match), unsure: r.timesheet.rows.filter((x) => x.low_confidence.includes('name')).map((x) => x.name) };
};

describe('tên thợ theo tuần trước của công trình', () => {
  it('anh Long ghi "Sơn" ở A Huynh → SƠN MT, dù danh mục có SƠN và AI chọn SƠN; tô vàng để xem lại', () => {
    expect(scan(['Long', 'Hiền', 'Sơn', 'Loan'], '', { Sơn: 'SƠN' })).toEqual({ project: HUYNH, names: ['LONG', 'HIỀN', 'SƠN MT', 'LOAN'], unsure: ['Sơn'] });
  });
  it('cùng chữ "Sơn" ở A Nhựt → SƠN, không tô vàng', () => {
    expect(scan(['Sơn', 'Thiện', 'Dương'])).toEqual({ project: NHUT, names: ['SƠN', 'THIỆN', 'DƯƠNG'], unsure: [] });
  });
  it('anh Toán ghi "Thanh" → THANH L (danh mục có 4 người tên Thanh), không tô vàng', () => {
    expect(scan(['Toán', 'C Tâm', 'Thanh'])).toEqual({ project: DANG, names: ['TOÁN', 'C TÂM', 'THANH L'], unsure: [] });
  });
  it('hai người tên Sơn: "Sơn Cốc" = SƠN, "Sơn Heo" = SƠN MT theo tên gọi đã nhớ', () => {
    expect(scan(['Long', 'Sơn Heo', 'Sơn Cốc'], 'chấm công A Huynh').names).toEqual(['LONG', 'SƠN MT', 'SƠN']);
  });
  it('"Sơn" + "Sơn Heo" cùng phiếu: người rõ tên lấy trước, "Sơn" là người còn lại', () => {
    expect(scan(['Sơn', 'Sơn Heo', 'Thiện'], 'A Nhựt').names).toEqual(['SƠN', 'SƠN MT', 'THIỆN']);
  });
  it('hai dòng cùng ghi "Sơn", tuần trước chỉ có 1 Sơn → không ai chắc, đều tô vàng', () => {
    expect(scan(['Long', 'Sơn', 'Sơn'], 'A Huynh').unsure).toEqual(['Sơn', 'Sơn']);
  });
  it('người lạ không khớp bừa', () => {
    expect(scan(['Long', 'Hiền', 'Khoa']).names[2]).toBe('');
  });
  it('tuần trước = tuần gần nhất TRƯỚC tuần của phiếu (chấm lại tuần cũ)', () => {
    expect(projectCrew(NHUT, history, '2026-11-15').last).toEqual(['SƠN', 'SƠN MT', 'THIỆN']);
    expect(projectCrew(NHUT, history).last).toEqual(['SƠN', 'THIỆN', 'DƯƠNG']);
  });
  it('không có lịch sử công trình → như cũ: trùng tên danh mục', () => {
    expect(matchRoster([{ name: 'Sơn' }, { name: 'Thanh' }], { workers, last: [], wide: [] }).map((m) => m.match)).toEqual(['SƠN', '']);
  });
});

describe('màn kiểm tra: đổi công trình khớp lại tên, nhớ tên gọi', () => {
  const data = {
    workers: workers.map((name) => ({ id: name, name, role: null })),
    weeks: [{ id: 'w1', project_id: 'h', week_start: '2026-11-15' }, { id: 'w2', project_id: 'n', week_start: '2026-11-15' }],
    lines: [...['LONG', 'SƠN MT'].map((worker_id) => ({ week_id: 'w1', worker_id })), ...['SƠN', 'THIỆN'].map((worker_id) => ({ week_id: 'w2', worker_id }))],
  };
  it('"Sơn" ở công trình h → SƠN MT, đổi sang n → SƠN', () => {
    const none = new Map<string, string>();
    expect(rosterForProject(['Sơn'], 'h', '2026-11-22', data, none)[0]!.match).toBe('SƠN MT');
    expect(rosterForProject(['Sơn'], 'n', '2026-11-22', data, none)[0]!.match).toBe('SƠN');
  });
  it('chỉ nhớ tên gọi từ 2 chữ và khác tên danh mục', () => {
    const p = (written: string, workerName: string) => ({ written, workerId: workerName, workerName });
    expect(aliasesToRemember([p('Sơn Heo', 'SƠN MT'), p('Sơn', 'SƠN MT'), p('thanh l', 'THANH L')], new Map())).toEqual([{ alias: 'son heo', worker_id: 'SƠN MT' }]);
    expect(aliasesToRemember([p('Sơn Heo', 'SƠN MT')], new Map([['son heo', 'SƠN MT']]))).toEqual([]);
  });
});

describe('cảnh báo trùng số liệu', () => {
  const a: DupRecord = { date: '2026-11-23', projectId: 'p1', partyId: 's1', amount: 435_000, text: '1 bao xi măng, 1/2 xe đá 1x2' };
  it('nhập tay ghi nội dung khác, không ghi NCC, cùng ngày + công trình + số tiền → báo', () => {
    expect(likelyDuplicates(a, [{ ...a, id: 'x', partyId: null, text: 'mua vật liệu' }])).toHaveLength(1);
  });
  it('lệch 1 ngày, mọi ô khác giống → vẫn báo', () => {
    expect(recordSimilarity(a, { ...a, date: '2026-11-24' })).toBeGreaterThanOrEqual(0.9);
  });
  it('khác số tiền / khác NCC / khác công trình / lệch 1 tuần / chính nó → không báo', () => {
    const no = [{ ...a, id: '1', amount: 450_000 }, { ...a, id: '2', partyId: 's2' }, { ...a, id: '3', projectId: 'p2' }, { ...a, id: '4', date: '2026-11-30' }];
    expect(likelyDuplicates(a, no)).toEqual([]);
    expect(likelyDuplicates({ ...a, id: 'me' }, [{ ...a, id: 'me' }])).toEqual([]);
  });
  it('số tiền 0 (AI chưa đọc được) → không báo', () => {
    expect(likelyDuplicates({ ...a, amount: 0 }, [{ ...a, amount: 0 }])).toEqual([]);
  });
});

describe('vân tay ảnh', () => {
  const gray = (f: (x: number, y: number) => number) => Array.from({ length: (HASH_SIDE + 1) * HASH_SIDE }, (_, i) => f(i % (HASH_SIDE + 1), Math.floor(i / (HASH_SIDE + 1))));
  const pic = gray((x, y) => ((x * 7 + y * 13) % 17) * 14);
  const noisy = pic.map((v, i) => v + (i % 3) - 1); // nén lại: lệch ±1
  const other = gray((x, y) => ((x * 11 + y * 5) % 13) * 18);
  it('ảnh nén lại gần như y hệt, ảnh khác thì xa, ảnh trắng không so được', () => {
    expect(dhashDistance(dhashOf(pic), dhashOf(noisy))).toBeLessThan(0.06);
    expect(dhashDistance(dhashOf(pic), dhashOf(other))).toBeGreaterThan(0.3);
    expect(dhashDistance(dhashOf(gray(() => 255)), dhashOf(gray(() => 255)))).toBe(1);
  });
  it('phiếu chi / phiếu thu (ảnh chuyển khoản giống nhau) chỉ báo khi đúng y ảnh', () => {
    const fp = { sha: 'a', dhash: dhashOf(pic) };
    const near = { sha: 'b', dhash: dhashOf(noisy), target_id: '1' };
    expect(matchFingerprint(fp, [{ ...near, target_table: 'payments' }])).toEqual([]);
    expect(matchFingerprint(fp, [{ ...near, target_table: 'expenses' }])[0]).toMatchObject({ exact: false });
    expect(matchFingerprint(fp, [{ ...near, sha: 'a', target_table: 'payments' }])[0]).toMatchObject({ exact: true });
  });
});
