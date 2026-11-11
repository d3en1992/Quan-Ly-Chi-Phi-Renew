// DOANH THU / GIÁ TRỊ HỢP ĐỒNG. Chép từ `calcTongDoanhThu`, `qtHdGocCuaCT`, `qtTinhDelta`,
// `qtTongQuyetToan`, `qtDaThuCuaCT` (quyettoan.core.js) và `_dtCalcRevenue` (doanhthu.core.js).
import type { CalcMainContract, CalcReceipt, CalcSettlement } from './types';
import { inYearLoose, type YearFilter } from './year';

/**
 * Giá trị hợp đồng sau quyết toán (`_dtCalcRevenue`), làm mẫu số cho % đã thu / còn phải thu:
 * - đã có quyết toán → HĐ gốc + quyết toán;
 * - chưa có → max(HĐ gốc, đã thu) + quyết toán.
 */
export function contractValue(baseContract: number, received: number, settlementDelta: number, hasSettlement: boolean): number {
  if (hasSettlement) return (baseContract || 0) + (settlementDelta || 0);
  return Math.max(baseContract || 0, received || 0) + (settlementDelta || 0);
}

/** HĐ gốc = giá trị + giá trị phụ + phát sinh đời cũ */
export function mainContractTotal(c: Pick<CalcMainContract, 'value' | 'extra_value' | 'legacy_variation'>): number {
  return (c.value || 0) + (c.extra_value || 0) + (c.legacy_variation || 0);
}

const createdMs = (s: string | null | undefined) => (s ? Date.parse(s) || 0 : 0);

/** Sắp theo ngày tăng dần, cùng ngày thì bản tạo trước đứng trước (`_qtSortAsc`) */
export function sortByDateThenCreated<T extends { date: string | null; created_at?: string | null }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = a.date ?? '', db = b.date ?? '';
    return da < db ? -1 : da > db ? 1 : createdMs(a.created_at) - createdMs(b.created_at);
  });
}

/**
 * Mức thay đổi (delta) của từng bản quyết toán của MỘT công trình, tính trên toàn vòng đời (`qtTinhDelta`):
 * tăng → +số tiền; giảm → −số tiền; thay thế → số tiền − giá trị HĐ ngay trước đó.
 */
export function settlementDeltas(baseContractAllTime: number, settlements: readonly CalcSettlement[]) {
  let running = baseContractAllTime;
  const deltas = new Map<string, number>();
  const sorted = sortByDateThenCreated(settlements);
  for (const s of sorted) {
    const v = Math.abs(s.amount || 0);
    const d = s.kind === 'replace' ? v - running : s.kind === 'decrease' ? -v : v;
    running += d;
    deltas.set(s.id, d);
  }
  return { sorted, deltas, finalValue: running };
}

export type ProjectRevenue = {
  /** X · HĐ gốc trong phạm vi năm */
  baseContract: number;
  /** Tổng đã thu (= doanh thu, tiền thực thu) */
  received: number;
  /** Y · Σ quyết toán (đã quy ra ±) trong phạm vi năm */
  settlement: number;
  /** Đã có bản quyết toán nào chưa (xét toàn vòng đời) */
  hasSettlement: boolean;
  /** Giá trị HĐ sau quyết toán */
  contractValue: number;
  /** Còn phải thu = giá trị HĐ − đã thu */
  receivable: number;
};

/** Doanh thu của 1 công trình (`calcTongDoanhThu`). Các danh sách đưa vào ĐÃ lọc theo công trình. */
export function projectRevenue(
  contracts: readonly CalcMainContract[],
  receipts: readonly CalcReceipt[],
  settlements: readonly CalcSettlement[],
  years: YearFilter,
): ProjectRevenue {
  const baseAllTime = contracts.reduce((s, c) => s + mainContractTotal(c), 0);
  const baseContract = contracts.reduce((s, c) => s + (inYearLoose(c.date, years) ? mainContractTotal(c) : 0), 0);
  const received = receipts.reduce((s, r) => s + (inYearLoose(r.date, years) ? r.amount || 0 : 0), 0);
  const { sorted, deltas } = settlementDeltas(baseAllTime, settlements);
  let settlement = 0;
  for (const s of sorted) if (inYearLoose(s.date, years)) settlement += deltas.get(s.id) ?? 0;
  const hasSettlement = sorted.length > 0;
  const value = contractValue(baseContract, received, settlement, hasSettlement);
  return { baseContract, received, settlement, hasSettlement, contractValue: value, receivable: value - received };
}
