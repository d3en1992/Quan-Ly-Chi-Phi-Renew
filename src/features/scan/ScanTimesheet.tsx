// Nút AI → PHIẾU CHẤM CÔNG tuần (ảnh phiếu viết tay mẫu NH): AI đọc tên + công CN..T7 + các khoản mua lẻ; app gợi ý sẵn công trình
// theo lịch sử chấm công của tổ thợ, điền lương/ngày theo lần chấm gần nhất. Mua lẻ cộng hết vào ô HĐ mua lẻ của người đầu phiếu (cai).
// Điện thoại (compact): mỗi thợ một thẻ như Sổ chấm công, ảnh phiếu bấm vào để xem toàn màn hình + phóng to đối chiếu.
// Anh kiểm tra, sửa rồi mới lưu — lưu bằng đúng hàm của Sổ chấm công (save_timesheet_week: mỗi công trình mỗi tuần 1 bản ghi).
import { useMemo, useState } from 'react';
import type { TimesheetScan } from '@shared/scan';
import { useAccess } from '@/app/auth';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { ConfirmDialog } from '@/components/ui/confirm';
import { ZoomableImage } from '@/components/ui/image-zoom';
import { Checkbox, Field, Input, MoneyInput } from '@/components/ui/input';
import { Card, ErrorState, LoadingState, Note, Pill } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { calcSheetRow, cycleDayUnit, sheetTotals, shiftWeek, weekRangeLabel, weekStartOf } from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { findByName } from '@/features/expenses/logic';
import { today } from '@/features/expenses/shared';
import { useCreateWorker, useSaveWeek, useSetWeekImage, useTimesheetData, type TimesheetData } from '@/features/timesheets/api';
import { blankRow, checkSheet, newKey, toCalcRow, type DraftRow } from '@/features/timesheets/sheet-model';
import { cDay, DAY_LABELS, DayCell, dayText, PhoneDayInput, RoleTag } from '@/features/timesheets/shared';
import { removeReceipt, uploadReceipt, type PreparedImage } from './api';
import { useObjectUrl } from './CaptureForm';
import { UNSURE } from './shared';
import { checkPurchaseTotal, lastWage, purchaseSum, timesheetFromScan, withPurchases, type PurchaseDraft } from './timesheet-model';

type Props = { scan: TimesheetScan; image: PreparedImage | null; compact?: boolean; onDone: () => void; onRetake: () => void };

export function ScanTimesheet(props: Props) {
  const data = useTimesheetData();
  if (data.isPending) return <Card><LoadingState label="Đang tải sổ chấm công…" /></Card>;
  if (data.isError || !data.data) return <Card><ErrorState error={data.error ?? 'Không tải được sổ chấm công'} onRetry={() => void data.refetch()} /></Card>;
  return <Sheet {...props} data={data.data} />;
}

const BY_TEXT: Record<TimesheetScan['project_by'], string> = {
  note: 'theo ghi chú của anh', crew: 'theo lịch sử chấm công của tổ thợ này', ai: 'AI đoán — anh xem lại', '': '',
};

