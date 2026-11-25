import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES, MAX_STORE_BYTES, MB, prepareStorable, sizeText } from './rules';

const blob = (size: number) => ({ size }) as Blob;
const to = (size: number | null) => async () => (size === null ? null : blob(size));
const never = async (): Promise<Blob | null> => { throw new Error('không được nén'); };

describe('quy tắc 3 MB / 15 MB', () => {
  it('tới 3 MB: lưu nguyên, không nén', async () => {
    expect(await prepareStorable(blob(MAX_STORE_BYTES), true, never)).toEqual({ blob: blob(MAX_STORE_BYTES), note: '' });
  });
  it('trên 15 MB: không nhận; đúng 15 MB: nhận', async () => {
    await expect(prepareStorable(blob(MAX_FILE_BYTES + 1), true, never)).rejects.toThrow('15 MB');
    expect((await prepareStorable(blob(MAX_FILE_BYTES), true, to(MB))).blob?.size).toBe(MB);
  });
  it('3–15 MB: nén dưới 3 MB thì lưu bản nén; vẫn trên 3 MB / không nén được thì không lưu và có lý do', async () => {
    expect(await prepareStorable(blob(8 * MB), true, to(MB))).toEqual({ blob: blob(MB), note: 'Đã nén để lưu: 8,0 MB → 1,0 MB.' });
    const big = await prepareStorable(blob(8 * MB), true, to(4 * MB));
    expect(big.blob).toBeNull();
    expect(big.note).toContain('còn 4,0 MB');
    expect((await prepareStorable(blob(8 * MB), true, to(null))).blob).toBeNull();
    expect((await prepareStorable(blob(8 * MB), true, never)).blob).toBeNull();
  });
  it('Excel / Word trên 3 MB: không nén, không lưu', async () => {
    expect((await prepareStorable(blob(4 * MB), false, never)).blob).toBeNull();
  });
  it('chữ dung lượng', () => { expect(sizeText(738_000)).toBe('721 KB'); expect(sizeText(8_434_148)).toBe('8,0 MB'); });
});
