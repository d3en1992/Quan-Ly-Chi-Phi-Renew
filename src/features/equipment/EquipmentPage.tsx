// Tab THEO DÕI TB (PAGES.thietbi / MP.thietbi): thiết bị Tại công trình (gom theo công trình) · Kho thiết bị · Kho giàn giáo.
// Một ô tìm chung không dấu (tên thiết bị, công trình / kho, thông tin máy, Người TH). Thêm, luân chuyển, sửa, xóa (chỉ trong kho — như app cũ).
import { ExportButton } from '@/features/export/ExportButton';
import { useMemo, useState } from 'react';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { ConfirmDialog } from '@/components/ui/confirm';
import { FilterBar, FilterSelect, KpiStrip, MobileCard, MobileRow, SearchBox } from '@/components/ui/data';
import { Field, Input, Select } from '@/components/ui/input';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, Note, PageHeader, Pill } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { canEditRow } from '@/features/payments/shared';
import { matchesSearch, normalizeText, todayIso } from '@/features/reports/shared';
import {
  CONDITION, CONDITION_OPTS, useCreateEquipmentName, useDeleteEquipment, useEditEquipment, useEquipData, useSaveEquipment, useTransferEquipment,
  WAREHOUSE, type EquipCondition, type EquipData, type Equipment,
} from './api';

const qty = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const sumQty = (rows: Equipment[]) => rows.reduce((s, r) => s + r.quantity, 0);
const CondPill = ({ c }: { c: EquipCondition }) => <Pill tone={CONDITION[c].tone}>{CONDITION[c].label}</Pill>;

type AddRow = { name: string; quantity: string; condition: EquipCondition; note: string };
const blankRow = (): AddRow => ({ name: '', quantity: '1', condition: 'working', note: '' });

function PlaceSelect({ data, value, onChange, exclude, label }: { data: EquipData; value: string; onChange: (v: string) => void; exclude?: string; label: string }) {
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Chọn công trình / kho —</option>
      {(['warehouse', 'scaffold'] as const).filter((k) => k !== exclude).map((k) => <option key={k} value={k}>{WAREHOUSE[k]}</option>)}
      {data.projects.filter((p) => p.status !== 'closed' || p.id === value).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </Select>
  );
}

/** Bảng trượt THÊM thiết bị: 1 nơi + ngày + nhiều dòng */
function AddSheet({ data, open, onClose }: { data: EquipData; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveEquipment(), createName = useCreateEquipmentName();
  const [place, setPlace] = useState('');
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<AddRow[]>([blankRow(), blankRow(), blankRow()]);
  const setRow = (i: number, patch: Partial<AddRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const submit = () => {
    const used = rows.filter((r) => r.name.trim() || r.note.trim());
    const out = [];
    for (const r of used) {
      const item = data.names.find((n) => normalizeText(n.name) === normalizeText(r.name));
      if (!item) { toast(`"${r.name || '(trống)'}" không có trong danh mục tên thiết bị — chọn trong gợi ý hoặc bấm "+ Tạo mới".`, 'error'); return; }
      const q = parseFloat(r.quantity.replace(',', '.'));
      if (!(q > 0)) { toast(`Số lượng của "${item.name}" phải lớn hơn 0.`, 'error'); return; }
      out.push({ nameId: item.id, quantity: q, condition: r.condition, note: r.note });
    }
    save.mutate({ place, date, rows: out }, {
      onSuccess: () => { toast(`Đã lưu ${out.length} thiết bị`); setRows([blankRow(), blankRow(), blankRow()]); onClose(); },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="Thêm thiết bị" wide
      footer={<><Button onClick={onClose}>Hủy</Button><Button variant="primary" data-testid="tb-save" disabled={save.isPending} onClick={submit}><Icon name="save" />{save.isPending ? 'Đang lưu…' : 'Lưu thiết bị'}</Button></>}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Công trình / Kho *"><PlaceSelect data={data} value={place} onChange={setPlace} label="Nơi đặt thiết bị" /></Field>
          <Field label="Ngày"><Input type="date" aria-label="Ngày" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <div className="grid gap-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_72px] gap-2 rounded-lg border border-line-soft p-2 sm:grid-cols-[minmax(0,1.4fr)_72px_150px_minmax(0,1fr)_34px] sm:border-0 sm:p-0">
              <Combo aria-label={`Tên thiết bị dòng ${i + 1}`} placeholder="Tên thiết bị" value={r.name} onChange={(v) => setRow(i, { name: v })} items={data.names} groupLabel="Tên thiết bị"
                onCreate={async (text) => { try { return (await createName.mutateAsync(text)).name; } catch (e) { toast(`Chưa tạo được: ${(e as Error).message}`, 'error'); } }} />
              <Input aria-label={`Số lượng dòng ${i + 1}`} inputMode="decimal" className="num text-right" value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} />
              <Select aria-label={`Tình trạng dòng ${i + 1}`} value={r.condition} onChange={(e) => setRow(i, { condition: e.target.value as EquipCondition })}>
                {CONDITION_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <Input aria-label={`Thông tin máy dòng ${i + 1}`} placeholder="Thông tin máy" value={r.note} onChange={(e) => setRow(i, { note: e.target.value })} />
              <Button variant="ghost" size="icon" aria-label={`Bỏ dòng ${i + 1}`} className="hidden sm:inline-flex" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [blankRow()]))}><Icon name="close" /></Button>
            </div>
          ))}
        </div>
        <div><Button size="sm" onClick={() => setRows((rs) => [...rs, blankRow()])}><Icon name="add" />Thêm dòng</Button></div>
        <Note>Cùng nơi đã có dòng trùng Tên + Tình trạng + Thông tin máy thì số lượng được cộng vào dòng đó.</Note>
      </div>
    </Sheet>
  );
}

