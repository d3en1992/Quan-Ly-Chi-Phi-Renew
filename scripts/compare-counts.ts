// GĐ2 — So sánh dữ liệu app cũ (snapshot) với kho mới (Supabase trên máy) sau khi chuyển.
// In số bản ghi cũ / mới từng loại, tổng tiền, các quy tắc Đã TT / chia tiền NCC, danh sách bị bỏ + lý do
// → ghi du-lieu/bao-cao-chuyen-du-lieu.md. Thoát mã 1 nếu có mục KHÔNG khớp.
// Chạy:  npm run compare:legacy
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPANY_ID, localAdminClient } from './local-supabase.mjs';
import { contentHash, DATA_DIR, fetchBusinessTables, legacyUserMap, loadSnapshot, REPORT_FILE } from './legacy/io.ts';
import { transformSnapshot } from './legacy/transform.ts';
import type { Row } from './legacy/transform.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type L = Record<string, any>;
const admin = localAdminClient();
const { snapshot, path, isFallback } = loadSnapshot();
const users = await legacyUserMap(admin, COMPANY_ID);
const expected = transformSnapshot(snapshot, { companyId: COMPANY_ID, userIdByLegacyName: users.map });
const db = await fetchBusinessTables(admin, COMPANY_ID);
const d = (snapshot as L).data as L;

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN');
const live = (rows: Row[]) => rows.filter((r) => !r.deleted_at);
const gone = (rows: Row[]) => rows.filter((r) => r.deleted_at);
const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
const n = (v: unknown) => Number(v) || 0;
const oldAlive = (r: L) => r && !r.deletedAt && !r.purgedAt && r.cancelled !== true;
const list = (key: string): L[] => (Array.isArray(d[key]) ? d[key] : []);
const out: string[] = [];
let failures = 0;
const mark = (ok: boolean) => { if (!ok) failures++; return ok ? '✅' : '❌'; };

// ── 1. Số bản ghi từng kho cũ → bảng mới ───────────────────────────
const MAPPING: { store: string; label: string; target: string; rows: Row[] }[] = [
  { store: 'inv_v3', label: 'Hóa đơn chi phí', target: 'expenses', rows: db.expenses },
  { store: 'cc_v2', label: 'Tuần chấm công', target: 'timesheet_weeks', rows: db.timesheet_weeks },
  { store: 'ung_v1', label: 'Phiếu ứng (TP + NCC + công nhân)', target: 'payments + wage_advances', rows: [...db.payments, ...db.wage_advances] },
  { store: 'thu_v1', label: 'Phiếu thu', target: 'receipts', rows: db.receipts },
  { store: 'tb_v1', label: 'Thiết bị', target: 'equipment', rows: db.equipment },
  { store: 'projects_v1', label: 'Công trình', target: 'projects (không tính CÔNG TY)', rows: db.projects.filter((p) => !p.is_company_overhead) },
  { store: 'customers_v1', label: 'Khách hàng', target: 'customers', rows: db.customers },
  { store: 'hopdong_v1', label: 'HĐ chính', target: 'main_contracts', rows: db.main_contracts },
  { store: 'thauphu_v1', label: 'HĐ thầu phụ', target: 'subcontracts', rows: db.subcontracts },
  { store: 'quyettoan_v1', label: 'Quyết toán', target: 'settlements', rows: db.settlements },
  { store: 'tytrong_v1', label: 'Tỉ trọng / định mức', target: 'cost_allocations', rows: db.cost_allocations },
];
out.push('## 1. Số bản ghi', '',
  '| Kho cũ | Nghĩa | Tổng | Còn sống | Xóa mềm | Bia mộ | → Bảng mới | Mới: đang dùng | Mới: thùng rác | Bỏ | Khớp |',
  '|---|---|--:|--:|--:|--:|---|--:|--:|--:|:-:|');
for (const m of MAPPING) {
  const lc = expected.legacy[m.store] ?? { total: 0, alive: 0, softDeleted: 0, purged: 0 };
  const dropped = expected.dropped.filter((x) => x.store === m.store);
  const merged = expected.routed[`${m.store}→${m.target} (gộp)`] ?? 0;
  const droppedAlive = dropped.filter((x) => x.alive).length;
  const wantAlive = lc.alive - droppedAlive - merged;
  const wantGone = lc.softDeleted - (dropped.length - droppedAlive - lc.purged);
  const ok = live(m.rows).length === wantAlive && gone(m.rows).length === wantGone;
  out.push(`| \`${m.store}\` | ${m.label} | ${lc.total} | ${lc.alive} | ${lc.softDeleted} | ${lc.purged} | ${m.target} | ${live(m.rows).length} | ${gone(m.rows).length} | ${dropped.length + merged} | ${mark(ok)} |`);
}
out.push('', '“Bỏ” = bia mộ (đã xóa vĩnh viễn ở app cũ) + bản trùng được gộp; chi tiết ở mục 6. Bản xóa mềm được chuyển sang kèm `deleted_at` (vào Thùng rác).', '');

