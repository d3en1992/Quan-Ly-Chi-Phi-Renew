// Ô TÌM CHUNG (Ctrl+K · ô tìm thanh trên · nút 🔍 điện thoại · ô tìm đầu màn Trợ lý AI) — tai-lieu/DE-XUAT-TIM-KIEM.md.
// Gõ / 🎤 nói → tìm dữ liệu thật trong 10 nhóm (hàm kho search_all, RLS lọc theo quyền) + "Đi tới trang" (tên tab như trước).
// Nút ✨ Tìm bằng AI (chỉ chạy khi bấm): AI gợi tên ghi khác (dây điện ↔ cáp 1.5) → tìm lại, dòng AI tìm thêm gắn ✨.
// Bấm 1 dòng → mở đúng trang, lọc sẵn, tô sáng dòng đó (app/search-intent.ts).
// Máy tính / máy tính bảng: bảng xổ xuống dưới ô tìm · điện thoại: toàn màn hình.
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseQuery, searchNorm, type SearchAssistResponse, type SearchKind } from '@shared/search';
import { Icon } from '@/components/ui/button';
import { AiBadge } from '@/components/ui/ai-badge';
import { askSearchAssist, useGlobalSearch, type SearchArgs, type SearchHit } from '@/features/search/api';
import { groupTarget, KIND_META, KIND_ORDER, targetOf, yearOf, type Target } from '@/features/search/targets';
import { useSpeech } from '@/features/search/useSpeech';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAccess } from './auth';
import { allEntries, canSeeEntry, canSeeModule, pathOfSub, type NavEntry } from './nav';
import { setSearchIntent } from './search-intent';
import { useLayoutMode } from './useLayoutMode';
import { useYears } from './year';

const OPEN_EVENT = 'qlcp:open-search';
const RECENT_KEY = 'qlcp-search-recent';

/** Mở ô tìm chung từ bất kỳ đâu (vd ô tìm đầu màn Trợ lý AI); listen = bật 🎤 ngay */
export function openGlobalSearch(opts: { listen?: boolean } = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: opts }));
}

/** Trạng thái mở ô tìm cho khung app: Ctrl+K (máy tính) + lời gọi openGlobalSearch */
export function useGlobalSearchState(hotkey: boolean) {
  const [open, setOpen] = useState(false);
  const [listen, setListen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (hotkey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setListen(false);
        setOpen(true);
      }
    };
    const onOpen = (e: Event) => {
      setListen(!!(e as CustomEvent<{ listen?: boolean }>).detail?.listen);
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, [hotkey]);
  return { open, listen, onOpenChange: (v: boolean) => { setOpen(v); if (!v) setListen(false); } };
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = window.setTimeout(() => setV(value), ms); return () => window.clearTimeout(t); }, [value, ms]);
  return v;
}

const loadRecent = (): string[] => {
  try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown; return Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, 6) : []; } catch { return []; }
};
const saveRecent = (q: string) => {
  const t = q.trim();
  if (t.length < 2) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([t, ...loadRecent().filter((x) => x !== t)].slice(0, 6))); } catch { /* bỏ qua */ }
};

type Row = SearchHit & { ai: boolean };
type Group = { kind: SearchKind; rows: Row[]; total: number };
type Item = { key: string; go: () => void };

/** Gộp kết quả tìm thường + kết quả AI: dòng AI tìm thêm gắn ✨ */
function mergeGroups(plain: SearchHit[] | undefined, ai: SearchHit[] | undefined, visible: (k: SearchKind) => boolean): Group[] {
  const by = new Map<SearchKind, Group>();
  const add = (h: SearchHit, isAi: boolean) => {
    if (!visible(h.kind)) return;
    const g = by.get(h.kind) ?? { kind: h.kind, rows: [], total: 0 };
    if (!g.rows.some((r) => r.id === h.id)) g.rows.push({ ...h, ai: isAi });
    g.total = Math.max(g.total, h.total, g.rows.length);
    by.set(h.kind, g);
  };
  (plain ?? []).forEach((h) => add(h, false));
  (ai ?? []).forEach((h) => add(h, !!plain));
  return KIND_ORDER.map((k) => by.get(k)).filter((g): g is Group => !!g).map((g) => ({ ...g, rows: g.rows.slice(0, 4) }));
}