function Sheet({ scan, image, compact = false, onDone, onRetake, data }: Props & { data: TimesheetData }) {
  const toast = useToast();
  const access = useAccess();
  const save = useSaveWeek();
  const setWeekImage = useSetWeekImage();
  const createWorker = useCreateWorker();
  const [keepImage, setKeepImage] = useState(true);
  const workers = useMemo(() => data.workers.filter((w) => !w.archived), [data.workers]);
  const guessed = findByName(scan.project_match, data.projectOptions) ?? findByName(scan.project_match, data.projects);
  const init = useMemo(() => timesheetFromScan(scan, data, guessed?.id ?? '', today()), [scan]); // eslint-disable-line react-hooks/exhaustive-deps
  const [project, setProject] = useState(guessed?.name ?? '');
  const [weekStart, setWeekStart] = useState(init.weekStart);
  const [rows, setRows] = useState<DraftRow[]>(init.rows);
  const [purchases, setPurchases] = useState<PurchaseDraft[]>(init.purchases);
  const [extraNote, setExtraNote] = useState(scan.note);
  const [seen, setSeen] = useState<string[]>([]); // ô tô vàng đã sửa → hết vàng
  const [bad, setBad] = useState<string[]>([]);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null); // điện thoại: thẻ đang mở ô gõ số công
  const photo = useObjectUrl(image?.blob ?? null);

  const proj = findByName(project, data.projectOptions) ?? findByName(project, data.projects);
  const existing = proj ? data.weeks.find((w) => w.project_id === proj.id && w.week_start === weekStart) ?? null : null;
  const existingCount = existing ? data.lines.filter((l) => l.week_id === existing.id).length : 0;
  const unsure = (cell: string) => init.unsure.includes(cell) && !seen.includes(cell);
  const touch = (cell: string) => setSeen((s) => (s.includes(cell) ? s : [...s, cell]));
  // Công trình chưa chọn, hoặc đang là gợi ý không theo ghi chú (tổ thợ / AI đoán) → tính là 1 ô cần xem
  const projectUnsure = !proj || (scan.project_by !== 'note' && proj.name === guessed?.name);
  const unsureCount = init.unsure.filter((c) => !seen.includes(c)).length + (projectUnsure ? 1 : 0);

  const full = useMemo(() => withPurchases(rows, purchases, extraNote), [rows, purchases, extraNote]);
  const totals = sheetTotals(full.map(toCalcRow));
  const buyTotal = purchaseSum(purchases);
  const buyCheck = checkPurchaseTotal(purchases, scan.purchase_total);
  const cai = rows.find((r) => r.name.trim());

  const setRow = (key: string, patch: Partial<DraftRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setName = (key: string, name: string) => {
    touch(`${key}:name`);
    const w = findByName(name, workers);
    setRows((rs) => rs.map((r) => (r.key === key
      ? { ...r, name, role: w ? w.role : r.role, wage: r.wage || (w ? lastWage(w.id, proj?.id ?? '', data.weeks, data.lines) : 0) } : r)));
  };
  const createName = async (text: string) => {
    try { const w = await createWorker.mutateAsync(text); toast(`Đã thêm công nhân ${w.name} vào Danh Bạ`); return w.name; }
    catch (e) { toast(`Chưa thêm được công nhân: ${(e as Error).message}`, 'error'); return undefined; }
  };
  const setBuy = (key: string, patch: Partial<PurchaseDraft>) => setPurchases((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const doSave = () => {
    if (save.isPending) return;
    if (!proj) { toast('Chọn công trình.', 'error'); return; }
    const check = checkSheet(full, data.workers);
    if (!check.ok) { setBad(check.badKeys); toast(check.message, 'error'); return; }
    setBad([]);
    if (existing && !confirmOverwrite) { setConfirmOverwrite(true); return; }
    save.mutate({ projectId: proj.id, weekStart, lines: check.lines }, {
      onSuccess: async (weekId) => {
        setConfirmOverwrite(false);
        // Ảnh phiếu: lưu sau khi chấm công đã vào sổ — ảnh hỏng không làm mất chấm công
        if (image && keepImage) {
          let path: string | null = null;
          try {
            path = await uploadReceipt(access.profile.company_id, image.blob, weekStart);
            await setWeekImage.mutateAsync({ weekId, path });
          } catch (e) {
            if (path) void removeReceipt(path);
            toast(`Chấm công đã lưu, nhưng chưa lưu được ảnh phiếu: ${(e as Error).message}`, 'error');
          }
        }
        toast(`Đã lưu chấm công ${weekRangeLabel(weekStart)} [${proj.name}] · ${check.lines.length} công nhân${buyTotal ? ` · mua lẻ ${formatMoney(buyTotal)}` : ''}`);
        onDone();
      },
      onError: (e) => { setConfirmOverwrite(false); toast(`Chưa lưu được: ${e.message}`, 'error'); },
    });
  };

  const weekNav = (
    <span className="inline-flex w-fit items-center gap-1 rounded-lg border border-line bg-surface">
      <button type="button" aria-label="Tuần trước" className="px-2 py-1.5 text-muted" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}><Icon name="chevron_left" /></button>
      <label className="relative cursor-pointer">
        <b className="num px-1.5 text-[13px] whitespace-nowrap" data-testid="ts-week">{weekRangeLabel(weekStart)}</b>
        <input type="date" aria-label="Chọn ngày trong tuần" className="absolute inset-0 cursor-pointer opacity-0" value={weekStart}
          onChange={(e) => { if (e.target.value) setWeekStart(weekStartOf(e.target.value)); }} />
      </label>
      <button type="button" aria-label="Tuần sau" className="px-2 py-1.5 text-muted" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}><Icon name="chevron_right" /></button>
    </span>
  );
  const num = 'num text-right whitespace-nowrap';

  return (
    <div className={cn('grid gap-3', !compact && 'lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start')} data-testid="scan-timesheet">
      <Card className="grid gap-2.5 p-3">
        {photo ? <ZoomableImage src={photo} alt="Ảnh phiếu chấm công" className={compact ? 'max-h-[200px]' : 'max-h-[520px]'} />
          : <div className="grid h-32 place-items-center rounded-lg bg-surface-2 text-muted">Không có ảnh</div>}
        <Checkbox checked={keepImage && !!image} disabled={!image} onChange={setKeepImage} label="Lưu ảnh phiếu kèm tuần chấm công (để đối chiếu sau)" />
        <Button onClick={onRetake} className="justify-center"><Icon name="photo_camera" />Chụp lại / phiếu khác</Button>
      </Card>

      <Card className="min-w-0">
        <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-3">
          <Icon name="calendar_month" className="text-accent" />
          <h3 className="m-0 text-sm font-bold">Phiếu chấm công — AI điền sẵn</h3>
          {unsureCount ? <Pill tone="warn"><Icon name="warning" className="text-[14px]" />{unsureCount} ô cần xem lại</Pill> : <Pill tone="good">AI đọc rõ</Pill>}
          <div className="flex-1" />
          <small className="text-muted">Ô tô vàng = AI không chắc</small>
        </header>
        <div className={cn('grid gap-3', compact ? 'p-3' : 'p-4')}>
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="Công trình *">
              <Combo aria-label="Công trình" value={project} onChange={setProject} items={data.projectOptions} groupLabel="Công trình"
                className={projectUnsure ? UNSURE : undefined} />
            </Field>
            <div className="grid gap-1 text-xs font-medium text-muted"><span>Tuần{scan.week_start ? '' : ' (phiếu không ghi ngày — anh xem lại)'}</span>{weekNav}</div>
          </div>
          {proj && proj.name === guessed?.name && scan.project_by ? (
            <p className="m-0 text-[12px] text-muted" data-testid="ts-project-by">Gợi ý công trình {BY_TEXT[scan.project_by]}.</p>
          ) : !proj ? <p className="m-0 text-[12px] text-warn">Chưa đoán được công trình (tổ thợ này chưa chấm công gần đây) — anh chọn giúp.</p> : null}
          {existing ? (
            <Note icon="warning"><span data-testid="ts-existing">Tuần này của <b>{proj!.name}</b> đã có chấm công ({existingCount} công nhân). Lưu sẽ <b>thay</b> bằng bảng dưới đây — không muốn thì đổi tuần / công trình.</span></Note>
          ) : null}

          {compact ? (
            <div className="grid gap-2" data-testid="ts-cards">
              {full.map((r, i) => {
                const c = calcSheetRow(toCalcRow(r));
                const known = !!findByName(r.name, workers);
                const open = openRow === r.key;
                const setDay = (d: number, nv: number) => { touch(`${r.key}:${d}`); setRow(r.key, { days: r.days.map((x, j) => (j === d ? nv : x)) }); };
                return (
                  <div key={r.key} data-row={r.key} className={cn('grid gap-2 rounded-[var(--r)] border bg-surface px-3 py-2.5', bad.includes(r.key) ? 'border-bad' : 'border-line')}>
                    <div className="flex items-center gap-2">
                      <span className="w-4 shrink-0 text-[12px] text-faint">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <Combo aria-label={`Tên công nhân dòng ${i + 1}`} placeholder="Tên công nhân…" value={r.name} onChange={(v) => setName(r.key, v)} items={workers} groupLabel="Công nhân"
                          onCreate={createName} className={cn((!known || unsure(`${r.key}:name`)) && UNSURE)} />
                      </div>
                      <RoleTag role={r.role} />
                      <button type="button" aria-label={`Gõ số công dòng ${i + 1}`} className="text-muted" onClick={() => setOpenRow(open ? null : r.key)}><Icon name={open ? 'expand_less' : 'tune'} /></button>
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {r.days.map((v, d) => (
                        <button key={d} type="button" aria-label={`${DAY_LABELS[d]} dòng ${i + 1}`}
                          className={cn('grid h-11 place-items-center rounded-lg border border-line text-[14px] font-bold',
                            v >= 1 ? 'border-transparent bg-good-soft text-good' : v > 0 ? 'border-transparent bg-warn-soft text-warn' : 'text-faint',
                            unsure(`${r.key}:${d}`) && 'ring-2 ring-warn')}
                          onClick={() => setDay(d, cycleDayUnit(v))}>
                          <small className="text-[10px] font-medium text-muted">{DAY_LABELS[d]}</small>{dayText(v)}
                        </button>
                      ))}
                    </div>
                    {open ? (
                      <div className="grid gap-1 text-[12px] text-muted">Gõ số công (được số lẻ: 1,3 · 0,75)
                        <div className="grid grid-cols-7 gap-1">
                          {r.days.map((v, d) => <PhoneDayInput key={d} label={`Số công ${DAY_LABELS[d]} dòng ${i + 1}`} value={v} onChange={(nv) => setDay(d, nv)} />)}
                        </div>
                        <Button variant="ghost-danger" size="sm" className="justify-self-start" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Icon name="delete" />Bỏ khỏi phiếu</Button>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2 text-[12px] text-muted">
                      <span className="shrink-0">{cDay(c.dayUnits)} công ×</span>
                      <MoneyInput aria-label={`Lương/ngày dòng ${i + 1}`} value={r.wage} onChange={(v) => { touch(`${r.key}:wage`); setRow(r.key, { wage: v }); }}
                        className={cn('h-9 w-[104px]', !r.wage && UNSURE)} />
                      <div className="min-w-0 flex-1 text-right">
                        <b className="num text-[13.5px] text-fg">{c.netPay ? formatMoney(c.netPay) : '—'}</b>
                        {r.retail ? <div className="text-[11px]">gồm mua lẻ {formatMoney(r.retail)}</div> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between rounded-[var(--r)] bg-surface-2 px-3 py-2 text-[13px]">
                <span className="text-muted">Tổng tuần · <b className="text-fg" data-testid="ts-total-days">{cDay(totals.dayUnits)}</b> công</span>
                <b className="num text-[15px]" data-testid="ts-net">{formatMoney(totals.netPay)}</b>
              </div>
            </div>
          ) : (
          <div className="tbl">
            <table data-testid="ts-table">
              <thead>
                <tr>
                  <th className="w-7">#</th><th className="min-w-[130px]">Tên CN</th><th className="!text-center">T/P</th>
                  {DAY_LABELS.map((d) => <th key={d} className="w-10 !text-center">{d}</th>)}
                  <th className="!text-right">TC</th><th className="!text-right">Lương/ngày</th><th className="!text-right">Thực lãnh</th><th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {full.map((r, i) => {
                  const c = calcSheetRow(toCalcRow(r));
                  const known = !!findByName(r.name, workers);
                  return (
                    <tr key={r.key} data-row={r.key} className={bad.includes(r.key) ? '[&>td]:bg-bad-soft' : undefined}>
                      <td className="text-faint">{i + 1}</td>
                      <td>
                        <Combo aria-label={`Tên công nhân dòng ${i + 1}`} placeholder="Tên…" value={r.name} onChange={(v) => setName(r.key, v)} items={workers} groupLabel="Công nhân"
                          onCreate={createName} className={cn('h-8', (!known || unsure(`${r.key}:name`)) && UNSURE)} />
                      </td>
                      <td className="text-center"><RoleTag role={r.role} /></td>
                      {r.days.map((v, d) => (
                        <td key={d} className={cn('text-center !px-1', unsure(`${r.key}:${d}`) && '!bg-warn-soft')}>
                          <DayCell value={v} label={`${DAY_LABELS[d]} dòng ${i + 1}`} onChange={(nv) => { touch(`${r.key}:${d}`); setRow(r.key, { days: r.days.map((x, j) => (j === d ? nv : x)) }); }} />
                        </td>
                      ))}
                      <td className={num}>{cDay(c.dayUnits)}</td>
                      <td><MoneyInput aria-label={`Lương/ngày dòng ${i + 1}`} value={r.wage} onChange={(v) => { touch(`${r.key}:wage`); setRow(r.key, { wage: v }); }}
                        className={cn('h-8 w-[88px]', !r.wage && UNSURE)} /></td>
                      <td className={num}><b>{c.netPay ? formatMoney(c.netPay) : '—'}</b>{r.retail ? <div className="text-[11px] font-normal text-muted">gồm mua lẻ {formatMoney(r.retail)}</div> : null}</td>
                      <td><Button size="icon" variant="ghost" aria-label={`Bỏ dòng ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Icon name="close" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold [&>td]:bg-surface-2">
                  <td colSpan={3}>Tổng tuần</td>
                  {totals.days.map((v, i) => <td key={i} className="num text-center">{v ? cDay(v) : ''}</td>)}
                  <td className={num} data-testid="ts-total-days">{cDay(totals.dayUnits)}</td><td />
                  <td className={num} data-testid="ts-net">{formatMoney(totals.netPay)}</td><td />
                </tr>
              </tfoot>
            </table>
          </div>
          )}
          <div><Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, blankRow()])}><Icon name="person_add" />Thêm công nhân</Button></div>

          <div className="grid gap-2 rounded-lg border border-line bg-surface-2/60 p-3" data-testid="ts-purchases">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <Icon name="shopping_bag" className="text-[18px] text-accent" /><b>Hóa đơn mua lẻ trong tuần</b>
              <div className="flex-1" />
              <span className="text-muted">Tổng</span><b className="num" data-testid="ts-buy-total">{formatMoney(buyTotal)}</b>
            </div>
            {purchases.length === 0 ? <p className="m-0 text-[12.5px] text-muted">Phiếu không ghi khoản mua đồ nào.</p> : null}
            {purchases.map((p, i) => (
              <div key={p.key} className="flex items-center gap-2">
                <Input aria-label={`Khoản mua ${i + 1}`} value={p.name} onChange={(e) => setBuy(p.key, { name: e.target.value })} className="h-9 min-w-0 flex-1" placeholder="Mua gì…" />
                <MoneyInput aria-label={`Số tiền khoản mua ${i + 1}`} value={p.amount} onChange={(v) => setBuy(p.key, { amount: v })} className={cn('h-9 shrink-0', compact ? 'w-[96px]' : 'w-[110px]', !p.amount && UNSURE)} />
                <Button size="icon" variant="ghost" aria-label={`Bỏ khoản mua ${i + 1}`} onClick={() => setPurchases((ps) => ps.filter((x) => x.key !== p.key))}><Icon name="close" /></Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPurchases((ps) => [...ps, { key: newKey(), name: '', amount: 0 }])}><Icon name="add" />Thêm khoản mua</Button>
              <span className="text-[12.5px]" data-testid="ts-buy-check">
                {buyCheck.status === 'match' ? <><Icon name="check_circle" className="text-[16px] text-good" /> Khớp số tổng ghi trên phiếu ({formatMoney(buyCheck.written)})</>
                  : buyCheck.status === 'diff' ? <><Icon name="error" className="text-[16px] text-warn" /> Lệch số tổng ghi trên phiếu ({formatMoney(buyCheck.written)}): <Pill tone="warn">{buyCheck.gap > 0 ? 'thiếu' : 'thừa'} {formatMoney(Math.abs(buyCheck.gap))}</Pill></>
                  : null}
              </span>
            </div>
            {buyTotal > 0 ? (
              <p className="m-0 text-[12.5px] text-muted">
                {cai ? <>Cộng hết <b className="text-fg">{formatMoney(buyTotal)}</b> vào ô <b>HĐ mua lẻ</b> của <b className="text-fg">{cai.name}</b> (người đầu phiếu — cai).</> : 'Chưa có công nhân nào để ghi tiền mua lẻ.'}
              </p>
            ) : null}
            <Field label="Ghi chú khác trên phiếu (ghi vào Nội dung của người đầu phiếu)">
              <Input aria-label="Ghi chú khác trên phiếu" value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="Vd: Tăng ca bốc ngói 30 phút" />
            </Field>
          </div>

          <div className={cn('flex flex-wrap justify-end gap-2', compact && '[&>button]:h-11 [&>button:last-child]:flex-1 [&>button]:justify-center')}>
            <Button onClick={onRetake}><Icon name="close" />Bỏ</Button>
            <Button variant="primary" data-testid="ts-save" disabled={save.isPending} onClick={doSave}><Icon name="save" />{save.isPending ? 'Đang lưu…' : existing ? 'Lưu (thay tuần đã có)' : 'Lưu vào Sổ chấm công'}</Button>
          </div>
        </div>
      </Card>
      <ConfirmDialog open={confirmOverwrite} onOpenChange={setConfirmOverwrite} title="Thay tuần chấm công đã có?" danger busy={save.isPending} confirmLabel="Thay bằng phiếu này"
        message={<>{weekRangeLabel(weekStart)} của <b>{proj?.name}</b> đã có {existingCount} công nhân. Lưu sẽ thay toàn bộ bằng {full.filter((r) => r.name.trim()).length} công nhân trên phiếu vừa chụp.</>}
        onConfirm={doSave} />
    </div>
  );
}
