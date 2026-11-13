// Tab TỈ TRỌNG & ĐỊNH MỨC (PAGES.tytrong / MP.tytrong): PHÂN BỔ CÔNG TRÌNH · ĐỊNH MỨC · CẤU HÌNH RỔ.
// Theo đúng logic app cũ bản 27/10/2026: chi phí chia 4 NHÓM; Nhóm 1 chia 6 rổ (Sắt / Bê tông / Nhân công / Thầu phụ / Quỹ / Khác).
// Bảng "giai đoạn × hạng mục" của bản vẽ được thay bằng bảng Loại chi phí × Nhóm (app cũ đã bỏ giai đoạn & hạng mục).
import { useMemo, useState } from 'react';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { useYears } from '@/app/year';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { FilterBar, FilterSelect, HBarList, KpiStrip, PhoneKpis } from '@/components/ui/data';
import { Checkbox, Field, Input, MoneyInput, Select } from '@/components/ui/input';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, Note, PageHeader, Pill, SubTabs } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import {
  ALL_YEARS, allocSummary, benchmarkFields, compareToBenchmark, contractStats, COST_GROUP_IDS, COST_GROUPS, defaultGroupRules, floorAreaTotal, groupOfType,
  PILLAR_ORDER, PILLARS, pillarOfType, readAllocConfig, readBenchmark, toYearFilter, typeGroupMatrix, typeKey,
  type AllocLine, type AllocPart, type AllocSummary, type FloorRow, type PillarKey,
} from '@/lib/calc';
import { formatDate, formatMoney, formatShortMoney } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { useProjectsFull, type ProjectFull } from '@/features/projects/api';
import { useReportData } from '@/features/reports/api';
import {
  toAllocSource, useAllExpenseLines, useAllocRecords, useCreateBenchmark, useDeleteBenchmark, useSaveConfig, useSaveFloorAreas, useSaveProjectAlloc, useUpdateBenchmark,
  type AllocRecord,
} from './api';

