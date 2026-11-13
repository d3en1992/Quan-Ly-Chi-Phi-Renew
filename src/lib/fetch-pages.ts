// Đọc hết một bảng theo trang 1000 dòng (giới hạn của Supabase) — các trang tải CÙNG LÚC, không chờ nối đuôi.
// Trang đầu hỏi kèm tổng số dòng (count: 'exact') → biết còn bao nhiêu trang → gọi song song phần còn lại.
// Kho ở Singapore, mỗi lần gọi ~0,2 giây: bảng 9 trang trước mất ~1,8 giây, nay ~0,4 giây.

export const PAGE_SIZE = 1000;

type PageResult = { data: unknown[] | null; error: { message: string } | null; count?: number | null };
/** Truy vấn đã chọn cột + lọc + sắp xếp (phải có .order để các trang không chồng / sót dòng), chưa gọi .range */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ranged = { range: (from: number, to: number) => PromiseLike<PageResult> } | any;

/**
 * build(withCount): trả về truy vấn của bảng. withCount = true thì gọi `.select(cols, { count: 'exact' })`.
 * Lỗi ở bất kỳ trang nào → ném lỗi (thông báo của Supabase).
 */
export async function fetchAllPages<T>(build: (withCount: boolean) => Ranged): Promise<T[]> {
  const first = (await build(true).range(0, PAGE_SIZE - 1)) as PageResult;
  if (first.error) throw new Error(first.error.message);
  const rows = (first.data ?? []) as T[];
  if (rows.length < PAGE_SIZE) return rows;

  const total = first.count;
  if (total == null) {
    // Không có tổng số dòng (hiếm) → đọc từng trang như cũ
    for (let from = PAGE_SIZE; ; from += PAGE_SIZE) {
      const page = (await build(false).range(from, from + PAGE_SIZE - 1)) as PageResult;
      if (page.error) throw new Error(page.error.message);
      rows.push(...((page.data ?? []) as T[]));
      if ((page.data ?? []).length < PAGE_SIZE) return rows;
    }
  }

  const starts: number[] = [];
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) starts.push(from);
  const pages = (await Promise.all(starts.map((from) => build(false).range(from, from + PAGE_SIZE - 1)))) as PageResult[];
  for (const page of pages) {
    if (page.error) throw new Error(page.error.message);
    rows.push(...((page.data ?? []) as T[]));
  }
  return rows;
}
