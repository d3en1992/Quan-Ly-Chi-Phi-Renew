// GĐ6 — Chấm Công: Sổ chấm công (thêm thợ, chấm ngày, Trừ nợ, Lưu tuần), cột Trừ nợ thành dòng "Trả" ở Tạm ứng lương,
// Tổng lương tuần, phiếu lương, 3 khổ màn hình. Chạy trên Supabase trong máy; dọn dữ liệu test sau khi xong.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { localAdminClient } from '../scripts/local-supabase.mjs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD06';
mkdirSync(SHOTS, { recursive: true });
const admin = localAdminClient();
const COMPANY = '00000000-0000-0000-0000-000000000001';
const WORKER = `E2E CN ${Date.now() % 100_000}`;
const WEEK = '2030-01-06'; // Chủ nhật, xa hiện tại để không đụng dữ liệu thật
let projectId = '';
let projectName = '';

async function cleanup() {
  const { data: ws } = await admin.from('workers').select('id').like('name', 'E2E CN %');
  const ids = (ws ?? []).map((w: { id: string }) => w.id);
  const { data: weeks } = await admin.from('timesheet_weeks').select('id').gte('week_start', '2030-01-01');
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
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const money = async (page: Page, testId: string) => Number((await page.getByTestId(testId).first().innerText()).replace(/\D/g, ''));

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await cleanup();
  const { data, error } = await admin.from('projects').select('id,name').is('deleted_at', null).eq('is_company_overhead', false).neq('status', 'closed').order('name').limit(1);
  expect(error).toBeNull();
  projectId = data![0]!.id; projectName = data![0]!.name;
  const { error: we } = await admin.from('workers').insert({ company_id: COMPANY, name: WORKER, role: 'T' });
  expect(we).toBeNull();
});
test.afterAll(cleanup);

