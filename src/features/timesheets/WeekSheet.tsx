// SỔ CHẤM CÔNG (PAGES.chamcong sub 0 + MP.cc của mẫu): tuần CN → T7, chọn công trình, bảng công nhân,
// Copy / Dán tuần, Phiếu lương Zalo (chỉ máy tính), Lưu tuần (mỗi công trình mỗi tuần 1 bản ghi). Điện thoại: mỗi thợ một thẻ.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { ConfirmDialog } from '@/components/ui/confirm';
import { FilterBar, FilterSelect, KpiStrip, Money } from '@/components/ui/data';
import { Input, MoneyInput } from '@/components/ui/input';
import { Card, EmptyState, Note, PageHeader } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { calcSheetRow, payslipData, payslipText, sheetTotals, shiftWeek, weekEnd, weekRangeLabel, weekStartOf, type PayrollIndex } from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { findByName } from '@/features/expenses/logic';
import { AttachReceiptButton, ReceiptPhotoButton } from '@/features/scan/ReceiptPhoto';
import { useCreateWorker, useDeleteWeek, useSaveWeek, useSetWeekImage, type TimesheetData } from './api';
import { blankRow, checkSheet, copyRows, pasteRows, rowsFromWeek, sameRows, toCalcRow, type DraftRow } from './sheet-model';
import { cDay, DAY_LABELS, DayCell, dayText, PayslipSheet, PhoneDayInput, RoleTag } from './shared';

const CLIP_KEY = 'qlcp-cc-clipboard';
function loadClip(): DraftRow[] | null {
  try { const raw = localStorage.getItem(CLIP_KEY); return raw ? (JSON.parse(raw) as DraftRow[]) : null; } catch { return null; }
}
/** Nhớ trong máy: có hiện 3 cột Phụ cấp, HĐ mua lẻ, Nội dung không (mặc định ẩn — GĐ99) */
const EXTRAS_KEY = 'qlcp-cc-extras';
function loadExtras(): boolean {
  try { return localStorage.getItem(EXTRAS_KEY) === '1'; } catch { return false; }
}

/** Khoản của dòng đang bị ẩn (cột tắt) hoặc không còn cột (Trừ nợ cũ) — để hiện dấu nhỏ ở Thực lãnh */
function hiddenParts(r: DraftRow, extrasShown: boolean): string[] {
  const out: string[] = [];
  if (!extrasShown) {
    if (r.allowance) out.push(`Phụ cấp ${formatMoney(r.allowance)}`);
    if (r.retail) out.push(`HĐ mua lẻ ${formatMoney(r.retail)}`);
    if (r.note.trim()) out.push(`Nội dung: ${r.note.trim()}`);
  }
  if (r.deduction) out.push(`Trừ nợ ${formatMoney(r.deduction)} (ghi ở Tạm ứng lương)`);
  return out;
}

type Props = {
  data: TimesheetData;
  ix: PayrollIndex;
  weekStart: string;
  projectId: string;
  /** Đổi tuần / công trình (đã hỏi xác nhận nếu còn thay đổi chưa lưu) */
  onNavigate: (next: { weekStart?: string; projectId?: string }) => void;
  canAdd: boolean;
  phone: boolean;
  tabs: ReactNode;
  dirtyRef: { current: boolean };
};

