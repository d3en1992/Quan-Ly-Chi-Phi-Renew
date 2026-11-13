import { describe, expect, it } from 'vitest';
import { blankRow, checkRow, commitCell, effectiveDates, isBlank, pasteMatrix, toTsv, typeCell, type GridLists } from './grid-model';
import { blankInvoice, blankLine, checkInvoice, invoiceDescription, invoiceTotal, lineTotal, parseQuantity, quantityText } from './invoice-model';
import { parseTsv } from './logic';

const P = '11111111-1111-4111-8111-111111111111', T = '22222222-2222-4222-8222-222222222222';
const S1 = '33333333-3333-4333-8333-333333333333', S2 = '44444444-4444-4444-8444-444444444444', B = '55555555-5555-4555-8555-555555555555';
const lists = {
  projects: [{ id: P, name: 'CT A Huynh (PTH, TP)' }], projectOptions: [{ id: P, name: 'CT A Huynh (PTH, TP)' }],
  types: [{ id: T, name: 'Copha' }], buyers: [{ id: B, name: 'KS LAM' }],
  suppliers: [{ id: S1, name: 'COPHA TÂN THÀNH', buys_on_credit: false }, { id: S2, name: 'SẮT THÉP AN PHÚ', buys_on_credit: true }],
} satisfies GridLists & { projects: { id: string; name: string }[] };

describe('form hóa đơn chi tiết', () => {
  it('số lượng: nhận dấu phẩy thập phân; sai → 0', () => {
    expect(parseQuantity('2,5')).toBe(2.5);
    expect(parseQuantity('10')).toBe(10);
    expect(parseQuantity('abc')).toBe(0);
    expect(quantityText(2.5)).toBe('2,5');
    expect(quantityText(0)).toBe('');
  });
  it('thành tiền dòng = SL × đơn giá (SL trống = 1), tổng = cộng các dòng', () => {
    const d = blankInvoice('2026-11-01', true);
    d.lines = [
      blankLine({ name: 'Ván ép coffa 20 x 4', unit: 'tấm', quantity: '10', unitPrice: 140000 }),
      blankLine({ name: 'Ván ép coffa 25 x 4', unit: 'tấm', quantity: '2,5', unitPrice: 100000 }),
      blankLine({ name: 'Vận chuyển', unitPrice: 100000 }),
      blankLine({ name: 'Giảm giá', quantity: '1', unitPrice: 200000, discount: '10%' }),
      blankLine(),
    ];
    expect(d.lines.map(lineTotal)).toEqual([1400000, 250000, 100000, 180000, 0]);
    expect(invoiceTotal(d)).toBe(1930000);
    expect(invoiceDescription(d)).toBe('Ván ép coffa 20 x 4, Ván ép coffa 25 x 4, Vận chuyển, Giảm giá');
    expect(invoiceDescription({ ...d, description: ' Copha đợt 1 ' })).toBe('Copha đợt 1');
  });
  it('kiểm tra: thiếu công trình / loại, hoặc chưa có dòng nào → báo ô sai', () => {
    const d = blankInvoice('2026-11-01', true);
    const r = checkInvoice(d, lists, 'detail');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.bad).toEqual(['project', 'type', 'lines']);
    const r2 = checkInvoice({ ...blankInvoice('2026-11-01', false), project: 'ct a huynh (pth, tp)', type: 'copha', supplier: 'không có' }, lists, 'quick');
    if (!r2.ok) expect(r2.bad).toEqual(['supplier', 'amount']);
  });
  it('hợp lệ → dữ liệu ghi kho: đổi tên ra id, bỏ dòng trống, tổng = cộng dòng', () => {
    const d = { ...blankInvoice('2026-11-01', true), project: 'ct a huynh (pth, tp)', type: 'COPHA', supplier: 'copha tan thanh', buyer: 'ks lam' };
    d.lines = [blankLine({ name: 'Ván 20', unit: 'tấm', quantity: '10', unitPrice: 140000 }), blankLine(), blankLine({ name: 'Vận chuyển', unitPrice: 100000 })];
    const r = checkInvoice(d, lists, 'detail');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input).toMatchObject({ projectId: P, typeId: T, supplierId: S1, buyerId: B, amount: 1500000, source: 'detail', description: 'Ván 20, Vận chuyển', paid: true });
      expect(r.input.lines).toEqual([
        { name: 'Ván 20', unit: 'tấm', quantity: 10, unitPrice: 140000, discount: null, amount: 1400000 },
        { name: 'Vận chuyển', unit: null, quantity: 1, unitPrice: 100000, discount: null, amount: 100000 },
      ]);
    }
  });
  it('hóa đơn không có dòng vật tư: lấy số tiền gõ tay, không gửi `lines`', () => {
    const r = checkInvoice({ ...blankInvoice('2026-11-01', false), project: 'CT A Huynh (PTH, TP)', type: 'Copha', amount: 5350000, paid: false }, lists, 'quick');
    expect(r.ok && r.input.amount).toBe(5350000);
    expect(r.ok && 'lines' in r.input).toBe(false);
    expect(r.ok && r.input.paid).toBe(false);
  });
});

