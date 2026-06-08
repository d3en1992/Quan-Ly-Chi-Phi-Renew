// ============================================================================
//  modules/dashboard/dashboard.data.js  —  TẦNG DỮ LIỆU (Layer 5): Tổng hợp
// ----------------------------------------------------------------------------
//  @module dashboard.data
//
//  Dashboard là 100% DERIVED (doc 09 §1): KHÔNG có store riêng — mọi con số tính
//  lại mỗi lần mở tab / đổi năm / đổi bộ lọc. Chi phí gom qua MỘT view chuẩn
//  getCostRows() để tổng chi luôn khớp Tab 03 và không cộng đúp:
//      CHI PHÍ = Hóa đơn thật (Tab 02) + Lương ảo (Tab 04) + Thầu phụ (Tab 08)
//  Tiền ứng (Tab 05) và thiết bị (Tab 06) KHÔNG phải chi phí — chỉ hiện ở khối
//  chi tiết theo công trình.
//
//  loadDashboard({year}) đọc DB MỘT lần → trả gói dữ liệu (costRows + ứng + thiết
//  bị). Các hàm tính còn lại là THUẦN (nhận costRows), để đổi bộ lọc tuần/CT vẽ
//  lại tức thì mà không phải đọc DB lại.
// ============================================================================

import { getSelectedYear } from '../../topbar.js';
import { getInvoices } from '../hoadon/hoadon.data.js';
import { getTimesheetWeeks } from '../chamcong/chamcong.data.js';
import { weekToLaborRow, snapToSunday, weekLabel } from '../chamcong/chamcong.calc.js';
import { getSubcontracts } from '../doanhthu/doanhthu.data.js';
import { getAdvances, ADVANCE_TYPES } from '../tienung/tienung.data.js';
import { getEquipment, WAREHOUSE_ID, CONDITION_KEYS } from '../thietbi/thietbi.data.js';
import { loadProjects, getProjectName } from '../projects/projects.data.js';

const num = (x) => Number(x) || 0;

// ----------------------------------------------------------------------------
//  getCostRows({ year }) — View CHUẨN chi phí (doc 09 §1): gộp 3 nguồn về cùng
//  một hình dạng dòng { date, projectId, category, amount, kind }.
//    kind: 'invoice' (HĐ thật) | 'labor' (lương ảo) | 'subcontract' (thầu phụ).
//  year=0 → mọi năm. Bỏ các dòng tiền 0 cho gọn biểu đồ.
// ----------------------------------------------------------------------------
export async function getCostRows({ year = getSelectedYear() } = {}) {
  const [invoices, weeks, subs] = await Promise.all([
    getInvoices({ year }),
    getTimesheetWeeks({ year }),
    getSubcontracts({ year }),
  ]);

  const rows = [];

  for (const inv of invoices) {
    rows.push({
      date: inv.date, projectId: inv.projectId,
      category: inv.category || 'Khác', amount: num(inv.amount), kind: 'invoice',
    });
  }

  for (const w of weeks) {
    const r = weekToLaborRow(w);
    if (num(r.amount) > 0) {
      rows.push({
        date: r.date, projectId: r.projectId,
        category: 'Nhân công', amount: num(r.amount), kind: 'labor',
      });
    }
  }

  for (const s of subs) {
    if (num(s.value) > 0) {
      rows.push({
        date: s.date, projectId: s.projectId,
        category: 'Thầu phụ', amount: num(s.value), kind: 'subcontract',
      });
    }
  }

  return rows.filter((r) => num(r.amount) > 0);
}

// ----------------------------------------------------------------------------
//  loadDashboard({ year }) — Đọc DB MỘT lần, trả gói đủ để vẽ cả tab:
//    { year, singleYear, costRows, advByProject, equipByProject }
//  advByProject: [{ projectId, sub, sup, total }] — ứng thầu phụ / NCC mỗi CT.
//  equipByProject: [{ projectId, totalQty, needQty, typeCount }] — thiết bị mỗi CT
//    (needQty = số TB đang bảo trì + sửa chữa → cảnh báo cờ đỏ).
// ----------------------------------------------------------------------------
export async function loadDashboard({ year = getSelectedYear() } = {}) {
  await loadProjects();

  const [costRows, advances, equipment] = await Promise.all([
    getCostRows({ year }),
    getAdvances({ year }),
    getEquipment({ year: 0 }),            // thiết bị: tồn kho hiện tại (mọi năm)
  ]);

  return {
    year,
    singleYear: num(year) !== 0,
    costRows,
    advByProject: groupAdvances(advances),
    equipByProject: groupEquipment(equipment),
  };
}