export function CommandPalette({ open, onOpenChange, listen = false }: { open: boolean; onOpenChange: (v: boolean) => void; listen?: boolean }) {
  const access = useAccess();
  const navigate = useNavigate();
  const phone = useLayoutMode() === 'phone';
  const { years, setYears } = useYears();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [ai, setAi] = useState<{ forQ: string; res: SearchAssistResponse } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const speech = useSpeech((text) => { setQ(text); setActive(0); });
  useEffect(() => {
    if (!open) { speech.stop(); return; }
    setRecent(loadRecent());
    if (listen && speech.supported) speech.start();
  }, [open, listen]); // eslint-disable-line react-hooks/exhaustive-deps

  const dq = useDebounced(q.trim(), 300);
  const parsed = useMemo(() => parseQuery(dq), [dq]);
  const plainArgs: SearchArgs | null = dq.length >= 2 ? { text: parsed.text, terms: [], kinds: parsed.kinds } : null;
  const aiOn = !!ai && ai.forQ === dq;
  const aiArgs: SearchArgs | null = aiOn ? { text: ai.res.text, terms: ai.res.terms, kinds: ai.res.kinds } : null;
  const plain = useGlobalSearch(plainArgs);
  const smart = useGlobalSearch(aiArgs);

  const visibleKind = (k: SearchKind) => canSeeModule(access.permissions, KIND_META[k].module);
  const groups = useMemo(
    () => (plainArgs ? mergeGroups(plain.data, aiOn ? smart.data : undefined, visibleKind) : []),
    [plain.data, smart.data, aiOn, plainArgs?.text, access.permissions], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const pages = useMemo(() => {
    const visible = allEntries().filter((e) => canSeeEntry(access.permissions, e));
    const nq = searchNorm(q.trim());
    return nq ? visible.filter((i) => searchNorm(`${i.label} ${i.aka ?? ''}`).includes(nq)).slice(0, 6) : visible.slice(0, 6);
  }, [access.permissions, q]);

  const close = () => { onOpenChange(false); };
  const reset = () => { setQ(''); setAi(null); setAiErr(null); setActive(0); };

  const goTarget = (t: Target, date: string | null = null) => {
    // Dòng thuộc năm đang ẩn → bật thêm năm đó trên ô chọn năm (không thì trang đích lọc mất)
    const y = yearOf(date);
    if (y && years !== 'all' && !years.includes(y)) setYears([...years, y].sort((a, b) => a - b));
    setSearchIntent({ seed: t.seed, focusText: t.focusText, params: t.params });
    navigate(t.path ?? pathOfSub(t.sub!));
    saveRecent(q);
    close();
    reset();
  };
  const goPage = (e: NavEntry) => { navigate(e.path); close(); reset(); };

  const runAi = async () => {
    const text = q.trim();
    if (text.length < 2 || aiBusy) return;
    setAiBusy(true); setAiErr(null);
    try {
      const res = await askSearchAssist(text);
      setAi({ forQ: text, res });
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  // Danh sách phẳng cho phím ↑ ↓ Enter (cùng thứ tự với lúc vẽ)
  const items: Item[] = [];
  const idx = new Map<string, number>();
  const push = (key: string, go: () => void) => { idx.set(key, items.length); items.push({ key, go }); };
  if (!q.trim()) recent.forEach((r) => push(`recent:${r}`, () => { setQ(r); setActive(0); }));
  for (const g of groups) {
    g.rows.forEach((r) => push(`hit:${r.kind}:${r.id}`, () => goTarget(targetOf(r), r.date)));
    if (g.total > g.rows.length && g.kind !== 'project' && g.kind !== 'timesheet') push(`all:${g.kind}`, () => goTarget(groupTarget(g.kind, parsed.text)));
  }
  pages.forEach((p) => push(`page:${p.path}`, () => goPage(p)));
  const activeKey = items[Math.min(active, items.length - 1)]?.key;

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeKey]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); items[Math.min(active, items.length - 1)]?.go(); }
  };

  const loading = (plain.isFetching && !plain.data) || (aiOn && smart.isFetching);
  const error = plain.isError ? plain.error : aiOn && smart.isError ? smart.error : null;
  const noHits = !!plainArgs && !plain.isFetching && !plain.isError && groups.length === 0;

  const option = (key: string, children: ReactNode, cls?: string) => {
    const i = idx.get(key) ?? -1;
    return (
      <button
        key={key}
        type="button"
        data-active={key === activeKey}
        onMouseMove={() => setActive(i)}
        onClick={() => items[i]?.go()}
        className={cn('flex w-full items-center gap-2.5 rounded-md px-3 text-left text-[13px]', phone ? 'py-2.5' : 'py-2',
          key === activeKey ? 'bg-accent-soft' : 'hover:bg-surface-2', cls)}
      >
        {children}
      </button>
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) speech.stop(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          data-testid="global-search"
          onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden bg-surface',
            phone
              ? 'inset-0 pt-[env(safe-area-inset-top)]'
              : 'top-[10px] left-1/2 max-h-[78vh] w-[calc(100%-32px)] max-w-2xl -translate-x-1/2 rounded-[var(--r)] border border-line shadow-card',
          )}
        >
          <Dialog.Title className="sr-only">Tìm kiếm</Dialog.Title>
          <Dialog.Description className="sr-only">Tìm công trình, danh bạ, hóa đơn, chấm công, thiết bị… bằng chữ hoặc giọng nói</Dialog.Description>

          {/* Ô tìm */}
          <div className="flex items-center gap-1.5 border-b border-line px-2">
            {phone ? (
              <button type="button" aria-label="Đóng tìm kiếm" onClick={close} className="grid size-10 place-items-center text-muted"><Icon name="arrow_back" /></button>
            ) : <Icon name="search" className="ml-1.5 text-faint" />}
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder={speech.listening ? 'Đang nghe… nói điều anh cần tìm' : 'Tìm công trình, hóa đơn, công nhân…'}
              aria-label="Tìm kiếm"
              enterKeyHint="search"
              className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none sm:text-sm"
            />
            {loading ? <Icon name="progress_activity" className="animate-spin text-[18px] text-faint" /> : null}
            {q ? (
              <button type="button" aria-label="Xóa chữ" onClick={() => { reset(); inputRef.current?.focus(); }} className="grid size-9 place-items-center text-faint hover:text-fg">
                <Icon name="close" className="text-[19px]" />
              </button>
            ) : null}
            {speech.supported ? (
              <button
                type="button"
                aria-label={speech.listening ? 'Dừng nghe' : 'Nói để tìm'}
                title="Nói để tìm (miễn phí)"
                onClick={() => (speech.listening ? speech.stop() : speech.start())}
                className={cn('grid size-10 place-items-center rounded-full', speech.listening ? 'animate-pulse bg-bad text-white' : 'text-accent hover:bg-accent-soft')}
              >
                <Icon name={speech.listening ? 'stop' : 'mic'} />
              </button>
            ) : null}
          </div>

          {/* Thanh AI */}
          {q.trim().length >= 2 ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2 text-[12.5px]">
              <button
                type="button"
                onClick={() => void runAi()}
                disabled={aiBusy || aiOn}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 font-medium text-fg hover:border-accent disabled:opacity-70"
              >
                <AiBadge size={18} glow={false} />
                {aiBusy ? 'AI đang hiểu ý…' : aiOn ? 'Đã tìm bằng AI' : 'Tìm bằng AI'}
              </button>
              <span className="min-w-0 flex-1 text-muted">
                {aiErr ? <span className="text-bad">{aiErr}</span>
                  : aiOn ? (ai.res.explain || (ai.res.terms.length ? `Tìm thêm: ${ai.res.terms.slice(0, 5).join(', ')}` : 'AI không thấy tên gọi khác'))
                  : 'Không ra hoặc ra thiếu? AI tìm cả tên ghi khác (dây điện ↔ cáp, CV…)'}
              </span>
            </div>
          ) : null}
          {speech.error ? <div className="border-b border-line-soft px-3 py-2 text-[12.5px] text-bad">{speech.error}</div> : null}

          {/* Kết quả */}
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5" data-testid="search-results">
            {!q.trim() && recent.length ? (
              <Section icon="history" title="Tìm gần đây">
                {recent.map((r) => option(`recent:${r}`, <><Icon name="history" className="text-[18px] text-faint" /><span className="truncate">{r}</span></>))}
              </Section>
            ) : null}

            {error ? (
              <div className="m-2 flex flex-wrap items-center gap-2 rounded-md bg-bad-soft px-3 py-2 text-[13px] text-bad">
                <Icon name="wifi_off" className="text-[18px]" />
                <span className="flex-1">Không tìm được — mạng yếu hoặc mất kết nối. Chữ anh gõ vẫn còn.</span>
                <button type="button" className="font-semibold underline" onClick={() => { void plain.refetch(); if (aiOn) void smart.refetch(); }}>Thử lại</button>
              </div>
            ) : null}
            {plainArgs && plain.isFetching && !plain.data ? <p className="px-3 py-3 text-[13px] text-muted">Đang tìm…</p> : null}
            {noHits ? (
              <p className="px-3 py-3 text-[13px] text-muted">
                Không thấy dữ liệu khớp “{dq}”.{aiOn ? '' : ' Bấm ✨ Tìm bằng AI để tìm cả tên ghi khác.'}
              </p>
            ) : null}

            {groups.map((g) => {
              const meta = KIND_META[g.kind];
              return (
                <Section key={g.kind} icon={meta.icon} title={meta.label} count={g.total} testId={`group-${g.kind}`}>
                  {g.rows.map((r) => option(`hit:${r.kind}:${r.id}`, <HitRow hit={r} icon={meta.icon} />))}
                  {idx.has(`all:${g.kind}`) ? option(`all:${g.kind}`, <span className="pl-8 text-[12.5px] font-medium text-accent">Xem tất cả {g.total} dòng ›</span>) : null}
                </Section>
              );
            })}

            {pages.length ? (
              <Section icon="tab" title={q.trim() ? 'Đi tới trang' : 'Lối tắt'}>
                {pages.map((p) => option(`page:${p.path}`, <><Icon name={p.icon} className="text-[19px] text-muted" /><span className="truncate">{p.label}</span></>))}
              </Section>
            ) : null}
          </div>

          {phone ? null : (
            <div className="flex items-center gap-3 border-t border-line-soft px-3 py-1.5 text-[11.5px] text-faint">
              <span><kbd>↑</kbd> <kbd>↓</kbd> chọn</span><span><kbd>Enter</kbd> mở</span><span><kbd>Esc</kbd> đóng</span>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Section({ icon, title, count, testId, children }: { icon: string; title: string; count?: number; testId?: string; children: ReactNode }) {
  return (
    <section className="mb-1" data-testid={testId}>
      <h3 className="m-0 flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-bold tracking-wide text-faint uppercase">
        <Icon name={icon} className="text-[15px]" />{title}
        {count ? <span className="font-medium normal-case">· {count}</span> : null}
      </h3>
      {children}
    </section>
  );
}

function HitRow({ hit, icon }: { hit: Row; icon: string }) {
  const meta = [hit.sub, hit.kind !== 'project' && hit.kind !== 'timesheet' && hit.date ? formatDate(hit.date) : ''].filter(Boolean).join(' · ');
  return (
    <>
      <Icon name={icon} className="shrink-0 text-[19px] text-muted" />
      <span className="grid min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <b className="truncate font-semibold text-fg">{hit.title || '—'}</b>
          {hit.ai ? <span title="AI tìm thêm" className="shrink-0 rounded-full bg-accent-soft px-1.5 text-[10.5px] font-semibold text-accent">✨ AI</span> : null}
        </span>
        {meta ? <small className="truncate text-[12px] text-muted">{meta}</small> : null}
      </span>
      {hit.amount != null ? <span className="num shrink-0 text-[13px] font-semibold text-fg">{formatMoney(hit.amount)}</span> : null}
      <Icon name="chevron_right" className="shrink-0 text-[18px] text-faint" />
    </>
  );
}
