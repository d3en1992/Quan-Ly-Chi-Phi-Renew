// TẠM ỨNG LƯƠNG (PAGES.chamcong sub 2, đổi tên từ "Ứng công nhân" — mục 4L): sổ cái theo tháng — nợ cũ mang sang,
// ứng (+), trả (−), tổng nợ hiện tại; ghi tạm ứng / trả (popup "Tiền ứng CN" của app cũ); lịch sử từng người.
// Dòng "Trả" sinh từ cột Trừ nợ của sổ chấm công chỉ sửa / xóa ở sổ chấm công.
import { useEffect, useMemo, useState } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { Combo } from '@/components/ui/combo';
import { ConfirmDialog } from '@/components/ui/confirm';
import { FilterBar, FilterSelect, KpiStrip, MiniList, MobileCard, MobileRow, Money, SearchBox } from '@/components/ui/data';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Checkbox, Field, Input, MoneyInput, Select } from '@/components/ui/input';
import { Card, EmptyState, Note, Pill } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { currentDebt, inYear, ledgerRows, monthRange, workerLedger, type PayrollIndex, type YearFilter } from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { findByName } from '@/features/expenses/logic';
import { matchesSearch, todayIso } from '@/features/reports/shared';
import { useDeleteAdvance, useSaveAdvance, type TimesheetData, type TsAdvance } from './api';
import { RoleTag } from './shared';

const vn = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Kỳ xem: 1 tháng, hoặc cả năm đang chọn (nhiều năm = từ năm nhỏ đến năm lớn; Tất cả = toàn bộ) — `_ccUngPeriod` */
export function ledgerPeriod(month: string, years: YearFilter): [string, string] {
  if (month) return monthRange(month);
  if (!years.length) return ['0000-01-01', '9999-12-31'];
  return [`${Math.min(...years)}-01-01`, `${Math.max(...years)}-12-31`];
}

function DebtCell({ v }: { v: number }) {
  if (v > 0) return <span className="num font-semibold text-bad">{formatMoney(v)}</span>;
  if (v < 0) return <span className="num text-good">({formatMoney(-v)})</span>;
  return <span className="text-faint">—</span>;
}

type Draft = { id: string | null; direction: 'advance' | 'repay'; date: string; worker: string; amount: number; project: string; note: string; counts: boolean };
const blank = (worker = ''): Draft => ({ id: null, direction: 'advance', date: todayIso(), worker, amount: 0, project: '', note: '', counts: false });

