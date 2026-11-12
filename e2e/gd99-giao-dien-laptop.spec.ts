// GĐ99 — Giao diện laptop của anh Tình (1536 × 860): menu trái hẹp, sổ chấm công không cuộn ngang khi ẩn 3 cột,
// ô ngày công gõ số lẻ (1.3 → 1,3), không còn cột Trừ nợ, bảng Tổng lương tuần rộng hơn Lịch sử.
// Chạy trên Supabase trong máy; dữ liệu test tên bắt đầu "E2E GD99", dọn sau khi chạy.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { localAdminClient } from '../scripts/local-supabase.mjs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD99';
mkdirSync(SHOTS, { recursive: true });
const admin = localAdminClient();
const COMPANY = '00000000-0000-0000-0000-000000000001';
const WORKER = 'E2E GD99 CN';
const WEEK = '2030-02-03'; // Chủ nhật, xa hiện tại
let projectId = '';

async function cleanup() {
  const { data: ws } = await admin.from('workers').select('id').like('name', 'E2E GD99%');
  const ids = (ws ?? []).map((w: { id: string }) => w.id);
  const { data: weeks } = await admin.from('timesheet_weeks').select('id').eq('week_start', WEEK);
  const weekIds = (weeks ?? []).map((w: { id: string }) => w.id);
  if (ids.length) await admin.from('wage_advances').delete().in('worker_id', ids);
  if (weekIds.length) {
    await admin.from('wage_advances').delete().in('source_week_id', weekIds);
    await admin.from('timesheet_lines').delete().in('week_id', weekIds);
    await admin.from('timesheet_weeks').delete().in('id', weekIds);
  }
  if (ids.length) {
    await admin.from('timesheet_lines').delete().in('worker_id', ids);
    await admin.from('workers').delete().in('id', ids);
  }
}

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}
async function login(page: Page, username: string) {
  await page.addInitScript(() => localStorage.setItem('qlcp-years', 'all'));
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
}
const tableFits = (page: Page) => page.getByTestId('cc-table').evaluate((t) => {
  const box = t.closest('.tbl')!;
  return box.scrollWidth <= box.clientWidth + 1;
});

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await cleanup();
  const { data, error } = await admin.from('projects').select('id').is('deleted_at', null).eq('is_company_overhead', false).neq('status', 'closed').order('name').limit(1);
  expect(error).toBeNull();
  projectId = data![0]!.id;
  const { error: we } = await admin.from('workers').insert({ company_id: COMPANY, name: WORKER, role: 'T' });
  expect(we).toBeNull();
});
test.afterAll(cleanup);

