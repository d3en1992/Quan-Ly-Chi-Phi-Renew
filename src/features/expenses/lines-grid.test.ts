import { describe, expect, it } from 'vitest';
import { parseTsv, tileMatrix } from '@/components/ui/sheet-grid';
import { blankLines } from './invoice-model';
import { cleanMoney, cleanQuantity, pasteLines } from './LinesGrid';

describe('Bảng dòng vật tư kiểu Sheet', () => {
  it('dán nhiều dòng từ Excel: tự tách cột, tự thêm dòng, đơn giá có dấu chấm / chữ đ', () => {
    const m = parseTsv('Xi măng\tbao\t10\t95.000\r\nCát vàng\tm3\t2,5\t320.000 đ\t800000\r\n\r\n');
    expect(m).toHaveLength(2);
    const out = pasteLines(blankLines(1), m, 0, 0);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: 'Xi măng', unit: 'bao', quantity: '10', unitPrice: 95000 });
    expect(out[1]).toMatchObject({ name: 'Cát vàng', unit: 'm3', quantity: '2,5', unitPrice: 320000 }); // cột thứ 5 (thành tiền) bỏ qua
  });
  it('dán từ giữa bảng (cột Số lượng) chỉ ghi các cột bên phải', () => {
    const out = pasteLines(blankLines(3), [['4', '12000']], 1, 2);
    expect(out[1]).toMatchObject({ name: '', quantity: '4', unitPrice: 12000 });
  });
  it('làm sạch số', () => {
    expect(cleanQuantity('1.250,5')).toBe('1250,5');
    expect(cleanQuantity('2.5 kg')).toBe('2.5');
    expect(cleanMoney('1.250.000 đ')).toBe(1250000);
    expect(cleanMoney('')).toBe(0);
  });
  it('vùng chọn lớn hơn vùng copy thì lặp lại', () => {
    expect(tileMatrix([['a']], 3, 1)).toEqual([['a'], ['a'], ['a']]);
  });
});