/** Bảng trượt của 1 dòng: Luân chuyển · Sửa · Xóa (chỉ trong kho) */
function RowSheet({ data, row, canEdit, onClose }: { data: EquipData; row: Equipment; canEdit: boolean; onClose: () => void }) {
  const toast = useToast();
  const transfer = useTransferEquipment(), edit = useEditEquipment(), del = useDeleteEquipment();
  const [mode, setMode] = useState<'transfer' | 'edit'>('transfer');
  const [place, setPlace] = useState('');
  const [moveQty, setMoveQty] = useState(String(row.quantity));
  const [date, setDate] = useState(todayIso());
  const [quantity, setQuantity] = useState(String(row.quantity));
  const [condition, setCondition] = useState<EquipCondition>(row.condition);
  const [note, setNote] = useState(row.note ?? '');
  const [confirmDel, setConfirmDel] = useState(false);
  const inWarehouse = row.location !== 'project';
  const from = data.placeName(row);
  const num = (s: string) => parseFloat(s.replace(',', '.'));
  const doTransfer = () => {
    const q = num(moveQty);
    if (!place) { toast('Chọn nơi chuyển đến!', 'error'); return; }
    if (!(q > 0) || q > row.quantity) { toast(`Số lượng chuyển phải từ 1 đến ${qty(row.quantity)}.`, 'error'); return; }
    transfer.mutate({ id: row.id, place, quantity: q, condition, date, note }, {
      onSuccess: () => { toast(`Đã chuyển ${qty(q)} ${data.nameOf(row.name_id)}`); onClose(); },
      onError: (e) => toast(`Chưa chuyển được: ${e.message}`, 'error'),
    });
  };
  const doEdit = () => {
    const q = num(quantity);
    if (!(q > 0)) { toast('Số lượng phải lớn hơn 0 — muốn bỏ thiết bị khỏi kho thì dùng nút Xóa.', 'error'); return; }
    edit.mutate({ id: row.id, quantity: q, condition, note }, {
      onSuccess: (r) => { toast(r.merged ? 'Đã cập nhật — gộp vào dòng trùng thiết bị' : 'Đã cập nhật'); onClose(); },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };
  const busy = transfer.isPending || edit.isPending;
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }} title={data.nameOf(row.name_id)}
      footer={canEdit ? (
        <>
          {inWarehouse ? <Button variant="ghost-danger" onClick={() => setConfirmDel(true)}><Icon name="delete" />Xóa</Button> : null}
          <div className="flex-1" />
          <Button onClick={onClose}>Đóng</Button>
          {mode === 'transfer'
            ? <Button variant="primary" data-testid="tb-transfer-save" disabled={busy} onClick={doTransfer}><Icon name="swap_horiz" />Xác nhận chuyển</Button>
            : <Button variant="primary" data-testid="tb-edit-save" disabled={busy} onClick={doEdit}><Icon name="save" />Lưu</Button>}
        </>
      ) : <Button onClick={onClose}>Đóng</Button>}>
      <div className="grid gap-3">
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
          <span className="text-muted">Đang ở:</span> <b>{from}</b> · <span className="text-muted">SL:</span> <b className="num">{qty(row.quantity)}</b>
          {row.date ? <> · <span className="text-muted">ngày</span> {formatDate(row.date)}</> : null}
          {data.userName(row.created_by) ? <> · <span className="text-muted">Người TH</span> {data.userName(row.created_by)}</> : null}
        </div>
        {!canEdit ? <Note icon="lock">Bạn chỉ được xem dòng này (dòng do người khác nhập hoặc chưa có quyền Nhập).</Note> : (
          <>
            <div className="flex gap-1">
              <Button size="sm" variant={mode === 'transfer' ? 'primary' : 'default'} onClick={() => setMode('transfer')}><Icon name="swap_horiz" />Luân chuyển</Button>
              <Button size="sm" variant={mode === 'edit' ? 'primary' : 'default'} data-testid="tb-mode-edit" onClick={() => setMode('edit')}><Icon name="edit" />Sửa tại chỗ</Button>
            </div>
            {mode === 'transfer' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Chuyển đến Công trình / Kho *" className="col-span-2"><PlaceSelect data={data} value={place} onChange={setPlace} exclude={inWarehouse ? row.location : undefined} label="Nơi chuyển đến" /></Field>
                <Field label={`Số lượng chuyển (tối đa ${qty(row.quantity)})`}><Input aria-label="Số lượng chuyển" inputMode="decimal" className="num text-right" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} /></Field>
                <Field label="Tình trạng"><Select aria-label="Tình trạng" value={condition} onChange={(e) => setCondition(e.target.value as EquipCondition)}>{CONDITION_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
                <Field label="Ngày luân chuyển"><Input type="date" aria-label="Ngày luân chuyển" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                <Field label="Thông tin máy"><Input aria-label="Thông tin máy" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                <div className="col-span-2"><Note>Phần còn lại (SL cũ − SL chuyển) giữ lại tại {from}.</Note></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Số lượng"><Input aria-label="Số lượng" inputMode="decimal" className="num text-right" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
                <Field label="Tình trạng"><Select aria-label="Tình trạng" value={condition} onChange={(e) => setCondition(e.target.value as EquipCondition)}>{CONDITION_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
                <Field label="Thông tin máy" className="col-span-2"><Input aria-label="Thông tin máy" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                {!inWarehouse ? <div className="col-span-2"><Note>Thiết bị ở công trình không xóa được — hết dùng thì luân chuyển về kho.</Note></div> : null}
              </div>
            )}
          </>
        )}
      </div>
      <ConfirmDialog open={confirmDel} onOpenChange={setConfirmDel} title="Xóa thiết bị?" danger busy={del.isPending} confirmLabel="Xóa"
        message={<>Xóa {qty(row.quantity)} {data.nameOf(row.name_id)} khỏi {from}. Dòng này vào Thùng Rác, khôi phục được.</>}
        onConfirm={() => del.mutate(row.id, { onSuccess: () => { toast('Đã xóa thiết bị (vào Thùng Rác)'); onClose(); }, onError: (e) => { setConfirmDel(false); toast(`Chưa xóa được: ${e.message}`, 'error'); } })} />
    </Sheet>
  );
}

