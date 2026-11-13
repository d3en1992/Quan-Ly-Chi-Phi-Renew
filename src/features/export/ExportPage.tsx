// Tab XUẤT DỮ LIỆU (TN02) — thay 9 nút CSV của app cũ và bản "Xuất Excel 12 sheet". Màn 3 cột:
// 1. Bộ lọc (công trình · thời gian · trạng thái · chấm công) · 2. Chọn dữ liệu (số bản ghi đếm thật) · 3. Kiểu file.
// Chỉ đọc: dữ liệu tải về trình duyệt qua RLS của chính người dùng, dựng file Excel ngay ở trình duyệt (ExcelJS).
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccess } from '@/app/auth';
import { Button, Icon } from '@/components/ui/button';
import { Checkbox, Input, Select } from '@/components/ui/input';
import { Card, ErrorState, LoadingState, PageHeader, Pill } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { exportFileName, vnDate } from '@/lib/export/ten-file';
import { normVi } from '@/features/expenses/logic';
import { GROUP_MODE_LABEL, planSheets, workbookBlob, writeWorkbook, type GroupMode } from './buildWorkbook';
import { countAll, DEFAULT_FILTER, loadPrivate, loadStore, timeRange, type ExportFilter, type TimeFilter } from './fetchDataset';
import { buildBlocks, effectiveKeys, totalRows, type Block, type TimesheetMode } from './joinDatasets';
import { DATASET, DATASETS, GROUPS, type DatasetKey } from './registry';
import { describeFilter, pushHistory, readHistory, type HistoryItem } from './history';

export const MAX_ROWS = 50_000;
const WARN_ROWS = 20_000;
const fmtN = (n: number) => n.toLocaleString('vi-VN');

export function useExportStore() {
  return useQuery({ queryKey: ['export-store'], staleTime: 60_000, queryFn: () => loadStore() });
}

type State = { filter: ExportFilter; keys: DatasetKey[]; timesheetMode: TimesheetMode; groupMode: GroupMode; includePrivate: boolean; header: boolean };

