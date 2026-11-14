import { describe, expect, it } from 'vitest';
import { mockAssist, normalizeAssist, parseQuery, searchNorm } from '@shared/search';
import { groupTarget, targetOf, yearOf, type HitLike } from './targets';

describe('searchNorm', () => {
  it('bỏ dấu, đ → d, ký tự lạ thành khoảng trắng, giữ số thập phân', () => {
    expect(searchNorm('Dây điện CADIVI (1.5)')).toBe('day dien cadivi 1.5');
    expect(searchNorm('  Đỗ   Hưng ')).toBe('do hung');
  });
});

describe('parseQuery', () => {
  it('tách nhóm khỏi câu tìm', () => {
    expect(parseQuery('chấm công nhà chú Thị')).toEqual({ text: 'nha chu thi', kinds: ['timesheet'] });
    expect(parseQuery('phiếu chi anh Tư')).toEqual({ text: 'anh tu', kinds: ['payment'] });
  });
  it('bỏ chữ đệm đầu câu khi nói', () => {
    expect(parseQuery('tìm giúp anh dây điện nhà chú Thị').text).toBe('day dien nha chu thi');
  });
  it('chỉ có chữ chỉ nhóm → giữ nguyên, tìm mọi nhóm', () => {
    expect(parseQuery('thiết bị')).toEqual({ text: 'thiet bi', kinds: [] });
  });
  it('câu thường không đoán nhóm', () => {
    expect(parseQuery('Hưng Long')).toEqual({ text: 'hung long', kinds: [] });
  });
});

describe('mockAssist (giả lập nút Tìm bằng AI)', () => {
  it('dây điện → cáp, CV, Cadivi, giữ tên công trình', () => {
    const r = mockAssist('dây điện nhà chú Thị');
    expect(r.terms).toContain('cap nha chu thi');
    expect(r.terms).toContain('cadivi nha chu thi');
    expect(r.kinds).toEqual(['expense']);
  });
  it('chỉ giữ tên có trong danh sách vật tư khi có danh sách', () => {
    const r = mockAssist('dây điện', ['Cap 1.5 cadivi', 'Xi măng Hà Tiên']);
    expect(r.terms).toContain('cap');
    expect(r.terms).toContain('cadivi');
    expect(r.terms).not.toContain('cv');
  });
  it('không có tên gọi khác → không thêm gì', () => {
    expect(mockAssist('anh Tư').terms).toEqual([]);
  });
});

describe('normalizeAssist', () => {
  it('lọc JSON lạ của AI', () => {
    const r = normalizeAssist({ text: 'Dây điện', terms: ['Cáp 1.5', 1, 'dây điện', 'CV 2.5', 'xi'], kinds: ['expense', 'xyz'], explain: 'ok' }, 'dây điện');
    expect(r).toEqual({ text: 'day dien', terms: ['cap 1.5', 'cv 2.5'], kinds: ['expense'], explain: 'ok' });
  });
  it('AI trả rác → dùng câu gốc', () => {
    expect(normalizeAssist('rác', 'chấm công Hưng Long')).toEqual({ text: 'hung long', terms: [], kinds: ['timesheet'], explain: '' });
  });
});

const hit = (h: Partial<HitLike>): HitLike => ({ kind: 'expense', id: 'x', title: '', sub: '', date: null, project_id: null, extra: null, ...h });

describe('targetOf (bấm kết quả mở đâu)', () => {
  it('công trình → trang chi tiết', () => {
    expect(targetOf(hit({ kind: 'project', id: 'p1' }))).toEqual({ path: '/cong-trinh/p1', sub: null });
  });
  it('hóa đơn → Tra cứu, lọc công trình + đoạn đầu nội dung', () => {
    expect(targetOf(hit({ title: 'Cap 1.5 cadivi, Dây 2.5', sub: 'CT A Nhựt · CH Hoàng Phát' }))).toEqual({
      path: null, sub: 'tracuu', seed: 'Cap 1.5 cadivi', focusText: 'Cap 1.5 cadivi', params: { project: 'CT A Nhựt' },
    });
  });
  it('danh bạ → đúng nhóm', () => {
    expect(targetOf(hit({ kind: 'contact', title: 'TPDN HÀ', extra: 'subcontractor' })).params).toEqual({ tab: 'subcontractor' });
  });
  it('chấm công → công trình + tuần', () => {
    expect(targetOf(hit({ kind: 'timesheet', project_id: 'p9', date: '2026-07-19' }))).toEqual({
      path: '/cham-cong', sub: null, params: { project: 'p9', week: '2026-07-19' },
    });
  });
  it('phiếu chi → lọc theo người nhận', () => {
    expect(targetOf(hit({ kind: 'payment', title: 'Tạm ứng · TPDN HÀ' })).seed).toBe('TPDN HÀ');
  });
  it('xem tất cả cửa hàng → tab Cửa hàng', () => {
    expect(groupTarget('shop', 'ton')).toEqual({ path: null, sub: 'danhba', seed: 'ton', params: { tab: 'shop' } });
  });
  it('năm của dòng', () => {
    expect(yearOf('2024-03-01')).toBe(2024);
    expect(yearOf(null)).toBeNull();
  });
});

describe('parseQuery giữ tên người', () => {
  it('"tìm anh Tư" chỉ bỏ "tìm"', () => {
    expect(parseQuery('tìm anh Tư').text).toBe('anh tu');
    expect(parseQuery('cho em xem hóa đơn xi măng')).toEqual({ text: 'xi mang', kinds: ['expense'] });
  });
});
