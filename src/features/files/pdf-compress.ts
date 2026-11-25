// Nén PDF ngay trên máy người dùng: CHỈ nén lại ẢNH bên trong (JPEG, cạnh dài tối đa `side`), chữ / font / nét vẽ giữ nguyên nên vẫn nét và copy được.
// Nạp riêng khi cần (pdf-lib ~400 KB). Ảnh lạ (CMYK, bảng màu, mặt nạ trong suốt…) để nguyên cho an toàn.
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, type PDFContext } from 'pdf-lib';

const N = (s: string) => PDFName.of(s);

/** Số kênh màu của ảnh: 1 xám, 3 RGB; loại khác → 0 (không đụng) */
function channels(cs: unknown): 0 | 1 | 3 {
  if (cs instanceof PDFName) return cs === N('DeviceRGB') ? 3 : cs === N('DeviceGray') ? 1 : 0;
  if (cs instanceof PDFArray) {
    const kind = cs.lookup(0);
    if (kind === N('CalRGB')) return 3;
    if (kind === N('CalGray')) return 1;
    if (kind === N('ICCBased')) {
      const s = cs.lookup(1);
      const n = s instanceof PDFStream ? s.dict.lookup(N('N')) : undefined;
      return n instanceof PDFNumber && (n.asNumber() === 1 || n.asNumber() === 3) ? (n.asNumber() as 1 | 3) : 0;
    }
  }
  return 0;
}

/** Ảnh dùng làm mặt nạ trong suốt của ảnh khác → không đụng */
function maskRefs(ctx: PDFContext): Set<string> {
  const out = new Set<string>();
  for (const [, o] of ctx.enumerateIndirectObjects()) {
    if (!(o instanceof PDFStream)) continue;
    for (const k of ['SMask', 'Mask']) { const m = o.dict.get(N(k)); if (m instanceof PDFRef) out.add(m.toString()); }
  }
  return out;
}

async function toJpeg(src: CanvasImageSource, w: number, h: number, side: number, quality: number) {
  const scale = Math.min(1, side / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, cw, ch);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', quality));
  c.width = 0;
  return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), w: cw, h: ch } : null;
}

async function shrinkImage(s: PDFRawStream, side: number, quality: number): Promise<PDFRawStream | null> {
  const d = s.dict;
  const num = (k: string) => { const v = d.lookup(N(k)); return v instanceof PDFNumber ? v.asNumber() : 0; };
  const w = num('Width'), h = num('Height');
  const ch = channels(d.lookup(N('ColorSpace')));
  if (!w || !h || !ch || num('BitsPerComponent') !== 8 || d.has(N('Decode')) || d.has(N('ImageMask')) || d.get(N('Mask')) instanceof PDFArray) return null;
  const smask = d.lookup(N('SMask'));
  if (smask instanceof PDFStream && smask.dict.has(N('Matte'))) return null;
  if (s.contents.length < 20_000) return null;
  const filter = d.lookup(N('Filter'));
  const names = filter instanceof PDFName ? [filter] : filter instanceof PDFArray ? filter.asArray() : [];
  let out: Awaited<ReturnType<typeof toJpeg>> = null;
  if (names.length === 1 && names[0] === N('DCTDecode')) {
    const bmp = await createImageBitmap(new Blob([s.contents as BlobPart], { type: 'image/jpeg' }));
    out = await toJpeg(bmp, w, h, side, quality);
    bmp.close();
  } else if (names.length === 0 || (names.length === 1 && names[0] === N('FlateDecode'))) {
    const raw = names.length ? decodePDFRawStream(s).decode() : s.contents;
    if (raw.length < w * h * ch) return null;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < w * h; i++, j += ch) {
      px[i * 4] = raw[j]!; px[i * 4 + 1] = raw[ch === 3 ? j + 1 : j]!; px[i * 4 + 2] = raw[ch === 3 ? j + 2 : j]!; px[i * 4 + 3] = 255;
    }
    const bmp = await createImageBitmap(new ImageData(px, w, h));
    out = await toJpeg(bmp, w, h, side, quality);
    bmp.close();
  }
  if (!out || out.bytes.length > s.contents.length * 0.9) return null;
  const nd = d.clone();
  nd.set(N('Filter'), N('DCTDecode'));
  nd.delete(N('DecodeParms'));
  nd.set(N('Width'), PDFNumber.of(out.w));
  nd.set(N('Height'), PDFNumber.of(out.h));
  nd.set(N('Length'), PDFNumber.of(out.bytes.length));
  if (ch === 1) nd.set(N('ColorSpace'), N('DeviceRGB')); // JPEG của trình duyệt luôn 3 kênh
  return PDFRawStream.of(nd as PDFDict, out.bytes);
}

/** Nén; trả về null khi không nén được (khóa mật khẩu, có chữ ký số, hỏng) */
export async function compressPdf(file: Blob, target: number): Promise<Blob | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Có chữ ký số: sửa là mất hiệu lực chữ ký
  if (new TextDecoder('latin1').decode(bytes).includes('/ByteRange')) return null;
  let best: Blob | null = null;
  for (const [side, quality] of [[1600, 0.7], [1100, 0.55]] as const) {
    let doc: PDFDocument;
    try { doc = await PDFDocument.load(bytes, { updateMetadata: false }); } catch { return null; }
    const masks = maskRefs(doc.context);
    for (const [ref, o] of doc.context.enumerateIndirectObjects()) {
      if (!(o instanceof PDFRawStream) || o.dict.lookup(N('Subtype')) !== N('Image') || masks.has(ref.toString())) continue;
      try { const small = await shrinkImage(o, side, quality); if (small) doc.context.assign(ref, small); } catch { /* ảnh lạ: để nguyên */ }
    }
    const out = new Blob([(await doc.save({ useObjectStreams: true })) as BlobPart], { type: 'application/pdf' });
    if (!best || out.size < best.size) best = out;
    if (best.size <= target) break;
  }
  return best && best.size < file.size ? best : null;
}
