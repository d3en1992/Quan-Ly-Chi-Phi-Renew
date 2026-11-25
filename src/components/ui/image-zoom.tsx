// TRÌNH XEM ẢNH dùng chung cho cả app (hóa đơn, phiếu chấm công, cửa hàng, ảnh chụp AI…) — chỗ nào xem ảnh thì dùng ZoomableImage / ImageViewer.
// Mở ra vừa khít màn hình. Chuột: bấm ảnh = phóng to / thu về, lăn = phóng tại con trỏ, nhấn giữ kéo = dời ảnh.
// Cảm ứng: chụm 2 ngón, chạm 2 lần, kéo 1 ngón. Phím: + − 0, mũi tên, Esc.
// Là Radix Dialog (không phải portal trơn): bảng trượt khóa chuột ở mọi thứ ngoài nó, portal trơn sẽ không kéo / lăn được.
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Icon } from './button';
import { cn } from '@/lib/utils';

const MAX = 8;
const CLICK_ZOOM = 2.5;
/** Phần được kéo quá mép trên / dưới để thanh nút không che ảnh */
const EDGE = 72;

type View = { z: number; x: number; y: number };
type Pt = { x: number; y: number };
const FIT: View = { z: 1, x: 0, y: 0 };
const limit = (v: number, max: number) => Math.min(max, Math.max(-max, v));

