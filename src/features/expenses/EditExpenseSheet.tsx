// Bảng trượt SỬA một hóa đơn (bấm dòng ở "Hóa đơn trong ngày" hoặc ở Thống Kê CP/HĐ). Có nút Xóa (xóa mềm → Thùng Rác).
// Hóa đơn có ảnh (Trợ lý AI lưu kèm) thì hiện ảnh ở đầu bảng — bấm ảnh để xem toàn màn hình, phóng to đối chiếu.
// Hóa đơn cũ chưa có ảnh: nút "Lưu ảnh hóa đơn" (chụp / chọn ảnh) gắn ảnh vào hóa đơn ngay, không cần bấm Lưu.
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccess } from '@/app/auth';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { ErrorState, LoadingState, Note } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { fetchExpenseLines, useDeleteExpense, useEntryExpenses, useLineHistory, useSetExpenseImage, useUpdateExpense, type EntryExpense } from './api';
import { expenseToDraft, InvoiceFields, useLineSuggestions } from './InvoiceForm';
import { blankInvoice, blankLines, checkInvoice, invoiceTotal, type InvoiceDraft, type InvoiceField } from './invoice-model';
import { findDuplicates, historySuggest, isoToVn, type DupHit } from './logic';
import type { ExpenseInput } from './schema';
import { DuplicateDialog, toDupCandidate, useLists, type Lists } from './shared';
import { AttachReceiptButton, ReceiptPhoto } from '@/features/scan/ReceiptPhoto';

type Props = { expense: EntryExpense | null; expenses: readonly EntryExpense[]; lists: Lists; onClose: () => void };

