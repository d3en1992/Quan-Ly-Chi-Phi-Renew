// Tab con ĐỊNH MỨC: so sánh 2–3 công trình / định mức (đ/m²) + danh sách định mức đã lưu dạng thẻ.
// Máy tính + máy tính bảng: bảng so sánh mỗi công trình 1 cột. Điện thoại: mỗi chỉ tiêu 1 khối, công trình xếp dọc.
import { useMemo, useState } from 'react';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Button, Icon } from '@/components/ui/button';
import { Segmented } from '@/components/ui/data';
import { Select } from '@/components/ui/input';
import { Card, CardHeader, EmptyState, Note, Pill } from '@/components/ui/misc';
import { compareBenchmarks, COST_GROUP_IDS, COST_GROUPS, readBenchmark, type Benchmark, type CompareRow } from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AllocRecord } from './api';

const MAX_COMPARE = 3;
const LETTERS = ['A', 'B', 'C'];
const SHORT_TYPES = 8;
/** Màu 4 nhóm trong thanh cơ cấu (0 = chưa xếp) */
const GROUP_COLOR: Record<number, string> = { 1: 'var(--accent)', 2: '#1a9a8f', 3: '#8b5fd0', 4: '#d9902f', 0: 'var(--faint)' };

const area = (n: number) => `${(Math.round((n || 0) * 100) / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} m²`;
const signedPct = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
const shortName = (s: string) => s.replace(/^Định mức\s*[—–-]\s*/i, '');

function Letter({ i }: { i: number }) {
  return <span aria-hidden className="inline-grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{LETTERS[i]}</span>;
}

function Diff({ d }: { d: number | null | undefined }) {
  if (d === null || d === undefined) return null;
  return <Pill tone={d > 2 ? 'warn' : d < -2 ? 'good' : 'neutral'}>{Math.abs(d) < 0.05 ? 'bằng A' : d >= 200 ? `gấp ${Math.round(1 + d / 100).toLocaleString('vi-VN')} lần` : signedPct(d)}</Pill>;
}

function Bar({ value, max }: { value: number; max: number }) {
  return <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2"><i className="block h-full rounded-full bg-accent" style={{ width: `${max > 0 ? Math.max(0, (value / max) * 100) : 0}%` }} /></span>;
}

type Item = { key: string; name: string; saved: boolean; b: Benchmark };