/** Khung xem ảnh toàn màn hình (mở bằng nút riêng — vd "Ảnh phiếu" ở Sổ chấm công) */
export function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Content data-testid="image-zoom" aria-describedby={undefined} className="fixed inset-0 z-[200] bg-black/95 outline-none"
          onClick={(e) => e.stopPropagation()}>
          <Dialog.Title className="sr-only">{alt}</Dialog.Title>
          <Stage src={src} alt={alt} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Stage({ src, alt }: { src: string; alt: string }) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const view = useRef<View>(FIT);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef({ moved: 0, multi: false });
  const lastTap = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  /** Vẽ thẳng lên ảnh (không qua React) cho mượt; `smooth` = có chuyển động khi bấm nút / bấm ảnh */
  const apply = useCallback((v: View, smooth = false) => {
    const el = box.current, im = img.current;
    if (!el || !im) return;
    const z = Math.min(MAX, Math.max(1, v.z));
    const overX = (im.offsetWidth * z - el.clientWidth) / 2, overY = (im.offsetHeight * z - el.clientHeight) / 2;
    const next = { z, x: limit(v.x, overX > 0 ? overX : 0), y: limit(v.y, z > 1 && overY > 0 ? overY + EDGE : 0) };
    view.current = next;
    im.style.transition = smooth ? 'transform 160ms ease-out' : 'none';
    im.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.z})`;
    setZoom(z);
  }, []);

  /** Đổi mức phóng, giữ điểm `at` (tọa độ màn hình) đứng yên */
  const zoomTo = useCallback((z: number, at?: Pt, smooth = false) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nz = Math.min(MAX, Math.max(1, z));
    const cx = at ? at.x - r.left - r.width / 2 : 0, cy = at ? at.y - r.top - r.height / 2 : 0;
    const v = view.current, k = nz / v.z;
    apply({ z: nz, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }, smooth);
  }, [apply]);

  const toggle = (at: Pt) => zoomTo(view.current.z > 1.05 ? 1 : CLICK_ZOOM, at, true);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Phải là listener không-passive mới chặn được trình duyệt cuộn / phóng cả trang
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      // ctrlKey = chụm 2 ngón trên bàn di chuột laptop (delta rất nhỏ)
      zoomTo(view.current.z * Math.exp(-limit(dy, 200) * (e.ctrlKey && Math.abs(dy) < 50 ? 0.01 : 0.002)), { x: e.clientX, y: e.clientY });
    };
    const key = (e: KeyboardEvent) => {
      const v = view.current, step = 90;
      if (e.key === '+' || e.key === '=') zoomTo(v.z * 1.4, undefined, true);
      else if (e.key === '-') zoomTo(v.z / 1.4, undefined, true);
      else if (e.key === '0') apply(FIT, true);
      else if (e.key === 'ArrowDown' || e.key === 'PageDown') apply({ ...v, y: v.y - step }, true);
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') apply({ ...v, y: v.y + step }, true);
      else if (e.key === 'ArrowRight') apply({ ...v, x: v.x - step }, true);
      else if (e.key === 'ArrowLeft') apply({ ...v, x: v.x + step }, true);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    const resize = new ResizeObserver(() => apply(view.current));
    resize.observe(el);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key, true);
    return () => { resize.disconnect(); el.removeEventListener('wheel', wheel); window.removeEventListener('keydown', key, true); };
  }, [apply, zoomTo]);

  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) || 1;

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 0) gesture.current = { moved: 0, multi: false };
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size > 1) gesture.current.multi = true;
    setDragging(true);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    const other = [...pointers.current].find(([id]) => id !== e.pointerId)?.[1];
    pointers.current.set(e.pointerId, now);
    gesture.current.moved += Math.hypot(now.x - prev.x, now.y - prev.y);
    if (other) {
      const a = mid(prev, other), b = mid(now, other), v = view.current;
      apply({ ...v, x: v.x + b.x - a.x, y: v.y + b.y - a.y });
      zoomTo(view.current.z * (dist(now, other) / dist(prev, other)), b);
    } else if (gesture.current.moved > 5) {
      const v = view.current;
      apply({ ...v, x: v.x + now.x - prev.x, y: v.y + now.y - prev.y });
    }
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId) || pointers.current.size > 0) return;
    setDragging(false);
    if (e.type === 'pointercancel' || gesture.current.multi || gesture.current.moved > 5) return;
    const double = e.timeStamp - lastTap.current < 350;
    lastTap.current = double ? 0 : e.timeStamp;
    // Chuột: bấm 1 lần là phóng (bấm đúp vẫn chỉ tính 1 lần). Cảm ứng: chạm 2 lần.
    if (e.pointerType === 'mouse' ? !double : double) toggle({ x: e.clientX, y: e.clientY });
  };

  const btn = 'grid size-11 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-40';
  return (
    <>
      <div ref={box} data-testid="image-zoom-stage"
        className={cn('absolute inset-0 grid touch-none place-items-center overflow-hidden select-none', zoom <= 1 ? 'cursor-zoom-in' : dragging ? 'cursor-grabbing' : 'cursor-grab')}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {state === 'error' ? <span className="text-[14px] text-white/80">Không tải được ảnh.</span>
          : <img ref={img} src={src} alt={alt} draggable={false} onLoad={() => { setState('ready'); apply(FIT); }} onError={() => setState('error')} className="block max-h-[100dvh] max-w-[100vw] object-contain" />}
        {state === 'loading' ? <span className="absolute text-[14px] text-white/80">Đang tải ảnh…</span> : null}
      </div>
      <Dialog.Close aria-label="Đóng ảnh" data-testid="image-zoom-close" className={cn(btn, 'absolute top-[max(12px,env(safe-area-inset-top))] right-3')}><Icon name="close" /></Dialog.Close>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 p-3 pb-[max(14px,env(safe-area-inset-bottom))]">
        <button type="button" aria-label="Thu nhỏ" className={cn(btn, 'pointer-events-auto')} disabled={zoom <= 1} onClick={() => zoomTo(view.current.z / 1.5, undefined, true)}><Icon name="remove" /></button>
        <button type="button" aria-label="Về vừa màn hình" title="Về vừa màn hình" data-testid="image-zoom-level" className="num pointer-events-auto rounded-full bg-black/60 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-black/80" onClick={() => apply(FIT, true)}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label="Phóng to" className={cn(btn, 'pointer-events-auto')} disabled={zoom >= MAX} onClick={() => zoomTo(view.current.z * 1.5, undefined, true)}><Icon name="add" /></button>
      </div>
    </>
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
      {open ? <ImageViewer src={src} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