export function EditExpenseSheet({ expense, expenses, lists, onClose }: Props) {
  const toast = useToast();
  const access = useAccess();
  const update = useUpdateExpense();
  const remove = useDeleteExpense();
  const setImage = useSetExpenseImage();
  /** Ảnh vừa gắn trong lúc bảng đang mở (danh sách cha chưa kịp tải lại) */
  const [photo, setPhoto] = useState<{ id: string; path: string } | null>(null);
  const id = expense?.id ?? null;
  const linesQuery = useQuery({ queryKey: ['expense-lines', 'edit', id], enabled: !!id, staleTime: 0, queryFn: () => fetchExpenseLines(id!) });
  const lineHistory = useLineHistory(!!id);
  const suggestions = useLineSuggestions(lineHistory.data, lists);
  const descriptions = useMemo(() => historySuggest(expenses.map((e) => ({ text: e.description, date: e.date }))).map((n) => ({ id: n, name: n })), [expenses]);

  const [draft, setDraft] = useState<InvoiceDraft>(() => blankInvoice('', false));
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [bad, setBad] = useState<InvoiceField[]>([]);
  const [dups, setDups] = useState<{ hits: DupHit[]; input: ExpenseInput } | null>(null);
  const [askDelete, setAskDelete] = useState(false);

  // Mở hóa đơn nào thì nạp form của hóa đơn đó (chờ dòng vật tư tải xong)
  useEffect(() => {
    if (!expense) { setLoadedFor(null); return; }
    if (loadedFor === expense.id || !linesQuery.data || linesQuery.isFetching) return;
    setDraft(expenseToDraft(expense, linesQuery.data, lists));
    setBad([]);
    setLoadedFor(expense.id);
  }, [expense, linesQuery.data, linesQuery.isFetching, loadedFor, lists]);

  const mine = !!expense && expense.created_by === access.profile.id;
  // Như RLS trong kho: Toàn quyền, hoặc Nhập + (dòng của mình / quyền sửa dòng người khác)
  const canEdit = hasLevel(access.permissions, 'expenses', 'full') || (hasLevel(access.permissions, 'expenses', 'add') && (mine || access.special.edit_others));
  // Công trình đã quyết toán không còn trong danh sách chọn, nhưng hóa đơn cũ của nó vẫn phải sửa được
  const projectItems = useMemo(() => {
    const cur = expense ? lists.projects.find((p) => p.id === expense.project_id) : undefined;
    return cur && !lists.projectOptions.some((p) => p.id === cur.id) ? [...lists.projectOptions, cur] : lists.projectOptions;
  }, [expense, lists]);

  const doSave = (input: ExpenseInput) => {
    if (!expense) return;
    update.mutate({ id: expense.id, input, knownUpdatedAt: expense.updated_at }, {
      onSuccess: (r) => {
        toast(r.overwritten ? 'Đã lưu. Lưu ý: hóa đơn này vừa được người khác sửa, bản của bạn đã ghi đè.' : `Đã lưu hóa đơn · ${formatMoney(input.amount)} đ`);
        setDups(null); onClose();
      },
      onError: (e) => { setDups(null); toast(`Chưa lưu được: ${e.message}`, 'error'); },
    });
  };
  const save = () => {
    if (!expense || update.isPending) return;
    const src = expense.source === 'quick' && draft.lines ? 'detail' : (expense.source as ExpenseInput['source']);
    const check = checkInvoice(draft, { ...lists, projects: projectItems }, src);
    if (!check.ok) { setBad(check.bad); toast(check.message, 'error'); return; }
    setBad([]);
    // Hóa đơn không có dòng vật tư: không gửi `lines` → dòng trong kho giữ nguyên
    const input = check.input;
    const hits = findDuplicates(
      [{ id: expense.id, date: input.date, projectId: input.projectId, typeId: input.typeId, buyerId: input.buyerId, supplierId: input.supplierId, amount: input.amount, description: input.description }],
      expenses.map(toDupCandidate),
    );
    if (hits.length) { setDups({ hits, input }); return; }
    doSave(input);
  };
  const doDelete = () => {
    if (!expense) return;
    remove.mutate(expense.id, {
      onSuccess: () => { toast('Đã xóa hóa đơn (nằm trong Thùng Rác, khôi phục được)'); setAskDelete(false); onClose(); },
      onError: (e) => { setAskDelete(false); toast(`Chưa xóa được: ${e.message}`, 'error'); },
    });
  };

  const ready = !!expense && loadedFor === expense.id;
  return (
    <>
      <Sheet
        open={!!expense} onOpenChange={(o) => { if (!o) onClose(); }} title="Sửa hóa đơn" wide={!!draft.lines && ready}
        footer={ready && canEdit ? (
          <>
            <Button variant="danger" onClick={() => setAskDelete(true)}><Icon name="delete" />Xóa</Button>
            <div className="flex-1" />
            <Button onClick={onClose}>Hủy</Button>
            <Button variant="primary" data-testid="edit-save" disabled={update.isPending} onClick={save}><Icon name="save" />{update.isPending ? 'Đang lưu…' : 'Lưu'}</Button>
          </>
        ) : undefined}
      >
        {!expense ? null : linesQuery.isError ? <ErrorState error={linesQuery.error} onRetry={() => void linesQuery.refetch()} />
          : !ready ? <LoadingState label="Đang mở hóa đơn…" />
          : (
            <>
              {canEdit ? null : <Note icon="lock">Hóa đơn do người khác nhập. Bạn chỉ xem được; cần quyền “Sửa / xóa dòng người khác nhập” để sửa.</Note>}
              {(() => {
                const path = photo?.id === expense.id ? photo.path : expense.receipt_image_path;
                return (
                  <>
                    <ReceiptPhoto key={path ?? ''} path={path} />
                    {canEdit ? (
                      <div><AttachReceiptButton date={expense.date} hasPhoto={!!path} label="Lưu ảnh hóa đơn" className="border border-line"
                        onAttach={async (p) => { await setImage.mutateAsync({ id: expense.id, path: p }); setPhoto({ id: expense.id, path: p }); }} /></div>
                    ) : null}
                  </>
                );
              })()}
              <fieldset disabled={!canEdit} className="m-0 grid min-w-0 gap-3 border-0 p-0">
                <InvoiceFields draft={draft} setDraft={setDraft} lists={lists} suggestions={suggestions} descriptions={descriptions} bad={bad} compact projectItems={projectItems} />
                {draft.lines ? null : canEdit ? (
                  <div><Button onClick={() => setDraft((d) => ({ ...d, lines: blankLines(3) }))}><Icon name="list_alt" />Thêm dòng vật tư (thành hóa đơn chi tiết)</Button></div>
                ) : null}
              </fieldset>
              <div className="text-[12px] text-muted">
                Tổng: <b className="num text-fg">{formatMoney(invoiceTotal(draft))} đ</b> · nhập lúc {isoToVn(expense.created_at.slice(0, 10))}
              </div>
            </>
          )}
      </Sheet>
      <DuplicateDialog hits={dups?.hits ?? null} lists={lists} busy={update.isPending} onCancel={() => setDups(null)} onConfirm={() => { if (dups) doSave(dups.input); }} />
      <ConfirmDialog
        open={askDelete} onOpenChange={setAskDelete} title="Xóa hóa đơn này?" danger confirmLabel="Xóa" busy={remove.isPending} onConfirm={doDelete}
        message={expense ? <>{isoToVn(expense.date)} · {lists.nameOf(expense.project_id)} · <b className="num">{formatMoney(expense.amount)} đ</b>. Hóa đơn sẽ vào Thùng Rác, khôi phục được.</> : ''}
      />
    </>
  );
}

/** Mở bảng sửa theo id (dùng ở Thống Kê CP/HĐ): tự tải danh mục + hóa đơn khi cần */
export function EditExpenseById({ id, onClose }: { id: string | null; onClose: () => void }) {
  return id ? <EditExpenseLoader id={id} onClose={onClose} /> : null;
}
function EditExpenseLoader({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast();
  const { query, lists } = useLists();
  const entries = useEntryExpenses();
  const expense = entries.data?.find((e) => e.id === id) ?? null;
  const failed = query.isError || entries.isError || (!!entries.data && !expense);
  useEffect(() => {
    if (!failed) return;
    toast('Không mở được hóa đơn để sửa (có thể vừa bị xóa). Tải lại trang rồi thử lại.', 'error');
    onClose();
  }, [failed, onClose, toast]);
  if (!lists || !entries.data || !expense) return null;
  return <EditExpenseSheet expense={expense} expenses={entries.data} lists={lists} onClose={onClose} />;
}
