// Trình xem ảnh dùng chung (components/ui/image-zoom.tsx) mở TRONG bảng trượt: vừa khít màn hình, lăn, kéo, bấm phóng, Esc chỉ đóng ảnh.
// Kèm: ô số + cấu thành của Chi tiết công trình khớp nhau ở 3 khổ.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD99';
mkdirSync(SHOTS, { recursive: true });

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('qlcp-years', 'all'));
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill('e2e.admin');
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
}

test('xem ảnh trong bảng trượt bằng chuột', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await login(page);
  await page.goto('/danh-ba');
  const tall = await page.screenshot({ clip: { x: 0, y: 0, width: 300, height: 700 } });
  await page.getByRole('tab', { name: 'CỬA HÀNG' }).click();
  await page.getByRole('button', { name: /Chụp bảng hiệu/ }).first().click();
  await page.getByTestId('scan-file').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: tall });
  await page.getByTestId('zoomable-image').click();
  const img = page.getByTestId('image-zoom').locator('img');
  const level = page.getByTestId('image-zoom-level');
  await expect(img).toBeVisible();
  const fit = (await img.boundingBox())!;
  expect(fit.y).toBeGreaterThanOrEqual(-1);
  expect(fit.y + fit.height).toBeLessThanOrEqual(801);
  // Lăn chuột = phóng
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, -300);
  await expect(level).not.toHaveText('100%');
  await level.click();
  await expect(level).toHaveText('100%');
  // Bấm ảnh = phóng; kéo = dời (không bị tính là bấm)
  await page.mouse.click(720, 400);
  await expect(level).toHaveText('250%');
  await page.waitForTimeout(400);
  const a = (await img.boundingBox())!;
  await page.mouse.move(720, 500);
  await page.mouse.down();
  await page.mouse.move(720, 200, { steps: 6 });
  await page.mouse.up();
  const b = (await img.boundingBox())!;
  expect(Math.round(a.y - b.y)).toBe(300);
  await expect(level).toHaveText('250%');
  await page.screenshot({ path: `${SHOTS}/xem-anh-phong-to.png` });
  // Kéo hết cỡ vẫn xem được mép dưới của ảnh
  for (let i = 0; i < 5; i++) { await page.mouse.move(720, 600); await page.mouse.down(); await page.mouse.move(720, 50, { steps: 4 }); await page.mouse.up(); }
  const c = (await img.boundingBox())!;
  expect(c.y + c.height).toBeLessThanOrEqual(801);
  expect(c.y + c.height).toBeGreaterThan(600);
  await page.waitForTimeout(400);
  await page.mouse.dblclick(720, 300);
  await expect(level).toHaveText('100%');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('image-zoom')).toHaveCount(0);
  await expect(page.getByTestId('scan-file')).toHaveCount(1); // bảng trượt vẫn mở
  await page.getByTestId('zoomable-image').click();
  await page.getByTestId('image-zoom-close').click();
  await expect(page.getByTestId('image-zoom')).toHaveCount(0);
  await expect(page.getByTestId('zoomable-image')).toBeVisible();
});

for (const [w, h] of [[1536, 864], [1024, 768], [800, 1000], [390, 844]] as const) {
  test(`chi tiết công trình ${w}px: ô Tổng chi phí = dòng Tổng chi phí, không kéo ngang`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await login(page);
    await page.goto('/cong-trinh');
    await page.getByTestId('project-card').first().click();
    const total = await page.getByTestId('kpi-total-cost').textContent();
    expect(await page.getByTestId('detail-total-cost').textContent()).toBe(total);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/chi-tiet-${w}.png` });
  });
}
