// FORM một hóa đơn: đầu phiếu (ngày, công trình, loại, NCC, người mua, Đã TT) + bảng dòng vật tư kiểu Sheet (LinesGrid, Copy / Dán bảng) + nội dung.
// Dùng chung cho tab HÓA ĐƠN CHI TIẾT, bảng trượt sửa hóa đơn. Mọi phép tính tiền gọi từ invoice-model → src/lib/calc.
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { Combo, type SuggestItem } from '@/components/ui/combo';
import { ConfirmDialog } from '@/components/ui/confirm';
import { Checkbox, Field, Input, MoneyInput } from '@/components/ui/input';
import { Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { sheetClip, SheetKeysHint } from '@/components/ui/sheet-grid';
import { cn } from '@/lib/utils';
import type { EntryExpense, EntryLine } from './api';
import { blankLine, invoiceDescription, invoiceTotal, lineIsBlank, quantityText, type InvoiceDraft, type InvoiceField, type LineDraft } from './invoice-model';
import { LinesGrid } from './LinesGrid';
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

export type LineHistory = { names: SuggestItem[]; units: SuggestItem[]; /** Lần mua gần nhất theo tên vật tư (chữ thường) → ĐVT + đơn giá */ last: Map<string, { unit: string; unitPrice: number }> };

/** Gợi ý tên vật tư + ĐVT: danh mục ĐVT trước, rồi những gì đã từng gõ */
export function useLineSuggestions(history: readonly { name: string; unit: string; unitPrice?: number; date: string }[] | undefined, lists: Lists): LineHistory {
  return useMemo(() => {
    const names = historySuggest((history ?? []).map((h) => ({ text: h.name, date: h.date }))).map((n) => ({ id: n, name: n }));
    const seen = new Set(lists.units.map((u) => u.name.toLowerCase()));
    const typed = historySuggest((history ?? []).map((h) => ({ text: h.unit, date: h.date }))).filter((u) => !seen.has(u.toLowerCase()));
    const last = new Map<string, { unit: string; unitPrice: number; date: string }>();
    for (const h of history ?? []) {
      const k = h.name.trim().toLowerCase();
      const cur = last.get(k);
      if (k && (!cur || h.date > cur.date)) last.set(k, { unit: h.unit, unitPrice: h.unitPrice ?? 0, date: h.date });
    }
    return { names, units: [...lists.units, ...typed.map((u) => ({ id: `t:${u}`, name: u }))], last };
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
  /** Nút AI: ẩn Copy / Dán bảng (không cần khi AI đã đọc sẵn dòng vật tư) */
  hideCopyPaste?: boolean;
  /** Nút thêm, đặt ngay dưới bảng dòng vật tư cạnh "Thêm dòng" (nút AI: Chuyển thành hóa đơn nhanh) */
  lineActions?: ReactNode;
  /** Ctrl+S trong bảng dòng vật tư */
  onSave?: () => void;
};

const UNSURE = '!border-warn !bg-warn-soft';

/** Bộ nhớ Copy / Dán dòng vật tư (trong máy này), như Copy KL của hợp đồng */
const LINES_CLIP_KEY = 'invoice_lines_clipboard';
type LineClip = Pick<LineDraft, 'name' | 'unit' | 'quantity' | 'unitPrice' | 'discount'>;

export function InvoiceFields({ draft, setDraft, lists, suggestions, descriptions, bad = [], compact = false, projectItems, unsureHead = [], unsureCells = [], hideCopyPaste = false, lineActions, onSave }: Props) {
  const toast = useToast();
  const u = (k: string) => (unsureHead.includes(k) ? UNSURE : undefined);
  const set = <K extends keyof InvoiceDraft>(k: K, v: InvoiceDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const addLine = () => setDraft((d) => (d.lines ? { ...d, lines: [...d.lines, blankLine()] } : d));
  const isBad = (f: InvoiceField) => bad.includes(f) || undefined;

  const supplier = findByName(draft.supplier, lists.suppliers);
  const project = findByName(draft.project, lists.projects);
  const otherArea = isDifferentArea(supplier?.address, project?.address);
  const total = invoiceTotal(draft);
  const autoDescription = draft.lines && !draft.description.trim() ? invoiceDescription(draft) : '';

  // Copy / Dán chỉ phần dòng vật tư của bảng (đầu phiếu, nội dung giữ nguyên)
  const [askPaste, setAskPaste] = useState<LineClip[] | null>(null);
  const copyLines = () => {
    const rows = (draft.lines ?? []).filter((l) => !lineIsBlank(l)).map(({ name, unit, quantity, unitPrice, discount }) => ({ name, unit, quantity, unitPrice, discount }));
    if (!rows.length) { toast('Bảng chưa có dòng vật tư để copy', 'error'); return; }
    // Chép ra clipboard dạng bảng (dán thẳng vào Excel / Google Sheet) + giữ trong máy để bấm Dán bảng ở hóa đơn khác
    const tsv = rows.map((r) => [r.name, r.unit, r.quantity, r.unitPrice ? String(r.unitPrice) : ''].map((x) => x.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\r\n');
    sheetClip.set(tsv);
    void navigator.clipboard?.writeText(tsv).catch(() => undefined);
    try { localStorage.setItem(LINES_CLIP_KEY, JSON.stringify(rows)); toast(`Đã copy ${rows.length} dòng vật tư — dán vào Excel, hoặc mở hóa đơn khác rồi bấm Dán bảng`); }
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
        <LinesGrid draft={draft} setDraft={setDraft} suggestions={suggestions} compact={compact} bad={bad.includes('lines')} unsure={unsureCells} total={total} onSave={onSave} />
      ) : null}
      {draft.lines ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={addLine}><Icon name="add" />Thêm dòng</Button>
          {hideCopyPaste ? null : <>
            <Button variant="ghost" data-testid="lines-copy" onClick={copyLines}><Icon name="content_copy" />Copy bảng</Button>
            <Button variant="ghost" data-testid="lines-paste" onClick={pasteLines}><Icon name="content_paste" />Dán bảng</Button>
          </>}
          {lineActions}
        </div>
      ) : null}
      {draft.lines && !compact ? <SheetKeysHint /> : null}
      {draft.lines ? descriptionField : null}
      <ConfirmDialog open={!!askPaste} onOpenChange={(o) => { if (!o) setAskPaste(null); }} title="Ghi đè dòng vật tư?" confirmLabel="Ghi đè"
        message="Bảng đang có dòng vật tư. Dán sẽ thay toàn bộ bằng các dòng đã copy (đầu phiếu và nội dung giữ nguyên)."
        onConfirm={() => { if (askPaste) applyPaste(askPaste); setAskPaste(null); }} />
    </>
  );
}