export function ExportPage() {
  const access = useAccess();
  const toast = useToast();
  const storeQ = useExportStore();
  const canSeeIds = access.special.see_contact_ids;
  const visible = useMemo(() => DATASETS.filter((d) => hasLevel(access.permissions, d.permModule, 'view') && (!d.privateOnly || canSeeIds)), [access.permissions, canSeeIds]);

  const [st, setSt] = useState<State>(() => ({
    filter: DEFAULT_FILTER, keys: ['expenses'], timesheetMode: 'detail', groupMode: 'per-project', includePrivate: false, header: true,
  }));
  const set = (patch: Partial<State>) => setSt((s) => ({ ...s, ...patch }));
  const setFilter = (patch: Partial<ExportFilter>) => setSt((s) => ({ ...s, filter: { ...s.filter, ...patch } }));

  const deferred = useDeferredValue(st.filter);
  const store = storeQ.data;
  const counts = useMemo(() => (store ? countAll(DATASETS.map((d) => d.key), store, deferred) : {}), [store, deferred]);
  const projects = useMemo(() => (store?.projects ?? []).filter((p) => !p.deleted_at).map((p) => ({ id: String(p.id), name: String(p.name), closed: p.status === 'closed' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi')), [store]);
  const projectName = useMemo(() => { const m = new Map(projects.map((p) => [p.id, p.name])); return (id: string | null) => (id ? m.get(id) ?? '' : ''); }, [projects]);
  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const e of store?.expenses ?? []) { const y = Number(String(e.date ?? '').slice(0, 4)); if (y > 2000) ys.add(y); }
    for (const w of store?.timesheet_weeks ?? []) { const y = Number(String(w.week_start ?? '').slice(0, 4)); if (y > 2000) ys.add(y); }
    ys.add(new Date().getFullYear());
    return [...ys].sort((a, b) => b - a);
  }, [store]);

  const chosen = st.keys.filter((k) => visible.some((d) => d.key === k) && (!DATASET[k].privateOnly || st.includePrivate));
  const effective = effectiveKeys(chosen);
  const estRows = effective.reduce((s, k) => s + (counts[k] ?? 0), 0);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [preview, setPreview] = useState<Block[] | null>(null);
  const [histOpen, setHistOpen] = useState(false);

  const blocked = !chosen.length ? 'Chưa chọn loại dữ liệu nào' : estRows === 0 ? 'Không có dòng nào trong bộ lọc đã chọn' : estRows > MAX_ROWS ? `Quá ${fmtN(MAX_ROWS)} dòng — hẹp bộ lọc lại (ít công trình / ngắn thời gian hơn)` : '';

  const build = async (withPriv: boolean) => {
    if (!store) throw new Error('Chưa tải xong dữ liệu');
    const priv = withPriv ? await loadPrivate({ datasets: chosen, filter: describeFilter(st.filter, projectName) }) : undefined;
    return buildBlocks({ keys: chosen, timesheetMode: st.timesheetMode, includePrivate: withPriv }, store, st.filter, priv);
  };

  const doPreview = async () => {
    try { setPreview(await build(false)); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };

  const doExport = async () => {
    if (blocked || busy) return;
    setBusy({ done: 0, total: 1 });
    try {
      const withPriv = st.includePrivate && canSeeIds;
      const blocks = await build(withPriv);
      const n = totalRows(blocks);
      if (n > MAX_ROWS) throw new Error(`File có ${fmtN(n)} dòng, quá giới hạn ${fmtN(MAX_ROWS)} — hẹp bộ lọc lại.`);
      const order = st.filter.projectMode === 'selected' ? st.filter.projectIds : [];
      const plans = planSheets(blocks, st.groupMode, order, projectName);
      const filterText = describeFilter(st.filter, projectName);
      const notes = st.header ? exportNotes(st, effective) : [];
      const now = new Date();
      const wb = await writeWorkbook(plans, {
        company: access.company.name, title: 'DỮ LIỆU XUẤT TỪ APP QUẢN LÝ CHI PHÍ', filterText: st.header ? filterText : '(ẩn)',
        exportedBy: access.profile.display_name, exportedAt: `${vnDate(now.toISOString())} ${now.toTimeString().slice(0, 5)}`, notes,
        privateWarning: withPriv,
      }, projectName, (done, total) => setBusy({ done, total }));
      const blob = await workbookBlob(wb);
      const name = exportFileName(now);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      pushHistory(access.profile.id, { at: now.toISOString(), by: access.profile.display_name, summary: `${chosen.map((k) => DATASET[k].label).join(', ')} · ${filterText} · ${GROUP_MODE_LABEL[st.groupMode]}`, rows: n, state: { ...st, includePrivate: false } });
      toast(`Đã xuất ${fmtN(n)} dòng → ${name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <PageHeader title="Xuất Dữ Liệu" sub="Chọn loại dữ liệu, công trình, thời gian → file Excel có trình bày"
      actions={<>
        <Button onClick={() => setHistOpen(true)}><Icon name="history" />Đã xuất gần đây</Button>
        <Button onClick={() => void doPreview()} disabled={!!blocked || !store}><Icon name="visibility" />Xem trước</Button>
        <Button variant="primary" data-testid="export-run" onClick={() => void doExport()} disabled={!!blocked || !!busy || !store}><Icon name="download" />{busy ? 'Đang tạo file…' : 'Xuất Excel'}</Button>
      </>} />
  );
  if (storeQ.isPending) return <>{header}<Card><LoadingState label="Đang tải dữ liệu để đếm…" /></Card></>;
  if (storeQ.isError || !store) return <>{header}<Card><ErrorState error={storeQ.error ?? 'Không tải được dữ liệu'} onRetry={() => void storeQ.refetch()} /></Card></>;

  return (
    <>
      {header}
      <div className="grid items-start gap-3 lg:grid-cols-[250px_minmax(0,1fr)_250px]" data-testid="export-page">
        <FilterColumn st={st} setFilter={setFilter} set={set} projects={projects} years={years} />
        <DatasetColumn st={st} set={set} visible={visible} counts={counts} total={estRows} />
        <OptionsColumn st={st} set={set} canSeeIds={canSeeIds} manySheets={st.groupMode === 'per-dataset' && effective.length > 15} />
      </div>
      <div className="sticky bottom-0 z-10 -mx-1 mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card" data-testid="export-bar">
        <Icon name={blocked ? 'block' : estRows > WARN_ROWS ? 'warning' : 'table_rows'} className={cn('text-[20px]', blocked ? 'text-bad' : estRows > WARN_ROWS ? 'text-warn' : 'text-accent')} />
        <span className="text-[13px]" data-testid="export-summary">
          {blocked || <><b className="num">{fmtN(estRows)}</b> dòng · ~{Math.max(0.1, (estRows * 140) / 1_048_576).toFixed(1).replace('.', ',')} MB · ước tính {Math.max(1, Math.round(estRows / 3000))}–{Math.max(2, Math.round(estRows / 1200))} giây{estRows > WARN_ROWS ? ' · file lớn' : ''}</>}
        </span>
        {busy ? <span className="flex min-w-[160px] flex-1 items-center gap-2 text-[12px] text-muted">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full bg-accent transition-all" style={{ width: `${Math.round((busy.done / busy.total) * 100)}%` }} /></span>
          khối {busy.done}/{busy.total}
        </span> : null}
        <div className="flex-1" />
        <Button variant="primary" onClick={() => void doExport()} disabled={!!blocked || !!busy}><Icon name="download" />Xuất Excel</Button>
      </div>
      <PreviewSheet blocks={preview} onClose={() => setPreview(null)} />
      <HistorySheet open={histOpen} onClose={() => setHistOpen(false)} userId={access.profile.id} onReuse={(s) => { setSt({ ...s, includePrivate: false }); setHistOpen(false); toast('Đã nạp lại bộ lọc — bấm Xuất Excel'); }} />
    </>
  );
}

/** Ghi chú bắt buộc trong đầu file (đặc tả 4.3, 4.4, 11) */
function exportNotes(st: State, keys: DatasetKey[]): string[] {
  const n: string[] = [];
  if (st.filter.projectMode !== 'all' && st.filter.contactsByProject && keys.some((k) => DATASET[k].link.kind === 'related')) n.push('Danh bạ lọc theo phát sinh của công trình đã chọn (chỉ người / NCC có chấm công, hóa đơn, phiếu chi… ở các công trình đó).');
  if (keys.includes('timesheet_weeks') && st.filter.time.mode !== 'all') n.push('Chấm công lọc theo ngày Chủ nhật đầu tuần; tab Lợi Nhuận tính lương vào năm của thứ Bảy — tuần vắt năm có thể lệch.');
  if (keys.includes('expenses')) n.push('Tổng hóa đơn ở đây gồm cả hóa đơn mua nợ nên cao hơn phần hóa đơn ở tab Lợi Nhuận (Lợi Nhuận tính hóa đơn Đã TT + tiền đã trả NCC).');
  if (st.filter.includeDeleted) n.push('Có cả dòng đã xóa mềm (đang nằm trong Thùng Rác).');
  return n;
}

// ───────────── Cột 1: bộ lọc ─────────────

function Col({ n, title, children, testId }: { n: number; title: string; children: ReactNode; testId?: string }) {
  return (
    <Card className="min-w-0">
      <h2 className="m-0 flex items-center gap-2 border-b border-line bg-accent-soft px-3 py-2.5 text-[11.5px] font-extrabold tracking-[.05em] text-accent uppercase">
        <span className="grid size-[18px] place-items-center rounded-full bg-accent text-[10.5px] text-accent-fg">{n}</span>{title}
      </h2>
      <div className="grid gap-3 p-3" data-testid={testId}>{children}</div>
    </Card>
  );
}
const Label = ({ children }: { children: ReactNode }) => <div className="text-[10.5px] font-extrabold tracking-[.05em] text-faint uppercase">{children}</div>;
function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-[13px]">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-3.5 accent-[var(--accent)]" />{children}
    </label>
  );
}

function FilterColumn({ st, setFilter, set, projects, years }: { st: State; setFilter: (p: Partial<ExportFilter>) => void; set: (p: Partial<State>) => void; projects: { id: string; name: string; closed: boolean }[]; years: number[] }) {
  const f = st.filter;
  const [q, setQ] = useState('');
  const shown = projects.filter((p) => !q || normVi(p.name).includes(normVi(q)));
  const toggle = (id: string) => setFilter({ projectMode: 'selected', projectIds: f.projectIds.includes(id) ? f.projectIds.filter((x) => x !== id) : [...f.projectIds, id] });
  const t = f.time;
  const setTime = (time: TimeFilter) => setFilter({ time });
  const thisYear = years[0] ?? new Date().getFullYear();
  return (
    <Col n={1} title="Bộ lọc" testId="export-filters">
      <div className="grid gap-0.5">
        <Label>Công trình</Label>
        <Radio name="pm" checked={f.projectMode === 'all'} onChange={() => setFilter({ projectMode: 'all' })}>Tất cả <span className="ml-auto text-[11.5px] text-faint">{projects.length}</span></Radio>
        <Radio name="pm" checked={f.projectMode === 'selected'} onChange={() => setFilter({ projectMode: 'selected' })}>Đang chọn <span className="ml-auto text-[11.5px] text-faint">{f.projectIds.length}</span></Radio>
        <Radio name="pm" checked={f.projectMode === 'none'} onChange={() => setFilter({ projectMode: 'none' })}>Không gán công trình</Radio>
        {f.projectMode === 'selected' ? (
          <div className="mt-1 grid gap-1">
            <Input aria-label="Tìm công trình" placeholder="Tìm công trình (gõ không dấu)…" value={q} onChange={(e) => setQ(e.target.value)} className="!h-8" />
            <div className="max-h-[180px] overflow-auto rounded-lg border border-line p-1" data-testid="project-pick">
              {shown.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] hover:bg-surface-2">
                  <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={f.projectIds.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span className={cn('min-w-0 truncate', p.closed && 'text-muted')} title={p.name}>{p.name}</span>
                </label>
              ))}
            </div>
            {f.projectIds.length ? <button type="button" className="justify-self-start text-[12px] text-accent" onClick={() => setFilter({ projectIds: [] })}>Bỏ chọn hết</button> : null}
          </div>
        ) : null}
        {f.projectMode !== 'all' ? (
          <div className="mt-1.5 grid gap-0.5 rounded-lg bg-surface-2 px-2 py-1.5">
            <span className="text-[11.5px] text-muted">Danh bạ (khách hàng, công nhân, NCC, thầu phụ)</span>
            <Radio name="cb" checked={f.contactsByProject} onChange={() => setFilter({ contactsByProject: true })}>Lọc theo công trình</Radio>
            <Radio name="cb" checked={!f.contactsByProject} onChange={() => setFilter({ contactsByProject: false })}>Lấy tất cả</Radio>
          </div>
        ) : null}
      </div>

      <div className="grid gap-0.5">
        <Label>Thời gian</Label>
        <Radio name="tm" checked={t.mode === 'all'} onChange={() => setTime({ mode: 'all' })}>Tất cả</Radio>
        <Radio name="tm" checked={t.mode === 'year'} onChange={() => setTime({ mode: 'year', year: thisYear })}>Năm</Radio>
        {t.mode === 'year' ? <Select aria-label="Năm" className="!h-8" value={t.year} onChange={(e) => setTime({ mode: 'year', year: Number(e.target.value) })}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select> : null}
        <Radio name="tm" checked={t.mode === 'month'} onChange={() => setTime({ mode: 'month', ym: new Date().toISOString().slice(0, 7) })}>Tháng</Radio>
        {t.mode === 'month' ? <Input type="month" aria-label="Tháng" className="!h-8" value={t.ym} onChange={(e) => e.target.value && setTime({ mode: 'month', ym: e.target.value })} /> : null}
        <Radio name="tm" checked={t.mode === 'range'} onChange={() => setTime({ mode: 'range', from: `${thisYear}-01-01`, to: new Date().toISOString().slice(0, 10) })}>Khoảng ngày</Radio>
        {t.mode === 'range' ? (
          <div className="grid grid-cols-2 gap-1.5">
            <Input type="date" aria-label="Từ ngày" className="!h-8 !px-1.5" value={t.from} onChange={(e) => setTime({ ...t, from: e.target.value })} />
            <Input type="date" aria-label="Đến ngày" className="!h-8 !px-1.5" value={t.to} onChange={(e) => setTime({ ...t, to: e.target.value })} />
          </div>
        ) : null}
        {timeRange(t) ? <span className="text-[11.5px] text-faint">Bảng không có ngày (danh mục, tỉ trọng…) luôn lấy tất cả.</span> : null}
      </div>

      <div className="grid gap-0.5">
        <Label>Trạng thái</Label>
        <Radio name="del" checked={!f.includeDeleted} onChange={() => setFilter({ includeDeleted: false })}>Đang dùng</Radio>
        <Radio name="del" checked={f.includeDeleted} onChange={() => setFilter({ includeDeleted: true })}>Cả đã xóa mềm (Thùng Rác)</Radio>
      </div>

      <div className="grid gap-0.5">
        <Label>Chấm công</Label>
        <Radio name="ts" checked={st.timesheetMode === 'detail'} onChange={() => set({ timesheetMode: 'detail' })}>Chi tiết (tuần × công nhân)</Radio>
        <Radio name="ts" checked={st.timesheetMode === 'grouped'} onChange={() => set({ timesheetMode: 'grouped' })}>Gộp (mỗi công nhân 1 dòng)</Radio>
      </div>
    </Col>
  );
}

// ───────────── Cột 2: chọn dữ liệu ─────────────

function DatasetColumn({ st, set, visible, counts, total }: { st: State; set: (p: Partial<State>) => void; visible: typeof DATASETS; counts: Record<string, number>; total: number }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const usable = visible.filter((d) => (counts[d.key] ?? 0) > 0 && (!d.privateOnly || st.includePrivate));
  const allOn = usable.length > 0 && usable.every((d) => st.keys.includes(d.key));
  const toggle = (k: DatasetKey) => set({ keys: st.keys.includes(k) ? st.keys.filter((x) => x !== k) : [...st.keys, k] });
  const selectAll = (on: boolean) => {
    set({ keys: on ? usable.map((d) => d.key) : [] });
    if (on) setOpen(Object.fromEntries(GROUPS.map((g) => [g.key, true])));
  };
  return (
    <Col n={2} title="Chọn dữ liệu" testId="export-datasets">
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-accent/40 bg-accent-soft/50 px-3 py-2 text-[13px] font-bold">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={allOn} onChange={(e) => selectAll(e.target.checked)} />
        CHỌN TẤT CẢ
        <span className="num ml-auto text-[12px] font-semibold text-accent" data-testid="export-selected">{st.keys.filter((k) => usable.some((d) => d.key === k)).length}/{usable.length} loại · {fmtN(total)} dòng</span>
      </label>
      {GROUPS.map((g) => {
        const items = visible.filter((d) => d.group === g.key);
        if (!items.length) return null;
        const picked = items.filter((d) => st.keys.includes(d.key)).length;
        const rows = (
          <div className="grid">
            {items.map((d) => {
              const c = counts[d.key] ?? 0;
              const locked = d.privateOnly && !st.includePrivate;
              const disabled = c === 0 || locked;
              return (
                <label key={d.key} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]', disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:bg-surface-2')} data-ds={d.key}>
                  <input type="checkbox" className="size-3.5 shrink-0 accent-[var(--accent)]" disabled={disabled} checked={!disabled && st.keys.includes(d.key)} onChange={() => toggle(d.key)} aria-label={d.label} />
                  <span className="min-w-0 flex-1 truncate">{d.label}</span>
                  {d.tag ? <span className="shrink-0 rounded-full bg-accent-soft px-1.5 text-[10px] font-semibold text-accent">{d.tag}</span> : null}
                  {c === 0 && !locked ? <span className="shrink-0 text-[10.5px] text-faint">không có trong bộ lọc</span> : null}
                  <span className="num w-12 shrink-0 text-right text-[12px] text-muted" data-count={d.key}>{locked ? '🔒' : fmtN(c)}</span>
                </label>
              );
            })}
          </div>
        );
        const head = (
          <span className={cn('flex flex-1 items-center gap-2 text-[10.5px] font-extrabold tracking-[.06em] text-faint uppercase', g.folded && picked && 'text-fg')}>
            {g.label}{g.folded && picked ? <span className="normal-case">({picked} chọn)</span> : null}
            <span className="h-px flex-1 bg-line" />
            {g.tag ? <span className={cn('rounded-full px-1.5 text-[9.5px] tracking-normal normal-case', g.tag === 'hay xuất' ? 'bg-good-soft text-good' : 'bg-surface-2 text-muted')}>{g.folded ? `${g.tag} · ${items.length} loại` : g.tag}</span> : null}
          </span>
        );
        return g.folded ? (
          <details key={g.key} open={!!open[g.key]} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen((x) => (x[g.key] === o ? x : { ...x, [g.key]: o })); }}>
            <summary className="flex cursor-pointer list-none items-center gap-1"><Icon name="chevron_right" className="text-[18px] text-faint" />{head}</summary>
            {rows}
          </details>
        ) : <div key={g.key} className="grid gap-0.5">{head}{rows}</div>;
      })}
    </Col>
  );
}

// ───────────── Cột 3: kiểu file ─────────────

function OptionsColumn({ st, set, canSeeIds, manySheets }: { st: State; set: (p: Partial<State>) => void; canSeeIds: boolean; manySheets: boolean }) {
  return (
    <Col n={3} title="Kiểu file" testId="export-options">
      <div className="grid gap-0.5">
        <Label>Kiểu gom</Label>
        {(Object.keys(GROUP_MODE_LABEL) as GroupMode[]).map((m) => (
          <Radio key={m} name="gm" checked={st.groupMode === m} onChange={() => set({ groupMode: m })}>{GROUP_MODE_LABEL[m]}</Radio>
        ))}
        <span className="text-[11.5px] text-faint">
          {st.groupMode === 'per-project' ? 'Có sheet TONG HOP (từ 2 công trình); danh bạ đặt ở TONG HOP.' : st.groupMode === 'one-sheet' ? 'Một sheet DU LIEU, có cột CÔNG TRÌNH — tiện copy / PivotTable.' : 'Mỗi loại 1 sheet, có cột CÔNG TRÌNH.'}
        </span>
        {manySheets ? <Pill tone="warn">Quá nhiều sheet — nên chọn kiểu khác</Pill> : null}
      </div>
      <div className="grid gap-1">
        <Label>Tùy chọn</Label>
        <Checkbox checked={st.header} onChange={(v) => set({ header: v })} label="Đầu trang công ty + ghi chú bộ lọc" />
        <span className="text-[11.5px] text-faint">Luôn có dòng TỔNG CỘNG (công thức SUBTOTAL — lọc, xóa dòng vẫn đúng).</span>
      </div>
      <div className="grid gap-1">
        <Label>Dữ liệu cá nhân 🔒</Label>
        {canSeeIds ? (
          <>
            <Checkbox checked={st.includePrivate} onChange={(v) => set({ includePrivate: v, keys: v ? st.keys : st.keys.filter((k) => !DATASET[k].privateOnly) })} label="Kèm SĐT, CCCD, số tài khoản" />
            <span className="text-[11.5px] text-faint">File sẽ có dòng đỏ cảnh báo; mỗi lần xuất được ghi nhật ký.</span>
          </>
        ) : (
          <span className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-2 text-[12px] text-muted" data-testid="private-locked"><Icon name="lock" className="text-[16px]" />Cần quyền "Xem SĐT, số CCCD"</span>
        )}
      </div>
    </Col>
  );
}

// ───────────── Xem trước + lịch sử ─────────────

function PreviewSheet({ blocks, onClose }: { blocks: Block[] | null; onClose: () => void }) {
  const first = blocks?.find((b) => b.rows.length);
  return (
    <Sheet open={!!blocks} onOpenChange={(o) => { if (!o) onClose(); }} title="Xem trước" wide>
      {blocks ? (
        <>
          <div className="grid gap-1 text-[13px]" data-testid="preview-counts">
            {blocks.map((b) => <div key={b.id} className="flex gap-2"><span className="min-w-0 flex-1 truncate">{b.title}</span><b className="num">{fmtN(b.rows.length)}</b> dòng</div>)}
            <div className="flex gap-2 border-t border-line pt-1 font-bold"><span className="flex-1">Tổng</span><span className="num">{fmtN(totalRows(blocks))}</span> dòng</div>
          </div>
          {first ? (
            <>
              <div className="text-[12px] text-muted">20 dòng đầu của khối “{first.title}”</div>
              <div className="tbl rounded-lg border border-line">
                <table>
                  <thead><tr><th>#</th>{first.columns.map((c) => <th key={c.key} className={c.type === 'money' || c.type === 'dec' ? '!text-right' : ''}>{c.label}</th>)}</tr></thead>
                  <tbody>
                    {first.rows.slice(0, 20).map((r, i) => (
                      <tr key={i}><td className="text-faint">{i + 1}</td>{first.columns.map((c, j) => (
                        <td key={c.key} className={cn('whitespace-nowrap', (c.type === 'money' || c.type === 'dec') && 'num text-right')}>
                          {r[j] == null ? '' : c.type === 'money' ? formatMoney(Number(r[j])) : c.type === 'date' ? vnDate(r[j]) : String(r[j]).slice(0, 60)}
                        </td>
                      ))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

function HistorySheet({ open, onClose, userId, onReuse }: { open: boolean; onClose: () => void; userId: string; onReuse: (s: State) => void }) {
  const items: HistoryItem<State>[] = open ? readHistory<State>(userId) : [];
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="Đã xuất gần đây" wide>
      {items.length === 0 ? <div className="text-[13px] text-muted">Chưa xuất lần nào trên máy này. Lịch sử chỉ lưu bộ lọc (30 lần gần nhất), không lưu file.</div> : (
        <div className="grid gap-2" data-testid="export-history">
          {items.map((h, i) => (
            <div key={i} className="grid gap-1 rounded-lg border border-line px-3 py-2 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-2"><b className="num">{vnDate(h.at)} {new Date(h.at).toTimeString().slice(0, 5)}</b><span className="text-muted">· {h.by}</span><span className="num ml-auto">{fmtN(h.rows)} dòng</span></div>
              <div className="text-muted">{h.summary}</div>
              <Button size="sm" className="justify-self-start" onClick={() => onReuse(h.state)}><Icon name="replay" />Xuất lại</Button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

