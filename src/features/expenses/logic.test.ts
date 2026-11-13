import { describe, expect, it } from 'vitest';
import { lineAmount, parseMoneyDigits, parsePastedMoney, sumAmounts } from '@/lib/calc';
import {
  buildDescription, districtOf, dupKey, filterSuggestions, findByName, findDuplicates, historySuggest, isDifferentArea, isoToVn, normVi,
  parseDateInput, parsePaidCell, parseTsv, strSimilarity, tileMatrix, type DupCandidate,
} from './logic';

describe('công thức tiền lúc nhập (src/lib/calc/expense.ts)', () => {
  it('ô tiền chỉ nhận chữ số, KHÔNG nhận gõ tắt 1tr', () => {
    expect(parseMoneyDigits('5.350.000')).toBe(5350000);
    expect(parseMoneyDigits('5,350,000 đ')).toBe(5350000);
    expect(parseMoneyDigits('1tr')).toBe(1);
    expect(parseMoneyDigits('')).toBe(0);
    expect(parseMoneyDigits('abc')).toBe(0);
  });
  it('tiền dán từ Excel', () => {
    expect(parsePastedMoney('5350000')).toBe(5350000);
    expect(parsePastedMoney('5.350.000')).toBe(5350000);
    expect(parsePastedMoney('5,350,000')).toBe(5350000);
    expect(parsePastedMoney('5,350,000.00')).toBe(5350000);
    expect(parsePastedMoney('5.350.000,00')).toBe(5350000);
    expect(parsePastedMoney('5350000.5')).toBe(5350001);
    expect(parsePastedMoney('5.350')).toBe(5350);
    expect(parsePastedMoney(' 15.554.000 đ ')).toBe(15554000);
    expect(parsePastedMoney('')).toBe(0);
  });
  it('thành tiền 1 dòng = SL × đơn giá − chiết khấu (như calcRowMoney app cũ)', () => {
    expect(lineAmount(10, 140000)).toBe(1400000);
    expect(lineAmount(2.5, 33333)).toBe(83333);
    expect(lineAmount(10, 140000, '5%')).toBe(1330000);
    expect(lineAmount(10, 140000, '50000')).toBe(1350000);
    expect(lineAmount(10, 140000, '50.000')).toBe(1350000);
    expect(lineAmount(1, 100000, '')).toBe(100000);
    expect(lineAmount(0, 100000)).toBe(0);
  });
  it('tổng hóa đơn = cộng thành tiền các dòng', () => {
    expect(sumAmounts([1400000, 1750000, 2100000, 1400000, 1750000, 100000])).toBe(8500000);
    expect(sumAmounts([])).toBe(0);
    expect(sumAmounts([null, undefined, 5])).toBe(5);
  });
});

describe('gợi ý tên', () => {
  const items = ['Vật Tư Điện Nước', 'Vật Tư Điện Lạnh', 'Thi Công Điện Nước', 'Cát', 'Cát TN', 'Sắt Thép'].map((name, i) => ({ id: String(i), name }));
  it('gõ không dấu cũng tìm ra', () => {
    expect(filterSuggestions('vat tu dien', items).map((i) => i.name)).toEqual(['Vật Tư Điện Nước', 'Vật Tư Điện Lạnh']);
    expect(filterSuggestions('dien', items).map((i) => i.name)).toEqual(['Vật Tư Điện Nước', 'Vật Tư Điện Lạnh', 'Thi Công Điện Nước']);
  });
  it('khớp nguyên tên đứng đầu, rồi bắt đầu bằng, rồi chứa', () => {
    expect(filterSuggestions('cat', items).map((i) => i.name)).toEqual(['Cát', 'Cát TN']);
    expect(filterSuggestions('thep', items).map((i) => i.name)).toEqual(['Sắt Thép']);
    expect(filterSuggestions('', items, 2)).toHaveLength(2);
  });
  it('tìm theo tên, không phân biệt dấu / hoa thường', () => {
    expect(findByName('sat thep', items)?.name).toBe('Sắt Thép');
    expect(findByName('SẮT  THÉP ', items)?.name).toBe('Sắt Thép');
    expect(findByName('sat', items)).toBeUndefined();
    expect(normVi('  ĐỔ Bê  Tông ')).toBe('do be tong');
  });
});

