import { describe, expect, it } from 'vitest';
import type { TsAdvance, TsLine, TsWeek, TsWorker } from './api';
import { blankRow, checkSheet, copyRows, pasteRows, rowsFromWeek, sameRows } from './sheet-model';

const workers: TsWorker[] = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'LONG', role: 'C', archived: false },
  { id: '22222222-2222-4222-8222-222222222222', name: 'CƯỜNG', role: 'T', archived: false },
];
const row = (p: Partial<ReturnType<typeof blankRow>>) => ({ ...blankRow(), ...p });

describe('sổ chấm công — bảng nháp', () => {
  it('nạp tuần đã lưu: Trừ nợ = tru đời cũ + dòng Trả do tuần sinh ra', () => {
    const week = { id: 'w', project_id: 'p', week_start: '2026-10-25', created_by: null, updated_at: '' } as TsWeek;
    const lines = [
      { id: 'b', week_id: 'w', worker_id: workers[1]!.id, position: 1, role: 'T', day_units: [0, 1, 1, 1, 1, 1, 1], daily_wage: 520_000, allowance: 0, retail_purchase: 85_000, debt_deduction: 100_000, legacy_loan: 0, note: null },
      { id: 'a', week_id: 'w', worker_id: workers[0]!.id, position: 0, role: 'C', day_units: [0, 1, 1, 1, 1, 1, 1], daily_wage: 600_000, allowance: 60_000, retail_purchase: 0, debt_deduction: 0, legacy_loan: 0, note: 'x' },
    ] as TsLine[];
    const adv = [{ id: 'r', worker_id: workers[1]!.id, source_week_id: 'w', direction: 'repay', amount: 200_000 }] as TsAdvance[];
    const rs = rowsFromWeek(week, lines, adv, (id) => workers.find((w) => w.id === id)!.name);
    expect(rs.map((r) => r.name)).toEqual(['LONG', 'CƯỜNG']);
    expect(rs[1]!.deduction).toBe(300_000);
    expect(rs[0]!.note).toBe('x');
  });

  it('kiểm tra trước khi lưu: tên phải có trong danh bạ, không trùng, bỏ dòng trống', () => {
    expect(checkSheet([blankRow()], workers)).toMatchObject({ ok: false, message: 'Chưa có công nhân nào!' });
    expect(checkSheet([row({ name: 'ABC', days: [0, 1, 0, 0, 0, 0, 0] })], workers)).toMatchObject({ ok: false });
    expect(checkSheet([row({ days: [0, 1, 0, 0, 0, 0, 0] })], workers)).toMatchObject({ ok: false });
    expect(checkSheet([row({ name: 'long' }), row({ name: 'LONG' })], workers)).toMatchObject({ ok: false, message: 'Còn tên trùng nhau! Sửa trước khi lưu.' });
    const ok = checkSheet([row({ name: 'cuong', days: [0, 1, 1, 0.5, 0, 0, 0], wage: 500_000, deduction: 200_000 }), blankRow()], workers);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.lines).toEqual([{ worker_id: workers[1]!.id, role: 'T', day_units: [0, 1, 1, 0.5, 0, 0, 0], daily_wage: 500_000, allowance: 0, retail_purchase: 0, note: '', debt_deduction: 200_000 }]);
  });

  it('Copy / Dán tuần: chỉ chép tên, vai trò, lương, ngày công', () => {
    const src = [row({ name: 'LONG', role: 'C', wage: 600_000, days: [0, 1, 1, 1, 1, 1, 1], allowance: 60_000, retail: 5, note: 'n', deduction: 9 }), blankRow()];
    const c = copyRows(src);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ name: 'LONG', role: 'C', wage: 600_000, allowance: 0, retail: 0, note: '', deduction: 0 });
    const p = pasteRows(c);
    expect(p[0]!.key).not.toBe(c[0]!.key);
    expect(sameRows(p, c)).toBe(true);
    expect(sameRows(p, [...c, blankRow()])).toBe(true);
    expect(sameRows(p, [])).toBe(false);
  });
});