describe('lưới nhập nhanh', () => {
  it('chọn NCC đang bật Mua nợ → tự bỏ tích Đã TT; đổi lại NCC thường → tích lại', () => {
    let row = commitCell(blankRow(), 'supplier', 'sat thep an phu', lists, 2026);
    expect(row.supplier).toBe('SẮT THÉP AN PHÚ');
    expect(row.paid).toBe(false);
    row = commitCell(row, 'supplier', 'COPHA TÂN THÀNH', lists, 2026);
    expect(row.paid).toBe(true);
    // Gõ ĐỦ tên rồi mới rời ô (ô đã chứa tên trước khi chốt) vẫn phải bỏ tích; chốt lại lần nữa không đè lên ô người dùng tự tích
    row = commitCell(typeCell(row, 'supplier', 'SẮT THÉP AN PHÚ'), 'supplier', 'SẮT THÉP AN PHÚ', lists, 2026);
    expect(row.paid).toBe(false);
    row = commitCell({ ...row, paid: true }, 'supplier', 'SẮT THÉP AN PHÚ', lists, 2026);
    expect(row.paid).toBe(true);
  });
  it('dán 20 dòng × 7 cột TSV: đủ dòng, đúng tổng, ngày trống lấy dòng trên', () => {
    const tsv = Array.from({ length: 20 }, (_, i) => [i === 0 ? '05/11' : '', 'copha', 'ct a huynh (pth, tp)', `${(i + 1) * 1000}.000`, `Dòng ${i + 1}`, 'ks lam', i % 2 ? 'SẮT THÉP AN PHÚ' : ''].join('\t')).join('\r\n');
    const rows = pasteMatrix([blankRow()], parseTsv(tsv), 0, 0, lists, 2026);
    expect(rows).toHaveLength(20);
    const dates = effectiveDates(rows, '2026-11-12');
    const checks = rows.map((r, i) => checkRow(r, dates[i] ?? null, lists));
    const inputs = checks.flatMap((c) => (c.state === 'valid' ? [c.input] : []));
    expect(inputs).toHaveLength(20);
    expect(inputs.reduce((a, b) => a + b.amount, 0)).toBe(210_000_000);
    expect(inputs.every((i) => i.date === '2026-11-05')).toBe(true);
    expect(inputs.filter((i) => !i.paid)).toHaveLength(10);
    expect(toTsv(rows, 0, 3, 1, 4)).toBe('1000000\tDòng 1\r\n2000000\tDòng 2');
  });
  it('dòng trống / dòng chỉ có Loại + Công trình tự chép thì bỏ qua', () => {
    expect(isBlank(blankRow())).toBe(true);
    expect(isBlank(blankRow({ type: 'Copha', project: 'CT A', auto: true }))).toBe(true);
    expect(isBlank(blankRow({ type: 'Copha' }))).toBe(false);
    expect(checkRow(blankRow({ type: 'Copha', project: 'CT A Huynh (PTH, TP)' }), '2026-11-01', lists)).toEqual({ state: 'invalid', bad: ['amount'] });
  });
});
