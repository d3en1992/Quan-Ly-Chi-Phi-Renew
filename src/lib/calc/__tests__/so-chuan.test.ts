// SO SỐ VỚI APP CŨ — cổng bắt buộc của GĐ3: lệch 0 đồng.
// - `du-lieu/snapshot.json` : bản sao lưu app cũ (đã chuyển sang kho mới bằng `npm run migrate:legacy`).
// - `du-lieu/so-chuan.json` : số do CHÍNH code app cũ tính (`scripts/legacy/xuat-so-chuan.js` dán vào Console,
//   hoặc `npm run so-chuan` chạy code app cũ trong Node trên đúng snapshot đó).
// Hai file không nằm trong git (dữ liệu thật). Thiếu file → bỏ qua, ghi "chờ so số".
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformSnapshot } from '../../../../scripts/legacy/transform.ts';
import { allocateOverhead, companyOverheadCost } from '../overhead';
import { buildProfitIndex, profitContext, projectProfit } from '../profit';
import type { CalcData } from '../types';
import { ALL_YEARS, inYear, type YearFilter } from '../year';

const DIR = join(process.cwd(), 'du-lieu');
const SNAP = join(DIR, 'snapshot.json');
const GOLD = join(DIR, 'so-chuan.json');
const ready = existsSync(SNAP) && existsSync(GOLD);

type GoldRow = {
  id: string; ten: string; A: number; A_hoaDon: number; A_ungNcc: number; B_ungThauPhu: number; C_chiPhiChung: number;
  tongDaChi: number; tongDaThu: number; loiNhuan: number; X_hdGoc: number; Y_quyetToan: number; giaTriHD: number; conPhaiThu: number;
};
type GoldYear = {
  chiPhiChungCongTy: number;
  phanBo: { id: string; ten: string; trongSo: number; tiLe: number; phanBo: number }[];
  tongHoaDonTheoNguon: Record<string, number>;
  soHoaDon: number;
  congTrinh: GoldRow[];
  tongCong: Record<string, number>;
};
type Gold = { taoLuc: string; nam: Record<string, GoldYear> };

function load() {
  const gold = JSON.parse(readFileSync(GOLD, 'utf8')) as Gold;
  const snapshot = JSON.parse(readFileSync(SNAP, 'utf8')) as Record<string, unknown>;
  const t = transformSnapshot(snapshot, { companyId: '00000000-0000-0000-0000-000000000001', userIdByLegacyName: {} }).tables as unknown as Record<string, Record<string, unknown>[]>;
  const live = <T,>(name: string) => (t[name] ?? []).filter((r) => !r.deleted_at) as unknown as T[];
  const data: CalcData = {
    projects: live('projects'), expenses: live('expenses'), timesheetWeeks: live('timesheet_weeks'), timesheetLines: live('timesheet_lines'),
    payments: live('payments'), paymentAllocations: live('payment_allocations'), receipts: live('receipts'),
    mainContracts: live('main_contracts'), settlements: live('settlements'),
  };
  return { gold, data, now: Date.parse(gold.taoLuc) };
}

const FIELDS: [keyof GoldRow, string][] = [
  ['A', 'A'], ['A_hoaDon', 'A phần hóa đơn'], ['A_ungNcc', 'A phần trả NCC'], ['B_ungThauPhu', 'B'], ['C_chiPhiChung', 'C'],
  ['tongDaChi', 'Tổng đã chi'], ['tongDaThu', 'Tổng đã thu'], ['loiNhuan', 'Lợi nhuận'], ['X_hdGoc', 'HĐ gốc'], ['Y_quyetToan', 'Quyết toán'],
  ['giaTriHD', 'Giá trị HĐ'], ['conPhaiThu', 'Còn phải thu'],
];