// ── 2. Dòng con, danh mục, bảng sinh thêm ──────────────────────────
out.push('## 2. Dòng con và danh mục', '', '| Nguồn cũ | Số cũ | → Bảng mới | Số mới | Khớp |', '|---|--:|---|--:|:-:|');
const keptInvIds = new Set(db.expenses.map((e) => e.id));
const oldItems = list('inv_v3').filter((r) => !r.purgedAt && keptInvIds.has(String(r.id).toLowerCase())).reduce((s, r) => s + (Array.isArray(r.items) ? r.items.length : 0), 0);
const keptWeekIds = new Set(db.timesheet_weeks.map((w) => w.id));
const oldWorkers = list('cc_v2').filter((r) => !r.purgedAt && keptWeekIds.has(String(r.id).toLowerCase())).reduce((s, r) => s + (Array.isArray(r.workers) ? r.workers.length : 0), 0);
const droppedWorkers = expected.dropped.filter((x) => x.store === 'cc_v2.workers').length;
const row2 = (label: string, oldN: number, target: string, newN: number) => out.push(`| ${label} | ${oldN} | ${target} | ${newN} | ${mark(oldN === newN)} |`);
row2('Dòng vật tư trong hóa đơn (`inv_v3.items`)', oldItems, 'expense_lines', db.expense_lines.length);
row2('Dòng công nhân trong tuần (`cc_v2.workers`)', oldWorkers - droppedWorkers, 'timesheet_lines', db.timesheet_lines.length);
const catItems: L = d.cat_items_v1 ?? {};
const activeCat = (t: string) => (Array.isArray(catItems[t]) ? catItems[t] : []).filter((i: L) => i && i.id && i.name && !i.isDeleted).length;
const dupCat = (t: string) => expected.dropped.filter((x) => x.store === `cat_items_v1.${t}` && x.alive).length;
const catRow = (t: string, label: string, target: string, rows: Row[]) =>
  row2(`${label} đang dùng (\`cat_items_v1.${t}\`)`, activeCat(t) - dupCat(t), target, rows.filter((r) => !r.archived && !r.deleted_at).length);
catRow('loai', 'Loại chi phí', 'catalog_items (expense_type)', db.catalog_items.filter((c) => c.kind === 'expense_type'));
catRow('nguoi', 'Người TH → Người mua', 'catalog_items (person)', db.catalog_items.filter((c) => c.kind === 'person'));
catRow('tbteb', 'Tên thiết bị', 'catalog_items (equipment_name)', db.catalog_items.filter((c) => c.kind === 'equipment_name'));
catRow('ncc', 'Nhà cung cấp', 'suppliers', db.suppliers);
catRow('tp', 'Thầu phụ', 'subcontractors', db.subcontractors);
catRow('cn', 'Công nhân', 'workers', db.workers);
const ungAlive = list('ung_v1').filter(oldAlive);
const kindOf = (r: L) => (r.loai === 'nhacungcap' ? 'nhacungcap' : r.loai === 'congnhan' ? 'congnhan' : 'thauphu');
row2('Phiếu ứng thầu phụ còn sống', ungAlive.filter((r) => kindOf(r) === 'thauphu').length, 'payments (advance)', live(db.payments).filter((p) => p.kind !== 'supplier_payment').length);
row2('Phiếu ứng NCC còn sống', ungAlive.filter((r) => kindOf(r) === 'nhacungcap').length, 'payments (supplier_payment)', live(db.payments).filter((p) => p.kind === 'supplier_payment').length);
row2('Phiếu ứng / trả công nhân còn sống', ungAlive.filter((r) => kindOf(r) === 'congnhan').length, 'wage_advances', live(db.wage_advances).length);
const settleIds = new Set(list('ung_v1').filter((r) => !r.purgedAt && r.autoSettle && r.settleId).map((r) => r.settleId));
row2('Lần tất toán (`settleId`)', settleIds.size, 'payable_closures', db.payable_closures.length);
out.push('', `Bảng sinh thêm: 1 công trình **CÔNG TY** (chi phí chung, thay cho id \`COMPANY\` của app cũ); ${db.contact_private.length} dòng SĐT khách hàng (\`contact_private\`); ${db.payment_allocations.length} dòng chia tiền trả NCC vào hóa đơn (\`payment_allocations\`).`, '');

