// Tab DANH MỤC & SAO LƯU: danh sách dùng chung khi nhập liệu, thông tin công ty, sao lưu / khôi phục.
import { ExportButton } from '@/features/export/ExportButton';
import { useEffect, useRef, useState } from 'react';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { SearchBox } from '@/components/ui/data';
import { Field, Input } from '@/components/ui/input';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, Note, PageHeader, Pill, SubTabs } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { matchesSearch } from '@/features/reports/shared';
import {
  CATALOG_GROUPS, downloadBackup, downloadSnapshot, useAddCatalogItem, useBackups, useCatalogCounts, useCatalogGroup, useCreateBackup, useDeleteBackup,
  useDeleteCatalogItem, useImportUnits, useRenameCatalogItem, useRestore, useUpdateCompany, type BackupRow, type CatalogKind,
} from './api';

type Tab = 'catalog' | 'company';
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (iso: string) => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mb = (bytes: number) => `${(bytes / 1_048_576).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
const KIND_LABEL: Record<string, string> = { manual: 'Thủ công', nightly: 'Tự động', before_restore: 'Trước khi khôi phục' };

export function CatalogPage() {
  const access = useAccess();
  const mode = useLayoutMode();
  const [tab, setTab] = useState<Tab>('catalog');
  return (
    <>
      {mode !== 'phone' ? <PageHeader title="Danh Mục & Sao Lưu" sub="Danh sách dùng chung khi nhập liệu, thông tin công ty, sao lưu" actions={<ExportButton datasets={['catalog_items']} year={null} />} /> : null}
      <SubTabs<Tab> tabs={[{ key: 'catalog', label: 'DANH MỤC' }, { key: 'company', label: 'CÔNG TY & SAO LƯU' }]} value={tab} onChange={setTab} />
      {tab === 'catalog' ? <CatalogTab canEdit={hasLevel(access.permissions, 'catalog', 'add')} /> : <CompanyTab isAdmin={access.role.is_admin} />}
    </>
  );
}

function CatalogTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const mode = useLayoutMode();
  const [kind, setKind] = useState<CatalogKind>('expense_type');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string; used: number } | null>(null);
  const q = useCatalogGroup(kind);
  const add = useAddCatalogItem(kind);
  const rename = useRenameCatalogItem(kind);
  const del = useDeleteCatalogItem(kind);
  const importUnits = useImportUnits();
  const group = CATALOG_GROUPS.find((g) => g.kind === kind)!;

  // Số mục của mọi nhóm (cột trái)
  const countsQ = useCatalogCounts();
  const counts = (countsQ.data ?? {}) as Partial<Record<CatalogKind, number>>;

  const submitAdd = async () => {
    try { const n = await add.mutateAsync(newName); toast(`Đã thêm "${n}"`); setNewName(''); setAdding(false); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const submitRename = async () => {
    if (!renaming) return;
    try { const n = await rename.mutateAsync(renaming); toast(`Đã đổi tên thành "${n}" — mọi nơi hiện tên mới`); setRenaming(null); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const submitDelete = async () => {
    if (!deleting) return;
    try { await del.mutateAsync({ id: deleting.id, used: deleting.used }); toast(`Đã xóa "${deleting.name}"`); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
    setDeleting(null);
  };

  const rows = (q.data?.rows ?? []).filter((r) => matchesSearch(search, r.name));

  const groupList = (
    <Card className="p-1.5">
      {CATALOG_GROUPS.map((g) => (
        <button key={g.kind} type="button" aria-current={kind === g.kind ? 'page' : undefined} onClick={() => { setKind(g.kind); setSearch(''); }}
          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-surface-2 aria-[current=page]:bg-accent-soft aria-[current=page]:font-semibold aria-[current=page]:text-accent">
          <span>{g.label}</span><span className="num text-muted">{counts[g.kind] ?? '…'}</span>
        </button>
      ))}
      <div className="px-2.5 py-2 text-[12px] text-muted">Khách hàng, công nhân, nhà cung cấp, thầu phụ đã chuyển sang tab <b>Danh Bạ</b>.</div>
    </Card>
  );

  return (
    <div className={mode === 'phone' ? 'grid gap-3' : 'grid grid-cols-[240px_minmax(0,1fr)] items-start gap-3.5'}>
      {groupList}
      <Card>
        <CardHeader title={group.label} sub={`${q.data?.rows.length ?? 0} mục · ${group.hint}`}
          actions={<>
            <SearchBox value={search} onChange={setSearch} placeholder="Tìm…" className="!min-w-[140px]" />
            {canEdit && kind === 'unit' ? <Button disabled={importUnits.isPending} onClick={() => void importUnits.mutateAsync().then((n) => toast(n ? `Đã nạp ${n} đơn vị tính` : 'Không có đơn vị tính mới'), (e: Error) => toast(e.message, 'error'))}><Icon name="download" />Nạp từ dữ liệu đã nhập</Button> : null}
            {canEdit ? <Button variant="primary" onClick={() => { setAdding(true); setNewName(''); }}><Icon name="add" />Thêm</Button> : null}
          </>} />
        {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          : rows.length === 0 ? <EmptyState icon="tune" title={q.data.rows.length === 0 ? 'Danh mục này chưa có mục nào' : 'Không có mục nào khớp'} />
          : (
            <div className="tbl">
              <table data-testid="catalog-table">
                <thead><tr><th>Tên</th>{kind !== 'template' ? <th className="!text-right">Đang dùng</th> : null}<th>Cập nhật</th>{canEdit ? <th /> : null}</tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const used = q.data.usage.get(r.id) ?? 0;
                    return (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        {kind !== 'template' ? <td className="num text-right">{used ? `${used.toLocaleString('vi-VN')} khoản` : <span className="text-faint">—</span>}</td> : null}
                        <td className="num text-muted">{formatDate(r.updated_at)}</td>
                        {canEdit ? (
                          <td className="text-right whitespace-nowrap">
                            <Button size="sm" variant="ghost" onClick={() => setRenaming({ id: r.id, name: r.name })}><Icon name="edit" />Đổi tên</Button>
                            <Button size="sm" variant="ghost-danger" aria-label={`Xóa ${r.name}`} onClick={() => setDeleting({ id: r.id, name: r.name, used })}><Icon name="delete" /></Button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Sheet open={adding} onOpenChange={setAdding} title={`Thêm vào "${group.label}"`}
        footer={<><Button variant="primary" className="flex-1" disabled={add.isPending || !newName.trim()} onClick={() => void submitAdd()}>Thêm</Button><Button onClick={() => setAdding(false)}>Hủy</Button></>}>
        <Field label="Tên mới" hint={group.hint}><Input aria-label="Tên mới" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submitAdd(); }} /></Field>
      </Sheet>
      <Sheet open={!!renaming} onOpenChange={(o) => { if (!o) setRenaming(null); }} title="Đổi tên"
        footer={<><Button variant="primary" className="flex-1" disabled={rename.isPending || !renaming?.name.trim()} onClick={() => void submitRename()}>Lưu</Button><Button onClick={() => setRenaming(null)}>Hủy</Button></>}>
        <Field label="Tên mới" hint="Đổi một chỗ, mọi hóa đơn / thiết bị đang dùng tên này đều hiện tên mới."><Input aria-label="Tên mới" autoFocus value={renaming?.name ?? ''} onChange={(e) => setRenaming(renaming && { ...renaming, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void submitRename(); }} /></Field>
      </Sheet>
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }} title="Xóa mục khỏi danh mục?" danger confirmLabel="Xóa" busy={del.isPending}
        message={deleting?.used ? <>"{deleting.name}" đang dùng trong {deleting.used} khoản nên không xóa được. Hãy đổi tên nếu muốn sửa.</> : <>Xóa <b>{deleting?.name}</b>? Mục bị xóa vào Thùng Rác, khôi phục được.</>}
        onConfirm={() => void submitDelete()} />
    </div>
  );
}

function CompanyTab({ isAdmin }: { isAdmin: boolean }) {
  const access = useAccess();
  const toast = useToast();
  const update = useUpdateCompany();
  const [name, setName] = useState(access.company.name);
  const [short, setShort] = useState(access.company.short_name ?? '');
  const [logo, setLogo] = useState<string | null>(access.company.logo_url ?? null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { setName(access.company.name); setShort(access.company.short_name ?? ''); setLogo(access.company.logo_url ?? null); }, [access.company.name, access.company.short_name, access.company.logo_url]);

  const pickLogo = (f: File | undefined) => {
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      setLogo(canvas.toDataURL('image/png'));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => toast('Không đọc được ảnh', 'error');
    img.src = url;
  };
  const save = async () => {
    try { await update.mutateAsync({ id: access.company.id, patch: { name: name.trim(), short_name: short.trim() || null, logo_url: logo } }); toast('Đã lưu thông tin công ty'); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };

  return (
    <div className="grid items-start gap-3.5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Thông tin công ty" />
        <div className="grid gap-3 p-4">
          <Field label="Tên công ty"><Input aria-label="Tên công ty" value={name} disabled={!isAdmin} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Tên ngắn trên menu"><Input aria-label="Tên ngắn trên menu" value={short} disabled={!isAdmin} onChange={(e) => setShort(e.target.value)} /></Field>
          <Field label="Logo">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center overflow-hidden rounded-lg bg-accent text-accent-fg">{logo ? <img src={logo} alt="Logo công ty" className="size-full object-cover" /> : <Icon name="foundation" />}</div>
              {isAdmin ? <>
                <input ref={file} type="file" accept="image/*" className="hidden" aria-label="Chọn ảnh logo" onChange={(e) => pickLogo(e.target.files?.[0])} />
                <Button onClick={() => file.current?.click()}><Icon name="image" />Đổi ảnh</Button>
                {logo ? <Button variant="ghost" onClick={() => setLogo(null)}>Bỏ logo</Button> : null}
              </> : null}
            </div>
          </Field>
          {isAdmin ? <div><Button variant="primary" disabled={update.isPending || !name.trim()} onClick={() => void save()}>Lưu</Button></div> : <Note>Chỉ Admin sửa được thông tin công ty.</Note>}
        </div>
      </Card>
      <BackupCard isAdmin={isAdmin} />
    </div>
  );
}

function BackupCard({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const q = useBackups();
  const create = useCreateBackup();
  const delBackup = useDeleteBackup();
  const restore = useRestore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);

  const askRestoreBackup = (b: BackupRow) => setConfirm({ label: `bản sao lưu ${stamp(b.created_at)}`, run: () => restore.mutateAsync({ backupId: b.id }) });
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as unknown;
      setConfirm({ label: `file ${f.name}`, run: () => restore.mutateAsync({ data }) });
    } catch { toast('File không phải JSON hợp lệ', 'error'); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try { await confirm.run(); toast('Đã khôi phục. Bản dữ liệu trước đó được tự lưu trong danh sách sao lưu.'); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
    setBusy(false); setConfirm(null);
  };
  const doDownload = async () => {
    setBusy(true);
    try { const r = await downloadSnapshot(); toast(`Đã tải ${r.name}`); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader title="Sao lưu" sub="tự động mỗi đêm khi bật (xem scripts/backup-nightly.ts), giữ 30 bản"
        actions={isAdmin ? <Button variant="primary" disabled={create.isPending} onClick={() => void create.mutateAsync(undefined).then(() => toast('Đã lưu bản sao lưu'), (e: Error) => toast(e.message, 'error'))}><Icon name="backup" />Sao lưu ngay</Button> : null} />
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        : q.data.length === 0 ? <EmptyState icon="backup" title="Chưa có bản sao lưu nào">{isAdmin ? 'Bấm "Sao lưu ngay" để lưu một bản trong kho.' : null}</EmptyState>
        : (
          <div className="tbl">
            <table data-testid="backup-table">
              <tbody>
                {q.data.map((b) => (
                  <tr key={b.id}>
                    <td className="num whitespace-nowrap">{stamp(b.created_at)}</td>
                    <td><Pill tone={b.kind === 'nightly' ? 'accent' : b.kind === 'before_restore' ? 'warn' : 'neutral'}>{KIND_LABEL[b.kind] ?? b.kind}</Pill></td>
                    <td className="text-muted">{mb(b.size_bytes)}</td>
                    <td className="text-right whitespace-nowrap">
                      {isAdmin ? (<>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void downloadBackup(b.id).then((r) => toast(`Đã tải ${r.name}`), (e: Error) => toast(e.message, 'error'))}><Icon name="download" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => askRestoreBackup(b)}>Khôi phục</Button>
                        <Button size="sm" variant="ghost-danger" aria-label="Xóa bản sao lưu" onClick={() => void delBackup.mutateAsync(b.id).then(() => toast('Đã xóa bản sao lưu'), (e: Error) => toast(e.message, 'error'))}><Icon name="delete" /></Button>
                      </>) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {isAdmin ? (
        <div className="flex flex-wrap gap-2 border-t border-line-soft p-4">
          <Button disabled={busy} onClick={() => void doDownload()}><Icon name="download" />Tải bản sao lưu JSON</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Chọn file sao lưu" onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="upload_file" />Khôi phục từ file…</Button>
        </div>
      ) : <div className="border-t border-line-soft p-4"><Note>Chỉ Admin tải và khôi phục được bản sao lưu.</Note></div>}
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }} title="Khôi phục dữ liệu?" danger confirmLabel="Khôi phục" busy={busy}
        message={<>Thay TOÀN BỘ dữ liệu hiện tại (công trình, hóa đơn, chấm công, chi trả, thu…) bằng <b>{confirm?.label}</b>. App tự lưu một bản dữ liệu hiện tại trước khi khôi phục để quay lại được. Tài khoản và quyền không đổi.</>}
        onConfirm={() => void runConfirm()} />
    </Card>
  );
}