export function WeekSheet({ data, ix, weekStart, projectId, onNavigate, canAdd, phone, tabs, dirtyRef }: Props) {
  const toast = useToast();
  const save = useSaveWeek();
  const del = useDeleteWeek();
  const createWorker = useCreateWorker();
  const week = useMemo(() => data.weeks.find((w) => w.project_id === projectId && w.week_start === weekStart) ?? null, [data.weeks, projectId, weekStart]);
  const saved = useMemo(() => rowsFromWeek(week, data.lines, data.advances, data.workerName), [week, data.lines, data.advances, data.workerName]);
  const [rows, setRows] = useState<DraftRow[]>(saved);
  const [bad, setBad] = useState<string[]>([]);
  const [clip, setClip] = useState<DraftRow[] | null>(loadClip);
  const [pending, setPending] = useState<{ weekStart?: string; projectId?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [slip, setSlip] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [extras, setExtras] = useState<boolean>(loadExtras);
  const [phoneExtras, setPhoneExtras] = useState<string | null>(null);
  const toggleExtras = () => setExtras((v) => { try { localStorage.setItem(EXTRAS_KEY, v ? '0' : '1'); } catch { /* bỏ qua */ } return !v; });
  const focusKey = useRef<string | null>(null);

  // Nạp lại bảng khi đổi tuần / công trình hoặc sau khi lưu (updated_at đổi); tải lại dữ liệu y nguyên thì giữ bảng đang sửa.
  // Máy khác vừa lưu CÙNG tuần này trong lúc mình đang sửa dở (dữ liệu tự làm mới) → giữ bảng đang sửa, báo cho người dùng.
  const sheetKey = `${weekStart}|${projectId}|${week?.id ?? ''}`;
  const loadKey = `${sheetKey}|${week?.updated_at ?? ''}`;
  const lastSheet = useRef(sheetKey);
  const [otherSaved, setOtherSaved] = useState(false);
  useEffect(() => {
    const sameSheet = lastSheet.current === sheetKey;
    lastSheet.current = sheetKey;
    // Mình vừa lưu xong thì bảng đang có = dữ liệu mới → nạp bình thường; khác nhau mới là người khác lưu chen vào
    if (sameSheet && dirtyRef.current && !sameRows(rows, saved)) { setOtherSaved(true); return; }
    setRows(saved); setBad([]); setOtherSaved(false);
  }, [loadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !sameRows(rows, saved);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty, dirtyRef]);
  useEffect(() => () => { dirtyRef.current = false; }, [dirtyRef]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  useEffect(() => {
    if (!focusKey.current) return;
    document.querySelector<HTMLInputElement>(`[data-row="${focusKey.current}"] input[role="combobox"]`)?.focus();
    focusKey.current = null;
  });

  const go = (next: { weekStart?: string; projectId?: string }) => { if (dirty) setPending(next); else onNavigate(next); };
  const workers = useMemo(() => data.workers.filter((w) => !w.archived), [data.workers]);
  const totals = sheetTotals(rows.map(toCalcRow));
  const readOnly = !canAdd;
  // Tuần cũ đã lưu (nhập tay): nút lưu ảnh phiếu chấm công giấy để đối chiếu sau — gắn ngay, không cần bấm Lưu tuần
  const setWeekImage = useSetWeekImage();
  const attachPhoto = !readOnly && week ? {
    date: week.week_start, hasPhoto: !!week.sheet_image_path, label: 'Lưu ảnh phiếu',
    onAttach: (path: string) => setWeekImage.mutateAsync({ weekId: week.id, path }),
  } : null;

  const setRow = (key: string, patch: Partial<DraftRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setName = (key: string, name: string) => {
    const w = findByName(name, workers);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, name, role: w ? w.role : r.role } : r)));
  };
  const addRow = () => { const r = blankRow(); focusKey.current = r.key; setRows((rs) => [...rs, r]); if (phone) setOpenRow(r.key); };
  const createName = async (text: string) => {
    try { const w = await createWorker.mutateAsync(text); toast(`Đã thêm công nhân ${w.name} vào Danh Bạ`); return w.name; }
    catch (e) { toast(`Chưa thêm được công nhân: ${(e as Error).message}`, 'error'); return undefined; }
  };

  const doSave = () => {
    if (save.isPending || readOnly) return;
    if (!projectId) { toast('Chọn công trình!', 'error'); return; }
    const check = checkSheet(rows, data.workers);
    if (!check.ok) { setBad(check.badKeys); toast(check.message, 'error'); return; }
    setBad([]);
    save.mutate({ projectId, weekStart, lines: check.lines }, {
      onSuccess: () => {
        const hd = check.lines.filter((l) => l.retail_purchase > 0).length;
        toast(`Đã lưu ${weekRangeLabel(weekStart)} [${data.projectName(projectId)}]${hd ? ` · ${hd} HĐ lẻ` : ''}`);
      },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };
  const doCopy = () => {
    const c = copyRows(rows);
    if (!c.length) { toast('Bảng trống, chưa có gì để copy!', 'error'); return; }
    setClip(c);
    try { localStorage.setItem(CLIP_KEY, JSON.stringify(c)); } catch { /* bỏ qua */ }
    toast(`Đã copy ${c.length} công nhân (${cDay(c.reduce((s, r) => s + r.days.reduce((a, v) => a + v, 0), 0))} công) — bấm Dán tuần để áp dụng`);
  };
  const doPaste = () => {
    if (!clip?.length) { toast('Chưa copy tuần nào!', 'error'); return; }
    setRows(pasteRows(clip));
    toast(`Đã dán ${clip.length} công nhân đầy đủ ngày công — nhớ bấm Lưu tuần`);
  };
  const doSlip = () => {
    if (!week) { toast('Tuần này chưa lưu — lưu tuần trước rồi mới in phiếu lương', 'error'); return; }
    if (dirty) { toast('Còn thay đổi chưa lưu — lưu tuần trước để phiếu lương đúng số', 'error'); return; }
    const sat = weekEnd(weekStart);
    const ids = data.lines.filter((l) => l.week_id === week.id).sort((a, b) => a.position - b.position).map((l) => l.worker_id);
    setSlip(ids.map((id) => payslipText(payslipData(ix, id, weekStart, sat), data.workerName(id), data.projectName)).join('\n\n'));
  };
  const doDelete = () => {
    if (!week) return;
    del.mutate(week.id, {
      onSuccess: () => { setConfirmDelete(false); toast('Đã xóa tuần — vào Thùng rác'); },
      onError: (e) => { setConfirmDelete(false); toast(`Chưa xóa được: ${e.message}`, 'error'); },
    });
  };

  const projectOpts = useMemo(() => {
    const list = [...data.projectOptions];
    if (projectId && !list.some((p) => p.id === projectId)) { const p = data.projects.find((x) => x.id === projectId); if (p) list.push(p); }
    return list.map((p) => ({ value: p.id, label: p.name }));
  }, [data.projectOptions, data.projects, projectId]);

  const weekNav = (
    <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface">
      <button type="button" aria-label="Tuần trước" className="px-2 py-1.5 text-muted" onClick={() => go({ weekStart: shiftWeek(weekStart, -1) })}><Icon name="chevron_left" /></button>
      <label className="relative cursor-pointer">
        <b className="num px-1.5 text-[13px] whitespace-nowrap" data-testid="cc-week">{weekRangeLabel(weekStart)}</b>
        <input type="date" aria-label="Chọn ngày trong tuần" className="absolute inset-0 cursor-pointer opacity-0" value={weekStart}
          onChange={(e) => { if (e.target.value) go({ weekStart: weekStartOf(e.target.value) }); }} />
      </label>
      <button type="button" aria-label="Tuần sau" className="px-2 py-1.5 text-muted" onClick={() => go({ weekStart: shiftWeek(weekStart, 1) })}><Icon name="chevron_right" /></button>
    </span>
  );
  const projectSel = <FilterSelect label="Công trình" value={projectId} onChange={(v) => go({ projectId: v })} options={projectOpts} allLabel={projectId ? null : 'Chọn công trình'} className="max-w-full" />;

  const actions = (
    <>
      <Button onClick={doCopy}><Icon name="content_copy" />Copy tuần</Button>
      <Button onClick={doPaste} disabled={readOnly || !clip?.length}><Icon name="content_paste" />Dán tuần</Button>
      <Button onClick={doSlip}><Icon name="chat" />Phiếu lương Zalo</Button>
      <Button variant="primary" data-testid="cc-save" onClick={doSave} disabled={readOnly || save.isPending}><Icon name="save" />{save.isPending ? 'Đang lưu…' : 'Lưu tuần'}</Button>
    </>
  );

  const dialogs = (
    <>
      <ConfirmDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }} title="Bỏ thay đổi chưa lưu?"
        message="Bảng chấm công tuần này còn thay đổi chưa lưu. Chuyển đi sẽ mất các thay đổi đó." confirmLabel="Bỏ thay đổi" danger
        onConfirm={() => { const p = pending; setPending(null); if (p) onNavigate(p); }} />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Xóa tuần chấm công?" danger busy={del.isPending} confirmLabel="Xóa tuần"
        message={<>Xóa {weekRangeLabel(weekStart)} của <b>{data.projectName(projectId)}</b> ({saved.length} công nhân). Dòng “Trả” gắn với tuần này (từ cột Trừ nợ trước đây, nếu có) cũng bị xóa. Tuần vào Thùng rác, khôi phục được.</>}
        onConfirm={doDelete} />
      <PayslipSheet text={slip} title={`Phiếu lương ${weekRangeLabel(weekStart)}`} onClose={() => setSlip(null)} />
    </>
  );

  const status = (
    <>
      {readOnly ? <Note icon="lock">Tài khoản chỉ được xem chấm công.</Note> : null}
      {!week && saved.length === 0 && rows.length === 0 ? null : !week ? <Note icon="edit_note">Tuần này của công trình chưa lưu — bấm <b>Lưu tuần</b> để ghi.</Note> : null}
      {dirty && week ? <Note icon="edit_note">Có thay đổi chưa lưu.</Note> : null}
      {otherSaved && dirty ? <Note icon="sync_problem">Tuần này vừa được người khác lưu trên máy khác. Bảng vẫn giữ phần đang sửa — bấm <b>Lưu tuần</b> sẽ ghi đè bản của họ; muốn xem bản mới thì đổi sang tuần khác rồi quay lại (bỏ phần đang sửa).</Note> : null}
    </>
  );

  if (phone) {
    return (
      <>
        <div className="grid gap-2">
          <div className="flex min-w-0 items-center gap-2 [&>span:first-child]:shrink-0">{weekNav}
            {rows.length ? (
              <span className="min-w-0 flex-1 text-right text-[12px] leading-tight text-muted">
                {cDay(totals.dayUnits)} công · <b className="num text-[14px] text-fg" data-testid="cc-net-total">{formatMoney(totals.netPay)}</b>
              </span>
            ) : <span hidden data-testid="cc-net-total">{formatMoney(totals.netPay)}</span>}
          </div>
          {projectSel}
          {status}
          {rows.length === 0 ? <div className="rounded-[var(--r)] border border-dashed border-line px-3.5 py-3 text-center text-[12.5px] text-muted">Tuần này chưa có công nhân.</div> : null}
          {rows.map((r) => {
            const c = calcSheetRow(toCalcRow(r));
            const open = openRow === r.key;
            return (
              <div key={r.key} data-row={r.key} className={cn('grid gap-2 rounded-[var(--r)] border bg-surface px-3 py-2.5', bad.includes(r.key) ? 'border-bad' : 'border-line')}>
                <div className="flex items-center gap-2">
                  {r.name && !open ? <b className="min-w-0 flex-1 truncate text-[14px]">{r.name}</b> : (
                    <div className="min-w-0 flex-1"><Combo aria-label="Tên công nhân" placeholder="Tên công nhân…" value={r.name} onChange={(v) => setName(r.key, v)} items={workers} groupLabel="Công nhân" onCreate={canAdd ? createName : undefined} disabled={readOnly} /></div>
                  )}
                  <RoleTag role={r.role} />
                  <button type="button" aria-label="Sửa chi tiết" className="text-muted" onClick={() => setOpenRow(open ? null : r.key)}><Icon name={open ? 'expand_less' : 'tune'} /></button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {r.days.map((v, i) => (
                    <button key={i} type="button" disabled={readOnly} aria-label={`${DAY_LABELS[i]} ${r.name}`}
                      className={cn('grid h-11 place-items-center rounded-lg border border-line text-[14px] font-bold', v >= 1 ? 'border-transparent bg-good-soft text-good' : v > 0 ? 'border-transparent bg-warn-soft text-warn' : 'text-faint')}
                      onClick={() => setRow(r.key, { days: r.days.map((x, j) => (j === i ? (x >= 1 ? 0.5 : x > 0 ? 0 : 1) : x)) })}>
                      <small className="text-[10px] font-medium text-muted">{DAY_LABELS[i]}</small>{dayText(v)}
                    </button>
                  ))}
                </div>
                {open ? (
                  <div className="grid grid-cols-2 gap-2 text-[12px] text-muted">
                    <div className="col-span-2 grid gap-1">Gõ số công (được số lẻ: 1,3 · 0,75)
                      <div className="grid grid-cols-7 gap-1">
                        {r.days.map((v, d) => (
                          <PhoneDayInput key={d} label={`Số công ${DAY_LABELS[d]} ${r.name}`} value={v} disabled={readOnly}
                            onChange={(nv) => setRow(r.key, { days: r.days.map((x, j) => (j === d ? nv : x)) })} />
                        ))}
                      </div>
                    </div>
                    <label className="col-span-2 grid gap-1">Lương/ngày<MoneyInput aria-label="Lương/ngày" value={r.wage} onChange={(v) => setRow(r.key, { wage: v })} disabled={readOnly} /></label>
                    {phoneExtras === r.key || r.allowance || r.retail || r.note.trim() ? (
                      <>
                        <label className="grid gap-1">Phụ cấp<MoneyInput aria-label="Phụ cấp" value={r.allowance} onChange={(v) => setRow(r.key, { allowance: v })} disabled={readOnly} /></label>
                        <label className="grid gap-1">HĐ mua lẻ<MoneyInput aria-label="HĐ mua lẻ" value={r.retail} onChange={(v) => setRow(r.key, { retail: v })} disabled={readOnly} /></label>
                        <label className="col-span-2 grid gap-1">Nội dung<Input aria-label="Nội dung" value={r.note} onChange={(e) => setRow(r.key, { note: e.target.value })} disabled={readOnly} /></label>
                      </>
                    ) : !readOnly ? (
                      <Button variant="ghost" size="sm" className="col-span-2 justify-self-start" onClick={() => setPhoneExtras(r.key)}><Icon name="add" />Thêm… (phụ cấp, HĐ lẻ, nội dung)</Button>
                    ) : null}
                    {!readOnly ? <Button variant="ghost-danger" size="sm" className="col-span-2 justify-self-start" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Icon name="delete" />Bỏ khỏi tuần</Button> : null}
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-[12px] text-muted">
                  <span>{cDay(c.dayUnits)} công × {formatMoney(r.wage)}{r.deduction ? ` · trừ ${formatMoney(r.deduction)}` : ''}{r.allowance || r.retail ? ` · +${formatMoney(r.allowance + r.retail)}` : ''}</span>
                  <b className="num text-[13px] text-fg">{formatMoney(c.netPay)}</b>
                </div>
              </div>
            );
          })}
          {/* Nút gọn một hàng: Thêm thợ · Dán tuần (khi đã copy) · Copy tuần (khi tuần có thợ).
              Điện thoại bỏ nút Zalo (13/11/2026) — phiếu lương Zalo làm ở tab Tổng lương */}
          {week?.sheet_image_path ? <ReceiptPhotoButton path={week.sheet_image_path} label="Xem ảnh phiếu chấm công" className="w-full justify-center border border-line" /> : null}
          {attachPhoto ? <AttachReceiptButton block {...attachPhoto} className="w-full justify-center border border-line" /> : null}
          <div className="flex min-w-0 gap-2 [&>button]:min-w-0 [&>button]:flex-1">
            {!readOnly ? <Button onClick={addRow} aria-label="Thêm công nhân"><Icon name="person_add" />Thêm thợ</Button> : null}
            {!readOnly && clip?.length ? <Button onClick={doPaste}><Icon name="content_paste" />Dán tuần</Button> : null}
            {rows.length ? <Button data-testid="cc-copy-phone" onClick={doCopy}><Icon name="content_copy" />Copy tuần</Button> : null}
          </div>
          {!readOnly && (rows.length || week) ? (
            <button type="button" data-testid="cc-save-phone" disabled={save.isPending} onClick={doSave}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[var(--r)] bg-accent text-[15px] font-bold text-accent-fg disabled:opacity-60">
              <Icon name="save" />{save.isPending ? 'Đang lưu…' : 'Lưu tuần'}
            </button>
          ) : null}
        </div>
        {dialogs}
      </>
    );
  }

  const num = 'num text-right whitespace-nowrap';
  return (
    <>
      <PageHeader title="Chấm Công" sub="Sổ chấm công theo tuần, tổng lương, tạm ứng lương" actions={actions} />
      {tabs}
      <FilterBar>
        {weekNav}
        {projectSel}
        {!readOnly ? <Button variant="ghost" onClick={addRow} data-testid="cc-add"><Icon name="person_add" />Thêm công nhân</Button> : null}
        <ReceiptPhotoButton path={week?.sheet_image_path} />
        {attachPhoto ? <AttachReceiptButton {...attachPhoto} /> : null}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" aria-pressed={extras} data-testid="cc-extras" onClick={toggleExtras}>
          <Icon name={extras ? 'visibility_off' : 'visibility'} />{extras ? 'Ẩn phụ cấp, HĐ lẻ, nội dung' : 'Hiện phụ cấp, HĐ lẻ, nội dung'}
        </Button>
        {!readOnly && week ? <Button variant="ghost-danger" onClick={() => setConfirmDelete(true)}><Icon name="delete" />Xóa tuần</Button> : null}
      </FilterBar>
      <KpiStrip items={[
        { label: 'Tổng công', value: cDay(totals.dayUnits), sub: `${rows.filter((r) => r.name.trim()).length} công nhân` },
        { label: 'Tổng lương', value: formatMoney(totals.wage), sub: 'đ' },
        { label: 'Phụ cấp + HĐ mua lẻ', value: formatMoney(totals.allowance + totals.retail), sub: 'đ' },
        ...(totals.deduction ? [{ label: 'Trừ nợ ứng (tuần cũ)', value: formatMoney(totals.deduction), sub: 'đ' }] : []),
        { label: 'Thực lãnh', value: <span data-testid="cc-net-total">{formatMoney(totals.netPay)}</span>, sub: 'đ', tone: 'pos' },
      ]} />
      {status}
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="calendar_month" title="Tuần này chưa có chấm công">{readOnly ? 'Chọn tuần / công trình khác.' : 'Bấm “Thêm công nhân” hoặc “Dán tuần” (sau khi Copy tuần trước).'}</EmptyState>
        ) : (
          <div className="tbl">
            <table data-testid="cc-table">
              <thead>
                <tr>
                  <th className="w-8">#</th><th className="min-w-[140px]">Tên CN</th><th className="!text-center">T/P</th>
                  {DAY_LABELS.map((d) => <th key={d} className="w-11 !text-center">{d}</th>)}
                  <th className="!text-right">TC</th><th className="!text-right">Lương/ngày</th><th className="!text-right">TC Lương</th>
                  {extras ? <><th className="!text-right">Phụ cấp</th><th className="!text-right">HĐ mua lẻ</th><th className="min-w-[240px]">Nội dung</th></> : null}
                  <th className="!text-right">Thực lãnh</th><th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const c = calcSheetRow(toCalcRow(r));
                  const hid = hiddenParts(r, extras);
                  return (
                    <tr key={r.key} data-row={r.key} className={bad.includes(r.key) ? '[&>td]:bg-bad-soft' : undefined}>
                      <td className="text-faint">{i + 1}</td>
                      <td><Combo aria-label={`Tên công nhân dòng ${i + 1}`} placeholder="Tên…" value={r.name} onChange={(v) => setName(r.key, v)} items={workers} groupLabel="Công nhân" onCreate={canAdd ? createName : undefined} disabled={readOnly} className="h-8" /></td>
                      <td className="text-center"><RoleTag role={r.role} /></td>
                      {r.days.map((v, d) => (
                        <td key={d} className="text-center !px-1"><DayCell value={v} disabled={readOnly} label={`${DAY_LABELS[d]} dòng ${i + 1}`} onChange={(nv) => setRow(r.key, { days: r.days.map((x, j) => (j === d ? nv : x)) })} /></td>
                      ))}
                      <td className={num}>{cDay(c.dayUnits)}</td>
                      <td><MoneyInput aria-label={`Lương/ngày dòng ${i + 1}`} value={r.wage} onChange={(v) => setRow(r.key, { wage: v })} disabled={readOnly} className="h-8 w-[88px]" /></td>
                      <td className={num}><Money value={c.wage} /></td>
                      {extras ? (
                        <>
                          <td><MoneyInput aria-label={`Phụ cấp dòng ${i + 1}`} value={r.allowance} onChange={(v) => setRow(r.key, { allowance: v })} disabled={readOnly} className="h-8 w-[78px]" /></td>
                          <td><MoneyInput aria-label={`HĐ mua lẻ dòng ${i + 1}`} value={r.retail} onChange={(v) => setRow(r.key, { retail: v })} disabled={readOnly} className="h-8 w-[78px]" /></td>
                          <td><Input aria-label={`Nội dung dòng ${i + 1}`} value={r.note} title={r.note || undefined} onChange={(e) => setRow(r.key, { note: e.target.value })} disabled={readOnly} className="h-8 w-full min-w-[230px]" placeholder="Nội dung…" /></td>
                        </>
                      ) : null}
                      <td className={num}>
                        {hid.length ? <span className="mr-1 inline-block size-[7px] rounded-full bg-warn align-middle" title={`Có khoản không hiện trên bảng:\n${hid.join('\n')}`} aria-label={`Có khoản ẩn: ${hid.join('; ')}`} data-testid="cc-hidden-mark" /> : null}
                        <b className={c.netPay < 0 ? 'text-bad' : ''}>{c.netPay ? (c.netPay < 0 ? `(${formatMoney(-c.netPay)})` : formatMoney(c.netPay)) : '—'}</b>
                      </td>
                      <td>{!readOnly ? <Button size="icon" variant="ghost" aria-label={`Bỏ dòng ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Icon name="close" /></Button> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold [&>td]:bg-surface-2">
                  <td colSpan={3}>Tổng tuần</td>
                  {totals.days.map((v, i) => <td key={i} className="num text-center">{v ? cDay(v) : ''}</td>)}
                  <td className={num}>{cDay(totals.dayUnits)}</td><td />
                  <td className={num}>{formatMoney(totals.wage)}</td>
                  {extras ? <><td className={num}>{formatMoney(totals.allowance)}</td><td className={num}>{formatMoney(totals.retail)}</td><td /></> : null}
                  <td className={num} data-testid="cc-foot-net">{formatMoney(totals.netPay)}</td><td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      <Note>Ô ngày: bấm để đổi 1 → ½ → 0, hoặc gõ số rồi Enter / mũi tên — được số lẻ dấu chấm hoặc phẩy (1,3 · 0.75 · 2). Gõ <b>H</b> = nửa công. Phụ cấp / HĐ mua lẻ / nội dung đang ẩn vẫn tính vào Thực lãnh (dòng có khoản ẩn có chấm cam ở Thực lãnh). Trả nợ ứng lương ghi ở tab <b>Tạm ứng lương</b>.</Note>
      {dialogs}
    </>
  );
}
