// Nút AI → PHIẾU CHẤM CÔNG: biến kết quả AI đọc thành bảng nháp của Sổ chấm công (DraftRow). Hàm thuần, có test.
// Tiền mua lẻ cộng bằng calc.sumAmounts, so số tổng ghi trên phiếu bằng calc.printedTotalGap — không tự cộng ở đây.
import type { TimesheetScan } from '@shared/scan';
import { printedTotalGap, shiftWeek, sumAmounts, weekStartOf } from '@/lib/calc';
import { formatMoney } from '@/lib/format';
import { findByName } from '@/features/expenses/logic';
import { blankRow, newKey, type DraftRow } from '@/features/timesheets/sheet-model';

type WorkerLite = { id: string; name: string; role: string | null; archived?: boolean };
type WeekLite = { id: string; project_id: string; week_start: string };
type LineLite = { week_id: string; worker_id: string; daily_wage: number };

export type PurchaseDraft = { key: string; name: string; amount: number };

/**
 * Tuần mặc định khi phiếu không ghi ngày: phiếu thường nộp cuối tuần (T7) hoặc đầu tuần sau.
 * Hôm nay là CN / T2 / T3 → tuần trước; từ T4 trở đi → tuần này.
 */
export function defaultWeekStart(today: string): string {
  const cur = weekStartOf(today);
  const dow = Math.round((Date.parse(today) - Date.parse(cur)) / 86_400_000);
  return dow <= 2 ? shiftWeek(cur, -1) : cur;
}

/** Lương/ngày gần nhất của công nhân (tuần mới nhất; cùng tuần thì ưu tiên đúng công trình). Chưa chấm bao giờ → 0 */
export function lastWage(workerId: string, projectId: string, weeks: readonly WeekLite[], lines: readonly LineLite[]): number {
  const weekById = new Map(weeks.map((w) => [w.id, w]));
  let best: { week: string; same: boolean; wage: number } | null = null;
  for (const l of lines) {
    if (l.worker_id !== workerId || !(l.daily_wage > 0)) continue;
    const w = weekById.get(l.week_id);
    if (!w) continue;
    const same = w.project_id === projectId;
    if (!best || w.week_start > best.week || (w.week_start === best.week && same && !best.same)) best = { week: w.week_start, same, wage: l.daily_wage };
  }
  return best?.wage ?? 0;
}

export type ScanTimesheetDraft = {
  weekStart: string;
  rows: DraftRow[];
  /** `${key dòng}:name` · `${key}:${0..6}` (ô ngày) · `${key}:wage` cần xem lại */
  unsure: string[];
  purchases: PurchaseDraft[];
};

/** Kết quả AI → bảng nháp: tên khớp danh bạ (không khớp thì giữ tên viết trên phiếu, tô vàng), vai trò + lương/ngày lấy theo lần chấm gần nhất */
export function timesheetFromScan(
  scan: TimesheetScan,
  data: { workers: readonly WorkerLite[]; weeks: readonly WeekLite[]; lines: readonly LineLite[] },
  projectId: string,
  today: string,
): ScanTimesheetDraft {
  const live = data.workers.filter((w) => !w.archived);
  const unsure: string[] = [];
  const rows = scan.rows.map((r) => {
    const w = findByName(r.worker_match, live) ?? findByName(r.name, live);
    const row: DraftRow = {
      ...blankRow(),
      name: w?.name ?? r.name.toUpperCase(),
      role: w?.role ?? (r.role || null),
      days: [0, 1, 2, 3, 4, 5, 6].map((i) => r.days[i] ?? 0),
      wage: w ? lastWage(w.id, projectId, data.weeks, data.lines) : 0,
    };
    if (!w || r.low_confidence.includes('name')) unsure.push(`${row.key}:name`);
    for (const f of r.low_confidence) if (/^[0-6]$/.test(f)) unsure.push(`${row.key}:${f}`);
    // Số công lẻ (tăng ca) dễ đọc nhầm → luôn nhờ xem lại
    row.days.forEach((v, i) => { if (v > 0 && v !== 1 && v !== 0.5) unsure.push(`${row.key}:${i}`); });
    if (!row.wage) unsure.push(`${row.key}:wage`);
    return row;
  });
  return {
    weekStart: scan.week_start ? weekStartOf(scan.week_start) : defaultWeekStart(today),
    rows, unsure: [...new Set(unsure)],
    purchases: scan.purchases.map((p) => ({ key: newKey(), name: p.name, amount: p.amount })),
  };
}

export const purchaseSum = (purchases: readonly PurchaseDraft[]): number => sumAmounts(purchases.map((p) => p.amount));

export type PurchaseCheck = { status: 'none' } | { status: 'match'; written: number } | { status: 'diff'; written: number; gap: number };

/** So tổng các khoản mua lẻ với số tổng người ta tự cộng trên phiếu */
export function checkPurchaseTotal(purchases: readonly PurchaseDraft[], writtenTotal: number): PurchaseCheck {
  const gap = printedTotalGap(writtenTotal, purchaseSum(purchases));
  if (gap === null) return { status: 'none' };
  return gap === 0 ? { status: 'match', written: writtenTotal } : { status: 'diff', written: writtenTotal, gap };
}

/** Nội dung ghi kèm ô HĐ mua lẻ: "Nước uống 180.000; Đinh thép 45.000" */
export function purchaseNote(purchases: readonly PurchaseDraft[]): string {
  return purchases.filter((p) => p.amount > 0).map((p) => `${p.name.trim() || 'Mua lẻ'} ${formatMoney(p.amount)}`).join('; ');
}

/**
 * Cộng TẤT CẢ khoản mua lẻ vào ô HĐ mua lẻ của người ĐẦU PHIẾU (cai) — dòng đầu tiên có tên; nội dung = danh sách khoản mua
 * (+ ghi chú khác trên phiếu). Không có khoản mua và không có ghi chú thì giữ nguyên.
 */
export function withPurchases(rows: readonly DraftRow[], purchases: readonly PurchaseDraft[], extraNote = ''): DraftRow[] {
  const total = purchaseSum(purchases);
  const note = [purchaseNote(purchases), extraNote.trim()].filter(Boolean).join(' · ');
  const first = rows.findIndex((r) => r.name.trim());
  if (first < 0 || (!total && !note)) return [...rows];
  return rows.map((r, i) => (i === first ? { ...r, retail: total, note } : r));
}
