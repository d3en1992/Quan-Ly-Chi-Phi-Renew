import { describe, expect, it } from 'vitest';
import { paymentZaloText, subcontractZaloText, supplierZaloText } from './zalo';

describe('Tin nhắn Zalo thầu phụ / NCC', () => {
  it('HĐ thầu phụ: liệt kê lần trả và còn phải trả', () => {
    const t = subcontractZaloText({ subcontractor: 'TPDN BÉ', project: 'CT A Huynh', description: 'Nhân công điện nước', date: '2026-10-01',
      total: 115_686_000, paid: 20_000_000, debt: 95_686_000, payments: [{ date: '2026-10-17', amount: 20_000_000, note: 'Ứng L1 - CK' }] });
    expect(t).toContain('CÔNG NỢ THẦU PHỤ — TPDN BÉ');
    expect(t).toContain('Đã trả: 20.000.000 đ (1 lần)');
    expect(t).toContain(' • 17/10/2026: 20.000.000 — Ứng L1 - CK');
    expect(t.split('\n').at(-1)).toBe('CÒN PHẢI TRẢ: 95.686.000 đ');
  });
  it('HĐ đã trả đủ không ghi dòng còn nợ', () => {
    expect(subcontractZaloText({ subcontractor: 'A', project: 'B', total: 1, paid: 1, debt: 0, payments: [] })).toContain('ĐÃ TRẢ ĐỦ');
  });
  it('phiếu chi bỏ dòng trống', () => {
    const t = paymentZaloText({ kind: 'Tạm ứng TP', date: '2026-11-07', party: 'TPDN HÀ', partyLabel: 'Thầu phụ', project: 'CT A Nhựt', note: null, amount: 8_000_000 });
    expect(t).toBe('PHIẾU CHI 07/11/2026 — Tạm ứng TP\nThầu phụ: TPDN HÀ\nCông trình: CT A Nhựt\nSố tiền: 8.000.000 đ');
  });
  it('đối chiếu NCC: chỉ hóa đơn còn nợ', () => {
    const t = supplierZaloText({ supplier: 'CH TRƯỜNG HẢI', today: '2026-11-13', creditInvoices: 300, paid: 200, debt: 100,
      open: [{ date: '2025-04-15', project: 'CT Cô Phụng', description: 'Keo BM', remaining: 100 }] });
    expect(t).toContain('CÒN NỢ: 100 đ');
    expect(t).toContain(' • 15/04/2025 · CT Cô Phụng · Keo BM: còn 100');
  });
});