describe.skipIf(!ready)('So số với app cũ (so-chuan.json) — lệch 0 đồng', () => {
  const { gold, data, now } = ready ? load() : ({} as ReturnType<typeof load>);
  const index = ready ? buildProfitIndex(data) : (null as never);
  const yearKeys = ready ? Object.keys(gold.nam) : [];

  it('có đủ mốc năm và công trình', () => {
    expect(yearKeys).toContain('TAT_CA');
    expect(gold.nam.TAT_CA!.congTrinh.length).toBe(index.realProjects.length);
  });

  for (const key of yearKeys) {
    const years: YearFilter = key === 'TAT_CA' ? ALL_YEARS : [Number(key)];
    const label = key === 'TAT_CA' ? 'Tất cả năm' : `Năm ${key}`;

    it(`${label}: từng công trình khớp A, B, C, đã chi, đã thu, lợi nhuận, giá trị HĐ, còn phải thu`, () => {
      const g = gold.nam[key]!;
      const ctx = profitContext(index, years, now);
      const diffs: string[] = [];
      const byId = new Map(index.realProjects.map((p) => [p.id, p]));
      for (const row of g.congTrinh) {
        const p = byId.get(row.id.toLowerCase());
        if (!p) { diffs.push(`${row.ten}: không thấy công trình trong kho mới`); continue; }
        const r = projectProfit(p, ctx);
        const mine: Record<keyof GoldRow, number | string> = {
          id: p.id, ten: p.name, A: r.A, A_hoaDon: r.paidInvoices, A_ungNcc: r.supplierPaid, B_ungThauPhu: r.B, C_chiPhiChung: r.C,
          tongDaChi: r.spent, tongDaThu: r.received, loiNhuan: r.profit, X_hdGoc: r.revenue.baseContract, Y_quyetToan: r.revenue.settlement,
          giaTriHD: r.revenue.contractValue, conPhaiThu: r.revenue.receivable,
        };
        for (const [f, name] of FIELDS) {
          const a = Math.round(Number(mine[f])), b = Number(row[f]);
          if (a !== b) diffs.push(`${row.ten} · ${name}: mới ${a.toLocaleString('vi-VN')} ≠ cũ ${b.toLocaleString('vi-VN')} (lệch ${(a - b).toLocaleString('vi-VN')})`);
        }
      }
      expect(diffs, `${label}: ${diffs.length} ô lệch\n` + diffs.slice(0, 40).join('\n')).toEqual([]);
    });

    it(`${label}: chi phí chung CÔNG TY và bảng phân bổ khớp`, () => {
      const g = gold.nam[key]!;
      const total = companyOverheadCost(index.costs, index.companyIds, years);
      expect(Math.round(total)).toBe(g.chiPhiChungCongTy);
      const mine = new Map(allocateOverhead(index.projects, total, years, now).map((o) => [o.projectId, o]));
      expect(mine.size).toBe(g.phanBo.length);
      for (const a of g.phanBo) {
        const o = mine.get(a.id.toLowerCase());
        expect(o, `thiếu phân bổ cho ${a.ten}`).toBeDefined();
        expect(Math.round(o!.weight), `trọng số ${a.ten}`).toBe(a.trongSo);
        expect(Math.round(o!.allocated), `phân bổ ${a.ten}`).toBe(a.phanBo);
      }
    });

    it(`${label}: số hóa đơn và tổng hóa đơn theo nguồn khớp`, () => {
      const g = gold.nam[key]!;
      const inScope = index.costs.filter((c) => inYear(c.date, years));
      expect(inScope.length).toBe(g.soHoaDon);
      const bySource: Record<string, number> = {};
      for (const c of inScope) {
        const k = c.source === 'wage' || c.source === 'retail' ? 'cc' : c.source;
        bySource[k] = (bySource[k] ?? 0) + Math.round(c.amount);
      }
      expect(bySource).toEqual(g.tongHoaDonTheoNguon);
    });
  }
});

describe.skipIf(ready)('So số với app cũ — CHỜ SO SỐ', () => {
  it.skip('chưa có du-lieu/snapshot.json + du-lieu/so-chuan.json (chạy: npm run so-chuan)', () => {});
});