type Tab = 'alloc' | 'benchmark' | 'config';
const TABS: { key: Tab; label: string }[] = [{ key: 'alloc', label: 'PHÂN BỔ CÔNG TRÌNH' }, { key: 'benchmark', label: 'ĐỊNH MỨC' }, { key: 'config', label: 'CẤU HÌNH RỔ' }];
const m2 = (n: number) => (Math.round((n || 0) * 100) / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const perM2 = (money: number, area: number) => (area > 0 ? formatMoney(Math.round(money / area)) : '—');
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const KIND_CODE: Record<string, string> = { new_build: 'CT', renovation: 'SC', small_repair: 'SN' };
const SRC_LABEL: Record<AllocPart['nhomSrc'], string> = { tay: 'Gán tay', hdtp: 'Theo HĐ thầu phụ', luat: 'Luật từ khóa', loai: 'Theo loại', macdinh: 'Mặc định' };
const GROUP_OPTS = COST_GROUP_IDS.map((n) => ({ value: String(n), label: `Nhóm ${n} · ${COST_GROUPS[n]!.ngan}` }));
const pillarLabel = (k: PillarKey) => PILLARS[k].ngan;

type Picked = { line: AllocLine; part: AllocPart };

/** Bảng trượt liệt kê các khoản trong 1 ô / các khoản chưa xếp; gán tay nhóm cho cả khoản */
function LinesSheet({ title, items, canEdit, busy, onAssign, onClose }: {
  title: string; items: Picked[]; canEdit: boolean; busy: boolean; onAssign: (keys: string[], group: number) => void; onClose: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState('');
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const total = items.reduce((s, x) => s + x.part.tien, 0);
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }} title={title} wide
      footer={canEdit ? (
        <>
          <span className="text-[12.5px] text-muted">Đã chọn {sel.size}</span>
          <Select aria-label="Nhóm gán hàng loạt" className="!w-[190px]" value={bulk} onChange={(e) => setBulk(e.target.value)}>
            <option value="">— Chọn nhóm —</option>
            {GROUP_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            <option value="0">Bỏ gán tay</option>
          </Select>
          <Button variant="primary" data-testid="tyt-bulk-assign" disabled={busy || !sel.size || bulk === ''} onClick={() => { onAssign([...sel], Number(bulk)); setSel(new Set()); }}>Gán {sel.size} khoản</Button>
          <div className="flex-1" />
          <Button onClick={onClose}>Đóng</Button>
        </>
      ) : <Button onClick={onClose}>Đóng</Button>}>
      <div className="grid gap-2">
        <div className="text-[12.5px] text-muted">{items.length} dòng · tổng <b className="num text-fg">{formatMoney(total)}</b>{canEdit ? ' · gán tay áp cho CẢ khoản (mọi món của hóa đơn đó)' : ''}</div>
        <div className="tbl">
          <table>
            <thead><tr>{canEdit ? <th /> : null}<th>Ngày</th><th>Nội dung</th><th>Loại</th><th className="!text-right">Số tiền</th><th>Đang xếp</th></tr></thead>
            <tbody>
              {items.map(({ line, part }, i) => (
                <tr key={line.key + '#' + i} data-line={line.key}>
                  {canEdit ? <td><input type="checkbox" aria-label={`Chọn ${line.nd}`} checked={sel.has(line.key)} onChange={() => toggle(line.key)} /></td> : null}
                  <td className="num">{formatDate(line.ngay)}</td>
                  <td>{part.mon ? part.ten : line.nd}{line.doiTuong ? <span className="block text-[11.5px] text-faint">{line.doiTuong}{part.mon ? ` · ${line.nd}` : ''}</span> : null}</td>
                  <td className="whitespace-nowrap">{line.loai}</td>
                  <td className="num text-right">{formatMoney(part.tien)}</td>
                  <td className="whitespace-nowrap">
                    <Pill tone={part.nhom === 0 ? 'bad' : part.nhomSrc === 'tay' ? 'accent' : 'neutral'}>{part.nhom === 0 ? 'Chưa xếp' : `Nhóm ${part.nhom}`}</Pill>
                    <span className="ml-1.5 text-[11.5px] text-faint">{SRC_LABEL[part.nhomSrc]}{part.tru !== null && part.nhom === 1 ? ` · rổ ${pillarLabel(part.tru)}` : ''}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Sheet>
  );
}

function FloorSheet({ project, onClose }: { project: ProjectFull; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveFloorAreas();
  type Row = { ten: string; kl: string; heSo: string; tinh: boolean };
  const [rows, setRows] = useState<Row[]>(() => {
    const src = (project.floor_areas as FloorRow[]).map((r) => ({ ten: r.ten ?? '', kl: r.kl === null || r.kl === undefined ? '' : String(r.kl).replace('.', ','), heSo: r.heSo === null || r.heSo === undefined ? '1' : String(r.heSo).replace('.', ','), tinh: r.tinh !== false }));
    return src.length ? src : [{ ten: '', kl: '', heSo: '1', tinh: true }];
  });
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const out: FloorRow[] = rows.filter((r) => r.ten.trim() || r.kl.trim()).map((r) => ({ ten: r.ten.trim(), dvt: 'm²', kl: parseFloat(r.kl.replace(',', '.')) || 0, heSo: (() => { const h = parseFloat(r.heSo.replace(',', '.')); return isFinite(h) && h >= 0 ? h : 1; })(), tinh: r.tinh }));
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }} title="Khối lượng sàn" wide
      footer={<><span className="text-[13px] text-muted">Tổng sàn quy đổi: <b className="num text-fg">{m2(floorAreaTotal(out))} m²</b></span><div className="flex-1" /><Button onClick={onClose}>Hủy</Button>
        <Button variant="primary" data-testid="tyt-floor-save" disabled={save.isPending} onClick={() => save.mutate({ projectId: project.id, rows: out }, { onSuccess: () => { toast('Đã lưu khối lượng sàn'); onClose(); }, onError: (e) => toast(e.message, 'error') })}><Icon name="save" />Lưu</Button></>}>
      <div className="grid gap-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_84px_64px_auto_34px] items-center gap-2">
            <Input aria-label={`Tầng / khu dòng ${i + 1}`} placeholder="Tầng / khu" value={r.ten} onChange={(e) => set(i, { ten: e.target.value })} />
            <Input aria-label={`KL dòng ${i + 1}`} placeholder="m²" inputMode="decimal" className="num text-right" value={r.kl} onChange={(e) => set(i, { kl: e.target.value })} />
            <Input aria-label={`Hệ số dòng ${i + 1}`} inputMode="decimal" className="num text-right" value={r.heSo} onChange={(e) => set(i, { heSo: e.target.value })} />
            <Checkbox checked={r.tinh} onChange={(v) => set(i, { tinh: v })} label="Tính" />
            <Button variant="ghost" size="icon" aria-label={`Bỏ dòng ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Icon name="close" /></Button>
          </div>
        ))}
        <div><Button size="sm" onClick={() => setRows((rs) => [...rs, { ten: '', kl: '', heSo: '1', tinh: true }])}><Icon name="add" />Thêm dòng</Button></div>
        <Note>Tổng sàn = Σ khối lượng × hệ số của các dòng có tích "Tính" (ví dụ mái, sân hệ số 0,5).</Note>
      </div>
    </Sheet>
  );
}

export function CostAllocationPage() {
  const phone = useLayoutMode() === 'phone';
  const access = useAccess();
  const toast = useToast();
  const canEdit = hasLevel(access.permissions, 'cost_allocation', 'add');
  const { years: yearSel, label: yearLabel } = useYears();
  const report = useReportData(), lines = useAllExpenseLines(), records = useAllocRecords(), projectsQ = useProjectsFull();
  const saveAlloc = useSaveProjectAlloc(), saveCfg = useSaveConfig();
  const createDm = useCreateBenchmark(), updateDm = useUpdateBenchmark(), deleteDm = useDeleteBenchmark();

  const [tab, setTab] = useState<Tab>('alloc');
  const [pid, setPid] = useState('');
  const [period, setPeriod] = useState<'life' | 'year'>('life');
  const [dmId, setDmId] = useState('');
  const [cell, setCell] = useState<{ loai: string | null; nhom: number | null } | null>(null);
  const [floorOpen, setFloorOpen] = useState(false);
  const [dmName, setDmName] = useState<string | null>(null);
  const [dmSel, setDmSel] = useState('');
  const [rename, setRename] = useState<{ rec: AllocRecord; name: string } | null>(null);
  const [delDm, setDelDm] = useState<AllocRecord | null>(null);
  const [rule, setRule] = useState({ tuKhoa: '', loai: '', nhom: '2' });
  const [fund, setFund] = useState<number | null>(null);

  const projects = useMemo(() => (projectsQ.data ?? []).filter((p) => !p.is_company_overhead), [projectsQ.data]);
  const recs = records.data ?? [];
  const configRec = recs.find((r) => r.kind === 'config');
  const benchmarks = useMemo(() => recs.filter((r) => r.kind === 'benchmark').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [recs]);
  // Mặc định mở công trình có bảng sàn và đã từng lưu định mức / phân nhóm; không có thì công trình đầu danh sách
  const projectId = pid || (() => {
    const withData = new Set(recs.map((r) => (r.kind === 'benchmark' ? String(r.data.nguonPid ?? '') : r.project_id ?? '')));
    return (projects.find((p) => withData.has(p.id) && floorAreaTotal(p.floor_areas as FloorRow[]) > 0) ?? projects.find((p) => floorAreaTotal(p.floor_areas as FloorRow[]) > 0) ?? projects[0])?.id ?? '';
  })();
  const project = projects.find((p) => p.id === projectId);
  const projectRec = recs.find((r) => r.kind === 'project' && r.project_id === projectId);
  const src = useMemo(() => (report.data && lines.data ? toAllocSource(report.data, lines.data) : null), [report.data, lines.data]);
  const years = useMemo(() => (period === 'life' ? ALL_YEARS : toYearFilter(yearSel)), [period, yearSel]);
  const sum: AllocSummary | null = useMemo(
    () => (src && project ? allocSummary({ projectId: project.id, floorAreas: project.floor_areas as FloorRow[], src, years, projectData: projectRec?.data ?? null, configData: configRec?.data ?? null }) : null),
    [src, project, years, projectRec, configRec],
  );
  const cfg = useMemo(() => readAllocConfig(configRec?.data ?? null), [configRec]);
  const matrix = useMemo(() => (sum ? typeGroupMatrix(sum) : []), [sum]);
  const allTypes = useMemo(() => {
    const set = new Set<string>(['Nhân Công', 'Hóa Đơn Lẻ', 'Thầu Phụ']);
    for (const e of report.data?.expenses ?? []) { const t = e.expense_type_id && report.data!.catalogName.get(e.expense_type_id); if (t) set.add(t); }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [report.data]);

  const loading = report.isLoading || lines.isLoading || records.isLoading || projectsQ.isLoading;
  const error = report.error || lines.error || records.error || projectsQ.error;
  if (loading) return <LoadingState />;
  if (error || !report.data) return <ErrorState error={error} onRetry={() => { void report.refetch(); void lines.refetch(); void records.refetch(); void projectsQ.refetch(); }} />;
  if (!project || !sum) return <Card><EmptyState icon="pie_chart" title="Chưa có công trình">Thêm công trình ở tab Công Trình trước.</EmptyState></Card>;

  const onErr = (e: Error) => toast(`Chưa lưu được: ${e.message}`, 'error');
  const dm = benchmarks.find((b) => b.id === dmId) ?? benchmarks.find((b) => b.data.nguonPid === project.id) ?? benchmarks[0];
  const dmData = dm ? readBenchmark(dm.data) : null;
  const diff = compareToBenchmark(sum, dmData);
  const unassigned = sum.chuaNhom.reduce((s, l) => s + l.parts.filter((p) => p.nhom === 0).reduce((a, p) => a + p.tien, 0), 0);
  const showZero = sum.theoNhom[0]! > 0;
  const cols = showZero ? [...COST_GROUP_IDS, 0] : [...COST_GROUP_IDS];
  const maxCell = Math.max(1, ...matrix.flatMap((r) => cols.map((n) => r.nhom[n] ?? 0)));
  const picked: Picked[] = cell ? sum.lines.flatMap((line) => line.parts.filter((part) => (cell.loai === null || line.loai === cell.loai) && (cell.nhom === null || part.nhom === cell.nhom)).map((part) => ({ line, part }))) : [];
  const assign = (keys: string[], group: number) => {
    const nhomTay = { ...sum.st.nhomTay };
    for (const k of keys) { if (group) nhomTay[k] = group; else delete nhomTay[k]; }
    saveAlloc.mutate({ projectId: project.id, current: projectRec, changes: { nhomTay } }, { onSuccess: () => toast(group ? `Đã gán ${keys.length} khoản vào Nhóm ${group}` : `Đã bỏ gán tay ${keys.length} khoản`), onError: onErr });
  };
  const setContractGroup = (id: string, group: number) => {
    const theoHdtp = { ...sum.st.theoHdtp };
    if (group) theoHdtp[id] = { nhom: group }; else delete theoHdtp[id];
    saveAlloc.mutate({ projectId: project.id, current: projectRec, changes: { theoHdtp } }, { onSuccess: () => toast('Đã lưu nhóm của HĐ thầu phụ'), onError: onErr });
  };
  const saveConfig = (changes: Parameters<typeof saveCfg.mutate>[0]['changes'], msg: string) => saveCfg.mutate({ current: configRec, changes }, { onSuccess: () => toast(msg), onError: onErr });
  const cStats = contractStats(sum);
  const periodLabel = period === 'life' ? 'Trọn vòng đời' : yearSel === 'all' ? 'Tất cả năm' : yearLabel;
  const projectOpts = projects.map((p) => ({ value: p.id, label: p.name }));

  const buckets = (
    <div className="grid grid-cols-2 gap-px border-t border-line-soft bg-line sm:grid-cols-3 xl:grid-cols-6" data-testid="tyt-buckets">
      {PILLAR_ORDER.map((k) => (
        <div key={k || 'khac'} className="bg-surface px-3 py-2.5" data-bucket={k || 'khac'}>
          <small className="block text-[11.5px] text-muted">Rổ {pillarLabel(k)}</small>
          <b className="num text-[15px]">{formatShortMoney(sum.theoTru[k])}</b>
          <span className="block text-[11.5px] text-faint">{perM2(sum.theoTru[k], sum.tongSan)} đ/m² · {pct(sum.theoTru[k], sum.tongChi)}%</span>
        </div>
      ))}
    </div>
  );

  if (phone) {
    return (
      <>
        <Select aria-label="Công trình" value={project.id} onChange={(e) => setPid(e.target.value)}>{projectOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
        <PhoneKpis items={[{ label: 'Tổng sàn', value: `${m2(sum.tongSan)} m²` }, { label: 'Đơn giá / m²', value: perM2(sum.tongChi, sum.tongSan) }, { label: `Tổng chi · ${periodLabel}`, value: formatMoney(sum.tongChi), wide: true }]} />
        <Card className="grid gap-1.5 p-3.5 text-[13px]">
          <div className="text-[11.5px] font-semibold text-muted">Theo nhóm chi phí</div>
          {[...COST_GROUP_IDS, 0].filter((n) => n !== 0 || showZero).map((n) => (
            <div key={n} className="flex justify-between gap-3"><span className={n === 0 ? 'text-bad' : ''}>{COST_GROUPS[n]!.ten}</span><b className="num">{formatShortMoney(sum.theoNhom[n] ?? 0)}</b></div>
          ))}
        </Card>
        <Card className="grid gap-1.5 p-3.5 text-[13px]">
          <div className="text-[11.5px] font-semibold text-muted">6 rổ của Nhóm 1 (đ/m²)</div>
          {PILLAR_ORDER.map((k) => <div key={k || 'khac'} className="flex justify-between gap-3"><span>{pillarLabel(k)}</span><b className="num">{perM2(sum.theoTru[k], sum.tongSan)}</b></div>)}
        </Card>
        {sum.chuaNhom.length ? <Note icon="warning">{sum.chuaNhom.length} khoản chưa xếp nhóm ({formatMoney(unassigned)}) — xử lý trên máy tính.</Note> : null}
      </>
    );
  }

  const allocTab = (
    <>
      <FilterBar>
        <FilterSelect label="Công trình" value={project.id} onChange={setPid} options={projectOpts} allLabel={null} />
        <FilterSelect label="Kỳ" value={period} onChange={(v) => setPeriod(v as 'life' | 'year')} options={[{ value: 'life', label: 'Trọn vòng đời' }, { value: 'year', label: `Theo năm đang chọn (${yearSel === 'all' ? 'Tất cả' : yearLabel})` }]} allLabel={null} />
        {benchmarks.length ? <FilterSelect label="So với" value={dm?.id ?? ''} onChange={setDmId} options={benchmarks.map((b) => ({ value: b.id, label: b.name ?? 'Định mức' }))} allLabel={null} /> : null}
        <span className="flex-1" />
        <Button onClick={() => setTab('config')}><Icon name="rule" />Luật tự gán ({cfg.nhomLuat.length})</Button>
        {canEdit ? <Button variant="primary" data-testid="tyt-save-benchmark" onClick={() => { if (!(sum.tongSan > 0)) { toast('Công trình chưa có khối lượng sàn — nhập bảng Khối lượng sàn trước.', 'error'); return; } setDmName(`Định mức — ${project.name}`); }}><Icon name="bookmark_add" />Lưu làm định mức</Button> : null}
      </FilterBar>
      <div data-testid="tyt-kpis">
        <KpiStrip items={[
          { label: 'Tổng chi thực tế', value: <span data-testid="tyt-total">{formatMoney(sum.tongChi)}</span>, sub: `${pct(sum.tongChi - unassigned, sum.tongChi)}% đã xếp nhóm · ${periodLabel}` },
          { label: 'Tổng sàn quy đổi', value: `${m2(sum.tongSan)} m²` },
          { label: 'Đơn giá / m²', value: perM2(sum.tongChi, sum.tongSan), sub: sum.tongSan > 0 ? `Nhóm 1: ${formatMoney(Math.round(sum.cpM2N1))} đ/m²` : 'chưa có khối lượng sàn' },
          { label: 'So định mức (Nhóm 1)', value: diff === null ? '—' : <Pill tone={diff > 2 ? 'warn' : diff < -2 ? 'good' : 'neutral'}>{`${diff >= 0 ? '+' : '−'}${Math.abs(diff).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`}</Pill>, sub: dmData && dmData.dgRo1 > 0 ? `định mức ${formatMoney(dmData.dgRo1)} đ/m²` : 'chưa có định mức' },
          { label: 'Khoản chưa gán', value: String(sum.chuaNhom.length), sub: sum.chuaNhom.length ? formatShortMoney(unassigned) : '', tone: sum.chuaNhom.length ? 'neg' : '' },
        ]} />
      </div>
      {sum.chuaNhom.length ? <div><Button variant="danger" data-testid="tyt-unassigned" onClick={() => setCell({ loai: null, nhom: 0 })}><Icon name="warning" />{sum.chuaNhom.length} khoản chưa xếp nhóm — bấm để gán</Button></div> : null}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
        <div className="grid min-w-0 content-start gap-4">
          <Card>
            <CardHeader title="Khối lượng sàn" actions={canEdit ? <Button size="sm" variant="ghost" data-testid="tyt-floor-edit" onClick={() => setFloorOpen(true)}><Icon name="edit" />Sửa</Button> : null} />
            {(project.floor_areas as FloorRow[]).length === 0 ? <EmptyState icon="square_foot" title="Chưa có khối lượng sàn">Nhập để tính đơn giá / m².</EmptyState> : (
              <div className="tbl">
                <table>
                  <thead><tr><th>Tầng / khu</th><th className="!text-right">KL (m²)</th><th className="!text-right">Hệ số</th></tr></thead>
                  <tbody>{(project.floor_areas as FloorRow[]).map((r, i) => (
                    <tr key={i} className={r.tinh === false ? 'text-faint line-through' : ''}><td>{r.ten}</td><td className="num text-right">{m2(Number(r.kl) || 0)}</td><td className="num text-right">{String(r.heSo ?? 1).replace('.', ',')}</td></tr>
                  ))}</tbody>
                  <tfoot><tr className="font-bold [&>td]:bg-surface-2"><td>Tổng sàn</td><td className="num text-right">{m2(sum.tongSan)}</td><td /></tr></tfoot>
                </table>
              </div>
            )}
          </Card>
          {sum.contracts.length ? (
            <Card>
              <CardHeader title="HĐ thầu phụ" sub="mọi khoản của thầu phụ đi theo nhóm đã chọn" />
              <div className="tbl">
                <table>
                  <thead><tr><th>Thầu phụ</th><th className="!text-right">Đã chi</th><th>Nhóm</th></tr></thead>
                  <tbody>{sum.contracts.map((h) => (
                    <tr key={h.id}>
                      <td>{h.ten}<span className="block text-[11.5px] text-faint">{h.nd || formatDate(h.ngay)} · HĐ {formatShortMoney(h.giaTri)}</span></td>
                      <td className="num text-right">{formatShortMoney(cStats.get(h.id)?.tien ?? 0)}</td>
                      <td>
                        <Select aria-label={`Nhóm của HĐ ${h.ten}`} disabled={!canEdit || saveAlloc.isPending} className="!h-8 !w-[150px]" value={String(sum.st.theoHdtp[h.id]?.nhom ?? '')} onChange={(e) => setContractGroup(h.id, Number(e.target.value))}>
                          <option value="">Theo loại / luật</option>
                          {GROUP_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>
        <Card>
          <CardHeader title="Chi theo loại chi phí × nhóm" sub="bấm một ô để xem các khoản chi trong đó và gán tay" />
          {matrix.length === 0 ? <EmptyState icon="pie_chart" title="Chưa có khoản chi nào trong kỳ này" /> : (
            <div className="tbl" data-testid="tyt-matrix">
              <table>
                <thead><tr><th>Loại chi phí</th>{cols.map((n) => <th key={n} className="!text-right" title={COST_GROUPS[n]!.mo}>{n === 0 ? 'Chưa xếp' : `${n} · ${COST_GROUPS[n]!.ngan}`}</th>)}<th className="!text-right">Tổng</th><th className="!text-right">đ/m²</th></tr></thead>
                <tbody>
                  {matrix.map((r) => (
                    <tr key={r.loai}>
                      <td className="whitespace-nowrap">{r.loai}</td>
                      {cols.map((n) => (
                        <td key={n} className="num cursor-pointer text-right" onClick={() => { if (r.nhom[n]) setCell({ loai: r.loai, nhom: n }); }}>
                          {r.nhom[n] ? <span className="inline-block min-w-[92px] rounded-[5px] px-2 py-[3px]" style={{ background: `color-mix(in srgb, var(--${n === 0 ? 'bad' : 'accent'}) ${Math.max(4, Math.round((r.nhom[n]! / maxCell) * 35))}%, transparent)` }}>{formatMoney(r.nhom[n]!)}</span> : ''}
                        </td>
                      ))}
                      <td className="num cursor-pointer text-right" onClick={() => setCell({ loai: r.loai, nhom: null })}><b>{formatMoney(r.tong)}</b></td>
                      <td className="num text-right text-faint">{perM2(r.tong, sum.tongSan)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold [&>td]:bg-surface-2"><td>Tổng</td>{cols.map((n) => <td key={n} className="num text-right" data-group-total={n}>{formatMoney(sum.theoNhom[n] ?? 0)}</td>)}<td className="num text-right">{formatMoney(sum.tongChi)}</td><td className="num text-right">{perM2(sum.tongChi, sum.tongSan)}</td></tr>
                  <tr className="text-[12px] text-muted"><td>đ/m²</td>{cols.map((n) => <td key={n} className="num text-right">{perM2(sum.theoNhom[n] ?? 0, sum.tongSan)}</td>)}<td /><td /></tr>
                </tfoot>
              </table>
            </div>
          )}
          <div className="border-t border-line-soft px-3.5 pt-2 text-[11.5px] font-semibold text-muted">6 rổ của Nhóm 1 (phần thô &amp; nhân công hoàn thiện)</div>
          {buckets}
        </Card>
      </div>
    </>
  );

  const dmShown = benchmarks.find((b) => b.id === dmSel) ?? benchmarks[0];
  const dmShownData = dmShown ? readBenchmark(dmShown.data) : null;
  const refreshDm = (rec: AllocRecord) => {
    const b = readBenchmark(rec.data);
    const p = projects.find((x) => x.id === b.nguonPid);
    if (!p || !src) { toast('Không tìm thấy công trình nguồn của định mức này.', 'error'); return; }
    const r = allocSummary({ projectId: p.id, floorAreas: p.floor_areas as FloorRow[], src, years: ALL_YEARS, projectData: recs.find((x) => x.kind === 'project' && x.project_id === p.id)?.data ?? null, configData: configRec?.data ?? null });
    if (!(r.tongSan > 0)) { toast('Công trình nguồn chưa có khối lượng sàn.', 'error'); return; }
    updateDm.mutate({ record: rec, fields: benchmarkFields({ id: p.id, name: p.name, kindLabel: KIND_CODE[p.kind ?? ''] ?? '' }, r, 'Trọn vòng đời') }, { onSuccess: () => toast('Đã cập nhật định mức theo số liệu mới nhất'), onError: onErr });
  };
  const benchmarkTab = benchmarks.length === 0 ? (
    <Card><EmptyState icon="bookmark" title="Chưa có định mức nào">Mở tab PHÂN BỔ CÔNG TRÌNH, chọn công trình đã xong rồi bấm "Lưu làm định mức".</EmptyState></Card>
  ) : (
    <>
      <Card>
        <CardHeader title="Định mức đã lưu" sub="dùng để báo giá công trình mới · bấm một dòng để xem chi tiết" />
        <div className="tbl" data-testid="tyt-benchmarks">
          <table>
            <thead><tr><th>Tên định mức</th><th>Loại CT</th><th className="!text-right">Tổng sàn</th><th className="!text-right">Tổng chi</th><th className="!text-right">Đơn giá tổng</th><th className="!text-right">Nhóm 1</th>{PILLAR_ORDER.map((k) => <th key={k || 'khac'} className="!text-right">{pillarLabel(k)}</th>)}</tr></thead>
            <tbody>{benchmarks.map((rec) => {
              const b = readBenchmark(rec.data);
              return (
                <tr key={rec.id} className="cursor-pointer" aria-selected={rec.id === dmShown?.id} onClick={() => setDmSel(rec.id)}>
                  <td className="whitespace-nowrap"><b className="font-semibold">{rec.name}</b><span className="block text-[11.5px] text-faint">{b.nam}</span></td>
                  <td>{b.loaiCT || '—'}</td>
                  <td className="num text-right">{m2(b.tongSan)} m²</td>
                  <td className="num text-right">{formatMoney(b.tongChi)}</td>
                  <td className="num text-right"><b>{formatMoney(b.dgTong)}</b></td>
                  <td className="num text-right">{formatMoney(b.dgRo1)}</td>
                  {PILLAR_ORDER.map((k) => <td key={k || 'khac'} className="num text-right text-faint">{formatMoney(b.ro1[k === '' ? 'khac' : k] ?? 0)}</td>)}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>
      {dmShown && dmShownData ? (
        <Card>
          <CardHeader title="Đơn giá theo loại chi phí (đ/m²)" sub={dmShown.name ?? ''}
            actions={canEdit ? (
              <>
                <Button size="sm" onClick={() => setRename({ rec: dmShown, name: dmShown.name ?? '' })}><Icon name="edit" />Đổi tên</Button>
                <Button size="sm" disabled={updateDm.isPending} onClick={() => refreshDm(dmShown)}><Icon name="refresh" />Cập nhật từ công trình nguồn</Button>
                <Button size="sm" variant="ghost-danger" data-testid="tyt-dm-delete" onClick={() => setDelDm(dmShown)}><Icon name="delete" />Xóa</Button>
              </>
            ) : null} />
          <div className="p-3.5">
            <HBarList items={Object.entries(dmShownData.dgLoai).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ key: label, label, value, display: formatMoney(value) }))} empty="Định mức này không có số theo loại" />
          </div>
        </Card>
      ) : null}
    </>
  );

  const configTab = (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Loại chi phí → nhóm, rổ" sub="dùng chung mọi công trình" />
        <div className="tbl" data-testid="tyt-type-config">
          <table>
            <thead><tr><th>Loại chi phí</th><th>Nhóm</th><th>Rổ (khi ở Nhóm 1)</th></tr></thead>
            <tbody>{allTypes.map((t) => {
              const k = typeKey(t), g = groupOfType(t, cfg), pl = pillarOfType(t, cfg);
              const gDefault = groupOfType(t, null).nhom, pDefault = pillarOfType(t, null).tru;
              return (
                <tr key={t}>
                  <td className="whitespace-nowrap">{t}</td>
                  <td>
                    <Select aria-label={`Nhóm của ${t}`} disabled={!canEdit || saveCfg.isPending} className="!h-8 !w-[190px]" value={g.src === 'loai' ? String(g.nhom) : ''}
                      onChange={(e) => { const nhomLoai = { ...cfg.nhomLoai }; if (e.target.value === '') delete nhomLoai[k]; else nhomLoai[k] = Number(e.target.value); saveConfig({ nhomLoai }, `Đã lưu nhóm của "${t}"`); }}>
                      <option value="">Mặc định: {gDefault ? `Nhóm ${gDefault}` : 'Chưa xếp'}</option>
                      {GROUP_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      <option value="0">Chưa xếp nhóm</option>
                    </Select>
                  </td>
                  <td>
                    {g.nhom === 1 ? (
                      <Select aria-label={`Rổ của ${t}`} disabled={!canEdit || saveCfg.isPending} className="!h-8 !w-[170px]" value={pl.src === 'loai' ? pl.tru || '-' : ''}
                        onChange={(e) => { const truLoai = { ...cfg.truLoai }; if (e.target.value === '') delete truLoai[k]; else truLoai[k] = e.target.value === '-' ? '' : e.target.value; saveConfig({ truLoai }, `Đã lưu rổ của "${t}"`); }}>
                        <option value="">Mặc định: {pillarLabel(pDefault)}</option>
                        {PILLAR_ORDER.filter((x) => x !== '').map((x) => <option key={x} value={x}>{PILLARS[x].ten}</option>)}
                        <option value="-">Chưa xếp rổ (Khác)</option>
                      </Select>
                    ) : <span className="text-faint">—</span>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title="Luật theo từ khóa" sub="xét trước bảng loại; từ khóa không dấu cũng khớp"
          actions={canEdit ? <Button size="sm" variant="ghost" onClick={() => saveConfig({ nhomLuat: defaultGroupRules() }, 'Đã đưa luật về mặc định')}><Icon name="restart_alt" />Về mặc định</Button> : null} />
        <div className="tbl" data-testid="tyt-rules">
          <table>
            <thead><tr><th>Nếu nội dung chứa</th><th>Loại</th><th>Gán vào</th><th /></tr></thead>
            <tbody>{cfg.nhomLuat.map((l) => (
              <tr key={l.id}>
                <td className="wrap">{l.tuKhoa}</td><td className="whitespace-nowrap">{l.loai || 'mọi loại'}</td><td className="whitespace-nowrap"><Pill tone="accent">{`Nhóm ${l.nhom} · ${COST_GROUPS[l.nhom]?.ngan ?? ''}`}</Pill></td>
                <td className="text-right">{canEdit ? <Button size="icon" variant="ghost" aria-label={`Xóa luật ${l.tuKhoa}`} onClick={() => saveConfig({ nhomLuat: cfg.nhomLuat.filter((x) => x.id !== l.id) }, 'Đã xóa luật')}><Icon name="close" /></Button> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {canEdit ? (
          <div className="grid gap-3 border-t border-line-soft p-3.5">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Từ khóa (cách nhau dấu phẩy)" className="col-span-2"><Input aria-label="Từ khóa luật mới" value={rule.tuKhoa} onChange={(e) => setRule({ ...rule, tuKhoa: e.target.value })} placeholder="chống thấm, sika" /></Field>
              <Field label="Chỉ với loại (bỏ trống = mọi loại)"><Input aria-label="Loại của luật mới" value={rule.loai} onChange={(e) => setRule({ ...rule, loai: e.target.value })} list="tyt-types" /><datalist id="tyt-types">{allTypes.map((t) => <option key={t} value={t} />)}</datalist></Field>
              <Field label="Gán vào"><Select aria-label="Nhóm của luật mới" value={rule.nhom} onChange={(e) => setRule({ ...rule, nhom: e.target.value })}>{GROUP_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
            </div>
            <div><Button data-testid="tyt-rule-add" disabled={saveCfg.isPending} onClick={() => {
              if (!rule.tuKhoa.trim()) { toast('Nhập ít nhất một từ khóa!', 'error'); return; }
              saveConfig({ nhomLuat: [...cfg.nhomLuat, { id: 'q' + Date.now().toString(36), loai: rule.loai.trim(), tuKhoa: rule.tuKhoa.trim(), nhom: Number(rule.nhom) }] }, 'Đã thêm luật');
              setRule({ tuKhoa: '', loai: '', nhom: rule.nhom });
            }}><Icon name="add" />Thêm luật</Button></div>
            <div className="grid grid-cols-[minmax(0,220px)_auto] items-end gap-2">
              <Field label="Quỹ phụ phí (đ/m²)" hint="mức chung để kiểm soát rổ Quỹ"><MoneyInput aria-label="Quỹ phụ phí" value={fund ?? cfg.quyMuc} onChange={setFund} /></Field>
              <Button disabled={fund === null || fund === cfg.quyMuc || saveCfg.isPending} onClick={() => { saveConfig({ quyMuc: fund ?? cfg.quyMuc }, 'Đã lưu mức quỹ'); setFund(null); }}>Lưu mức quỹ</Button>
            </div>
          </div>
        ) : <div className="p-3.5 text-[13px] text-muted">Quỹ phụ phí: <b className="num text-fg">{formatMoney(cfg.quyMuc)}</b> đ/m²</div>}
      </Card>
    </div>
  );

  return (
    <>
      <PageHeader title="Tỉ Trọng & Định Mức" sub="Chi phí mỗi công trình chia theo nhóm, loại, rổ; lưu thành định mức để báo giá" />
      <SubTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'alloc' ? allocTab : tab === 'benchmark' ? benchmarkTab : configTab}

      {cell ? <LinesSheet key={`${cell.loai}|${cell.nhom}`} canEdit={canEdit} busy={saveAlloc.isPending} items={picked} onAssign={assign} onClose={() => setCell(null)}
        title={`${cell.loai ?? 'Mọi loại'} · ${cell.nhom === null ? 'mọi nhóm' : cell.nhom === 0 ? 'Chưa xếp nhóm' : COST_GROUPS[cell.nhom]!.ten}`} /> : null}
      {floorOpen ? <FloorSheet project={project} onClose={() => setFloorOpen(false)} /> : null}
      <Sheet open={dmName !== null} onOpenChange={(o) => { if (!o) setDmName(null); }} title="Lưu làm định mức"
        footer={<><Button onClick={() => setDmName(null)}>Hủy</Button><Button variant="primary" data-testid="tyt-dm-save" disabled={createDm.isPending} onClick={() => createDm.mutate(
          { name: dmName ?? '', fields: benchmarkFields({ id: project.id, name: project.name, kindLabel: KIND_CODE[project.kind ?? ''] ?? '' }, sum, periodLabel) },
          { onSuccess: () => { setDmName(null); toast('Đã lưu định mức'); setTab('benchmark'); }, onError: onErr })}><Icon name="save" />Lưu</Button></>}>
        <div className="grid gap-3">
          <Field label="Tên định mức"><Input aria-label="Tên định mức" value={dmName ?? ''} onChange={(e) => setDmName(e.target.value)} /></Field>
          <Note>Lưu đơn giá đ/m² của {project.name} ({periodLabel}): tổng {perM2(sum.tongChi, sum.tongSan)}, Nhóm 1 {formatMoney(Math.round(sum.cpM2N1))}, cùng 6 rổ và từng loại chi phí.</Note>
        </div>
      </Sheet>
      <Sheet open={!!rename} onOpenChange={(o) => { if (!o) setRename(null); }} title="Đổi tên định mức"
        footer={<><Button onClick={() => setRename(null)}>Hủy</Button><Button variant="primary" disabled={updateDm.isPending} onClick={() => rename && updateDm.mutate({ record: rename.rec, name: rename.name }, { onSuccess: () => { setRename(null); toast('Đã đổi tên'); }, onError: onErr })}>Lưu</Button></>}>
        <Field label="Tên định mức"><Input aria-label="Tên định mức mới" value={rename?.name ?? ''} onChange={(e) => rename && setRename({ ...rename, name: e.target.value })} /></Field>
      </Sheet>
      <ConfirmDialog open={!!delDm} onOpenChange={(o) => { if (!o) setDelDm(null); }} title="Xóa định mức?" danger busy={deleteDm.isPending} confirmLabel="Xóa"
        message={<>Xóa "{delDm?.name}". Định mức vào Thùng Rác, khôi phục được.</>}
        onConfirm={() => delDm && deleteDm.mutate(delDm.id, { onSuccess: () => { setDelDm(null); toast('Đã xóa định mức (vào Thùng Rác)'); }, onError: (e) => { setDelDm(null); onErr(e); } })} />
    </>
  );
}
