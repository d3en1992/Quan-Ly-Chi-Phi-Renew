import { describe, expect, it } from 'vitest';
import { fetchAllPages, PAGE_SIZE } from './fetch-pages';

/** Bảng giả `total` dòng; ghi lại các trang được gọi và lúc nào đang có bao nhiêu trang chạy cùng lúc */
function fakeTable(total: number, opts: { count?: boolean; failAt?: number } = {}) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: { from: number; withCount: boolean }[] = [];
  let running = 0, maxRunning = 0;
  const build = (withCount: boolean) => ({
    range: async (from: number, to: number) => {
      calls.push({ from, withCount });
      running++; maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (from === opts.failAt) return { data: null, error: { message: 'hỏng trang' }, count: null };
      return { data: rows.slice(from, to + 1), error: null, count: withCount && opts.count !== false ? total : null };
    },
  });
  return { build, calls, get maxRunning() { return maxRunning; } };
}

describe('fetchAllPages — tải mọi trang cùng lúc', () => {
  it('bảng nhỏ: 1 lần gọi', async () => {
    const t = fakeTable(37);
    expect(await fetchAllPages(t.build)).toHaveLength(37);
    expect(t.calls).toEqual([{ from: 0, withCount: true }]);
  });

  it('bảng 9.500 dòng: đủ dòng, đúng thứ tự, các trang sau chạy song song', async () => {
    const t = fakeTable(9_500);
    const out = await fetchAllPages<{ id: number }>(t.build);
    expect(out).toHaveLength(9_500);
    expect(out.map((r) => r.id)).toEqual(Array.from({ length: 9_500 }, (_, i) => i));
    expect(t.calls.map((c) => c.from)).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]);
    expect(t.maxRunning).toBe(9); // trang 2…10 cùng lúc
  });

  it('đúng 1000 dòng: không gọi thêm trang trống', async () => {
    const t = fakeTable(PAGE_SIZE);
    expect(await fetchAllPages(t.build)).toHaveLength(PAGE_SIZE);
    expect(t.calls).toHaveLength(1);
  });

  it('không có tổng số dòng → đọc lần lượt như cũ', async () => {
    const t = fakeTable(2_500, { count: false });
    expect(await fetchAllPages(t.build)).toHaveLength(2_500);
    expect(t.maxRunning).toBe(1);
  });

  it('một trang lỗi → báo lỗi', async () => {
    const t = fakeTable(3_000, { failAt: 2000 });
    await expect(fetchAllPages(t.build)).rejects.toThrow('hỏng trang');
  });
});
