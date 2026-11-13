// Tab DANH BẠ: Khách hàng · Công nhân · Nhân viên · Nhà cung cấp · Thầu phụ.
// SĐT, CCCD che theo quyền "Xem SĐT, số CCCD" (`see_contact_ids`). Nút Chụp CCCD mở bảng trượt Chụp đa năng (features/scan) — chỉ lưu chữ, không lưu ảnh.
import { useMemo, useState, type ReactNode } from 'react';
import { useAccess } from '@/app/auth';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { FilterBar, FilterSelect, MobileCard, MobileRow, Money, SearchBox } from '@/components/ui/data';
import { Card, EmptyState, ErrorState, LoadingState, Note, PageHeader, Pill, SubTabs } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { subcontractorStandings, ALL_YEARS } from '@/lib/calc';
import { formatDate } from '@/lib/format';
import { hasLevel } from '@/lib/permissions';
import { useReportData } from '@/features/reports/api';
import { matchesSearch } from '@/features/reports/shared';
import { projectNumbers } from '@/features/projects/numbers';
import { useDeleteContact, useContacts, useToggleCredit, type ContactKind, type ContactsData } from './api';
import { ContactForm, KIND_TITLE } from './ContactForm';
import { Sheet } from '@/components/ui/sheet';
import { ScanWorkspace } from '@/features/scan/ScanWorkspace';

const TABS: { key: ContactKind; label: string; short?: string }[] = [
  { key: 'customer', label: 'KHÁCH HÀNG', short: 'KHÁCH' }, { key: 'worker', label: 'CÔNG NHÂN', short: 'THỢ' }, { key: 'employee', label: 'NHÂN VIÊN', short: 'NHÂN VIÊN' },
  { key: 'supplier', label: 'NHÀ CUNG CẤP', short: 'NCC' }, { key: 'subcontractor', label: 'THẦU PHỤ' },
];
const ROLE_LABEL: Record<string, string> = { C: 'Cai', T: 'Thợ', P: 'Phụ' };
const dim = (t: string) => <span className="text-faint">{t}</span>;

type Col = { head: string; right?: boolean; wrap?: boolean; cell: ReactNode };
type RowDef = { id: string; kind: ContactKind; name: string; tel?: string; haystack: (string | null | undefined)[]; cols: Col[]; mobileTitle: ReactNode; mobileMeta: ReactNode[]; extra?: Record<string, string> };