// groupAdvances(advances) — Gom ứng theo CT, tách thầu phụ / nhà cung cấp.
function groupAdvances(advances) {
  const subKey = Object.keys(ADVANCE_TYPES)[0];     // 'subcontractor'
  const map = new Map();
  for (const a of advances) {
    if (!map.has(a.projectId)) map.set(a.projectId, { projectId: a.projectId, sub: 0, sup: 0, total: 0 });
    const g = map.get(a.projectId);
    const amt = num(a.amount);
    if (a.type === subKey) g.sub += amt; else g.sup += amt;
    g.total += amt;
  }
  return [...map.values()].filter((g) => g.total > 0).sort((a, b) => b.total - a.total);
}

// groupEquipment(equipment) — Gom thiết bị theo CT (bỏ Kho Tổng), đếm TB cần lo.
function groupEquipment(equipment) {
  const needKeys = CONDITION_KEYS.filter((k) => k !== 'active');   // maintenance, repair
  const map = new Map();
  for (const e of equipment) {
    if (e.projectId === WAREHOUSE_ID) continue;
    if (!map.has(e.projectId)) map.set(e.projectId, { projectId: e.projectId, totalQty: 0, needQty: 0, names: new Set() });
    const g = map.get(e.projectId);
    const qty = num(e.quantity);
    g.totalQty += qty;
    if (needKeys.includes(e.condition)) g.needQty += qty;
    if (e.name) g.names.add(e.name);
  }
  return [...map.values()]
    .map((g) => ({ projectId: g.projectId, totalQty: g.totalQty, needQty: g.needQty, typeCount: g.names.size }))
    .filter((g) => g.totalQty > 0)
    .sort((a, b) => b.totalQty - a.totalQty);
}

// ----------------------------------------------------------------------------
//  calcKpi(costRows, year) — Thẻ KPI (doc 09 §2). singleYear → maxWeek; nhiều
//  năm → avgMonth (chia cho số tháng ĐÃ xảy ra). biggestInvoice = HĐ thật lớn nhất.
//  Trả { totalCost, projectCount, singleYear, maxWeek, avgMonth, biggestInvoice }.
// ----------------------------------------------------------------------------
export function calcKpi(costRows, year = getSelectedYear()) {
  const singleYear = num(year) !== 0;
  const totalCost = costRows.reduce((s, r) => s + num(r.amount), 0);
  const projectCount = new Set(costRows.map((r) => r.projectId)).size;

  // Tuần chi cao nhất
  let maxWeek = null;
  if (singleYear) {
    const byWeek = new Map();
    for (const r of costRows) {
      const k = snapToSunday(r.date);
      byWeek.set(k, num(byWeek.get(k)) + num(r.amount));
    }
    for (const [k, v] of byWeek) {
      if (!maxWeek || v > maxWeek.total) maxWeek = { weekKey: k, label: weekLabel(k), total: v };
    }
  }

  // TB/tháng (chỉ chia cho tháng đã xảy ra trong dữ liệu)
  const months = new Set(costRows.map((r) => String(r.date || '').slice(0, 7)).filter(Boolean));
  const avgMonth = months.size ? totalCost / months.size : 0;

  // HĐ thật lớn nhất
  let biggestInvoice = 0;
  for (const r of costRows) if (r.kind === 'invoice' && num(r.amount) > biggestInvoice) biggestInvoice = num(r.amount);

  return { totalCost, projectCount, singleYear, maxWeek, avgMonth, biggestInvoice };
}

// ----------------------------------------------------------------------------
//  weeklyCost(costRows, range) — Cột chồng theo TUẦN (CN→T7). range: 'all'|'12'|
//  '8'|'4' → lấy N tuần gần nhất có dữ liệu. Mỗi cột:
//    { weekKey, label, layers:{invoice,labor,subcontract}, total, byCT:[{name,amount}] }
//  byCT = top-3 CT chi nhiều nhất trong tuần (cho tooltip).
// ----------------------------------------------------------------------------
export function weeklyCost(costRows, range = 'all') {
  const map = new Map();
  for (const r of costRows) {
    const k = snapToSunday(r.date);
    if (!map.has(k)) map.set(k, { weekKey: k, layers: { invoice: 0, labor: 0, subcontract: 0 }, total: 0, ct: new Map() });
    const g = map.get(k);
    const amt = num(r.amount);
    g.layers[r.kind] = num(g.layers[r.kind]) + amt;
    g.total += amt;
    g.ct.set(r.projectId, num(g.ct.get(r.projectId)) + amt);
  }

  let weeks = [...map.values()].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
  const n = range === 'all' ? weeks.length : Number(range) || weeks.length;
  weeks = weeks.slice(-n);

  return weeks.map((g) => ({
    weekKey: g.weekKey, label: weekLabel(g.weekKey), layers: g.layers, total: g.total,
    byCT: [...g.ct.entries()]
      .map(([projectId, amount]) => ({ name: getProjectName(projectId), amount }))
      .sort((a, b) => b.amount - a.amount).slice(0, 3),
  }));
}

