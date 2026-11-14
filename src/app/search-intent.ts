// Ô tìm chung → trang đích: "bấm kết quả thì mở đúng trang, lọc sẵn, tô sáng dòng đó" (tai-lieu/DE-XUAT-TIM-KIEM.md).
// Ô tìm đặt "ý định" (chữ điền vào ô lọc của trang + tham số riêng như nhóm danh bạ / công trình / tuần) rồi mới chuyển trang.
//  • SearchBox (components/ui/data.tsx) tự nhận chữ → mọi trang có ô lọc tự hỗ trợ, không phải sửa từng trang.
//  • Trang cần thêm (Danh bạ chọn nhóm, Chấm công chọn công trình + tuần, Tra cứu chọn công trình) gọi useSearchIntent.
//  • useSearchFocus (gắn ở khung app) tìm dòng vừa bấm trên trang mới rồi cuộn tới + tô sáng vài giây.
import { useEffect, useRef } from 'react';
import { searchNorm } from '@shared/search';

export type SearchIntent = {
  /** Chữ điền vào ô lọc (SearchBox) của trang đích */
  seed?: string;
  /** Dòng cần tô sáng: theo data-row-id, không có thì theo chữ trong dòng */
  focusId?: string;
  focusText?: string;
  /** Tham số riêng của trang: tab (nhóm danh bạ), project (id / tên), week (ngày đầu tuần) */
  params?: Record<string, string>;
  at: number;
};

/** Ý định chỉ có hiệu lực vài giây sau khi bấm — trang mở sau đó (tự đi) không bị lọc nhầm */
const TTL_MS = 5000;
let current: SearchIntent | null = null;
const subs = new Set<() => void>();

export function setSearchIntent(i: Omit<SearchIntent, 'at'>) {
  current = { ...i, at: Date.now() };
  subs.forEach((f) => f());
}

export function peekSearchIntent(): SearchIntent | null {
  return current && Date.now() - current.at < TTL_MS ? current : null;
}

/** Nhận ý định (lúc trang vừa mở, hoặc khi đang ở sẵn trang đó) — mỗi ý định áp 1 lần cho mỗi chỗ gọi */
export function useSearchIntent(apply: (i: SearchIntent) => void) {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const seen = useRef(0);
  useEffect(() => {
    const run = () => {
      const i = peekSearchIntent();
      if (!i || i.at === seen.current) return;
      seen.current = i.at;
      applyRef.current(i);
    };
    run();
    subs.add(run);
    return () => { subs.delete(run); };
  }, []);
}

const FLASH_MS = 2600;
const WAIT_MS = 6000;

function findRow(i: SearchIntent): HTMLElement | null {
  const root = document.querySelector('main') ?? document.body;
  if (i.focusId) {
    const el = root.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(i.focusId)}"]`);
    if (el) return el;
  }
  const want = i.focusText ? searchNorm(i.focusText) : '';
  if (!want) return null;
  const rows = root.querySelectorAll<HTMLElement>('tbody tr, [data-mobile-card], [data-row-id]');
  for (const el of rows) {
    if (el.offsetParent === null) continue; // đang ẩn (bản điện thoại / máy tính)
    if (searchNorm(el.textContent ?? '').includes(want)) return el;
  }
  return null;
}

/** Gắn 1 lần ở khung app: sau khi chuyển trang, đợi dữ liệu tải rồi cuộn tới + tô sáng dòng vừa bấm */
export function useSearchFocus() {
  useEffect(() => {
    let timer: number | undefined;
    const run = () => {
      const i = peekSearchIntent();
      if (!i || (!i.focusId && !i.focusText)) return;
      window.clearInterval(timer);
      const started = Date.now();
      timer = window.setInterval(() => {
        const el = findRow(i);
        if (!el && Date.now() - started < WAIT_MS) return;
        window.clearInterval(timer);
        if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('search-flash');
        window.setTimeout(() => el.classList.remove('search-flash'), FLASH_MS);
      }, 200);
    };
    subs.add(run);
    return () => { subs.delete(run); window.clearInterval(timer); };
  }, []);
}