describe('dán từ Excel', () => {
  it('tách TSV, bỏ dòng trống cuối', () => {
    expect(parseTsv('a\tb\r\nc\td\r\n\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseTsv('một ô')).toEqual([['một ô']]);
    expect(parseTsv('')).toEqual([]);
  });
  it('vùng chọn lớn hơn thì lặp lại cho đầy', () => {
    expect(tileMatrix([['a']], 2, 3)).toEqual([['a', 'a', 'a'], ['a', 'a', 'a']]);
    expect(tileMatrix([['a', 'b']], 1, 1)).toEqual([['a', 'b']]);
  });
  it('ngày', () => {
    expect(parseDateInput('1/11', 2026)).toBe('2026-11-01');
    expect(parseDateInput('01/11/2025', 2026)).toBe('2025-11-01');
    expect(parseDateInput('1-11-26', 2020)).toBe('2026-11-01');
    expect(parseDateInput('2026-11-01', 2020)).toBe('2026-11-01');
    expect(parseDateInput('0111', 2026)).toBe('2026-11-01');
    expect(parseDateInput('31/02', 2026)).toBeNull();
    expect(parseDateInput('abc', 2026)).toBeNull();
    expect(parseDateInput('', 2026)).toBeNull();
    expect(isoToVn('2026-11-01')).toBe('01/11/2026');
  });
  it('ô Đã TT', () => {
    expect(parsePaidCell('x')).toBe(true);
    expect(parsePaidCell('Có')).toBe(true);
    expect(parsePaidCell('Đã TT')).toBe(true);
    expect(parsePaidCell('0')).toBe(false);
    expect(parsePaidCell('Nợ')).toBe(false);
    expect(parsePaidCell('mua nợ')).toBe(false);
    expect(parsePaidCell('')).toBeNull();
    expect(parsePaidCell('gì đó')).toBeNull();
  });
});

describe('cảnh báo trùng', () => {
  const base: DupCandidate = { id: 's1', date: '2026-11-01', projectId: 'p1', typeId: 't1', buyerId: null, supplierId: 'n1', amount: 5350000, description: 'Ván ép 20 x 4, 25 x 4, Vận chuyển' };
  const incoming = (o: Partial<DupCandidate> = {}): DupCandidate => ({ ...base, id: null, ...o });
  it('độ giống nhau (Dice)', () => {
    expect(strSimilarity('abc', 'abc')).toBe(1);
    expect(strSimilarity('', 'abc')).toBe(0);
    expect(strSimilarity('night', 'nacht')).toBeCloseTo(0.25, 5);
  });
  it('trùng 100% với hóa đơn đã lưu (không phân biệt dấu, hoa thường)', () => {
    const hits = findDuplicates([incoming({ description: 'VÁN ÉP 20 x 4, 25 x 4,  vận chuyển' })], [base]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ exact: true, inForm: false });
    expect(dupKey(incoming())).toBe(dupKey(base));
  });
  it('gần giống: cùng ngày + công trình + số tiền, nội dung giống ≥ 70%', () => {
    expect(findDuplicates([incoming({ typeId: 't2', description: 'Ván ép 20 x 4, 25 x 4, vận chuyển xe' })], [base])).toHaveLength(1);
    expect(findDuplicates([incoming({ typeId: 't2', description: 'Xi măng' })], [base])).toHaveLength(0);
    expect(findDuplicates([incoming({ amount: 1 })], [base])).toHaveLength(0);
    expect(findDuplicates([incoming({ date: '2026-11-02' })], [base])).toHaveLength(0);
    expect(findDuplicates([incoming({ projectId: 'p2' })], [base])).toHaveLength(0);
  });
  it('cùng trống nội dung cũng tính là gần giống', () => {
    expect(findDuplicates([incoming({ typeId: 't9', description: '' })], [{ ...base, description: '' }])).toHaveLength(1);
  });
  it('2 dòng giống hệt nhau trong cùng lần lưu', () => {
    const hits = findDuplicates([incoming({ date: '2026-12-01' }), incoming({ date: '2026-12-01' })], [base]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.inForm).toBe(true);
  });
  it('đang sửa thì bỏ qua chính nó và không so gần giống', () => {
    expect(findDuplicates([{ ...base }], [base])).toHaveLength(0);
    expect(findDuplicates([{ ...base, description: 'Ván ép 20 x 4, 25 x 4, vận chuyển xe' }], [base, { ...base, id: 's2' }])).toHaveLength(0);
    expect(findDuplicates([{ ...base, id: 's3' }], [base])).toHaveLength(1);
  });
  it('hóa đơn chi tiết: khác dòng vật tư thì không trùng 100%', () => {
    const line = { name: 'Ván ép', unit: 'tấm', quantity: 10, unitPrice: 140000, discount: null };
    expect(dupKey({ ...base, lines: [line] })).not.toBe(dupKey({ ...base, lines: [{ ...line, quantity: 11 }] }));
    expect(dupKey({ ...base, lines: [line] })).toBe(dupKey({ ...base, lines: [{ ...line, name: 'VÁN ÉP' }] }));
  });
});

describe('gợi ý từ lịch sử + nội dung tự ghép', () => {
  it('xếp theo số lần dùng rồi ngày gần nhất, giữ cách viết gần nhất', () => {
    const list = historySuggest([
      { text: 'Xi măng', date: '2026-01-01' }, { text: 'xi măng', date: '2026-03-01' }, { text: 'Cát', date: '2026-05-01' },
      { text: 'Đá 1x2', date: '2026-04-01' }, { text: '', date: '2026-04-01' }, { text: 'x'.repeat(121), date: '2026-04-01' },
    ]);
    expect(list).toEqual(['xi măng', 'Cát', 'Đá 1x2']);
  });
  it('nội dung = tên các dòng nối bằng dấu phẩy, bỏ tên trùng', () => {
    expect(buildDescription(['Ván ép 20 x 4', ' Vận chuyển ', '', 'ván ép 20 x 4', null])).toBe('Ván ép 20 x 4, Vận chuyển');
    expect(buildDescription([])).toBe('');
  });
});

describe('khác khu vực', () => {
  it('đoán quận / huyện từ địa chỉ', () => {
    expect(districtOf('128 Tỉnh lộ 8, Tân An Hội, Củ Chi')).toBe('cu chi');
    expect(districtOf('Phú Thọ Hòa, Tân Phú')).toBe('tan phu');
    expect(districtOf('213 Quang Trung, GV')).toBe('go vap');
    expect(districtOf('12 Lê Văn Khương, Q.12, TP HCM')).toBe('quan 12');
    expect(districtOf('45 Nguyễn Trãi, Quận 5')).toBe('quan 5');
    expect(districtOf('(PTH, TP)')).toBe('tan phu');
    expect(districtOf('số 5 đường 3')).toBeNull();
    expect(districtOf('')).toBeNull();
  });
  it('chỉ báo khi đoán được cả hai và khác nhau', () => {
    expect(isDifferentArea('Tỉnh lộ 8, Củ Chi', 'Phú Thọ Hòa, Tân Phú')).toBe(true);
    expect(isDifferentArea('Tỉnh lộ 8, Củ Chi', 'ấp 3, Củ Chi')).toBe(false);
    expect(isDifferentArea('Tỉnh lộ 8, Củ Chi', '')).toBe(false);
    expect(isDifferentArea(null, 'Tân Phú')).toBe(false);
  });
});

describe('Người mua (13/11/2026)', () => {
  const U = '11111111-1111-4111-8111-111111111111';
  const cat = [{ id: U, name: 'TÌNH' }];
  it('gợi ý gộp danh mục + công nhân + tài khoản, không trùng', async () => {
    const { mergeBuyerNames } = await import('./logic');
    const m = mergeBuyerNames(cat, ['tình', 'Cai', 'PHẠM VĂN LAM', '  cai ']);
    expect(m.map((x) => x.name)).toEqual(['CAI', 'PHẠM VĂN LAM', 'TÌNH']);
    expect(m.find((x) => x.name === 'CAI')!.id).toBe('ten:CAI');
  });
  it('ô Người mua không bao giờ lỗi: danh mục → id, tên khác → tên, trống → trống', async () => {
    const { buyerOf, mergeBuyerNames } = await import('./logic');
    const list = mergeBuyerNames(cat, ['Cai']);
    expect(buyerOf('tinh', list)).toEqual({ buyerId: U });
    expect(buyerOf('cai', list)).toEqual({ buyerId: null, buyerName: 'CAI' });
    expect(buyerOf('Toán', list)).toEqual({ buyerId: null, buyerName: 'Toán' });
    expect(buyerOf('  ', list)).toEqual({ buyerId: null });
  });
});