test('1536px: menu trái ≈ 200px; sổ chấm công gõ 1.3, không cuộn ngang, bật / tắt 3 cột, không có Trừ nợ; Tổng lương rộng hơn Lịch sử', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1536, height: 860 });
  await login(page, 'e2e.admin');

  const aside = await page.getByRole('complementary', { name: 'Menu chính' }).boundingBox();
  expect(aside!.width).toBeGreaterThanOrEqual(195);
  expect(aside!.width).toBeLessThanOrEqual(205);

  await page.goto('/cham-cong');
  await page.getByLabel('Chọn ngày trong tuần').fill('2030-02-05');
  await expect(page.getByTestId('cc-week')).toHaveText('CN 03/02 – T7 09/02/2030');
  await page.getByLabel('Công trình').first().selectOption(projectId);
  await page.getByTestId('cc-add').click();
  await page.getByRole('combobox', { name: 'Tên công nhân dòng 1' }).fill(WORKER);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Tên công nhân dòng 1' })).toHaveValue(WORKER);
  await page.getByLabel('Lương/ngày dòng 1').fill('500000');

  // Gõ 1.3 vào T2, 1,5 vào T3, đúng "5" vào T4 = nửa công; số âm bị từ chối
  await page.getByRole('button', { name: 'T2 dòng 1' }).focus();
  await page.keyboard.type('1.3');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('1,5');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'T2 dòng 1' })).toHaveText('1,3');
  await expect(page.getByRole('button', { name: 'T3 dòng 1' })).toHaveText('1,5');
  await expect(page.getByRole('button', { name: 'T4 dòng 1' })).toHaveText('½');
  await page.getByRole('button', { name: 'T5 dòng 1' }).focus();
  await page.keyboard.type('-1');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Ô ngày công chỉ nhận số ≥ 0/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'T5 dòng 1' })).toHaveText('·');

  // TC = 1,3 + 1,5 + 0,5 = 3,3; Thực lãnh = 3,3 × 500.000
  const row = page.getByTestId('cc-table').locator('tbody tr').first();
  await expect(row.locator('td').nth(10)).toHaveText('3,3');
  await expect(page.getByTestId('cc-foot-net')).toHaveText('1.650.000');

  // Không cột Trừ nợ; 3 cột ẩn mặc định → không cuộn ngang
  const heads = await page.getByTestId('cc-table').locator('thead th').allInnerTexts();
  expect(heads.join('|')).not.toMatch(/Trừ nợ|Phụ cấp|HĐ mua lẻ|Nội dung/);
  expect(heads.join('|')).toMatch(/Tên CN.*Thực lãnh/);
  expect(await tableFits(page)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/so-cham-cong-1536-an-3-cot.png` });

  await page.getByTestId('cc-extras').click();
  await expect(page.getByLabel('Phụ cấp dòng 1')).toBeVisible();
  await expect(page.getByLabel('HĐ mua lẻ dòng 1')).toBeVisible();
  await expect(page.getByLabel('Nội dung dòng 1')).toBeVisible();
  await page.getByLabel('Phụ cấp dòng 1').fill('20000');
  await page.screenshot({ path: `${SHOTS}/so-cham-cong-1536-hien-3-cot.png` });
  await page.getByTestId('cc-extras').click();
  await expect(page.getByLabel('Phụ cấp dòng 1')).toHaveCount(0);
  await expect(page.getByTestId('cc-hidden-mark')).toHaveCount(1); // dòng có phụ cấp đang ẩn
  await expect(page.getByTestId('cc-foot-net')).toHaveText('1.670.000');

  await page.getByTestId('cc-save').click();
  await expect(page.getByText(/Đã lưu CN 03\/02/)).toBeVisible();
  const { data: wk } = await admin.from('timesheet_weeks').select('id').eq('project_id', projectId).eq('week_start', WEEK).is('deleted_at', null).single();
  const { data: ln } = await admin.from('timesheet_lines').select('day_units').eq('week_id', wk!.id).is('deleted_at', null);
  expect(ln![0]!.day_units.map(Number)).toEqual([0, 1.3, 1.5, 0.5, 0, 0, 0]);

  // Mở lại: vẫn 1,3
  await page.reload();
  await page.getByLabel('Chọn ngày trong tuần').fill('2030-02-05');
  await page.getByLabel('Công trình').first().selectOption(projectId);
  await expect(page.getByRole('button', { name: 'T2 dòng 1' })).toHaveText('1,3');
  await expect(page.getByTestId('cc-foot-net')).toHaveText('1.670.000');

  // Tổng lương & lịch sử: bảng Tổng lương rộng hơn Lịch sử, thấy trọn cột Thực lãnh không cuộn ngang
  await page.getByRole('tab', { name: 'TỔNG LƯƠNG & LỊCH SỬ' }).click();
  await page.getByLabel('Tuần').selectOption(WEEK);
  await expect(page.getByText('Lịch sử chấm công')).toBeVisible();
  const tlt = await page.getByTestId('tlt-table').evaluate((t) => { const b = t.closest('.tbl') ?? t.parentElement!; return { w: b.getBoundingClientRect().width, sw: b.scrollWidth, cw: b.clientWidth, fits: b.scrollWidth <= b.clientWidth + 1 }; });
  const hist = await page.getByTestId('cc-history').evaluate((t) => { const b = t.closest('.tbl') ?? t.parentElement!; return { w: b.getBoundingClientRect().width, sw: b.scrollWidth, cw: b.clientWidth, fits: b.scrollWidth <= b.clientWidth + 1 }; });
  expect(tlt.w).toBeGreaterThan(hist.w);
  expect(tlt.fits).toBe(true);
  expect(hist.fits).toBe(true);
  await expect(page.getByRole('row', { name: new RegExp(WORKER) })).toContainText('1.670.000');
  await page.screenshot({ path: `${SHOTS}/tong-luong-1536.png` });

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});
