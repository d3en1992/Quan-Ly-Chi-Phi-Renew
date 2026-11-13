// GĐ4 — Danh Mục & Sao Lưu: thêm / đổi tên / xóa, đổi tên lan ra mọi nơi, công ty, sao lưu → tải JSON → khôi phục.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD04';
mkdirSync(SHOTS, { recursive: true });

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
const SIZES = [{ name: '1440', width: 1440, height: 900 }, { name: '800', width: 800, height: 1000 }, { name: '390', width: 390, height: 844 }];

for (const size of SIZES) {
  test(`Danh Mục & Sao Lưu ở ${size.name}px: 2 tab, không lỗi, không kéo ngang`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width: size.width, height: size.height });
    await login(page, 'e2e.admin');
    await page.goto('/danh-muc');
    await expect(page.getByTestId('catalog-table')).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/danh-muc-${size.name}.png`, fullPage: true });
    await page.getByRole('tab', { name: 'CÔNG TY & SAO LƯU' }).click();
    await expect(page.getByRole('button', { name: 'Tải bản sao lưu JSON' })).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/sao-luu-${size.name}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('Thêm → đổi tên → xóa một loại chi phí', async ({ page }) => {
  await login(page, 'e2e.admin');
  await page.goto('/danh-muc');
  await expect(page.getByTestId('catalog-table')).toBeVisible();
  const label = `thử e2e ${Date.now() % 100000}`;
  const shown = label.split(' ').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  await page.getByLabel('Tên mới').fill(label);
  await page.getByRole('button', { name: 'Thêm', exact: true }).last().click();
  await expect(page.locator('tr', { hasText: shown })).toBeVisible();
  await page.locator('tr', { hasText: shown }).getByRole('button', { name: 'Đổi tên' }).click();
  await page.getByLabel('Tên mới').fill(`${label} 2`);
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.locator('tr', { hasText: `${shown} 2` })).toBeVisible();
  await page.getByLabel(`Xóa ${shown} 2`).click();
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(page.locator('tr', { hasText: `${shown} 2` })).toHaveCount(0);
});

test('Đổi tên một loại chi phí đang dùng → Thống Kê CP/HĐ hiện tên mới; xóa mục đang dùng bị chặn', async ({ page }) => {
  await login(page, 'e2e.admin');
  await page.goto('/danh-muc');
  await expect(page.getByTestId('catalog-table')).toBeVisible();
  const row = page.locator('[data-testid="catalog-table"] tbody tr', { hasText: 'khoản' }).first();
  const oldName = (await row.locator('td').first().innerText()).trim();
  const newName = `${oldName} Zz`;
  try {
    // xóa bị chặn
    await row.getByRole('button', { name: `Xóa ${oldName}` }).click();
    await expect(page.getByText('nên không xóa được')).toBeVisible();
    await page.getByRole('button', { name: 'Xóa', exact: true }).click();
    await expect(page.getByText(/đang dùng trong .* không xóa được/i)).toBeVisible();
    await page.getByText(/đang dùng trong .* không xóa được/i).waitFor();
    await row.getByRole('button', { name: 'Đổi tên' }).click();
    await page.getByLabel('Tên mới').fill(newName);
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByText('mọi nơi hiện tên mới')).toBeVisible();
    await page.goto('/thong-ke-cp-hd');
    await expect(page.getByTestId('expense-table')).toBeVisible();
    await page.getByLabel('Loại chi phí', { exact: true }).fill(newName);
    await expect(page.getByTestId('expense-table').locator('tbody tr').first()).toContainText(newName);
  } finally {
    await page.goto('/danh-muc');
    await page.locator('tr', { hasText: newName }).getByRole('button', { name: 'Đổi tên' }).click();
    await page.getByLabel('Tên mới').fill(oldName);
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByText('mọi nơi hiện tên mới')).toBeVisible();
  }
});

test('Thông tin công ty: Admin sửa được, Giám đốc chỉ xem', async ({ page, browser }) => {
  await login(page, 'e2e.admin');
  await page.goto('/danh-muc');
  await page.getByRole('tab', { name: 'CÔNG TY & SAO LƯU' }).click();
  const old = await page.getByLabel('Tên ngắn trên menu').inputValue();
  await page.getByLabel('Tên ngắn trên menu').fill(`${old} E2E`);
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu thông tin công ty')).toBeVisible();
  await expect(page.locator('aside').getByText(`${old} E2E`)).toBeVisible();
  await page.getByLabel('Tên ngắn trên menu').fill(old);
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu thông tin công ty').last()).toBeVisible();

  const gd = await (await browser.newContext({ locale: 'vi-VN' })).newPage();
  await login(gd, 'e2e.gd');
  await gd.goto('/danh-muc');
  await gd.getByRole('tab', { name: 'CÔNG TY & SAO LƯU' }).click();
  await expect(gd.getByLabel('Tên ngắn trên menu')).toBeDisabled();
  await expect(gd.getByRole('button', { name: 'Sao lưu ngay' })).toHaveCount(0);
});

test('Sao lưu → tải JSON → thêm dữ liệu → khôi phục: dữ liệu và số tổng như cũ', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, 'e2e.admin');
  // số tổng trước
  await page.goto('/loi-nhuan');
  await expect(page.getByTestId('profit-table')).toBeVisible();
  const before = { spent: await page.getByTestId('total-spent').innerText(), received: await page.getByTestId('total-received').innerText() };

  await page.goto('/danh-muc');
  await page.getByRole('tab', { name: 'CÔNG TY & SAO LƯU' }).click();
  await page.getByRole('button', { name: 'Sao lưu ngay' }).click();
  await expect(page.getByText('Đã lưu bản sao lưu')).toBeVisible();
  // tải JSON
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Tải bản sao lưu JSON' }).click()]);
  const file = await dl.path();
  const json = JSON.parse(readFileSync(file!, 'utf8')) as { app: string; tables: Record<string, unknown[]> };
  expect(json.app).toBe('qlcp');
  expect(json.tables.projects!.length).toBeGreaterThan(10);
  expect(json.tables.expenses!.length).toBeGreaterThan(100);

  // thêm 1 loại chi phí rồi khôi phục bản vừa lưu → loại đó biến mất
  const label = `Sẽ Mất ${Date.now() % 100000}`;
  await page.getByRole('tab', { name: 'DANH SÁCH' }).click();
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  await page.getByLabel('Tên mới').fill(label);
  await page.getByRole('button', { name: 'Thêm', exact: true }).last().click();
  await expect(page.locator('tr', { hasText: label })).toBeVisible();
  await page.getByRole('tab', { name: 'CÔNG TY & SAO LƯU' }).click();
  await page.getByTestId('backup-table').getByRole('button', { name: 'Khôi phục' }).first().click();
  await page.getByRole('button', { name: 'Khôi phục', exact: true }).last().click();
  await expect(page.getByText('Đã khôi phục')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('backup-table')).toContainText('Trước khi khôi phục');
  await page.getByRole('tab', { name: 'DANH SÁCH' }).click();
  await expect(page.getByTestId('catalog-table')).toBeVisible();
  await expect(page.locator('tr', { hasText: label })).toHaveCount(0);
  // số tổng như cũ
  await page.goto('/loi-nhuan');
  await expect(page.getByTestId('total-spent')).toHaveText(before.spent);
  await expect(page.getByTestId('total-received')).toHaveText(before.received);
});