/** Bảng so sánh (≥ 640px) */
function CompareTable({ items, sections }: { items: Item[]; sections: { title: string; rows: CompareRow[]; strong?: boolean }[] }) {
  return (
    <div className="overflow-x-auto" data-testid="tyt-compare">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <colgroup><col className="w-[24%]" />{items.map((it) => <col key={it.key} />)}</colgroup>
        <thead>
          <tr className="align-top">
            <th className="border-b border-line px-3.5 py-2.5 text-left text-[11.5px] font-semibold text-muted">đồng / m² sàn</th>
            {items.map((it, i) => (
              <th key={it.key} className="border-b border-line px-3 py-2.5 text-left font-semibold">
                <span className="flex items-start gap-1.5"><Letter i={i} /><span className="min-w-0 break-words">{shortName(it.name)}</span></span>
                <span className="mt-0.5 block pl-[26px] text-[11.5px] font-normal text-faint">{area(it.b.tongSan)} · {formatMoney(it.b.tongChi)} đ</span>
              </th>
            ))}
          </tr>
        </thead>
        {sections.map((s) => (
          <tbody key={s.title}>
            {s.strong ? null : <tr><td colSpan={items.length + 1} className="border-b border-line-soft bg-surface-2 px-3.5 py-1.5 text-[11.5px] font-semibold text-muted">{s.title}</td></tr>}
            {s.rows.map((r) => (
              <tr key={r.key} data-compare-row={r.key}>
                <td className={cn('border-b border-line-soft px-3.5 py-2 break-words', s.strong && 'font-bold')}>{r.label}</td>
                {items.map((it, i) => (
                  <td key={it.key} className="border-b border-line-soft px-3 py-2">
                    <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                      <b className={cn('num', s.strong ? 'text-[17px]' : 'font-semibold')}>{r.values[i] ? formatMoney(r.values[i]!) : '—'}</b>
                      <Diff d={r.diffPct[i]} />
                    </span>
                    <span className="mt-1 block"><Bar value={r.values[i]!} max={r.max} /></span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** So sánh trên điện thoại: mỗi chỉ tiêu 1 khối */
function CompareStack({ items, sections }: { items: Item[]; sections: { title: string; rows: CompareRow[]; strong?: boolean }[] }) {
  return (
    <div data-testid="tyt-compare">
      <ul className="grid gap-1.5 border-t border-line-soft px-3.5 py-2.5">
        {items.map((it, i) => (
          <li key={it.key} className="flex items-start gap-2 text-[13px]"><Letter i={i} /><span className="min-w-0"><b className="font-semibold break-words">{shortName(it.name)}</b><span className="block text-[11.5px] text-faint">{area(it.b.tongSan)} · {formatMoney(it.b.tongChi)} đ</span></span></li>
        ))}
      </ul>
      {sections.map((s) => (
        <div key={s.title}>
          {s.strong ? null : <div className="border-y border-line-soft bg-surface-2 px-3.5 py-1.5 text-[11.5px] font-semibold text-muted">{s.title}</div>}
          {s.rows.map((r) => (
            <div key={r.key} data-compare-row={r.key} className="grid gap-1 border-t border-line-soft px-3.5 py-2.5 first:border-t-0">
              <div className={cn('text-[13px]', s.strong ? 'font-bold' : 'font-medium')}>{r.label}</div>
              {items.map((it, i) => (
                <div key={it.key} className="grid grid-cols-[20px_minmax(24px,1fr)_84px_76px] items-center gap-2 text-[13px]">
                  <Letter i={i} /><Bar value={r.values[i]!} max={r.max} />
                  <b className="num text-right font-semibold">{r.values[i] ? formatMoney(r.values[i]!) : '—'}</b>
                  <span className="text-right"><Diff d={r.diffPct[i]} /></span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function BenchmarkCard({ rec, b, canEdit, busy, picked, onToggle, onRename, onRefresh, onDelete }: {
  rec: AllocRecord; b: Benchmark; canEdit: boolean; busy: boolean; picked: boolean; onToggle: () => void; onRename: () => void; onRefresh: () => void; onDelete: () => void;
}) {
  const groups = COST_GROUP_IDS.map((n) => ({ n, v: b.dgNhom[n] ?? (n === 1 ? b.dgRo1 : 0) }));
  return (
    <li className={cn('grid min-w-0 content-start gap-2.5 rounded-[var(--r)] border bg-surface p-3.5', picked ? 'border-accent' : 'border-line')} data-benchmark={rec.id}>
      <div className="min-w-0">
        <b className="block text-[13.5px] font-semibold break-words">{rec.name}</b>
        <span className="text-[11.5px] text-faint">{[b.loaiCT, area(b.tongSan), `${formatMoney(b.tongChi)} đ`].filter(Boolean).join(' · ')}</span>
      </div>
      <div><b className="num text-[19px] leading-tight font-bold">{formatMoney(b.dgTong)}</b> <span className="text-[12px] text-muted">đ/m²</span></div>
      <div className="flex h-2 gap-px overflow-hidden rounded-full bg-surface-2">
        {groups.map((g) => (g.v > 0 && b.dgTong > 0 ? <i key={g.n} className="h-full" style={{ width: `${(g.v / b.dgTong) * 100}%`, background: GROUP_COLOR[g.n] }} /> : null))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        {groups.map((g) => (
          <span key={g.n} className="flex min-w-0 items-center justify-between gap-2" title={COST_GROUPS[g.n]!.ten}>
            <span className="flex min-w-0 items-center gap-1.5 text-muted"><i className="size-2 shrink-0 rounded-full" style={{ background: GROUP_COLOR[g.n] }} /><span className="truncate">{COST_GROUPS[g.n]!.ngan}</span></span>
            <b className="num font-semibold">{g.v ? formatMoney(g.v) : '—'}</b>
          </span>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-1 border-t border-line-soft pt-2">
        <Button size="sm" aria-pressed={picked} onClick={onToggle}><Icon name={picked ? 'check' : 'compare_arrows'} />{picked ? 'Đang so sánh' : 'So sánh'}</Button>
        <span className="flex-1" />
        {canEdit ? (
          <>
            <Button size="icon" variant="ghost" aria-label={`Cập nhật ${rec.name} theo công trình nguồn`} title="Cập nhật theo số mới nhất của công trình" disabled={busy} onClick={onRefresh}><Icon name="refresh" /></Button>
            <Button size="icon" variant="ghost" aria-label={`Đổi tên ${rec.name}`} title="Đổi tên" onClick={onRename}><Icon name="edit" /></Button>
            <Button size="icon" variant="ghost-danger" data-testid="tyt-dm-delete" aria-label={`Xóa ${rec.name}`} title="Xóa" onClick={onDelete}><Icon name="delete" /></Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

export function BenchmarkTab({ benchmarks, projects, buildLive, canEdit, busy, onRename, onRefresh, onDelete }: {
  benchmarks: AllocRecord[];
  /** Công trình có khối lượng sàn (so sánh được theo m²) */
  projects: { id: string; name: string }[];
  /** Số liệu mới nhất của 1 công trình, cùng dạng với định mức đã lưu */
  buildLive: (projectId: string) => Benchmark | null;
  canEdit: boolean; busy: boolean;
  onRename: (r: AllocRecord) => void; onRefresh: (r: AllocRecord) => void; onDelete: (r: AllocRecord) => void;
}) {
  const phone = useLayoutMode() === 'phone';
  const [sel, setSel] = useState<string[] | null>(null);
  const [view, setView] = useState<'group' | 'type'>('group');
  const [allTypes, setAllTypes] = useState(false);

  const options = useMemo(() => [
    ...projects.map((p) => ({ key: 'p:' + p.id, name: p.name, saved: false })),
    ...benchmarks.map((r) => ({ key: 'b:' + r.id, name: r.name ?? 'Định mức', saved: true })),
  ], [projects, benchmarks]);
  // Chưa chọn gì: lấy các định mức đã lưu, thiếu thì thêm công trình chưa có trong đó
  const initial = useMemo(() => {
    const keys = benchmarks.slice(0, MAX_COMPARE).map((r) => 'b:' + r.id);
    const used = new Set(benchmarks.map((r) => String(r.data.nguonPid ?? '')));
    for (const p of projects) if (keys.length < 2 && !used.has(p.id)) keys.push('p:' + p.id);
    return keys;
  }, [benchmarks, projects]);
  const keys = (sel ?? initial).filter((k) => options.some((o) => o.key === k));
  const items = useMemo(() => keys.flatMap((k): Item[] => {
    const o = options.find((x) => x.key === k)!;
    const rec = o.saved ? benchmarks.find((r) => 'b:' + r.id === k) : undefined;
    const b = rec ? readBenchmark(rec.data) : buildLive(k.slice(2));
    return b ? [{ ...o, b }] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [keys.join('|'), options, benchmarks, buildLive]);
  const cmp = useMemo(() => compareBenchmarks(items.map((it) => it.b)), [items]);

  const setAt = (i: number, k: string) => {
    const next = [...keys];
    if (k) next[i] = k; else next.splice(i, 1);
    setSel(next);
  };
  const toggle = (k: string) => setSel(keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k].slice(-MAX_COMPARE));

  const slots = Array.from({ length: MAX_COMPARE }, (_, i) => i).filter((i) => i <= keys.length);
  const typeRows = allTypes ? cmp.types : cmp.types.slice(0, SHORT_TYPES);
  const sections = [
    { title: 'Tổng', rows: [{ ...cmp.total, label: 'Đơn giá tổng' }], strong: true },
    view === 'group'
      ? { title: 'Theo nhóm chi phí', rows: cmp.groups.filter((r) => r.max > 0).map((r) => ({ ...r, label: COST_GROUPS[Number(r.key)]!.ten })) }
      : { title: 'Theo loại chi phí', rows: typeRows },
  ];
  const base = items[0];
  const compareOn = items.length >= 2;

  return (
    <>
      <Card>
        <CardHeader title="So sánh công trình" sub="chọn 2 hoặc 3 · tính trên 1 m² sàn · A là mốc" />
        <div className="grid gap-2 px-3.5 py-3 sm:grid-cols-3">
          {slots.map((i) => (
            <label key={i} className="flex min-w-0 items-center gap-2">
              <Letter i={i} />
              <Select aria-label={`Công trình so sánh ${LETTERS[i]}`} value={keys[i] ?? ''} onChange={(e) => setAt(i, e.target.value)}>
                <option value="">{keys[i] ? '— Bỏ chọn —' : i === 2 ? '— Thêm (không bắt buộc) —' : '— Chọn —'}</option>
                {[false, true].map((saved) => {
                  const list = options.filter((o) => o.saved === saved && (o.key === keys[i] || !keys.includes(o.key)));
                  return list.length ? <optgroup key={String(saved)} label={saved ? 'Định mức đã lưu' : 'Công trình (số mới nhất)'}>{list.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}</optgroup> : null;
                })}
              </Select>
            </label>
          ))}
        </div>
        {!compareOn ? <EmptyState icon="compare_arrows" title="Chọn ít nhất 2 công trình để so sánh">Chỉ công trình đã nhập khối lượng sàn mới so sánh được.</EmptyState> : (
          <>
            <div className="grid gap-1.5 border-t border-line-soft px-3.5 py-2.5 text-[13px]" data-testid="tyt-compare-summary">
              {items.slice(1).map((it, j) => {
                const i = j + 1;
                const d = cmp.total.diffPct[i] ?? null;
                const top = cmp.topGroup[i];
                if (d === null) return null;
                return (
                  <div key={it.key} className="flex items-start gap-2"><Letter i={i} /><span className="min-w-0">
                    {Math.abs(d) < 0.05 ? <>bằng A</> : <><b className={d > 0 ? 'text-warn' : 'text-good'}>{d > 0 ? 'cao hơn' : 'thấp hơn'} A {signedPct(Math.abs(d)).replace('+', '')}</b> ({formatMoney(Math.abs(cmp.total.values[i]! - cmp.total.values[0]!))} đ/m²)</>}
                    {top && Math.abs(top.delta) >= 1 ? <>, lệch nhiều nhất ở <b className="font-semibold">{COST_GROUPS[top.group]!.ngan}</b> ({top.delta > 0 ? '+' : '−'}{formatMoney(Math.abs(top.delta))})</> : null}
                  </span></div>
                );
              })}
            </div>
            <div className="border-t border-line-soft px-3.5 py-2"><Segmented value={view} onChange={setView} options={[{ value: 'group', label: 'Theo nhóm' }, { value: 'type', label: 'Theo loại' }]} /></div>
            {phone ? <CompareStack items={items} sections={sections} /> : <CompareTable items={items} sections={sections} />}
            {view === 'type' && cmp.types.length > SHORT_TYPES ? <div className="flex justify-center p-2"><Button size="sm" variant="ghost" onClick={() => setAllTypes(!allTypes)}><Icon name={allTypes ? 'expand_less' : 'expand_more'} />{allTypes ? 'Thu gọn' : `Xem đủ ${cmp.types.length} loại`}</Button></div> : null}
            {base && items.some((it) => it.saved) ? <div className="px-3.5 py-2 text-[11.5px] text-faint">Định mức đã lưu giữ số lúc lưu; chọn mục "Công trình" để lấy số mới nhất.</div> : null}
          </>
        )}
      </Card>

      <section className="grid min-w-0 gap-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2"><h2 className="text-[15px] font-bold">Định mức đã lưu ({benchmarks.length})</h2><span className="text-[12px] text-muted">dùng để báo giá công trình mới</span></div>
        {benchmarks.length === 0 ? <Note>Chưa có định mức nào. Vào Tỉ trọng trên máy tính, chọn công trình đã xong rồi bấm "Lưu làm định mức".</Note> : (
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="tyt-benchmarks">
            {benchmarks.map((rec) => (
              <BenchmarkCard key={rec.id} rec={rec} b={readBenchmark(rec.data)} canEdit={canEdit} busy={busy} picked={keys.includes('b:' + rec.id)}
                onToggle={() => toggle('b:' + rec.id)} onRename={() => onRename(rec)} onRefresh={() => onRefresh(rec)} onDelete={() => onDelete(rec)} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
