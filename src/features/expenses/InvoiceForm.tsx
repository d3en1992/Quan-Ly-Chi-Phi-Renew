// FORM một hóa đơn: đầu phiếu (ngày, công trình, loại, NCC, người mua, Đã TT) + bảng dòng vật tư (nếu có, Copy / Dán bảng) + nội dung.
// Dùng chung cho tab HÓA ĐƠN CHI TIẾT, bảng trượt sửa hóa đơn. Mọi phép tính tiền gọi từ invoice-model → src/lib/calc.
import { useMemo, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { Combo, type SuggestItem } from '@/components/ui/combo';
import { ConfirmDialog } from '@/components/ui/confirm';
import { Checkbox, Field, Input, MoneyInput } from '@/components/ui/input';
import { Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { EntryExpense, EntryLine } from './api';
import { blankLine, invoiceDescription, invoiceTotal, lineIsBlank, lineTotal, quantityText, type InvoiceDraft, type InvoiceField, type LineDraft } from './invoice-model';
import { findByName, historySuggest, isDifferentArea } from './logic';
import { defaultPaid, type Lists } from './shared';

/** Hóa đơn đã lưu → form sửa. `lines` rỗng = hóa đơn không có dòng vật tư. */
export function expenseToDraft(e: EntryExpense, lines: readonly EntryLine[], lists: Lists): InvoiceDraft {
  return {
    date: e.date, project: lists.nameOf(e.project_id), type: lists.nameOf(e.expense_type_id), supplier: lists.nameOf(e.supplier_id), buyer: lists.nameOf(e.buyer_id),
    paid: e.paid_at_purchase, description: e.description, amount: e.amount,
    lines: lines.length
      ? lines.map((l) => blankLine({ name: l.name, unit: l.unit ?? '', quantity: quantityText(l.quantity), unitPrice: l.unit_price, discount: l.discount ?? '' }))
      : null,
  };
}

export type LineHistory = { names: SuggestItem[]; units: SuggestItem[] };

/** Gợi ý tên vật tư + ĐVT: danh mục ĐVT trước, rồi những gì đã từng gõ */
export function useLineSuggestions(history: readonly { name: string; unit: string; date: string }[] | undefined, lists: Lists): LineHistory {
  return useMemo(() => {
    const names = historySuggest((history ?? []).map((h) => ({ text: h.name, date: h.date }))).map((n) => ({ id: n, name: n }));
    const seen = new Set(lists.units.map((u) => u.name.toLowerCase()));
    const typed = historySuggest((history ?? []).map((h) => ({ text: h.unit, date: h.date }))).filter((u) => !seen.has(u.toLowerCase()));
    return { names, units: [...lists.units, ...typed.map((u) => ({ id: `t:${u}`, name: u }))] };
  }, [history, lists.units]);
}

type Props = {
  draft: InvoiceDraft;
  setDraft: Dispatch<SetStateAction<InvoiceDraft>>;
  lists: Lists;
  suggestions: LineHistory;
  descriptions: readonly SuggestItem[];
  /** Ô đang sai (tô đỏ sau khi bấm Lưu) */
  bad?: readonly InvoiceField[];
  /** true = trong bảng trượt / điện thoại: 2 cột */
  compact?: boolean;
  /** Công trình được chọn (khi sửa hóa đơn cũ của công trình đã quyết toán thì truyền thêm công trình đó) */
  projectItems?: readonly SuggestItem[];
  /** Chụp hóa đơn: ô đầu phiếu AI không chắc (tô vàng) — 'date' | 'project' | 'type' | 'supplier' | 'buyer' */
  unsureHead?: readonly string[];
  /** Chụp hóa đơn: ô dòng vật tư AI không chắc, dạng `${key dòng}:${cột 0–3}` */
  unsureCells?: readonly string[];
};

const UNSURE = '!border-warn !bg-warn-soft';

/** Bộ nhớ Copy / Dán dòng vật tư (trong máy này), như Copy KL của hợp đồng */
const LINES_CLIP_KEY = 'invoice_lines_clipboard';
type LineClip = Pick<LineDraft, 'name' | 'unit' | 'quantity' | 'unitPrice' | 'discount'>;

const cellInput = '!h-[34px] !rounded-none !border-0 !bg-transparent focus:!outline-2 focus:!-outline-offset-2';

export function InvoiceFields({ draft, setDraft, lists, suggestions, descriptions, bad = [], compact = false, projectItems, unsureHead = [], unsureCells = [] }: Props) {
  const toast = useToast();
  const u = (k: string) => (unsureHead.includes(k) ? UNSURE : undefined);
  const uc = (key: number, col: number) => (unsureCells.includes(`${key}:${col}`) ? '!bg-warn-soft' : undefined);
  const set = <K extends keyof InvoiceDraft>(k: K, v: InvoiceDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setLine = (key: number, patch: Partial<LineDraft>) =>
    setDraft((d) => (d.lines ? { ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) } : d));
  const addLine = () => setDraft((d) => (d.lines ? { ...d, lines: [...d.lines, blankLine()] } : d));
  const removeLine = (key: number) => setDraft((d) => (d.lines ? { ...d, lines: d.lines.length > 1 ? d.lines.filter((l) => l.key !== key) : [blankLine()] } : d));
  const isBad = (f: InvoiceField) => bad.includes(f) || undefined;

  const supplier = findByName(draft.supplier, lists.suppliers);
  const project = findByName(draft.project, lists.projects);
  const otherArea = isDifferentArea(supplier?.address, project?.address);
  const total = invoiceTotal(draft);
  const autoDescription = draft.lines && !draft.description.trim() ? invoiceDescription(draft) : '';

  /** Enter trong bảng dòng vật tư: xuống ô dưới cùng cột; dòng cuối thì thêm dòng */
  const onLineKey = (e: KeyboardEvent<HTMLElement>, row: number, col: number) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    e.preventDefault();
    const table = e.currentTarget.closest('table');
    if (draft.lines && row >= draft.lines.length - 1) addLine();
    setTimeout(() => table?.querySelector<HTMLElement>(`[data-lr="${row + 1}"][data-lc="${col}"]`)?.focus(), 0);
  };

  // Copy / Dán chỉ phần dòng vật tư của bảng (đầu phiếu, nội dung giữ nguyên)
  const [askPaste, setAskPaste] = useState<LineClip[] | null>(null);
  const copyLines = () => {
    const rows = (draft.lines ?? []).filter((l) => !lineIsBlank(l)).map(({ name, unit, quantity, unitPrice, discount }) => ({ name, unit, quantity, unitPrice, discount }));
    if (!rows.length) { toast('Bảng chưa có dòng vật tư để copy', 'error'); return; }
    try { localStorage.setItem(LINES_CLIP_KEY, JSON.stringify(rows)); toast(`Đã copy ${rows.length} dòng vật tư — mở hóa đơn khác rồi bấm Dán bảng`); }
    catch { toast('Copy thất bại', 'error'); }
  };
  const applyPaste = (rows: LineClip[]) => { setDraft((d) => ({ ...d, lines: rows.map((r) => blankLine(r)) })); toast(`Đã dán ${rows.length} dòng vật tư`); };
  const pasteLines = () => {
    let rows: LineClip[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(LINES_CLIP_KEY) ?? '[]') as Partial<LineClip>[];
      rows = raw.map((r) => ({ name: String(r.name ?? ''), unit: String(r.unit ?? ''), quantity: String(r.quantity ?? ''), unitPrice: Math.round(Number(r.unitPrice) || 0), discount: String(r.discount ?? '') }));
    } catch { /* bộ nhớ hỏng → coi như chưa copy */ }
    if (!rows.length) { toast('Chưa copy dòng vật tư nào', 'error'); return; }
    if ((draft.lines ?? []).some((l) => !lineIsBlank(l))) setAskPaste(rows);
    else applyPaste(rows);
  };

  const paidField = (
    <Field label="Thanh toán">
      <span className="flex h-9 items-center"><Checkbox checked={draft.paid} onChange={(v) => set('paid', v)} label="Đã thanh toán lúc mua" /></span>
    </Field>
  );
  const descriptionField = (
    <Field label={draft.lines ? 'Nội dung (để trống = tự ghép từ tên vật tư)' : 'Nội dung / ghi chú'}>
      <Combo aria-label="Nội dung" free value={draft.description} onChange={(v) => set('description', v)} items={descriptions} groupLabel="Nội dung đã nhập" placeholder={autoDescription || undefined} maxLength={2000} />
    </Field>
  );

  return (
    <>
      {/* 13/11/2026: hàng 1 = Ngày (hẹp) + Công trình (dài); hàng 2 = Loại chi phí · NCC · Người mua; nội dung xuống dưới bảng vật tư */}
      {compact ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày"><Input type="date" aria-label="Ngày hóa đơn" aria-invalid={isBad('date')} className={u('date')} value={draft.date} onChange={(e) => set('date', e.target.value)} /></Field>
          {paidField}
        </div>
      ) : null}
      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-[minmax(130px,190px)_minmax(0,1fr)]')}>
        {compact ? null : <Field label="Ngày"><Input type="date" aria-label="Ngày hóa đơn" aria-invalid={isBad('date')} className={u('date')} value={draft.date} onChange={(e) => set('date', e.target.value)} /></Field>}
        <Field label="Công trình *">
          <Combo aria-label="Công trình" value={draft.project} onChange={(v) => set('project', v)} items={projectItems ?? lists.projectOptions} groupLabel="Công trình" invalid={isBad('project')} className={u('project')} />
        </Field>
      </div>
      <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-3')}>
        <Field label="Loại chi phí *" className={compact ? 'col-span-2' : undefined}>
          <Combo aria-label="Loại chi phí" value={draft.type} onChange={(v) => set('type', v)} items={lists.types} groupLabel="Loại chi phí" onCreate={(t) => lists.create('expense_type', t)} invalid={isBad('type')} className={u('type')} />
        </Field>
        <Field label="Nhà cung cấp">
          <Combo
            aria-label="Nhà cung cấp" value={draft.supplier} items={lists.suppliers} groupLabel="Nhà cung cấp" onCreate={(t) => lists.create('supplier', t)} invalid={isBad('supplier')} className={u('supplier')}
            onChange={(v) => setDraft((d) => {
              // Đổi sang NCC khác → ô Đã TT theo công tắc Mua nợ của NCC mới (vẫn tích lại được)
              const before = findByName(d.supplier, lists.suppliers)?.id, after = findByName(v, lists.suppliers)?.id;
              return { ...d, supplier: v, paid: before !== after ? defaultPaid(v, lists.suppliers) : d.paid };
            })}
          />
        </Field>
        <Field label="Người mua">
          <Combo aria-label="Người mua" value={draft.buyer} onChange={(v) => set('buyer', v)} items={lists.buyers} groupLabel="Người mua" onCreate={(t) => lists.create('person', t)} invalid={isBad('buyer')} className={u('buyer')} />
        </Field>
      </div>
      {compact && draft.lines ? null : (
        <div className={cn('grid items-end gap-3', draft.lines ? 'grid-cols-1' : compact ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_minmax(0,2fr)]')}>
          {compact ? null : paidField}
          {draft.lines ? null : (
            <Field label="Số tiền (đ) *">
              <MoneyInput aria-label="Số tiền" aria-invalid={isBad('amount')} className={cn('!h-10 !text-[16px] font-bold', bad.includes('amount') && 'border-bad bg-bad-soft')} value={draft.amount} onChange={(v) => set('amount', v)} />
            </Field>
          )}
        </div>
      )}
      {draft.lines ? null : descriptionField}
      {supplier?.address || project?.address ? (
        <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-2')}>
          <div className="flex min-w-0 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-2 text-[12.5px] text-muted">
            <Icon name="storefront" className="text-[17px]" /><span className="min-w-0 truncate">Mua tại: {supplier?.address || '(chưa ghi địa chỉ cửa hàng)'}</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-2 text-[12.5px] text-muted">
            <Icon name="location_on" className="text-[17px]" /><span className="min-w-0 truncate">Công trình: {project?.address || '(chưa ghi địa chỉ)'}</span>
            {otherArea ? <Pill tone="warn">khác khu vực</Pill> : null}
          </div>
        </div>
      ) : null}

      {draft.lines ? (
        <div className={cn('tbl rounded-lg border', bad.includes('lines') ? 'border-bad' : 'border-line')}>
          {/* Kẻ dọc giữa các cột để phân biệt Tên / ĐVT / Số lượng / Đơn giá / Thành tiền */}
          <table data-testid="invoice-lines" className="!w-full table-fixed [&_td]:border-r [&_td]:border-line [&_th]:border-r [&_th]:border-line [&_tr>*:last-child]:border-r-0" style={{ minWidth: compact ? 600 : 680 }}>
            <colgroup><col style={{ width: 34 }} /><col style={{ minWidth: 160 }} /><col style={{ width: 70 }} /><col style={{ width: 76 }} /><col style={{ width: 112 }} /><col style={{ width: 112 }} /><col style={{ width: 36 }} /></colgroup>
            <thead>
              <tr><th className="!px-0 !text-center">#</th><th>Tên vật tư</th><th>ĐVT</th><th className="!text-right">Số lượng</th><th className="!text-right">Đơn giá</th><th className="!text-right">Thành tiền</th><th /></tr>
            </thead>
            <tbody>
              {draft.lines.map((l, i) => (
                <tr key={l.key}>
                  <td className="!px-0 text-center text-[12px] text-faint">{i + 1}</td>
                  <td className={cn('!p-0', uc(l.key, 0))}><Combo free data-lr={i} data-lc={0} aria-label={`Tên vật tư dòng ${i + 1}`} className={cellInput} value={l.name} maxLength={300} items={suggestions.names} groupLabel="Vật tư đã nhập" onChange={(v) => setLine(l.key, { name: v })} onKeyDown={(e) => onLineKey(e, i, 0)} /></td>
                  <td className={cn('!p-0', uc(l.key, 1))}><Combo free data-lr={i} data-lc={1} aria-label={`ĐVT dòng ${i + 1}`} className={cellInput} value={l.unit} maxLength={30} items={suggestions.units} groupLabel="Đơn vị tính" onChange={(v) => setLine(l.key, { unit: v })} onKeyDown={(e) => onLineKey(e, i, 1)} /></td>
                  <td className={cn('!p-0', uc(l.key, 2))}><Input data-lr={i} data-lc={2} aria-label={`Số lượng dòng ${i + 1}`} inputMode="decimal" autoComplete="off" className={cn(cellInput, 'num text-right')} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value.replace(/[^\d.,]/g, '') })} onKeyDown={(e) => onLineKey(e, i, 2)} /></td>
                  <td className={cn('!p-0', uc(l.key, 3))}><MoneyInput data-lr={i} data-lc={3} aria-label={`Đơn giá dòng ${i + 1}`} className={cellInput} placeholder="" value={l.unitPrice} onChange={(v) => setLine(l.key, { unitPrice: v })} onKeyDown={(e) => onLineKey(e, i, 3)} /></td>
                  <td className="num text-right">{lineIsBlank(l) ? '' : formatMoney(lineTotal(l))}{l.discount.trim() ? <div className="text-[11px] text-muted">CK {l.discount}</div> : null}</td>
                  <td className="!p-0 text-center"><button type="button" tabIndex={-1} aria-label={`Xóa dòng ${i + 1}`} className="grid h-[34px] w-full place-items-center text-faint hover:text-bad" onClick={() => removeLine(l.key)}><Icon name="close" className="text-[17px]" /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold [&>td]:bg-surface-2">
                <td />
                <td colSpan={4}>Tổng hóa đơn</td>
                <td className="num text-right" data-testid="invoice-total">{formatMoney(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
      {draft.lines ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={addLine}><Icon name="add" />Thêm dòng</Button>
          <Button variant="ghost" data-testid="lines-copy" onClick={copyLines}><Icon name="content_copy" />Copy bảng</Button>
          <Button variant="ghost" data-testid="lines-paste" onClick={pasteLines}><Icon name="content_paste" />Dán bảng</Button>
        </div>
      ) : null}
      {draft.lines ? descriptionField : null}
      <ConfirmDialog open={!!askPaste} onOpenChange={(o) => { if (!o) setAskPaste(null); }} title="Ghi đè dòng vật tư?" confirmLabel="Ghi đè"
        message="Bảng đang có dòng vật tư. Dán sẽ thay toàn bộ bằng các dòng đã copy (đầu phiếu và nội dung giữ nguyên)."
        onConfirm={() => { if (askPaste) applyPaste(askPaste); setAskPaste(null); }} />
    </>
  );
}
