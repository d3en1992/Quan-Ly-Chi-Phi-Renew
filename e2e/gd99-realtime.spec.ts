// Realtime (13/11/2026): máy A lưu → máy B đang mở cùng màn tự thấy, KHÔNG bấm F5, không đổi tab.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E_PASSWORD } from './accounts';

async function openAs(browser: Browser, username: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('qlcp-years', 'all'));
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
  return page;
}

test('Máy A thêm danh mục → máy B tự hiện trong vài giây', async ({ browser }) => {
  const a = await openAs(browser, 'e2e.admin');
  const b = await openAs(browser, 'e2e.gd');
  for (const p of [a, b]) {
    await p.goto('/cai-dat/danh-muc');
    await expect(p.getByTestId('catalog-table')).toBeVisible();
  }
  await b.waitForTimeout(1500); // chờ máy B nối Realtime xong
  const label = `realtime ${Date.now() % 100000}`;
  const shown = label.split(' ').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
  await a.getByRole('button', { name: 'Thêm', exact: true }).click();
  await a.getByLabel('Tên mới').fill(label);
  await a.getByRole('button', { name: 'Thêm', exact: true }).last().click();
  await expect(a.locator('tr', { hasText: shown })).toBeVisible();

  const t0 = Date.now();
  await expect(b.locator('tr', { hasText: shown })).toBeVisible({ timeout: 8000 });
  console.log(`Máy B thấy sau ${Date.now() - t0} ms`);

  // Dọn: xóa ở máy A → máy B cũng tự mất
  await a.getByLabel(`Xóa ${shown}`).click();
  await a.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(b.locator('tr', { hasText: shown })).toHaveCount(0, { timeout: 8000 });
});