export function ContactsPage() {
  const access = useAccess();
  const toast = useToast();
  const mode = useLayoutMode();
  const canSeeIds = access.special.see_contact_ids;
  const canEdit = hasLevel(access.permissions, 'contacts', 'add');
  const canDelete = hasLevel(access.permissions, 'contacts', 'full');
  const money = hasLevel(access.permissions, 'revenue') || hasLevel(access.permissions, 'profit');
  const q = useContacts(canSeeIds);
  const reportQ = useReportData();
  const toggle = useToggleCredit();
  const del = useDeleteContact();

  const [tab, setTab] = useState<ContactKind>('customer');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState<{ kind: ContactKind; id: string | null } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const canScanId = canEdit && access.special.see_contact_ids;
  const [deleting, setDeleting] = useState<{ kind: ContactKind; id: string; name: string } | null>(null);

  const rows = useMemo<RowDef[]>(() => {
    const data = q.data;
    if (!data) return [];
    return buildRows(tab, data, reportQ.data ?? null, { money, canSeeIds, canEdit, onToggleCredit: (id, value) => void toggle.mutateAsync({ id, value }).catch((e: Error) => toast(e.message, 'error')) });
  }, [q.data, reportQ.data, tab, money, canSeeIds, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => void q.refetch()} /></Card>;
  if (!q.data) return <Card><LoadingState label="Đang tải danh bạ…" /></Card>;

  const filtered = rows.filter((r) => matchesSearch(search, ...r.haystack) && (!filter || r.extra?.filter === filter));
  const heads = rows[0]?.cols.map((c) => ({ head: c.head, right: c.right })) ?? columnHeads(tab, money);
  const filterOptions = tab === 'worker' ? [{ value: 'C', label: 'Cai' }, { value: 'T', label: 'Thợ' }, { value: 'P', label: 'Phụ' }]
    : tab === 'supplier' ? [{ value: 'credit', label: 'Có Mua nợ' }, { value: 'cash', label: 'Không Mua nợ' }]
    : tab === 'customer' ? [{ value: 'has', label: 'Có công trình' }, { value: 'none', label: 'Chưa có công trình' }] : [];
  const filterLabel = tab === 'worker' ? 'T/P' : tab === 'supplier' ? 'Mua nợ' : 'Có công trình';

  const openRow = (r: RowDef) => { if (canEdit) setForm({ kind: r.kind, id: r.id }); };
  const doDelete = async () => {
    if (!deleting) return;
    try { await del.mutateAsync({ kind: deleting.kind, id: deleting.id }); toast(`Đã xóa: ${deleting.name}`); setDeleting(null); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); setDeleting(null); }
  };

  const actions = (
    <>
      {canScanId ? <Button onClick={() => setScanOpen(true)}><Icon name="badge" />Chụp CCCD / giấy tờ</Button> : null}
      {canEdit ? <Button variant="primary" onClick={() => setForm({ kind: tab, id: null })}><Icon name="person_add" />Thêm</Button> : null}
    </>
  );

  return (
    <>
      {mode === 'phone' ? null : <PageHeader title="Danh Bạ" sub="Thông tin khách hàng, công nhân, nhân viên, nhà cung cấp, thầu phụ" actions={actions} />}
      <SubTabs tabs={TABS} value={tab} onChange={(t) => { setTab(t); setSearch(''); setFilter(''); }} />
      {mode === 'phone' ? (
        // Điện thoại: tìm + lọc + nút nhỏ trên một hàng; Xuất dữ liệu nằm ở mục Thêm → Xuất dữ liệu; Chụp CCCD chỉ ở nhóm Công nhân
        <div className="flex min-w-0 items-center gap-2">
          <SearchBox value={search} onChange={setSearch} placeholder="Tìm tên, SĐT…" className="min-w-0" />
          {filterOptions.length ? <FilterSelect label={filterLabel === 'Có công trình' ? 'CT' : filterLabel} value={filter} onChange={setFilter} options={filterOptions} className="shrink-0" selectClassName="max-w-[96px]" /> : null}
          {canScanId && tab === 'worker' ? <Button size="icon" aria-label="Chụp CCCD / giấy tờ" onClick={() => setScanOpen(true)}><Icon name="badge" /></Button> : null}
          {canEdit ? <Button size="icon" variant="primary" className="text-accent-fg" aria-label={`Thêm ${KIND_TITLE[tab]}`} onClick={() => setForm({ kind: tab, id: null })}><Icon name="person_add" /></Button> : null}
        </div>
      ) : (
        <FilterBar>
          <SearchBox value={search} onChange={setSearch} placeholder="Tìm tên, SĐT, địa chỉ…" />
          {filterOptions.length ? <FilterSelect label={filterLabel} value={filter} onChange={setFilter} options={filterOptions} /> : null}
        </FilterBar>
      )}
      {filtered.length === 0 ? (
        <Card><EmptyState icon="contacts" title={rows.length === 0 ? `Chưa có ${KIND_TITLE[tab]} nào` : 'Không có ai khớp'}>{rows.length === 0 && canEdit ? 'Bấm "Thêm" để tạo mới.' : null}</EmptyState></Card>
      ) : mode === 'phone' ? (
        filtered.map((r) => (
          <MobileCard key={r.id} onClick={canEdit ? () => openRow(r) : undefined}>
            <MobileRow>
              <b className="min-w-0 break-words">{r.mobileTitle}</b>
              {r.tel ? (
                <a href={`tel:${r.tel}`} aria-label={`Gọi ${r.name}`} onClick={(e) => e.stopPropagation()}
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-good-soft text-good"><Icon name="call" className="text-[18px]" /></a>
              ) : null}
            </MobileRow>
            <MobileRow meta>{r.mobileMeta}</MobileRow>
          </MobileCard>
        ))
      ) : (
        <Card>
          <div className="tbl">
            <table data-testid="contacts-table">
              <thead><tr>{heads.map((h) => <th key={h.head} className={h.right ? '!text-right' : ''}>{h.head}</th>)}{canEdit ? <th /> : null}</tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={canEdit ? 'cursor-pointer' : ''} onClick={() => openRow(r)}>
                    {r.cols.map((c, i) => <td key={i} className={c.right ? 'text-right' : c.wrap ? 'wrap' : ''}>{c.cell}</td>)}
                    {canEdit ? (
                      <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" aria-label={`Sửa ${r.name}`} onClick={() => openRow(r)}><Icon name="edit" /></Button>
                        {canDelete ? <Button size="sm" variant="ghost-danger" aria-label={`Xóa ${r.name}`} onClick={() => setDeleting({ kind: r.kind, id: r.id, name: r.name })}><Icon name="delete" /></Button> : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === 'worker' && mode !== 'phone' ? <Note icon="badge">Bấm <b>Chụp CCCD</b>: AI đọc họ tên, ngày sinh, số CCCD, quê quán. <b>Chỉ lưu chữ, không lưu ảnh.</b> Số CCCD che bớt, chỉ vai trò có quyền "Xem SĐT, số CCCD" mới thấy đủ.</Note> : null}
      {tab === 'supplier' && mode !== 'phone' ? <Note><b>Mua nợ</b> bật sẵn cho nhà cung cấp từng có tiền ứng trong dữ liệu cũ. Địa chỉ, SĐT sẽ tự điền dần khi chụp hóa đơn.</Note> : null}
      <Sheet open={scanOpen} onOpenChange={setScanOpen} title="Chụp CCCD" wide>
        {scanOpen ? <ScanWorkspace defaultKind="id_card" lockKind compact onSaved={() => setScanOpen(false)} /> : null}
      </Sheet>
      {form ? <ContactForm open onClose={() => setForm(null)} kind={form.kind} id={form.id} data={q.data} canSeeIds={canSeeIds} /> : null}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }} title="Xóa khỏi Danh Bạ?" danger busy={del.isPending} confirmLabel="Xóa"
        message={<>Xóa <b>{deleting?.name}</b>? Mục bị xóa vào Thùng Rác, khôi phục được.</>} onConfirm={() => void doDelete()} />
    </>
  );
}

function columnHeads(tab: ContactKind, money: boolean) {
  const map: Record<ContactKind, { head: string; right?: boolean }[]> = {
    customer: [{ head: 'Khách hàng' }, { head: 'Họ tên đầy đủ' }, { head: 'Số điện thoại' }, { head: 'Địa chỉ' }, { head: 'CCCD' }, { head: 'Số CT', right: true }, ...(money ? [{ head: 'Tổng giá trị HĐ', right: true }] : [])],
    worker: [{ head: 'Tên gọi' }, { head: 'T/P' }, { head: 'Họ tên (theo CCCD)' }, { head: 'Năm sinh' }, { head: 'Quê quán' }, { head: 'Số điện thoại' }, { head: 'CCCD' }, { head: 'Tài khoản nhận lương' }],
    employee: [{ head: 'Nhân viên' }, { head: 'Chức danh' }, { head: 'Tài khoản app' }, { head: 'Số điện thoại' }, { head: 'Ngày vào làm' }, { head: 'Ghi chú' }],
    supplier: [{ head: 'Nhà cung cấp' }, { head: 'Địa chỉ' }, { head: 'Số điện thoại' }, { head: 'Mua nợ' }, { head: 'Hóa đơn', right: true }],
    subcontractor: [{ head: 'Thầu phụ' }, { head: 'Lĩnh vực' }, { head: 'Người liên hệ' }, { head: 'Số điện thoại' }, { head: 'Số HĐ', right: true }, { head: 'Còn phải trả', right: true }],
  };
  return map[tab];
}

type Ctx = { money: boolean; canSeeIds: boolean; canEdit: boolean; onToggleCredit: (id: string, value: boolean) => void };

function buildRows(tab: ContactKind, d: ContactsData, report: ReturnType<typeof useReportData>['data'] | null, ctx: Ctx): RowDef[] {
  const phoneOf = (id: string) => { const p = d.masked.get(id)?.phone; return p ? <span className="num">{p}</span> : dim('chưa có'); };
  const idOf = (id: string) => { const m = d.masked.get(id); return m?.id_number ? <span className="num">{m.id_number}</span> : <Pill tone="warn">Chưa có</Pill>; };
  const phoneText = (id: string) => d.masked.get(id)?.phone ?? '';
  /** Số gọi được (đủ số, không bị che) cho nút Gọi trên điện thoại */
  const telOf = (raw: string | null | undefined) => { const t = String(raw ?? '').replace(/[\s.-]/g, ''); return /^\+?\d{8,12}$/.test(t) ? t : undefined; };
  const text = (v: string | null | undefined) => (v ? v : dim('chưa có'));

  if (tab === 'customer') {
    const counts = new Map<string, { n: number; value: number }>();
    if (report) {
      const nums = projectNumbers(report, ALL_YEARS, report.loadedAt);
      for (const p of report.projects) {
        if (p.is_company_overhead || !p.customer_id) continue;
        const c = counts.get(p.customer_id) ?? { n: 0, value: 0 };
        c.n++; c.value += nums.of(p).revenue.contractValue;
        counts.set(p.customer_id, c);
      }
    }
    return d.customers.map((c) => {
      const s = counts.get(c.id) ?? { n: 0, value: 0 };
      return {
        id: c.id, kind: 'customer', name: c.name, haystack: [c.name, c.full_name, c.address, phoneText(c.id)], extra: { filter: s.n > 0 ? 'has' : 'none' },
        cols: [
          { head: 'Khách hàng', cell: <b className="font-semibold">{c.name}</b> }, { head: 'Họ tên đầy đủ', cell: <span className={c.full_name ? '' : 'text-faint'}>{c.full_name || 'chưa có'}</span> },
          { head: 'Số điện thoại', cell: phoneOf(c.id) }, { head: 'Địa chỉ', wrap: true, cell: text(c.address) },
          { head: 'CCCD', cell: d.masked.get(c.id)?.id_number ? <Pill tone="good">Đã có</Pill> : dim('—') }, { head: 'Số CT', right: true, cell: <span className="num">{s.n}</span> },
          ...(ctx.money ? [{ head: 'Tổng giá trị HĐ', right: true, cell: <Money value={s.value} /> }] : []),
        ],
        mobileTitle: c.name, tel: telOf(phoneText(c.id)),
        mobileMeta: [<span key="a" className="min-w-0 truncate">{c.address || 'chưa có địa chỉ'}</span>, <span key="b" className="shrink-0">{s.n} CT</span>],
      };
    });
  }
  if (tab === 'worker') {
    return d.workers.map((w) => {
      const pv = d.priv.get(w.id);
      const year = pv?.date_of_birth ? pv.date_of_birth.slice(0, 4) : '';
      const hasBank = d.masked.get(w.id)?.has_bank_account;
      return {
        id: w.id, kind: 'worker', name: w.name, haystack: [w.name, w.full_name, phoneText(w.id)], extra: { filter: w.role ?? '' },
        cols: [
          { head: 'Tên gọi', cell: <b className="font-semibold">{w.name}</b> }, { head: 'T/P', cell: w.role ? <Pill tone={w.role === 'C' ? 'accent' : 'neutral'}>{ROLE_LABEL[w.role] ?? w.role}</Pill> : dim('—') },
          { head: 'Họ tên (theo CCCD)', cell: text(w.full_name) }, { head: 'Năm sinh', cell: year ? <span className="num">{year}</span> : dim(ctx.canSeeIds ? '—' : 'ẩn theo quyền') },
          { head: 'Quê quán', wrap: true, cell: pv?.hometown ? pv.hometown : dim(ctx.canSeeIds ? '—' : 'ẩn theo quyền') }, { head: 'Số điện thoại', cell: phoneOf(w.id) },
          { head: 'CCCD', cell: idOf(w.id) }, { head: 'Tài khoản nhận lương', cell: hasBank ? (ctx.canSeeIds && pv?.bank_account ? <span className="num text-muted">{[pv.bank_name, '•••' + pv.bank_account.slice(-4)].filter(Boolean).join(' · ')}</span> : <span className="text-muted">Đã có</span>) : dim('—') },
        ],
        mobileTitle: <>{w.name} {w.role ? <Pill>{ROLE_LABEL[w.role] ?? w.role}</Pill> : null}</>,
        tel: telOf(phoneText(w.id)),
        mobileMeta: [<span key="a" className="min-w-0 truncate">{[w.full_name, phoneText(w.id)].filter(Boolean).join(' · ') || 'chưa có họ tên, SĐT'}</span>],
      };
    });
  }
  if (tab === 'employee') {
    return d.employees.map((e) => ({
      id: e.id, kind: 'employee', name: e.full_name, haystack: [e.full_name, e.title, phoneText(e.id)],
      cols: [
        { head: 'Nhân viên', cell: <b className="font-semibold">{e.full_name}</b> }, { head: 'Chức danh', cell: e.title ?? dim('—') },
        { head: 'Tài khoản app', cell: e.profile_id ? <Pill tone="accent">Có tài khoản</Pill> : dim('—') }, { head: 'Số điện thoại', cell: phoneOf(e.id) },
        { head: 'Ngày vào làm', cell: e.started_on ? <span className="num">{formatDate(e.started_on)}</span> : dim('—') }, { head: 'Ghi chú', wrap: true, cell: e.note ?? dim('—') },
      ],
      mobileTitle: e.full_name, tel: telOf(phoneText(e.id)), mobileMeta: [<span key="a" className="min-w-0 truncate">{[e.title, phoneText(e.id)].filter(Boolean).join(' · ') || '—'}</span>],
    }));
  }
  if (tab === 'supplier') {
    const invoices = new Map<string, number>();
    for (const e of report?.expenses ?? []) if (e.supplier_id) invoices.set(e.supplier_id, (invoices.get(e.supplier_id) ?? 0) + 1);
    return d.suppliers.map((s) => ({
      id: s.id, kind: 'supplier', name: s.name, haystack: [s.name, s.address, s.phone], extra: { filter: s.buys_on_credit ? 'credit' : 'cash' },
      cols: [
        { head: 'Nhà cung cấp', cell: <b className="font-semibold whitespace-nowrap">{s.name}</b> }, { head: 'Địa chỉ', wrap: true, cell: text(s.address) },
        { head: 'Số điện thoại', cell: s.phone ? <span className="num">{s.phone}</span> : dim('chưa có') },
        {
          head: 'Mua nợ',
          cell: (
            <button type="button" role="switch" aria-checked={s.buys_on_credit} aria-label={`Mua nợ ${s.name}`} disabled={!ctx.canEdit}
              onClick={(e) => { e.stopPropagation(); ctx.onToggleCredit(s.id, !s.buys_on_credit); }}
              className={s.buys_on_credit ? 'text-warn' : 'text-faint'}><Icon name={s.buys_on_credit ? 'toggle_on' : 'toggle_off'} className="!text-[28px]" /></button>
          ),
        },
        { head: 'Hóa đơn', right: true, cell: <span className="num">{invoices.get(s.id) ?? 0}</span> },
      ],
      mobileTitle: <>{s.name} {s.buys_on_credit ? <Pill tone="warn">Mua nợ</Pill> : null}</>,
      tel: telOf(s.phone),
      mobileMeta: [<span key="a" className="min-w-0 truncate">{s.address || 'chưa có địa chỉ'}</span>, <span key="b" className="shrink-0">{invoices.get(s.id) ?? 0} HĐ</span>],
    }));
  }
  const standing = report ? subcontractorStandings(report.subcontracts, report.payments) : new Map();
  return d.subcontractors.map((t) => {
    const s = standing.get(t.id) ?? { contracts: 0, debt: 0 };
    return {
      id: t.id, kind: 'subcontractor', name: t.name, haystack: [t.name, t.field, t.contact_person, phoneText(t.id)],
      cols: [
        { head: 'Thầu phụ', cell: <b className="font-semibold whitespace-nowrap">{t.name}</b> }, { head: 'Lĩnh vực', wrap: true, cell: t.field ?? dim('—') },
        { head: 'Người liên hệ', cell: text(t.contact_person) }, { head: 'Số điện thoại', cell: phoneOf(t.id) },
        { head: 'Số HĐ', right: true, cell: <span className="num">{s.contracts}</span> }, { head: 'Còn phải trả', right: true, cell: <Money value={s.debt} className="text-bad" /> },
      ],
      mobileTitle: t.name, tel: telOf(phoneText(t.id)), mobileMeta: [<span key="a">{t.field || '—'} · {s.contracts} HĐ</span>, <span key="b" className="num">{s.debt ? `còn ${Math.round(s.debt).toLocaleString('vi-VN')}` : ''}</span>],
    };
  });
}