// ── 3. Tổng tiền bản ghi còn sống ──────────────────────────────────
out.push('## 3. Tổng tiền (bản ghi còn sống)', '', '| Khoản | App cũ | Kho mới | Lệch | Khớp |', '|---|--:|--:|--:|:-:|');
const row3 = (label: string, a: number, b: number) => out.push(`| ${label} | ${fmt(a)} | ${fmt(b)} | ${fmt(b - a)} | ${mark(Math.round(a) === Math.round(b))} |`);
const oldSum = (rows: L[], f: (r: L) => number) => rows.filter(oldAlive).reduce((s, r) => s + f(r), 0);
row3('Hóa đơn chi phí', oldSum(list('inv_v3'), (r) => n(r.thanhtien || r.tien)), sum(live(db.expenses), (r) => n(r.amount)));
row3('Dòng vật tư (thành tiền)', oldSum(list('inv_v3'), (r) => (Array.isArray(r.items) ? r.items : []).reduce((s: number, i: L) => s + n(i?.thanhtien), 0)), sum(live(db.expense_lines), (r) => n(r.amount)));
const ccOld = list('cc_v2').filter(oldAlive).flatMap((w) => (Array.isArray(w.workers) ? w.workers : []) as L[]);
const ccNew = live(db.timesheet_lines);
// tienich.js buildInvoices: lương = Σ (tổng công × lương/ngày + phụ cấp); HĐ mua lẻ chỉ tính dòng > 0
row3('Lương chấm công (công × lương + phụ cấp)',
  ccOld.reduce((s, w) => s + (Array.isArray(w.d) ? w.d : []).reduce((a: number, v: unknown) => a + n(v), 0) * n(w.luong) + n(w.phucap), 0),
  sum(ccNew, (r) => (r.day_units as number[]).reduce((a, v) => a + n(v), 0) * n(r.daily_wage) + n(r.allowance)));
row3('HĐ mua lẻ trong chấm công', ccOld.reduce((s, w) => s + (n(w.hdmuale) > 0 ? n(w.hdmuale) : 0), 0), sum(ccNew, (r) => (n(r.retail_purchase) > 0 ? n(r.retail_purchase) : 0)));
row3('Trừ nợ trong chấm công', ccOld.reduce((s, w) => s + n(w.tru), 0), sum(ccNew, (r) => n(r.debt_deduction)));
row3('Ứng ghi trong tuần đời cũ (loanAmount)', ccOld.reduce((s, w) => s + n(w.loanAmount), 0), sum(ccNew, (r) => n(r.legacy_loan)));
row3('Đã chi thầu phụ (ứng TP)', ungAlive.filter((r) => kindOf(r) === 'thauphu').reduce((s, r) => s + n(r.tien), 0), sum(live(db.payments).filter((p) => p.kind !== 'supplier_payment'), (r) => n(r.amount)));
row3('Đã trả NCC (ứng NCC)', ungAlive.filter((r) => kindOf(r) === 'nhacungcap').reduce((s, r) => s + n(r.tien), 0), sum(live(db.payments).filter((p) => p.kind === 'supplier_payment'), (r) => n(r.amount)));
row3('Tạm ứng lương: ứng', ungAlive.filter((r) => kindOf(r) === 'congnhan' && r.cnKind !== 'tra').reduce((s, r) => s + n(r.tien), 0), sum(live(db.wage_advances).filter((w) => w.direction === 'advance'), (r) => n(r.amount)));
row3('Tạm ứng lương: trả', ungAlive.filter((r) => kindOf(r) === 'congnhan' && r.cnKind === 'tra').reduce((s, r) => s + n(r.tien), 0), sum(live(db.wage_advances).filter((w) => w.direction === 'repay'), (r) => n(r.amount)));
row3('Thu tiền', oldSum(list('thu_v1'), (r) => n(r.tien)), sum(live(db.receipts), (r) => n(r.amount)));
row3('HĐ chính (giá trị + phụ + phát sinh cũ)', Object.values((d.hopdong_v1 ?? {}) as L).filter(oldAlive).reduce((s: number, h: L) => s + n(h.giaTri) + n(h.giaTriphu) + n(h.phatSinh), 0),
  sum(live(db.main_contracts), (r) => n(r.value) + n(r.extra_value) + n(r.legacy_variation)));
