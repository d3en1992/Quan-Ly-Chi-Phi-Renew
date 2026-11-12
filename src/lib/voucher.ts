// Xuất ẢNH PHIẾU (phiếu chi, phiếu thu, HĐ thầu phụ) để gửi Zalo — thay `exportUngToImage` / `exportThuToImage` của app cũ.
// Vẽ thẳng lên canvas (không chụp lại màn hình) nên ảnh giống nhau trên mọi máy, không phụ thuộc màu / cỡ chữ đang hiển thị.
import { formatDate, formatMoney } from '@/lib/format';

export type Voucher = {
  /** PHIẾU CHI / PHIẾU THU / HỢP ĐỒNG THẦU PHỤ */
  title: string;
  company: string;
  date: string | null;
  rows: [label: string, value: string][];
  amountLabel: string;
  amount: number;
  signLeft?: string;
  signRight?: string;
  filename: string;
};

const W = 720, PAD = 36, SCALE = 2;
const FONT = '"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", sans-serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of (text || '—').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export function drawVoucher(v: Voucher): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const LABEL_W = 150, valueW = W - PAD * 2 - LABEL_W;
  ctx.font = `500 15px ${FONT}`;
  const rows = v.rows.map(([label, value]) => ({ label, lines: wrap(ctx, value, valueW) }));
  const rowsH = rows.reduce((s, r) => s + r.lines.length * 22 + 10, 0);
  const H = 150 + rowsH + 84 + 120;
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#d6d3cd'; ctx.lineWidth = 1; ctx.strokeRect(12.5, 12.5, W - 25, H - 25);

  ctx.fillStyle = '#1c1a17'; ctx.textBaseline = 'alphabetic';
  ctx.font = `700 14px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(v.company.toUpperCase(), PAD, 48);
  ctx.font = `400 12px ${FONT}`; ctx.fillStyle = '#6b665e'; ctx.textAlign = 'right'; ctx.fillText(`Ngày ${formatDate(v.date) || '—'}`, W - PAD, 48);
  ctx.fillStyle = '#1c1a17'; ctx.textAlign = 'center'; ctx.font = `800 26px ${FONT}`; ctx.fillText(v.title, W / 2, 98);
  ctx.strokeStyle = '#e7e4de'; ctx.beginPath(); ctx.moveTo(PAD, 120); ctx.lineTo(W - PAD, 120); ctx.stroke();

  let y = 150;
  ctx.textAlign = 'left';
  for (const r of rows) {
    ctx.font = `400 13px ${FONT}`; ctx.fillStyle = '#6b665e'; ctx.fillText(r.label, PAD, y);
    ctx.font = `500 15px ${FONT}`; ctx.fillStyle = '#1c1a17';
    r.lines.forEach((l, i) => ctx.fillText(l, PAD + LABEL_W, y + i * 22));
    y += r.lines.length * 22 + 10;
  }

  ctx.fillStyle = '#f5f3ef'; ctx.fillRect(PAD, y, W - PAD * 2, 60);
  ctx.fillStyle = '#6b665e'; ctx.font = `600 13px ${FONT}`; ctx.fillText(v.amountLabel, PAD + 16, y + 36);
  ctx.fillStyle = '#1c1a17'; ctx.font = `800 26px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText(`${formatMoney(v.amount)} đ`, W - PAD - 16, y + 40);
  y += 84;

  ctx.font = `600 13px ${FONT}`; ctx.fillStyle = '#6b665e'; ctx.textAlign = 'center';
  ctx.fillText(v.signLeft ?? 'Người lập phiếu', PAD + (W - PAD * 2) / 4, y + 16);
  ctx.fillText(v.signRight ?? 'Người nhận', W - PAD - (W - PAD * 2) / 4, y + 16);
  return canvas;
}

/** Vẽ phiếu rồi tải về máy dạng PNG. Chờ font nạp xong để chữ tiếng Việt đúng kiểu. */
export async function exportVoucherImage(v: Voucher): Promise<void> {
  try { await document.fonts?.ready; } catch { /* bỏ qua */ }
  const canvas = drawVoucher(v);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Không tạo được ảnh phiếu.');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = v.filename.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
