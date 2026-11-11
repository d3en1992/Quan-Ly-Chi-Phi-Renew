// Phần dùng chung của các màn nhập chi phí: danh sách gợi ý (kèm mục vừa "Tạo mới"), đổi tên ↔ id, hộp cảnh báo trùng.
import { useCallback, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { todayIso } from '@/features/reports/shared';
import { useCreateLookup, useLookups, type CreatableKind, type EntryExpense, type EntryProject, type EntrySupplier, type Lookups, type Named } from './api';
import { findByName, isoToVn, type DupCandidate, type DupHit } from './logic';

export type Lists = {
  projects: EntryProject[];
  projectOptions: EntryProject[];
  types: Named[];
  buyers: Named[];
  suppliers: EntrySupplier[];
  units: Named[];
  nameOf: (id: string | null | undefined) => string;
  /** "+ Tạo mới": thêm vào danh mục, trả về tên đã chuẩn hóa ('' nếu lỗi — đã báo toast) */
  create: (kind: CreatableKind, text: string) => Promise<string>;
};

/** Danh sách gợi ý + mục vừa tạo trong phiên này (dùng được ngay, không chờ tải lại) */
export function useLists(): { query: ReturnType<typeof useLookups>; lists: Lists | null } {
  const query = useLookups();
  const toast = useToast();
  const createLookup = useCreateLookup();
  const [extra, setExtra] = useState<{ kind: CreatableKind; item: Named }[]>([]);
  const data: Lookups | undefined = query.data;

  const create = useCallback(async (kind: CreatableKind, text: string) => {
    try {
      const item = await createLookup.mutateAsync({ kind, rawName: text });
      setExtra((xs) => [...xs, { kind, item }]);
      toast(`Đã thêm “${item.name}” vào danh mục`);
      return item.name;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      return '';
    }
  }, [createLookup, toast]);

  const lists = useMemo<Lists | null>(() => {
    if (!data) return null;
    const merge = <T extends Named>(base: T[], kind: CreatableKind, make: (n: Named) => T) => {
      const have = new Set(base.map((b) => b.id));
      return [...base, ...extra.filter((x) => x.kind === kind && !have.has(x.item.id)).map((x) => make(x.item))];
    };
    const names = new Map(data.nameOf);
    for (const x of extra) names.set(x.item.id, x.item.name);
    return {
      projects: data.projects, projectOptions: data.projectOptions, units: data.units,
      types: merge(data.types, 'expense_type', (n) => n),
      buyers: merge(data.buyers, 'person', (n) => n),
      suppliers: merge(data.suppliers, 'supplier', (n) => ({ ...n, address: null, buys_on_credit: false, archived: false })),
      nameOf: (id) => (id ? names.get(id) ?? '' : ''),
      create,
    };
  }, [data, extra, create]);

  return { query, lists };
}

/** Hóa đơn đã lưu → dạng để so trùng */
export const toDupCandidate = (e: EntryExpense): DupCandidate => ({
  id: e.id, date: e.date, projectId: e.project_id, typeId: e.expense_type_id, buyerId: e.buyer_id, supplierId: e.supplier_id, amount: e.amount, description: e.description,
});

/** NCC đang bật "Mua nợ" → ô Đã TT tự bỏ tích */
export function defaultPaid(supplierText: string, suppliers: readonly EntrySupplier[]): boolean {
  return !findByName(supplierText, suppliers)?.buys_on_credit;
}

export const today = () => todayIso();

/** Hộp cảnh báo trùng (như `_showDupModal` app cũ): liệt kê, cho "Vẫn lưu" hoặc quay lại sửa */
export function DuplicateDialog({ hits, lists, busy, onCancel, onConfirm }: { hits: DupHit[] | null; lists: Lists; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const list = hits ?? [];
  return (
    <ConfirmDialog
      open={!!hits}
      onOpenChange={(o) => { if (!o) onCancel(); }}
      title={`Có ${list.length} hóa đơn có thể bị trùng`}
      confirmLabel="Vẫn lưu"
      busy={busy}
      onConfirm={onConfirm}
      message={
        <div className="grid max-h-[50vh] gap-2 overflow-auto" data-testid="dup-list">
          {list.slice(0, 6).map((h, i) => (
            <div key={i} className="rounded-lg border border-line bg-warn-soft px-3 py-2 text-[12.5px] text-fg">
              <div className="flex flex-wrap items-center gap-x-2">
                <b className="num">{isoToVn(h.incoming.date)}</b>
                <span className="min-w-0 truncate">{lists.nameOf(h.incoming.projectId)}</span>
                <b className="num ml-auto">{formatMoney(h.incoming.amount)} đ</b>
              </div>
              <div className="truncate">{h.incoming.description || '(không ghi nội dung)'}</div>
              <div className="mt-1 border-t border-dashed border-line pt-1 text-muted">
                {h.inForm ? 'Trùng với một dòng khác trong lần lưu này' : h.exact ? 'Trùng hoàn toàn với hóa đơn đã lưu' : `Giống ${Math.round(h.similarity * 100)}% hóa đơn đã lưu`}
                {h.inForm ? '' : `: ${h.existing.description || '(không ghi nội dung)'}`}
              </div>
            </div>
          ))}
          {list.length > 6 ? <div className="text-[12.5px]">… và {list.length - 6} hóa đơn khác</div> : null}
          <div>Bấm <b>Hủy</b> để quay lại sửa, hoặc <b>Vẫn lưu</b> nếu đây đúng là hóa đơn khác.</div>
        </div>
      }
    />
  );
}
