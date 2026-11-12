// Bảng nháp của Sổ chấm công (hàm thuần, có test). Chép hành vi app cũ: `loadCCWeekForm`, `saveCCWeek`
// (kiểm tra tên trùng, tên phải có trong danh bạ, bỏ dòng trống), `copyCCWeek` / `pasteCCWeek` (chỉ chép tên, lương, ngày công).
import type { SheetRowInput } from '@/lib/calc';
import { findByName } from '@/features/expenses/logic';
import type { SaveLine, TsAdvance, TsLine, TsWeek, TsWorker } from './api';

export type DraftRow = {
  key: string;
  name: string;
  role: string | null;
  days: number[];
  wage: number;
  allowance: number;
  retail: number;
  note: string;
  deduction: number;
};

let seq = 0;
export const newKey = () => `r${++seq}`;

export function blankRow(): DraftRow {
  return { key: newKey(), name: '', role: null, days: [0, 0, 0, 0, 0, 0, 0], wage: 0, allowance: 0, retail: 0, note: '', deduction: 0 };
}

export const toCalcRow = (r: DraftRow): SheetRowInput => ({ day_units: r.days, daily_wage: r.wage, allowance: r.allowance, retail_purchase: r.retail, deduction: r.deduction });

/**
 * Dòng nháp của một tuần đã lưu. Trừ nợ = "tru" đời cũ còn nằm trong dòng + dòng "Trả" do tuần này sinh ra
 * (lưu lại thì gộp hết thành dòng "Trả" trong sổ Tạm ứng lương).
 */
export function rowsFromWeek(week: TsWeek | null, lines: readonly TsLine[], advances: readonly TsAdvance[], workerName: (id: string) => string): DraftRow[] {
  if (!week) return [];
  const ded = new Map<string, number>();
  for (const a of advances) if (a.source_week_id === week.id && a.direction === 'repay') ded.set(a.worker_id, (ded.get(a.worker_id) ?? 0) + a.amount);
  return lines
    .filter((l) => l.week_id === week.id)
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      key: newKey(), name: workerName(l.worker_id), role: l.role, days: [...l.day_units, 0, 0, 0, 0, 0, 0, 0].slice(0, 7),
      wage: l.daily_wage, allowance: l.allowance, retail: l.retail_purchase, note: l.note ?? '', deduction: (l.debt_deduction || 0) + (ded.get(l.worker_id) ?? 0),
    }));
}

const isEmpty = (r: DraftRow) => !r.name.trim() && !r.days.some((v) => v > 0) && !r.wage && !r.allowance && !r.retail && !r.deduction && !r.note.trim();

export type CheckResult = { ok: true; lines: SaveLine[] } | { ok: false; message: string; badKeys: string[] };

/** `saveCCWeek`: bỏ dòng trống; tên phải có trong danh bạ công nhân; không trùng tên; ít nhất 1 công nhân */
export function checkSheet(rows: readonly DraftRow[], workers: readonly TsWorker[]): CheckResult {
  const used = rows.filter((r) => !isEmpty(r));
  const noName = used.filter((r) => !r.name.trim());
  if (noName.length) return { ok: false, message: 'Có dòng đã chấm công nhưng chưa có tên công nhân.', badKeys: noName.map((r) => r.key) };
  const unknown = used.filter((r) => !findByName(r.name, workers));
  if (unknown.length) return { ok: false, message: `"${unknown[0]!.name.trim()}" không có trong danh bạ công nhân — chọn từ gợi ý hoặc bấm "+ Tạo mới".`, badKeys: unknown.map((r) => r.key) };
  const seen = new Map<string, string>();
  const dup: string[] = [];
  for (const r of used) {
    const id = findByName(r.name, workers)!.id;
    if (seen.has(id)) dup.push(r.key, seen.get(id)!); else seen.set(id, r.key);
  }
  if (dup.length) return { ok: false, message: 'Còn tên trùng nhau! Sửa trước khi lưu.', badKeys: dup };
  if (!used.length) return { ok: false, message: 'Chưa có công nhân nào!', badKeys: [] };
  return {
    ok: true,
    lines: used.map((r) => {
      const w = findByName(r.name, workers)!;
      return {
        worker_id: w.id, role: r.role ?? w.role ?? null, day_units: r.days.map((v) => Number(v) || 0), daily_wage: r.wage, allowance: r.allowance,
        retail_purchase: r.retail, note: r.note.trim(), debt_deduction: r.deduction,
      };
    }),
  };
}

/** `copyCCWeek`: chỉ chép tên, vai trò, lương, ngày công — phụ cấp / HĐ lẻ / trừ nợ / nội dung là phát sinh theo tuần */
export function copyRows(rows: readonly DraftRow[]): DraftRow[] {
  return rows
    .filter((r) => r.name.trim() || r.wage > 0 || r.days.some((v) => v > 0))
    .map((r) => ({ ...blankRow(), name: r.name, role: r.role, wage: r.wage, days: [...r.days] }));
}

/** `pasteCCWeek`: thay cả bảng bằng bản đã chép (khóa dòng mới) */
export function pasteRows(clip: readonly DraftRow[]): DraftRow[] {
  return clip.map((r) => ({ ...r, key: newKey(), days: [...r.days] }));
}

/** Hai bảng nháp có giống nhau không (để biết còn thay đổi chưa lưu) */
export function sameRows(a: readonly DraftRow[], b: readonly DraftRow[]): boolean {
  const strip = (rs: readonly DraftRow[]) => JSON.stringify(rs.filter((r) => !isEmpty(r)).map(({ key: _k, ...rest }) => ({ ...rest, name: rest.name.trim(), note: rest.note.trim() })));
  return strip(a) === strip(b);
}
