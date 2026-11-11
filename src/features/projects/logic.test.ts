import { describe, expect, it } from 'vitest';
import { detectKindCode, kindFromCode, normalizeName, normalizeNamePrefix, readK, scopeFromName, stripKindPrefix, suggestProjectName, NAME_MAX } from './logic';

describe('nhận loại công trình theo tiền tố tên', () => {
  it('nhận CT / SC / SN, có hoặc không ngoặc vuông', () => {
    expect(detectKindCode('CT Nhà Tình (925 Âu Cơ)')).toBe('CT');
    expect(detectKindCode('SC Chú Thỉ')).toBe('SC');
    expect(detectKindCode('[SN] Cô Sáu')).toBe('SN');
    expect(detectKindCode('sn cô sáu')).toBe('SN');
  });
  it('mã phải đứng riêng: CTY / Scan không tính', () => {
    expect(detectKindCode('CTY ABC')).toBe('Khác');
    expect(detectKindCode('Scan nhà')).toBe('Khác');
    expect(detectKindCode('Nhà anh Tài')).toBe('Khác');
    expect(detectKindCode('')).toBe('Khác');
  });
  it('đổi ra loại trong kho', () => {
    expect(kindFromCode('CT')).toBe('new_build');
    expect(kindFromCode('SC')).toBe('renovation');
    expect(kindFromCode('SN')).toBe('small_repair');
    expect(kindFromCode('Khác')).toBe('small_repair');
  });
  it('chuẩn hóa [SN] → SN và bỏ tiền tố', () => {
    expect(normalizeNamePrefix('[sn] Cô Sáu')).toBe('SN Cô Sáu');
    expect(stripKindPrefix('SN - Cô Sáu')).toBe('Cô Sáu');
  });
});

describe('gợi ý tên công trình (≤ 45 ký tự, hạng mục trong ngoặc đơn)', () => {
  it('chưa chọn khách → chưa gợi ý', () => expect(suggestProjectName('', null, 'Ốp gạch')).toBe(''));
  it('ô tên trống → mặc định CT', () => expect(suggestProjectName('', 'Cô Sáu', 'Ốp gạch sân vườn')).toBe('CT Cô Sáu (Ốp gạch sân vườn)'));
  it('giữ loại người dùng đã gõ', () => expect(suggestProjectName('SN x', 'Cô Sáu', 'Mái che')).toBe('SN Cô Sáu (Mái che)'));
  it('tên không mã → không gắn mã', () => expect(suggestProjectName('Nhà x', 'Cô Sáu', '')).toBe('Cô Sáu'));
  it('dài quá thì cắt hạng mục nhưng giữ ngoặc đóng', () => {
    const s = suggestProjectName('SN', 'Thầy Phước', 'Thi công WC, Vách ngăn, Sơn nước toàn bộ nhà');
    expect(s.length).toBeLessThanOrEqual(NAME_MAX);
    expect(s.endsWith(')')).toBe(true);
    expect(s.startsWith('SN Thầy Phước (')).toBe(true);
  });
  it('khách tên quá dài → cắt đầu tên', () => {
    expect(suggestProjectName('CT', 'A'.repeat(60), 'x').length).toBeLessThanOrEqual(NAME_MAX);
  });
});

describe('hàm nhỏ', () => {
  it('hạng mục từ ngoặc cuối', () => expect(scopeFromName('SN Cô Sáu (Ốp gạch)')).toBe('Ốp gạch'));
  it('bỏ dấu để so tên', () => expect(normalizeName('  Đỗ  Thị Thư ')).toBe('do thi thu'));
  it('hệ số k', () => {
    expect(readK('1,5')).toBe(1.5);
    expect(readK('0')).toBe(0);
    expect(readK('-2')).toBe(1);
    expect(readK('abc')).toBe(1);
  });
});
