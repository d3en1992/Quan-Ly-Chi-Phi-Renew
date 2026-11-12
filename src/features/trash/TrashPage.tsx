// Tab THÙNG RÁC (PAGES.thungrac / MP.thungrac): subtab theo loại dữ liệu; Khôi phục; Xóa hẳn theo quyền `purge_trash`.
import { useMemo, useState } from 'react';
import { useAccess, type MyAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { FilterBar, MobileCard, MobileRow, Pager, SearchBox, usePaged } from '@/components/ui/data';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, Pill, SubTabs } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatMoney } from '@/lib/format';
import { matchesSearch } from '@/features/reports/shared';
import { TRASH_TABS, usePurgeTrash, useRestoreTrash, useTrash, type TrashRow, type TrashTab } from './api';

/** Khôi phục: Toàn quyền ở mục của bảng, hoặc Nhập + (dòng của mình / quyền sửa dòng người khác) — đúng RLS */
const canRestore = (a: MyAccess, r: TrashRow) => r.modules.some((m) => a.permissions[m] === 'full' || (a.permissions[m] === 'add' && (r.createdBy === a.profile.id || a.special.edit_others)));
const canPurge = (a: MyAccess, r: TrashRow) => a.special.purge_trash && r.modules.some((m) => a.permissions[m] === 'full');

export function TrashPage() {
  const phone = useLayoutMode() === 'phone';
  const access = useAccess();
  const toast = useToast();
  const query = useTrash();
  const restore = useRestoreTrash(), purge = usePurgeTrash();
  const [tab, setTab] = useState<TrashTab>('all');
  const [q, setQ] = useState('');
  const [ask, setAsk] = useState<{ rows: TrashRow[]; all: boolean } | null>(null);
  const all = query.data;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all?.length ?? 0 };
    for (const r of all ?? []) c[r.tab] = (c[r.tab] ?? 0) + 1;
    return c;
  }, [all]);
  const rows = useMemo(() => (all ?? []).filter((r) => (tab === 'all' || r.tab === tab) && matchesSearch(q, r.type, r.content, r.project, r.deletedBy)), [all, tab, q]);
  const paged = usePaged(rows, 50, `${tab}|${q}`);

  if (query.isLoading) return <LoadingState />;
  if (query.error || !all) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const doRestore = (r: TrashRow) => restore.mutate(r, {
    onSuccess: () => toast(`Đã khôi phục: ${r.type} — ${r.content || r.project}`),
    onError: (e) => toast(`Chưa khôi phục được: ${e.message}`, 'error'),
  });
  const doPurge = () => {
    if (!ask) return;
    purge.mutate(ask.rows, {
      onSuccess: (res) => { setAsk(null); toast(res.firstError ? `Đã xóa vĩnh viễn ${res.done} mục; còn mục chưa xóa được: ${res.firstError}` : `Đã xóa vĩnh viễn ${res.done} mục`, res.firstError ? 'error' : undefined); },
      onError: (e) => { setAsk(null); toast(`Chưa xóa được: ${e.message}`, 'error'); },
    });
  };
  const purgeable = rows.filter((r) => canPurge(access, r));
  const busyKey = restore.isPending ? `${restore.variables?.table}:${restore.variables?.id}` : '';
  const tabs = TRASH_TABS.map((t) => ({ key: t.key, label: counts[t.key] ? `${t.label} (${counts[t.key]})` : t.label }));
  const buttons = (r: TrashRow) => (
    <>
      {canRestore(access, r) ? <Button size="sm" data-testid="trash-restore" disabled={busyKey === r.key} onClick={() => doRestore(r)}><Icon name="restore" />Khôi phục</Button> : null}
      {canPurge(access, r) ? <Button size="sm" variant="ghost-danger" data-testid="trash-purge" onClick={() => setAsk({ rows: [r], all: false })}>Xóa hẳn</Button> : null}
    </>
  );
  const dialog = (
    <ConfirmDialog open={!!ask} onOpenChange={(o) => { if (!o) setAsk(null); }} danger busy={purge.isPending} confirmLabel="Xóa vĩnh viễn"
      title={ask?.all ? `Xóa vĩnh viễn ${ask.rows.length} mục đang hiện?` : 'Xóa vĩnh viễn?'}
      message={ask?.all
        ? <>Xóa hẳn <b>{ask.rows.length}</b> mục trong thẻ đang xem. <b>Không khôi phục lại được.</b></>
        : <>Xóa hẳn <b>{ask?.rows[0]?.type}</b> — {ask?.rows[0]?.content}. <b>Không khôi phục lại được.</b></>}
      onConfirm={doPurge} />
  );
  const empty = <Card><EmptyState icon="delete" title={all.length === 0 ? 'Thùng rác trống' : 'Không có mục nào khớp'}>Dữ liệu bị xóa ở các tab sẽ nằm ở đây, khôi phục được.</EmptyState></Card>;

  if (phone) {
    return (
      <>
        <div className="text-[12.5px] text-muted" data-testid="trash-count">{all.length} mục</div>
        <SearchBox value={q} onChange={setQ} placeholder="Tìm nội dung, công trình…" />
        {rows.length === 0 ? empty : (
          <div className="grid gap-2">
            {paged.slice.map((r) => (
              <MobileCard key={r.key}>
                <MobileRow><b className="min-w-0 truncate">{r.content || r.project}</b>{r.amount !== null ? <b className="num">{formatMoney(r.amount)}</b> : null}</MobileRow>
                <MobileRow meta><span className="min-w-0 truncate"><Pill tone="neutral">{r.type}</Pill> {r.project}</span><span className="num shrink-0">{formatDate(r.deletedAt.slice(0, 10))}</span></MobileRow>
                <div className="flex gap-1.5">{buttons(r)}</div>
              </MobileCard>
            ))}
          </div>
        )}
        <Pager {...paged} />
        {dialog}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Thùng Rác" sub="Dữ liệu đã xóa, khôi phục được"
        actions={purgeable.length > 0 ? <Button variant="danger" data-testid="trash-empty" onClick={() => setAsk({ rows: purgeable, all: true })}><Icon name="delete_forever" />Xóa hẳn {purgeable.length} mục đang hiện</Button> : null} />
      <SubTabs tabs={tabs} value={tab} onChange={setTab} />
      <FilterBar><SearchBox value={q} onChange={setQ} placeholder="Tìm nội dung, công trình, người xóa…" className="min-w-[240px] flex-1" /></FilterBar>
      {rows.length === 0 ? empty : (
        <Card>
          <div className="tbl" data-testid="trash-table">
            <table>
              <thead><tr><th>Loại</th><th>Nội dung</th><th>Công trình</th><th className="!text-right">Số tiền</th><th>Người xóa</th><th>Ngày xóa</th><th /></tr></thead>
              <tbody>
                {paged.slice.map((r) => (
                  <tr key={r.key} data-trash={r.key}>
                    <td className="whitespace-nowrap"><Pill tone="neutral">{r.type}</Pill></td>
                    <td>{r.content}</td>
                    <td className="whitespace-nowrap">{r.project}</td>
                    <td className="num text-right">{r.amount !== null ? formatMoney(r.amount) : ''}</td>
                    <td>{r.deletedBy}</td>
                    <td className="num">{formatDate(r.deletedAt.slice(0, 10))}</td>
                    <td className="text-right whitespace-nowrap"><span className="inline-flex gap-1">{buttons(r)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...paged} />
        </Card>
      )}
      {dialog}
    </>
  );
}
