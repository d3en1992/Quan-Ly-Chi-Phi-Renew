// Xem ảnh toàn màn hình để đối chiếu (ảnh phiếu chấm công, hóa đơn): bấm ảnh nhỏ → mở lớn; chụm 2 ngón / lăn chuột / nút + − để phóng,
// kéo để dời, chạm 2 lần để phóng nhanh, Esc hoặc nút ✕ để đóng. Ảnh phóng bằng cách tăng bề rộng trong khung cuộn nên kéo dời là cuộn thường.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './button';
import { cn } from '@/lib/utils';

const MIN = 1;
const MAX = 6;
const clamp = (z: number) => Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100));

function Viewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const lastTap = useRef(0);

  /** Đổi mức phóng, giữ điểm (cx, cy — tọa độ trong khung) đứng yên dưới ngón tay / con trỏ */
  const setZoom = (next: number, cx?: number, cy?: number) => {
    const el = box.current;
    const z = clamp(next);
    const prev = zoomRef.current;
    if (!el || z === prev) return;
    const x = cx ?? el.clientWidth / 2;
    const y = cy ?? el.clientHeight / 2;
    const fx = (el.scrollLeft + x) / prev;
    const fy = (el.scrollTop + y) / prev;
    zoomRef.current = z;
    setZoomState(z);
    requestAnimationFrame(() => { el.scrollLeft = fx * z - x; el.scrollTop = fy * z - y; });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === '+' || e.key === '=') setZoom(zoomRef.current * 1.4);
      else if (e.key === '-') setZoom(zoomRef.current / 1.4);
    };
    window.addEventListener('keydown', onKey, true);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = old; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Chụm 2 ngón + lăn chuột: phải gắn listener không-passive mới chặn được trình duyệt tự phóng cả trang
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const start = (e: TouchEvent) => { if (e.touches.length === 2) pinch.current = { dist: dist(e.touches), zoom: zoomRef.current }; };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch.current) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2 - r.left;
      const cy = (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2 - r.top;
      setZoom(pinch.current.zoom * (dist(e.touches) / pinch.current.dist), cx, cy);
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          const r = el.getBoundingClientRect();
          setZoom(zoomRef.current > 1.2 ? 1 : 2.5, e.changedTouches[0]!.clientX - r.left, e.changedTouches[0]!.clientY - r.top);
          lastTap.current = 0;
        } else lastTap.current = now;
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setZoom(zoomRef.current * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('wheel', wheel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const btn = 'grid size-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 disabled:opacity-40';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={alt} data-testid="image-zoom" className="fixed inset-0 z-[200] flex flex-col bg-black/95">
      <div ref={box} className="min-h-0 flex-1 overflow-auto overscroll-contain" style={{ touchAction: 'pan-x pan-y' }}
        onDoubleClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom(zoomRef.current > 1.2 ? 1 : 2.5, e.clientX - r.left, e.clientY - r.top); }}>
        <div className={cn('grid min-h-full place-items-center', zoom === 1 && 'h-full')} style={{ width: `${zoom * 100}%` }}>
          <img src={src} alt={alt} draggable={false} className={cn('block select-none', zoom === 1 ? 'max-h-full max-w-full object-contain' : 'w-full')} />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 p-3 pt-[max(12px,env(safe-area-inset-top))]">
        {zoom === 1 ? <span className="rounded-full bg-black/50 px-3 py-1.5 text-[12.5px] text-white/90">Chụm 2 ngón hoặc chạm 2 lần để phóng to</span> : null}
        <div className="flex-1" />
        <button type="button" aria-label="Đóng ảnh" data-testid="image-zoom-close" className={cn(btn, 'pointer-events-auto')} onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 p-3 pb-[max(14px,env(safe-area-inset-bottom))]">
        <button type="button" aria-label="Thu nhỏ" className={cn(btn, 'pointer-events-auto')} disabled={zoom <= MIN} onClick={() => setZoom(zoomRef.current / 1.5)}><Icon name="remove" /></button>
        <button type="button" aria-label="Về vừa màn hình" data-testid="image-zoom-level" className="pointer-events-auto num rounded-full bg-white/15 px-4 py-2.5 text-[13px] font-semibold text-white backdrop-blur" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label="Phóng to" className={cn(btn, 'pointer-events-auto')} disabled={zoom >= MAX} onClick={() => setZoom(zoomRef.current * 1.5)}><Icon name="add" /></button>
      </div>
    </div>,
    document.body,
  );
}

/** Ảnh nhỏ bấm vào thì mở xem toàn màn hình (phóng to được). `children` = chữ / nút thêm dưới ảnh nhỏ. */
export function ZoomableImage({ src, alt, className, hint = true, children }: { src: string; alt: string; className?: string; hint?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label={`${alt} — bấm để xem lớn`} data-testid="zoomable-image" className="relative block w-full cursor-zoom-in overflow-hidden rounded-lg bg-surface-2" onClick={() => setOpen(true)}>
        <img src={src} alt={alt} className={cn('w-full object-contain', className)} />
        {hint ? <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-medium text-white"><Icon name="zoom_in" className="text-[16px]" />Bấm để phóng to</span> : null}
      </button>
      {children}
      {open ? <Viewer src={src} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
