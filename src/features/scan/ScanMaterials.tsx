// Nút AI → DANH SÁCH VẬT TƯ CẦN MUA (tin nhắn Zalo của thợ, chữ ghi trên ván của cai…): bảng Tên vật tư / Số lượng / ĐVT / Ghi chú
// sửa được, nút "Copy gửi Zalo" (chữ đánh số) và "Copy bảng" (dán Excel). KHÔNG lưu vào chi phí.
import { useState } from 'react';
import type { MaterialItem, MaterialListScan } from '@shared/scan';
import { Button, Icon } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Card, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { materialsText, materialsTsv } from './shared';

type Props = { scan: MaterialListScan; onDone: () => void; onRetake: () => void };

const blank = (): MaterialItem => ({ name: '', quantity: 0, unit: '', note: '' });
const cell = 'h-[34px] w-full min-w-0 border-0 bg-transparent px-2 text-[13px] text-fg focus:outline-2 focus:outline-accent';

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function ScanMaterials({ scan, onDone, onRetake }: Props) {
  const toast = useToast();
  const [title, setTitle] = useState(scan.title);
  const [delivery, setDelivery] = useState(scan.delivery_note);
  const [items, setItems] = useState<MaterialItem[]>(scan.items.length ? scan.items : [blank()]);
  const setItem = (i: number, patch: Partial<MaterialItem>) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const text = materialsText(items, { title, project: scan.project_match, delivery });

  const doCopy = async (what: 'zalo' | 'table') => {
    const ok = await copy(what === 'zalo' ? text : materialsTsv(items));
    toast(ok ? (what === 'zalo' ? 'Đã copy — dán vào Zalo gửi cửa hàng' : 'Đã copy bảng — dán vào Excel') : 'Trình duyệt chặn copy — anh bấm giữ ô xem trước để copy tay.', ok ? undefined : 'error');
  };

  return (
    <Card>
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <Icon name="checklist" className="text-accent" />
        <h3 className="m-0 text-sm font-bold">Danh sách vật tư cần mua</h3>
        <Pill>{items.filter((x) => x.name.trim()).length} món</Pill>
        {scan.supplier_match ? <Pill tone="good">Gợi ý NCC: {scan.supplier_match}</Pill> : null}
        <div className="flex-1" />
        <small className="text-muted">Không lưu vào chi phí — chỉ để copy gửi cửa hàng</small>
      </header>
      <div className="grid gap-3 p-4" data-testid="scan-materials">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Tiêu đề"><Input aria-label="Tiêu đề danh sách" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vật tư điện" /></Field>
          <Field label="Giao hàng"><Input aria-label="Ghi chú giao hàng" value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="Giao qua chùa" /></Field>
        </div>
        <div className="tbl rounded-lg border border-line">
          <table className="!w-full table-fixed [&_td]:border-r [&_td]:border-line [&_th]:border-r [&_th]:border-line [&_tr>*:last-child]:border-r-0" style={{ minWidth: 520 }} data-testid="materials-table">
            <colgroup><col style={{ width: 32 }} /><col /><col style={{ width: 76 }} /><col style={{ width: 72 }} /><col style={{ width: 130 }} /><col style={{ width: 36 }} /></colgroup>
            <thead><tr><th className="!px-0 !text-center">#</th><th>Tên vật tư</th><th className="!text-right">Số lượng</th><th>ĐVT</th><th>Ghi chú</th><th /></tr></thead>
            <tbody>
              {items.map((x, i) => (
                <tr key={i}>
                  <td className="!px-0 text-center text-[12px] text-faint">{i + 1}</td>
                  <td className="!p-0"><input aria-label={`Tên vật tư dòng ${i + 1}`} className={cell} value={x.name} onChange={(e) => setItem(i, { name: e.target.value })} /></td>
                  <td className="!p-0"><input aria-label={`Số lượng dòng ${i + 1}`} inputMode="decimal" className={`${cell} num text-right`} value={x.quantity ? String(x.quantity).replace('.', ',') : ''}
                    onChange={(e) => { const n = Number(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.')); setItem(i, { quantity: Number.isFinite(n) ? n : 0 }); }} /></td>
                  <td className="!p-0"><input aria-label={`ĐVT dòng ${i + 1}`} className={cell} value={x.unit} onChange={(e) => setItem(i, { unit: e.target.value })} /></td>
                  <td className="!p-0"><input aria-label={`Ghi chú dòng ${i + 1}`} className={cell} value={x.note} onChange={(e) => setItem(i, { note: e.target.value })} /></td>
                  <td className="!p-0 text-center"><button type="button" aria-label={`Xóa dòng ${i + 1}`} className="grid h-[34px] w-full place-items-center text-faint hover:text-bad" onClick={() => setItems((xs) => xs.filter((_, k) => k !== i))}><Icon name="close" className="text-[17px]" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div><Button size="sm" onClick={() => setItems((xs) => [...xs, blank()])}><Icon name="add" />Thêm dòng</Button></div>

        <Field label="Xem trước tin nhắn gửi cửa hàng">
          <pre className="m-0 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-3 font-sans text-[13px] leading-relaxed text-fg" data-testid="materials-preview">{text}</pre>
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onRetake}><Icon name="close" />Bỏ</Button>
          <Button onClick={() => void doCopy('table')}><Icon name="table_view" />Copy bảng (Excel)</Button>
          <Button variant="primary" data-testid="materials-copy" onClick={() => void doCopy('zalo')}><Icon name="content_copy" />Copy gửi Zalo</Button>
          <Button onClick={onDone}><Icon name="done" />Xong</Button>
        </div>
      </div>
    </Card>
  );
}
