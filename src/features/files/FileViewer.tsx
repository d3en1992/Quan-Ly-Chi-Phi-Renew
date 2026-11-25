// Xem tệp toàn màn hình trong app: PDF (cuộn trang, phóng to, kéo) · Excel .xlsx (bảng) · luôn có nút Tải về.
// Là Radix Dialog như trình xem ảnh: mở trong bảng trượt vẫn lăn / kéo được.
import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Button, Icon } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PdfPages = lazy(() => import('./PdfPages'));
const SheetView = lazy(() => import('./SheetView'));
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function saveBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(u), 10_000);
}
export async function fetchFile(url: string): Promise<Blob> {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Không tải được tệp (có thể đã bị gỡ khỏi kho).');
  return r.blob();
}

export function FileViewer({ url, kind, name, title, onClose }: { url: string; kind: 'pdf' | 'xlsx'; name: string; title: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['file-blob', url], queryFn: () => fetchFile(url), staleTime: Infinity, gcTime: 5 * 60_000, retry: 1 });
  // Radix dựng khung trễ một nhịp → giữ phần tử bằng state để effect chạy lại khi khung đã có
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [fit, setFit] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  useEffect(() => {
    const el = area;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.min(el.clientWidth - 24, 1000)));
    ro.observe(el);
    // Ctrl + lăn (hoặc chụm 2 ngón trên bàn di) = phóng; lăn thường = cuộn trang
    const wheel = (e: WheelEvent) => { if (e.ctrlKey && kind === 'pdf') { e.preventDefault(); step(e.deltaY < 0 ? 1 : -1); } };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener('wheel', wheel); };
  }, [area, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Đổi mức phóng, giữ chỗ đang xem ở giữa màn hình */
  const step = (d: 1 | -1) => setZoom((z) => {
    const next = d > 0 ? ZOOMS.find((x) => x > z) ?? z : [...ZOOMS].reverse().find((x) => x < z) ?? z;
    const el = area;
    if (el && next !== z) {
      const k = next / z, cx = el.scrollLeft + el.clientWidth / 2, cy = el.scrollTop + el.clientHeight / 2;
      requestAnimationFrame(() => { el.scrollLeft = cx * k - el.clientWidth / 2; el.scrollTop = cy * k - el.clientHeight / 2; });
    }
    return next;
  });
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (kind !== 'pdf' || e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    e.currentTarget.scrollLeft = d.left - (e.clientX - d.x);
    e.currentTarget.scrollTop = d.top - (e.clientY - d.y);
  };
  const loading = <div className="grid h-40 place-items-center text-[13px] text-muted">Đang tải…</div>;
  const msg = error || (q.isError ? (q.error as Error).message : '');

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Content aria-describedby={undefined} data-testid="file-viewer" onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[200] grid grid-rows-[auto_minmax(0,1fr)] bg-surface-2 outline-none">
          <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2 pt-[max(8px,env(safe-area-inset-top))]">
            <Dialog.Title className="m-0 min-w-0 flex-1 truncate text-[14px] font-bold">{title}</Dialog.Title>
            {kind === 'pdf' ? (
              <span className="inline-flex items-center gap-1">
                <Button size="icon" aria-label="Thu nhỏ" disabled={zoom <= ZOOMS[0]!} onClick={() => step(-1)}><Icon name="remove" /></Button>
                <button type="button" className="num min-w-[48px] text-[13px] font-semibold" aria-label="Về vừa màn hình" data-testid="file-zoom" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
                <Button size="icon" aria-label="Phóng to" disabled={zoom >= ZOOMS[ZOOMS.length - 1]!} onClick={() => step(1)}><Icon name="add" /></Button>
              </span>
            ) : null}
            <Button size="sm" data-testid="file-download" disabled={!q.data} onClick={() => { if (q.data) saveBlob(q.data, name); }}><Icon name="download" />Tải về</Button>
            <Dialog.Close asChild><Button size="icon" aria-label="Đóng tệp"><Icon name="close" /></Button></Dialog.Close>
          </header>
          <div ref={setArea} className={cn('min-h-0 min-w-0 overscroll-contain', kind === 'pdf' ? 'cursor-grab overflow-auto p-3 select-none active:cursor-grabbing' : 'overflow-hidden')}
            onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
            {msg ? <div role="alert" className="grid h-40 place-items-center px-4 text-center text-[13px] text-bad">{msg}</div>
              : !q.data || !fit ? loading
              : <Suspense fallback={loading}>{kind === 'pdf' ? <PdfPages data={q.data} width={fit * zoom} onError={setError} /> : <SheetView data={q.data} onError={setError} />}</Suspense>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