export function EquipmentPage() {
  const phone = useLayoutMode() === 'phone';
  const access = useAccess();
  const canAdd = hasLevel(access.permissions, 'equipment', 'add');
  const query = useEquipData();
  const data = query.data;
  const [q, setQ] = useState('');
  const [cond, setCond] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickTransfer, setPickTransfer] = useState(false);

  const view = useMemo(() => {
    if (!data) return null;
    const shown = data.rows.filter((r) => (!cond || r.condition === cond) && matchesSearch(q, data.nameOf(r.name_id), data.placeName(r), r.note, data.userName(r.created_by)));
    const byName = (a: Equipment, b: Equipment) => data.nameOf(a.name_id).localeCompare(data.nameOf(b.name_id), 'vi');
    const site = shown.filter((r) => r.location === 'project').sort((a, b) => data.projectName(a.project_id).localeCompare(data.projectName(b.project_id), 'vi') || byName(a, b));
    const stock = shown.filter((r) => r.location !== 'project').sort((a, b) => a.location.localeCompare(b.location) * -1 || byName(a, b));
    const groups: { projectId: string; rows: Equipment[] }[] = [];
    for (const r of site) {
      const g = groups[groups.length - 1];
      if (g && g.projectId === r.project_id) g.rows.push(r); else groups.push({ projectId: r.project_id!, rows: [r] });
    }
    const all = data.rows;
    return {
      site, stock, groups,
      kpi: {
        site: sumQty(all.filter((r) => r.location === 'project')), warehouse: sumQty(all.filter((r) => r.location === 'warehouse')),
        scaffold: sumQty(all.filter((r) => r.location === 'scaffold')), broken: sumQty(all.filter((r) => r.condition !== 'working')),
      },
    };
  }, [data, q, cond]);

  if (query.isLoading) return <LoadingState />;
  if (query.error || !data || !view) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const openRow = openId ? data.rows.find((r) => r.id === openId) : undefined;
  const filtered = !!q.trim() || !!cond;
  const actions = canAdd ? (
    <>
      <Button data-testid="tb-transfer" onClick={() => setPickTransfer(true)}><Icon name="swap_horiz" />Chuyển thiết bị</Button>
      <Button variant="primary" data-testid="tb-add" onClick={() => setAdding(true)}><Icon name="add" />Thêm thiết bị</Button>
    </>
  ) : null;
  const sheets = (
    <>
      {adding ? <AddSheet data={data} open onClose={() => setAdding(false)} /> : null}
      {openRow ? <RowSheet key={openRow.id} data={data} row={openRow} canEdit={canEditRow(access, 'equipment', openRow.created_by)} onClose={() => setOpenId(null)} /> : null}
      <Sheet open={pickTransfer} onOpenChange={setPickTransfer} title="Chuyển thiết bị — chọn dòng cần chuyển">
        <div className="grid gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Tìm tên thiết bị, công trình, kho…" />
          {[...view.site, ...view.stock].slice(0, 60).map((r) => (
            <MobileCard key={r.id} onClick={() => { setPickTransfer(false); setOpenId(r.id); }}>
              <MobileRow><b className="truncate">{data.nameOf(r.name_id)}</b><span className="num">× {qty(r.quantity)}</span></MobileRow>
              <MobileRow meta><span className="truncate">{data.placeName(r)}{r.note ? ` · ${r.note}` : ''}</span><CondPill c={r.condition} /></MobileRow>
            </MobileCard>
          ))}
          {view.site.length + view.stock.length === 0 ? <EmptyState icon="build" title="Không có thiết bị khớp" /> : null}
        </div>
      </Sheet>
    </>
  );

  if (phone) {
    const list = [...view.site, ...view.stock];
    return (
      <>
        <div className="text-[12.5px] text-muted" data-testid="tb-phone-sub">{qty(view.kpi.site)} tại CT · {qty(view.kpi.warehouse + view.kpi.scaffold)} trong kho</div>
        <SearchBox value={q} onChange={setQ} placeholder="Tìm thiết bị, công trình…" />
        {list.length === 0 ? <Card><EmptyState icon="build" title={filtered ? 'Không có thiết bị khớp' : 'Chưa có thiết bị'} /></Card> : (
          <div className="grid gap-2">
            {list.map((r) => (
              <MobileCard key={r.id} onClick={() => setOpenId(r.id)}>
                <MobileRow><b className="truncate">{data.nameOf(r.name_id)}</b><span className="num">× {qty(r.quantity)}</span></MobileRow>
                <MobileRow meta><span className="truncate">{data.placeName(r)}</span>{r.location === 'project' ? <CondPill c={r.condition} /> : <Pill tone="neutral">Trong kho</Pill>}</MobileRow>
              </MobileCard>
            ))}
          </div>
        )}
        {canAdd ? (
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" data-testid="tb-transfer" onClick={() => setPickTransfer(true)}><Icon name="swap_horiz" />Chuyển</Button>
            <Button size="lg" variant="primary" data-testid="tb-add" onClick={() => setAdding(true)}><Icon name="add" />Thêm</Button>
          </div>
        ) : null}
        {sheets}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Theo Dõi TB" sub="Thiết bị tại công trình, Kho thiết bị, Kho giàn giáo" actions={<><ExportButton datasets={['equipment']} year={null} />{actions}</>} />
      <FilterBar>
        <SearchBox value={q} onChange={setQ} placeholder="Tìm tên thiết bị hoặc công trình (không dấu cũng được)…" className="min-w-[260px] flex-1" />
        <FilterSelect label="Tình trạng" value={cond} onChange={setCond} options={CONDITION_OPTS} />
      </FilterBar>
      <KpiStrip items={[
        { label: 'Tại công trình', value: qty(view.kpi.site), sub: 'món' },
        { label: 'Kho thiết bị', value: qty(view.kpi.warehouse) },
        { label: 'Kho giàn giáo', value: qty(view.kpi.scaffold) },
        { label: 'Cần sửa / bảo trì', value: qty(view.kpi.broken), tone: view.kpi.broken > 0 ? 'neg' : '' },
      ]} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Tại công trình" sub="gom theo công trình" />
          {view.site.length === 0 ? <EmptyState icon="build" title={filtered ? 'Không có thiết bị khớp' : 'Chưa có thiết bị ở công trình'} /> : (
            <div className="tbl" data-testid="tb-site">
              <table>
                <thead><tr><th>Tên thiết bị</th><th className="!text-right">SL</th><th>Tình trạng</th><th>Thông tin máy</th><th>Người TH</th><th>Ngày</th></tr></thead>
                <tbody>
                  {view.groups.map((g) => (
                    <FragmentGroup key={g.projectId} title={data.projectName(g.projectId)} total={sumQty(g.rows)}>
                      {g.rows.map((r) => (
                        <tr key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                          <td><b className="font-semibold">{data.nameOf(r.name_id)}</b></td>
                          <td className="num text-right">{qty(r.quantity)}</td>
                          <td><CondPill c={r.condition} /></td>
                          <td className="text-muted">{r.note}</td>
                          <td>{data.userName(r.created_by)}</td>
                          <td className="num">{formatDate(r.date)}</td>
                        </tr>
                      ))}
                    </FragmentGroup>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Trong kho" />
          {view.stock.length === 0 ? <EmptyState icon="warehouse" title={filtered ? 'Không có thiết bị khớp' : 'Kho đang trống'} /> : (
            <div className="tbl" data-testid="tb-stock">
              <table>
                <thead><tr><th>Tên</th><th>Kho</th><th className="!text-right">SL</th></tr></thead>
                <tbody>
                  {view.stock.map((r) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                      <td>{data.nameOf(r.name_id)}{r.note ? <span className="block text-[11.5px] text-faint">{r.note}</span> : null}{r.condition !== 'working' ? <span className="ml-1.5"><CondPill c={r.condition} /></span> : null}</td>
                      <td><Pill tone={r.location === 'scaffold' ? 'warn' : 'neutral'}>{WAREHOUSE[r.location as 'warehouse' | 'scaffold']}</Pill></td>
                      <td className="num text-right">{qty(r.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {sheets}
    </>
  );
}

function FragmentGroup({ title, total, children }: { title: string; total: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="[&>td]:bg-surface-2"><td colSpan={6} className="!py-1.5 text-[12px] font-semibold text-muted">{title} · <span className="num">{qty(total)}</span> món</td></tr>
      {children}
    </>
  );
}