for (const size of [{ name: '1440', width: 1440, height: 900 }, { name: '800', width: 800, height: 1000 }, { name: '390', width: 390, height: 844 }]) {
  test(`Chấm Công ở ${size.name}px: 3 tab mở được, không lỗi, không kéo ngang`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width: size.width, height: size.height });
    await login(page, 'e2e.kt');
    await page.goto('/cham-cong');
    await expect(page.getByTestId('cc-week')).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/so-cham-cong-${size.name}.png`, fullPage: true });
    await page.getByRole('tab', { name: 'TỔNG LƯƠNG & LỊCH SỬ' }).click();
    await expect(page.getByText('Lịch sử chấm công')).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/tong-luong-${size.name}.png`, fullPage: true });
    await page.getByRole('tab', { name: 'TẠM ỨNG LƯƠNG' }).click();
    await expect(page.getByText('Tổng nợ hiện tại').first()).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/tam-ung-luong-${size.name}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('Sổ chấm công: thêm thợ, chấm ½ công, Trừ nợ → Lưu tuần → dòng "Trả" ở Tạm ứng lương, Tổng lương tuần, phiếu lương', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.kt');
  await page.goto('/cham-cong');
  await page.getByLabel('Chọn ngày trong tuần').fill('2030-01-09');
  await expect(page.getByTestId('cc-week')).toHaveText('CN 06/01 – T7 12/01/2030');
  await page.getByLabel('Công trình').first().selectOption(projectId);

  // Kế toán ghi trước 1 phiếu tạm ứng 1.000.000 để có nợ
  await page.getByRole('tab', { name: 'TẠM ỨNG LƯƠNG' }).click();
  await page.getByTestId('adv-add').click();
  await page.getByLabel('Ngày giao dịch').fill('2030-01-02');
  await page.getByRole('combobox', { name: 'Công nhân' }).fill(WORKER);
  await page.keyboard.press('Enter');
  await page.getByLabel('Số tiền').fill('1000000');
  await page.getByTestId('adv-save').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('row', { name: new RegExp(WORKER) })).toContainText('1.000.000');

  await page.getByRole('tab', { name: 'SỔ CHẤM CÔNG' }).click();
  await expect(page.getByTestId('cc-week')).toHaveText('CN 06/01 – T7 12/01/2030');
  await page.getByTestId('cc-add').click();
  await page.getByRole('combobox', { name: 'Tên công nhân dòng 1' }).fill(WORKER.toLowerCase());
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Tên công nhân dòng 1' })).toHaveValue(WORKER);
  for (const d of ['T2', 'T3', 'T4', 'T5', 'T6']) await page.getByRole('button', { name: `${d} dòng 1` }).click();
  await page.getByRole('button', { name: 'T7 dòng 1' }).click();
  await page.getByRole('button', { name: 'T7 dòng 1' }).click(); // 1 → ½
  await expect(page.getByRole('button', { name: 'T7 dòng 1' })).toHaveText('½');
  await page.getByLabel('Lương/ngày dòng 1').fill('500000');
  await page.getByLabel('Phụ cấp dòng 1').fill('50000');
  await page.getByLabel('Trừ nợ dòng 1').fill('300000');
  // 5,5 công × 500.000 + 50.000 − 300.000
  await expect(page.getByTestId('cc-foot-net')).toHaveText('2.500.000');
  await page.screenshot({ path: `${SHOTS}/so-cham-cong-dang-nhap.png`, fullPage: true });
  await page.getByTestId('cc-save').click();
  await expect(page.getByText(/Đã lưu CN 06\/01/)).toBeVisible();

  // Kho: 1 tuần, 1 dòng, 1 dòng Trả 300.000 (tính vào Thực lãnh, ngày thứ Bảy)
  const { data: wk } = await admin.from('timesheet_weeks').select('id').eq('project_id', projectId).eq('week_start', WEEK).is('deleted_at', null).single();
  const { data: ln } = await admin.from('timesheet_lines').select('day_units,daily_wage,allowance,debt_deduction').eq('week_id', wk!.id).is('deleted_at', null);
  expect(ln).toHaveLength(1);
  expect(ln![0]!.day_units.map(Number)).toEqual([0, 1, 1, 1, 1, 1, 0.5]);
  const { data: rp } = await admin.from('wage_advances').select('amount,direction,counts_in_net_pay,date').eq('source_week_id', wk!.id).is('deleted_at', null);
  expect(rp).toEqual([{ amount: 300000, direction: 'repay', counts_in_net_pay: true, date: '2030-01-12' }]);

  // Tạm ứng lương: nợ 1.000.000 − 300.000 = 700.000
  await page.getByRole('tab', { name: 'TẠM ỨNG LƯƠNG' }).click();
  await page.getByPlaceholder('Tìm công nhân…').fill(WORKER);
  await expect(page.getByRole('row', { name: new RegExp(WORKER) })).toContainText('700.000');
  await page.getByRole('row', { name: new RegExp(WORKER) }).click();
  await expect(page.getByText('Trừ nợ CC')).toBeVisible();
  await page.keyboard.press('Escape');

  // Tổng lương tuần: lọc tuần → Thực lãnh 2.500.000; phiếu lương
  await page.getByRole('tab', { name: 'TỔNG LƯƠNG & LỊCH SỬ' }).click();
  await page.getByLabel('Tuần').selectOption(WEEK);
  await page.getByPlaceholder('Tìm tên công nhân…').fill(WORKER);
  await expect(page.getByRole('row', { name: new RegExp(WORKER) })).toContainText('2.500.000');
  await page.getByRole('row', { name: new RegExp(WORKER) }).click();
  await page.getByRole('button', { name: 'Phiếu lương Zalo' }).click();
  const slip = await page.getByTestId('payslip-text').inputValue();
  expect(slip).toContain(`Người lao động: ${WORKER}`);
  expect(slip).toContain('5,5 công × 500.000 đ');
  expect(slip).toContain('Trừ trả nợ: −300.000 đ');
  expect(slip).toContain('THỰC LÃNH: 2.500.000 đ');
  expect(slip).toContain('Nợ còn lại: 700.000 đ');
  await page.screenshot({ path: `${SHOTS}/phieu-luong.png` });
  await page.keyboard.press('Escape');

  // Sửa Trừ nợ về 0 → dòng Trả bị xóa mềm, nợ về 1.000.000
  await page.getByRole('row', { name: new RegExp(`06/01–12/01/2030`) }).first().click();
  await expect(page.getByLabel('Trừ nợ dòng 1')).toHaveValue('300.000');
  await page.getByLabel('Trừ nợ dòng 1').fill('');
  await page.getByTestId('cc-save').click();
  await expect(page.getByText(/Đã lưu CN 06\/01/)).toBeVisible();
  await expect.poll(async () => (await admin.from('wage_advances').select('id').eq('source_week_id', wk!.id).is('deleted_at', null)).data?.length).toBe(0);
  expect(errors).toEqual([]);
});

test('Điện thoại: chạm ô ngày đổi 1 → ½ → 0', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'e2e.kt');
  await page.goto('/cham-cong');
  await page.getByLabel('Chọn ngày trong tuần').fill('2030-01-09');
  await page.getByLabel('Công trình').first().selectOption(projectId);
  const cell = page.getByRole('button', { name: `T2 ${WORKER}` });
  await expect(cell).toContainText('1');
  await cell.click();
  await expect(cell).toContainText('½');
  await cell.click();
  await expect(cell).toContainText('·');
  await expect(page.getByTestId('cc-net-total')).toHaveText('2.300.000'); // 4,5 công × 500.000 + 50.000
  await page.screenshot({ path: `${SHOTS}/dien-thoai-cham-cong.png`, fullPage: true });
  expect(await noSideScroll(page)).toBe(true);
  expect(errors).toEqual([]);
  void projectName;
});