row3('HĐ thầu phụ (giá trị + phát sinh cũ)', oldSum(list('thauphu_v1'), (r) => n(r.giaTri) + n(r.phatSinh)), sum(live(db.subcontracts), (r) => n(r.value) + n(r.legacy_variation)));
row3('Quyết toán (|giá trị|)', oldSum(list('quyettoan_v1'), (r) => Math.abs(n(r.giaTri))), sum(live(db.settlements), (r) => n(r.amount)));
row3('Thiết bị (số lượng)', oldSum(list('tb_v1'), (r) => n(r.soluong)), sum(live(db.equipment), (r) => n(r.quantity)));
out.push('');

// ── 4. Quy tắc Đã TT, Mua nợ, chia tiền NCC (mục 4F, 4J) ───────────
out.push('## 4. Đã TT, Mua nợ, chia tiền trả NCC', '');
const PLAN_CREDIT = ['VLXD HÙNG HUỆ', 'VLXD PHƯƠNG', 'VLXD DUY THỊNH PHÁT', 'CH TRƯỜNG HẢI', 'VLXD HOÀNG TUẤN BC', 'HIỆP ĐỔ BÊ TÔNG TAY', 'SẮT THÉP VLXD ĐỨC ANH', 'CH SƠN TRUNG HẬU', 'SẮT THÉP AN PHÚ'].sort();
const credit = db.suppliers.filter((s) => s.buys_on_credit).map((s) => String(s.name)).sort();
out.push(`- ${mark(JSON.stringify(credit) === JSON.stringify(PLAN_CREDIT))} NCC bật **Mua nợ** (${credit.length}): ${credit.join(', ')}${JSON.stringify(credit) === JSON.stringify(PLAN_CREDIT) ? ' — đúng 9 NCC trong KẾ HOẠCH mục 4F' : ` — KHÁC danh sách trong KẾ HOẠCH: ${PLAN_CREDIT.join(', ')}`}`);
const unpaid = live(db.expenses).filter((e) => e.paid_at_purchase === false);
out.push(`- Hóa đơn **chưa tích Đã TT** (mua nợ): ${unpaid.length} hóa đơn, tổng ${fmt(sum(unpaid, (r) => n(r.amount)))} đ. Còn lại ${live(db.expenses).length - unpaid.length} hóa đơn đã tích.`);
const allocByPayment = new Map<string, number>();
for (const a of live(db.payment_allocations)) allocByPayment.set(a.payment_id as string, (allocByPayment.get(a.payment_id as string) ?? 0) + n(a.amount));
const supplierPays = live(db.payments).filter((p) => p.kind === 'supplier_payment');
const badAlloc = supplierPays.filter((p) => (allocByPayment.get(p.id as string) ?? 0) !== n(p.amount));
out.push(`- ${mark(badAlloc.length === 0)} Mỗi phiếu chi NCC cũ được chia đủ số tiền của phiếu (${supplierPays.length} phiếu, ${badAlloc.length} phiếu lệch).`);
const overAlloc = new Map<string, number>();
for (const a of live(db.payment_allocations)) if (a.expense_id) overAlloc.set(a.expense_id as string, (overAlloc.get(a.expense_id as string) ?? 0) + n(a.amount));
const amountById = new Map(db.expenses.map((e) => [e.id as string, n(e.amount)]));
const over = [...overAlloc].filter(([id, v]) => v > (amountById.get(id) ?? 0)).length;
out.push(`- ${mark(over === 0)} Không hóa đơn nào được chia quá số tiền của nó (${over} hóa đơn vượt).`);
const restRows = live(db.payment_allocations).filter((a) => !a.expense_id);
out.push(`- Phần tiền trả NCC **không còn hóa đơn mua nợ để chia** ở cùng công trình (trả dư / trả trước): ${restRows.length} dòng, tổng ${fmt(sum(restRows, (r) => n(r.amount)))} đ — vẫn tính là đã trả của công trình đó, như app cũ.`);

