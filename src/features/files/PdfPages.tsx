// Vẽ các trang PDF trong app (pdf.js, nạp riêng khi mở PDF lần đầu). Trang nào cuộn tới mới vẽ. Dùng bản legacy cho điện thoại cũ.
import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

function Page({ doc, n, width }: { doc: PDFDocumentProxy; n: number; width: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => setNear(es.some((e) => e.isIntersecting)), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!near || page) return;
    let live = true;
    doc.getPage(n).then((p) => { if (live) setPage(p); }, () => undefined);
    return () => { live = false; };
  }, [near, page, doc, n]);
  const v1 = page?.getViewport({ scale: 1 });
  const height = v1 ? (width * v1.height) / v1.width : width * 1.414;
  useEffect(() => {
    const c = canvas.current;
    if (!page || !near || !c || width < 10) return;
    // Nét theo màn hình, chặn 4096 px để điện thoại không hết bộ nhớ
    const base = page.getViewport({ scale: 1 });
    const px = Math.min(4096, 4096 * (base.width / base.height), width * Math.min(window.devicePixelRatio || 1, 2));
    const vp = page.getViewport({ scale: px / base.width });
    let task: ReturnType<PDFPageProxy['render']> | null = null;
    const timer = window.setTimeout(() => {
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      task = page.render({ canvas: c, viewport: vp });
      task.promise.catch(() => undefined);
    }, 120);
    return () => { window.clearTimeout(timer); task?.cancel(); };
  }, [page, near, width]);
  return (
    <div ref={box} className="mx-auto mb-3 bg-white shadow" style={{ width, height }} data-testid="pdf-page">
      {near ? <canvas ref={canvas} className="size-full" aria-label={`Trang ${n}`} /> : null}
    </div>
  );
}

export default function PdfPages({ data, width, onError }: { data: Blob; width: number; onError: (msg: string) => void }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  useEffect(() => {
    let live = true;
    let task: ReturnType<typeof getDocument> | null = null;
    void data.arrayBuffer().then((buf) => {
      if (!live) return;
      // isEvalSupported không còn; tắt mọi thứ chạy script trong PDF: pdf.js chỉ vẽ, không chạy script của tệp
      task = getDocument({ data: new Uint8Array(buf) });
      task.promise.then((d) => { if (live) setDoc(d); }, (e: Error) => { if (live) onError(/password/i.test(e.name + e.message) ? 'PDF có mật khẩu — bấm Tải về để mở.' : 'Không mở được PDF này — bấm Tải về để mở.'); });
    });
    return () => { live = false; void task?.destroy(); };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!doc) return <div className="grid h-40 place-items-center text-[13px] text-muted">Đang mở PDF…</div>;
  return <>{Array.from({ length: doc.numPages }, (_, i) => <Page key={i} doc={doc} n={i + 1} width={width} />)}</>;
}