function AdvanceSheet({ open, draft, setDraft, data, ix, onClose }: { open: boolean; draft: Draft; setDraft: (d: Draft) => void; data: TimesheetData; ix: PayrollIndex; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveAdvance();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  // Trả nợ: chỉ công nhân đang còn nợ (khi sửa vẫn giữ tên đang sửa) — `_ccUngNameCandidates`
  const names = useMemo(() => data.workers.filter((w) => {
    if (draft.id && findByName(draft.worker, [w])) return true;
    if (w.archived) return false;
    return draft.direction === 'repay' ? currentDebt(ix, w.id) > 0 : true;
  }), [data.workers, draft.direction, draft.id, draft.worker, ix]);
  const w = findByName(draft.worker, data.workers);
  const debt = w ? currentDebt(ix, w.id) : 0;

  const submit = () => {
    if (!draft.date) { toast('Chọn ngày giao dịch!', 'error'); return; }
    if (!w) { toast(draft.worker.trim() ? `"${draft.worker.trim()}" không có trong danh bạ công nhân!` : 'Chọn tên công nhân!', 'error'); return; }
    if (draft.amount <= 0) { toast('Nhập số tiền > 0!', 'error'); return; }
    if (draft.direction === 'repay' && !draft.id && debt <= 0) { toast(`"${w.name}" hiện không còn nợ!`, 'error'); return; }
    save.mutate({ id: draft.id, input: { workerId: w.id, projectId: draft.project || null, date: draft.date, direction: draft.direction, amount: draft.amount, countsInNetPay: draft.counts, note: draft.note } }, {
      onSuccess: () => { toast(`${draft.id ? 'Đã cập nhật' : 'Đã ghi'} ${draft.direction === 'repay' ? 'trả nợ' : 'tạm ứng'} ${formatMoney(draft.amount)} cho ${w.name}${draft.counts ? (draft.direction === 'repay' ? ' · trừ vào Thực lãnh tuần' : ' · cộng vào Thực lãnh tuần') : ''}`); onClose(); },
      onError: (e) => toast(`Chưa lưu được: ${e.message}`, 'error'),
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={draft.id ? 'Sửa tạm ứng / trả' : 'Ghi tạm ứng / trả'}
      footer={<><Button onClick={onClose}>Hủy</Button><div className="flex-1" /><Button variant="primary" data-testid="adv-save" disabled={save.isPending} onClick={submit}><Icon name="save" />{save.isPending ? 'Đang lưu…' : 'Lưu'}</Button></>}>
      <div className="inline-flex w-fit rounded-lg border border-line bg-surface-2 p-0.5">
        {(['advance', 'repay'] as const).map((d) => (
          <button key={d} type="button" aria-pressed={draft.direction === d} onClick={() => setDraft({ ...draft, direction: d })}
            className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-muted aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm">
            {d === 'advance' ? 'Tạm ứng (+ nợ)' : 'Trả nợ (− nợ)'}
          </button>
        ))}
      </div>
      <Field label="Ngày giao dịch"><Input type="date" aria-label="Ngày giao dịch" value={draft.date} onChange={(e) => set('date', e.target.value)} /></Field>
      <Field label="Công nhân" hint={w ? <span className="flex items-center gap-2"><RoleTag role={w.role} /> Đang nợ: <b className="num text-fg">{formatMoney(debt)}</b> đ</span> : draft.direction === 'repay' && !names.length ? 'Không có công nhân nào đang nợ' : undefined}>
        <Combo aria-label="Công nhân" placeholder={draft.direction === 'repay' ? 'Chọn công nhân đang nợ…' : 'Chọn / gõ tên công nhân…'} value={draft.worker} onChange={(v) => set('worker', v)} items={names} groupLabel="Công nhân" />
      </Field>
      <Field label="Số tiền"><MoneyInput aria-label="Số tiền" value={draft.amount} onChange={(v) => set('amount', v)} /></Field>
      <Field label="Công trình (không bắt buộc)">
        <Select aria-label="Công trình" value={draft.project} onChange={(e) => set('project', e.target.value)}>
          <option value="">— Không gắn công trình —</option>
          {data.projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Nội dung"><Input aria-label="Nội dung" value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder="Ứng tiền chợ, trả bớt nợ…" /></Field>
      <Checkbox checked={draft.counts} onChange={(v) => set('counts', v)} label={draft.direction === 'repay' ? '− Trừ vào Thực lãnh tuần giao dịch' : '+ Cộng vào Thực lãnh tuần giao dịch'} />
      <Note>Tick ô trên thì số tiền này hiện trong cột Thực lãnh và phiếu lương của tuần chứa ngày giao dịch. Nợ của công nhân tính như nhau dù tick hay không.</Note>
    </Sheet>
  );
}

function HistorySheet({ workerId, data, ix, onClose, onEdit }: { workerId: string | null; data: TimesheetData; ix: PayrollIndex; onClose: () => void; onEdit: (a: TsAdvance) => void }) {
  const toast = useToast();
  const phone = useLayoutMode() === 'phone';
  const del = useDeleteAdvance();
  const [confirm, setConfirm] = useState<TsAdvance | null>(null);
  const items = useMemo(() => (workerId ? workerLedger(ix, workerId).reverse() : []), [ix, workerId]);
  return (
    <Sheet wide open={!!workerId} onOpenChange={(o) => { if (!o) onClose(); }} title={`Lịch sử nợ · ${workerId ? data.workerName(workerId) : ''}`}>
      {workerId ? <div className="text-[13px] text-muted">Tổng nợ hiện tại: <DebtCell v={currentDebt(ix, workerId)} /></div> : null}
      {items.length === 0 ? <EmptyState icon="history" title="Chưa có giao dịch" /> : phone ? (
        <MiniList testId="adv-history" items={items.map((it, i) => {
          const a = it.advance as TsAdvance | undefined;
          const fromSheet = !!a?.source_week_id;
          const kind = it.kind === 'advance' ? <Pill tone="warn">Ứng</Pill> : it.kind === 'repay' ? <Pill tone="good">{fromSheet ? 'Trừ nợ CC' : 'Trả'}</Pill> : <Pill>Chấm công cũ</Pill>;
          return {
            key: a?.id ?? `l${i}`,
            title: <span className="flex flex-wrap items-center gap-1.5"><span className="num">{vn(it.date)}</span>{kind}</span>,
            sub: [it.projectId ? data.projectName(it.projectId) : '', it.note].filter(Boolean).join(' · ') || undefined,
            value: `${it.amount > 0 ? '+' : '−'}${formatMoney(Math.abs(it.amount))}`,
            valueSub: <>còn nợ <DebtCell v={it.balance} /></>,
            trail: a && !fromSheet ? (
              <>
                <Button size="icon" variant="ghost" aria-label="Sửa" onClick={() => onEdit(a)}><Icon name="edit" /></Button>
                <Button size="icon" variant="ghost-danger" aria-label="Xóa" onClick={() => setConfirm(a)}><Icon name="delete" /></Button>
              </>
            ) : undefined,
          };
        })} />
      ) : (
        <div className="tbl">
          <table>
            <thead><tr><th>Ngày</th><th>Loại</th><th>Công trình</th><th className="!text-right">Số tiền</th><th className="!text-right">Còn nợ</th><th>Nội dung</th><th /></tr></thead>
            <tbody>
              {items.map((it, i) => {
                const a = it.advance as TsAdvance | undefined;
                const fromSheet = !!a?.source_week_id;
                return (
                  <tr key={a?.id ?? `l${i}`}>
                    <td className="num whitespace-nowrap">{vn(it.date)}</td>
                    <td>{it.kind === 'advance' ? <Pill tone="warn">Ứng</Pill> : it.kind === 'repay' ? <Pill tone="good">{fromSheet ? 'Trừ nợ CC' : 'Trả'}</Pill> : <Pill>Chấm công cũ</Pill>}{a?.counts_in_net_pay ? <small className="ml-1 text-faint" title="Tính vào Thực lãnh tuần">TL</small> : null}</td>
                    <td className="max-w-[160px] truncate">{it.projectId ? data.projectName(it.projectId) : '—'}</td>
                    <td className="num text-right whitespace-nowrap">{it.amount > 0 ? '+' : '−'}{formatMoney(Math.abs(it.amount))}</td>
                    <td className="text-right"><DebtCell v={it.balance} /></td>
                    <td className="max-w-[200px] truncate text-muted" title={it.note}>{it.note}</td>
                    <td className="whitespace-nowrap">
                      {a && !fromSheet ? (
                        <>
                          <Button size="icon" variant="ghost" aria-label="Sửa" onClick={() => onEdit(a)}><Icon name="edit" /></Button>
                          <Button size="icon" variant="ghost-danger" aria-label="Xóa" onClick={() => setConfirm(a)}><Icon name="delete" /></Button>
                        </>
                      ) : fromSheet ? <small className="text-faint">sửa ở sổ CC</small> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }} title="Xóa giao dịch?" danger busy={del.isPending} confirmLabel="Xóa"
        message={confirm ? <>Xóa phiếu {confirm.direction === 'repay' ? 'trả' : 'ứng'} {formatMoney(confirm.amount)} ngày {vn(confirm.date)}. Phiếu vào Thùng rác, khôi phục được.</> : null}
        onConfirm={() => { if (!confirm) return; del.mutate(confirm.id, { onSuccess: () => { setConfirm(null); toast('Đã xóa giao dịch'); }, onError: (e) => { setConfirm(null); toast(`Chưa xóa được: ${e.message}`, 'error'); } }); }} />
    </Sheet>
  );
}

export function AdvancesTab({ data, ix, years, yearLabel, phone, canAdd }: { data: TimesheetData; ix: PayrollIndex; years: YearFilter; yearLabel: string; phone: boolean; canAdd: boolean }) {
  const [month, setMonth] = useState('');
  const [project, setProject] = useState('');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hist, setHist] = useState<string | null>(null);
  useEffect(() => setMonth(''), [years]);

  const monthOpts = useMemo(() => {
    const s = new Set<string>();
    for (const a of data.advances) if (inYear(a.date, years)) s.add(a.date.slice(0, 7));
    for (const w of data.weeks) if (inYear(w.week_start, years)) s.add(w.week_start.slice(0, 7));
    return [...s].sort().reverse().map((m) => ({ value: m, label: `Tháng ${Number(m.slice(5, 7))}/${m.slice(0, 4)}` }));
  }, [data.advances, data.weeks, years]);
  const projOpts = useMemo(() => data.projects.slice().sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((p) => ({ value: p.id, label: p.name })), [data.projects]);

  const [start, end] = ledgerPeriod(month, years);
  const rows = useMemo(() => {
    let rs = ledgerRows(ix, data.workers.map((w) => w.id), start, end);
    if (project) {
      const inProj = new Set<string>();
      for (const a of data.advances) if (a.project_id === project) inProj.add(a.worker_id);
      const weekIds = new Set(data.weeks.filter((w) => w.project_id === project).map((w) => w.id));
      for (const l of data.lines) if (weekIds.has(l.week_id)) inProj.add(l.worker_id);
      rs = rs.filter((r) => inProj.has(r.workerId));
    }
    return rs.filter((r) => matchesSearch(q, data.workerName(r.workerId)))
      .sort((a, b) => b.total - a.total || data.workerName(a.workerId).localeCompare(data.workerName(b.workerId), 'vi'));
  }, [ix, data, start, end, project, q]);
  const T = rows.reduce((s, r) => ({ before: s.before + r.before, adv: s.adv + r.advances, rep: s.rep + r.repays, total: s.total + r.total }), { before: 0, adv: 0, rep: 0, total: 0 });
  const periodLabel = month ? `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}` : yearLabel;

  const edit = (a: TsAdvance) => {
    setHist(null);
    setDraft({ id: a.id, direction: a.direction === 'repay' ? 'repay' : 'advance', date: a.date, worker: data.workerName(a.worker_id), amount: a.amount, project: a.project_id ?? '', note: a.note ?? '', counts: a.counts_in_net_pay });
  };

  return (
    <>
      <FilterBar className="sm:flex-nowrap">
        <FilterSelect label="Tháng" value={month} onChange={setMonth} options={monthOpts} allLabel={`Cả kỳ (${yearLabel})`} />
        <FilterSelect label="Công trình" value={project} onChange={setProject} options={projOpts} />
        <SearchBox value={q} onChange={setQ} placeholder="Tìm công nhân…" className="sm:min-w-[110px]" />
        <div className="flex-1" />
        {canAdd ? <Button variant="primary" className="shrink-0" data-testid="adv-add" onClick={() => setDraft(blank())}><Icon name="add" />Ghi tạm ứng / trả</Button> : null}
      </FilterBar>
      <KpiStrip items={[
        { label: 'Nợ cũ mang sang', value: formatMoney(T.before), sub: start === '0000-01-01' ? 'từ đầu' : `trước ${vn(start)}` },
        { label: 'Ứng trong kỳ (+)', value: formatMoney(T.adv), sub: periodLabel },
        { label: 'Trả trong kỳ (−)', value: formatMoney(T.rep), sub: periodLabel },
        { label: 'Tổng nợ hiện tại', value: <span data-testid="adv-total">{formatMoney(T.total)}</span>, sub: `${rows.length} công nhân`, tone: T.total > 0 ? 'neg' : '' },
      ]} />
      <Card>
        {rows.length === 0 ? <EmptyState icon="account_balance_wallet" title="Chưa có công nợ phát sinh trong kỳ này" /> : phone ? (
          <div className="grid gap-2 p-2">
            {rows.map((r) => {
              const w = data.workerById.get(r.workerId);
              return (
                <MobileCard key={r.workerId} onClick={() => setHist(r.workerId)}>
                  <MobileRow><span className="flex min-w-0 items-center gap-2"><b className="truncate">{w?.name ?? '?'}</b><RoleTag role={w?.role} /></span><DebtCell v={r.total} /></MobileRow>
                  <MobileRow meta><span>Cũ {formatMoney(r.before)} · +{formatMoney(r.advances)} · −{formatMoney(r.repays)}</span></MobileRow>
                </MobileCard>
              );
            })}
          </div>
        ) : (
          <div className="tbl">
            <table data-testid="adv-table">
              <thead><tr><th>Tên công nhân</th><th className="!text-center">T/P</th><th>Công trình gần nhất</th><th className="!text-right">Nợ cũ mang sang</th><th className="!text-right">Ứng trong kỳ (+)</th><th className="!text-right">Trả trong kỳ (−)</th><th className="!text-right">Tổng nợ hiện tại</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const w = data.workerById.get(r.workerId);
                  return (
                    <tr key={r.workerId} className="cursor-pointer" tabIndex={0} onClick={() => setHist(r.workerId)} onKeyDown={(e) => { if (e.key === 'Enter') setHist(r.workerId); }}>
                      <td className="whitespace-nowrap"><b className="font-semibold">{w?.name ?? '?'}</b></td>
                      <td className="text-center"><RoleTag role={w?.role} /></td>
                      <td className="max-w-[240px] truncate">{r.lastProjectId ? data.projectName(r.lastProjectId) : '—'}</td>
                      <td className="text-right"><DebtCell v={r.before} /></td>
                      <td className="text-right">{r.advances ? <span className="num">+{formatMoney(r.advances)}</span> : <span className="text-faint">—</span>}</td>
                      <td className="text-right">{r.repays ? <span className="num">−{formatMoney(r.repays)}</span> : <span className="text-faint">—</span>}</td>
                      <td className="text-right"><b><DebtCell v={r.total} /></b></td>
                      <td><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setHist(r.workerId); }}><Icon name="history" />Lịch sử</Button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={cn('font-bold [&>td]:bg-surface-2')}>
                  <td colSpan={3}>Tổng {rows.length} công nhân</td>
                  <td className="text-right"><Money value={T.before} /></td><td className="text-right"><Money value={T.adv} /></td><td className="text-right"><Money value={T.rep} /></td><td className="text-right"><Money value={T.total} /></td><td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      <Note>Tiền trừ nợ trong Sổ chấm công (cột Trừ nợ) tự ghi thành dòng “Trả” ở đây.</Note>
      {draft ? <AdvanceSheet open draft={draft} setDraft={setDraft} data={data} ix={ix} onClose={() => setDraft(null)} /> : null}
      <HistorySheet workerId={hist} data={data} ix={ix} onClose={() => setHist(null)} onEdit={edit} />
    </>
  );
}