// So thử A (phần hóa đơn nhập tay + tiền trả NCC), B, Đã thu theo ĐÚNG công thức app cũ (lnTinhCongTrinh, _lnUngCT)
// với cách tính mới (Đã TT + phần đã chia) — từng công trình, từng năm và Tất cả năm. Lương chấm công không đổi nên không so ở đây.
{
  const normNcc = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase(); // _lnNormNcc
  const invOld = list('inv_v3').filter(oldAlive);
  const ungOld = ungAlive;
  const thuOld = list('thu_v1').filter(oldAlive);
  const years = new Set<string>();
  for (const r of [...invOld, ...ungOld, ...thuOld]) if (typeof r.ngay === 'string') years.add(r.ngay.slice(0, 4));
  const scopes = [...[...years].sort(), 'Tất cả'];
  const inScope = (date: unknown, y: string) => y === 'Tất cả' || String(date ?? '').startsWith(y);
  const payDate = new Map(db.payments.map((p) => [p.id as string, p.date as string]));
  const bad: string[] = [];
  let checked = 0;
  for (const p of live(db.projects).filter((x) => !x.is_company_overhead)) {
    const pid = p.id as string;
    const nccSet = new Set(ungOld.filter((r) => kindOf(r) === 'nhacungcap' && r.projectId === pid).map((r) => normNcc(r.tp)).filter(Boolean));
    for (const y of scopes) {
      const aHdOld = invOld.filter((i) => i.projectId === pid && inScope(i.ngay, y) && !nccSet.has(normNcc(i.ncc))).reduce((s, i) => s + n(i.thanhtien || i.tien), 0);
      const aUngOld = ungOld.filter((r) => kindOf(r) === 'nhacungcap' && r.projectId === pid && inScope(r.ngay, y)).reduce((s, r) => s + n(r.tien), 0);
      const bOld = ungOld.filter((r) => kindOf(r) === 'thauphu' && r.projectId === pid && inScope(r.ngay, y)).reduce((s, r) => s + n(r.tien), 0);
      const thuO = thuOld.filter((r) => r.projectId === pid && inScope(r.ngay, y)).reduce((s, r) => s + n(r.tien), 0);
      const aHdNew = sum(live(db.expenses).filter((e) => e.project_id === pid && e.paid_at_purchase === true && inScope(e.date, y)), (r) => n(r.amount));
      const aUngNew = sum(live(db.payment_allocations).filter((a) => a.project_id === pid && inScope(payDate.get(a.payment_id as string), y)), (r) => n(r.amount));
      const bNew = sum(live(db.payments).filter((x) => x.kind !== 'supplier_payment' && x.project_id === pid && inScope(x.date, y)), (r) => n(r.amount));
      const thuN = sum(live(db.receipts).filter((x) => x.project_id === pid && inScope(x.date, y)), (r) => n(r.amount));
      checked++;
      if (aHdOld !== aHdNew || aUngOld !== aUngNew || bOld !== bNew || thuO !== thuN) {
        bad.push(`  - ${p.name} · ${y}: hóa đơn ${fmt(aHdOld)} → ${fmt(aHdNew)}; trả NCC ${fmt(aUngOld)} → ${fmt(aUngNew)}; thầu phụ ${fmt(bOld)} → ${fmt(bNew)}; đã thu ${fmt(thuO)} → ${fmt(thuN)}`);
      }
    }
  }
  out.push(`- ${mark(bad.length === 0)} So thử phần **A (hóa đơn nhập tay + tiền trả NCC), B (thầu phụ), Đã thu** theo công thức app cũ với cách tính mới: ${checked} ô (công trình × năm, gồm “Tất cả”), **${bad.length} ô lệch**.`, ...bad.slice(0, 30));
  if (bad.length > 30) out.push(`  - … còn ${bad.length - 30} ô nữa`);
}
const weekKeys = new Set<string>();
let dupWeeks = 0;
for (const w of live(db.timesheet_weeks)) { const k = `${w.project_id}|${w.week_start}`; if (weekKeys.has(k)) dupWeeks++; weekKeys.add(k); }
out.push(`- ${mark(dupWeeks === 0)} Mỗi công trình mỗi tuần chỉ 1 bảng chấm công (${dupWeeks} bản trùng).`, '');