// ----------------------------------------------------------------------------
//  monthlyCost(costRows, year) — Cột theo THÁNG, luôn đủ T1→T12. Nhiều năm /
//  tất cả (year=0) → lấy TRUNG BÌNH mỗi tháng trên số NĂM có dữ liệu (doc 09 §2B).
//  Trả [{ month:1..12, label:'T1'.., value }].
// ----------------------------------------------------------------------------
export function monthlyCost(costRows, year = getSelectedYear()) {
  const sums = Array(12).fill(0);
  const years = new Set();
  for (const r of costRows) {
    const d = String(r.date || '');
    const m = Number(d.slice(5, 7));
    if (m >= 1 && m <= 12) sums[m - 1] += num(r.amount);
    if (d.length >= 4) years.add(d.slice(0, 4));
  }
  const divisor = num(year) === 0 ? Math.max(1, years.size) : 1;   // nhiều năm → TB/năm
  return sums.map((v, i) => ({ month: i + 1, label: `T${i + 1}`, value: v / divisor }));
}

// ----------------------------------------------------------------------------
//  costByType(costRows) — Tỷ trọng theo LOẠI chi phí cho pie (doc 09 §3): giữ
//  tối đa 6 loại lớn, gộp phần còn lại thành "Khác". Trả [{ type, value, pct }].
// ----------------------------------------------------------------------------
export function costByType(costRows) {
  const map = new Map();
  let total = 0;
  for (const r of costRows) {
    const t = r.category || 'Khác';
    map.set(t, num(map.get(t)) + num(r.amount));
    total += num(r.amount);
  }
  if (total <= 0) return [];

  let arr = [...map.entries()].map(([type, value]) => ({ type, value })).sort((a, b) => b.value - a.value);
  if (arr.length > 6) {
    const head = arr.slice(0, 6);
    const rest = arr.slice(6).reduce((s, x) => s + x.value, 0);
    arr = head.concat(rest > 0 ? [{ type: 'Khác', value: rest }] : []);
  }
  return arr.map((x) => ({ ...x, pct: (x.value / total) * 100 }));
}

// ----------------------------------------------------------------------------
//  topProjects(costRows, projectId) — Xếp hạng CT theo tổng chi. projectId rỗng
//  = mọi CT; có giá trị → chỉ giữ CT đó. Trả [{ projectId, name, total }].
// ----------------------------------------------------------------------------
export function topProjects(costRows, projectId = '') {
  const map = new Map();
  for (const r of costRows) {
    if (projectId && r.projectId !== projectId) continue;
    map.set(r.projectId, num(map.get(r.projectId)) + num(r.amount));
  }
  return [...map.entries()]
    .map(([id, total]) => ({ projectId: id, name: getProjectName(id), total }))
    .sort((a, b) => b.total - a.total);
}

// ----------------------------------------------------------------------------
//  buildCsv(bundle, range) — CSV tổng hợp (doc 09 §6): tuần/tháng + loại + Top CT.
//  UTF-8 BOM + CRLF để Excel tiếng Việt mở đúng font. Trả chuỗi (chưa BOM).
// ----------------------------------------------------------------------------
export function buildCsv(bundle, range = 'all') {
  const { costRows, year, singleYear } = bundle;
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [];

  lines.push(q(`Dashboard tổng hợp — ${singleYear ? 'Năm ' + year : 'Tất cả năm'}`));
  lines.push('');

  if (singleYear) {
    lines.push([q('Tuần'), q('Hóa đơn'), q('Nhân công'), q('Thầu phụ'), q('Tổng')].join(','));
    for (const w of weeklyCost(costRows, range)) {
      lines.push([q(w.label), w.layers.invoice, w.layers.labor, w.layers.subcontract, w.total].join(','));
    }
  } else {
    lines.push([q('Tháng'), q('Chi phí')].join(','));
    for (const m of monthlyCost(costRows, year)) lines.push([q(m.label), m.value].join(','));
  }

  lines.push('');
  lines.push([q('Loại chi phí'), q('Số tiền'), q('Tỷ trọng %')].join(','));
  for (const t of costByType(costRows)) lines.push([q(t.type), t.value, t.pct.toFixed(1)].join(','));

  lines.push('');
  lines.push([q('Công trình'), q('Tổng chi')].join(','));
  for (const p of topProjects(costRows)) lines.push([q(p.name), p.total].join(','));

  return lines.join('\r\n');
}