// ── 5. so-chuan.json (nếu có) ──────────────────────────────────────
out.push('## 5. Đối chiếu `so-chuan.json`', '');
const soChuanFile = join(DATA_DIR, 'so-chuan.json');
if (existsSync(soChuanFile)) {
  const sc = JSON.parse(readFileSync(soChuanFile, 'utf8')) as L;
  const newAlive: Record<string, number> = {
    inv_v3: live(db.expenses).length, cc_v2: live(db.timesheet_weeks).length, ung_v1: live(db.payments).length + live(db.wage_advances).length,
    thu_v1: live(db.receipts).length, tb_v1: live(db.equipment).length, thauphu_v1: live(db.subcontracts).length,
    quyettoan_v1: live(db.settlements).length, projects_v1: live(db.projects).filter((p) => !p.is_company_overhead).length, customers_v1: live(db.customers).length,
  };
  out.push('| Kho | so-chuan.json | Kho mới | Khớp |', '|---|--:|--:|:-:|');
  for (const [k, v] of Object.entries((sc.soBanGhi ?? {}) as Record<string, number>)) out.push(`| \`${k}\` | ${v} | ${newAlive[k] ?? '—'} | ${mark(newAlive[k] === v)} |`);
  out.push('', 'Lưu ý: `so-chuan.json` phải được xuất CÙNG LÚC với snapshot đang dùng; lệch thời điểm thì số bản ghi lệch là bình thường.', '');
} else {
  out.push('Chưa có `du-lieu/so-chuan.json` (anh xuất bằng `mega-prompt/xuat-so-chuan.js`) → mới so với snapshot. Có file thì chạy lại `npm run compare:legacy`.', '');
}

// ── 6. Bản ghi bị bỏ + lý do ───────────────────────────────────────
out.push('## 6. Bản ghi bị bỏ và lý do', '');
const groups = new Map<string, typeof expected.dropped>();
for (const x of expected.dropped) { const k = `${x.store}|${x.reason}`; groups.set(k, [...(groups.get(k) ?? []), x]); }
out.push('| Kho cũ | Lý do | Số bản ghi | Trong đó còn sống |', '|---|---|--:|--:|');
for (const [k, g] of [...groups].sort()) out.push(`| \`${k.split('|')[0]}\` | ${k.split('|')[1]} | ${g.length} | ${g.filter((x) => x.alive).length} |`);
const aliveDropped = expected.dropped.filter((x) => x.alive);
out.push('', `Tổng: **${expected.dropped.length}** bản ghi bị bỏ, đều có lý do. Trong đó **${aliveDropped.length}** bản đang còn sống ở app cũ:`);
out.push(...(aliveDropped.length ? aliveDropped.map((x) => `- \`${x.store}\` · ${x.label} — ${x.reason}`) : ['- (không có)']), '');

// ── 7. Ghi chú của script chuyển ───────────────────────────────────
out.push('## 7. Ghi chú', '', ...expected.notes.map((x) => `- ${x}`), '');

// ── Đầu báo cáo ────────────────────────────────────────────────────
const hash = contentHash(db);
const prev = existsSync(REPORT_FILE) ? readFileSync(REPORT_FILE, 'utf8').match(/Mã băm nội dung kho mới: `([0-9a-f]+)`/)?.[1] : undefined;
const head = [
  '# BÁO CÁO CHUYỂN DỮ LIỆU APP CŨ → KHO MỚI',
  '',
  `- Lập lúc: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
  `- Snapshot: \`${path}\`${isFallback ? ' — **BẢN TẠM 02/11/2026**, chưa có `du-lieu/snapshot.json`' : ''} (xuất lúc ${new Date(expected.exportedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })})`,
  '- Kho mới: Supabase chạy trên máy (Docker)',
  `- Mã băm nội dung kho mới: \`${hash}\`${prev ? (prev === hash ? ' — **giống lần chạy trước** (chạy lại cho cùng kết quả)' : ` — khác lần trước (\`${prev}\`)`) : ''}`,
  `- Kết quả: ${failures === 0 ? '**✅ KHỚP HẾT** — không bản ghi nào mất mà không rõ lý do' : `**❌ CÓ ${failures} MỤC KHÔNG KHỚP** — xem dấu ❌ bên dưới`}`,
  '',
];
mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(REPORT_FILE, [...head, ...out].join('\n'), 'utf8');
console.log([...head, ...out.slice(0, out.indexOf('## 6. Bản ghi bị bỏ và lý do'))].join('\n'));
console.log(`\n→ Đã ghi ${REPORT_FILE}\nMã băm: ${hash}${prev ? (prev === hash ? ' (giống lần trước)' : ` (lần trước: ${prev})`) : ''}`);
process.exit(failures === 0 ? 0 : 1);
