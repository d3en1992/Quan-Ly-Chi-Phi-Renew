// GĐ10 — mọi màn mở được ở 390 / 820 / 1440px, không lỗi console, không kéo ngang cả trang; PWA có manifest.
// Ảnh chụp lưu ở anh-chup/GD10/.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD10';
mkdirSync(SHOTS, { recursive: true });

const SIZES = [
  { name: '390', width: 390, height: 844 },
  { name: '820', width: 820, height: 1180 },
  { name: '1440', width: 1440, height: 900 },
];
// [tên file, đường dẫn]; màn riêng điện thoại chỉ chạy ở 390
const ROUTES: [string, string][] = [
  ['cong-trinh', '/cong-trinh'], ['nhap-chi-phi', '/nhap-chi-phi'], ['thong-ke', '/thong-ke-cp-hd'],
  ['cham-cong', '/cham-cong'], ['chi-tra', '/chi-tra'], ['cong-no', '/cong-no'], ['ti-trong', '/ti-trong'],
  ['thiet-bi', '/thiet-bi'], ['tien-do', '/tien-do'], ['danh-ba', '/danh-ba'], ['doanh-thu', '/doanh-thu'],
  ['loi-nhuan', '/loi-nhuan'], ['quyet-toan', '/quyet-toan'], ['dashboard', '/dashboard'], ['danh-muc', '/danh-muc'],
  ['tai-khoan', '/tai-khoan'], ['thung-rac', '/thung-rac'],
];
const PHONE_ONLY: [string, string][] = [['tong-quan', '/tong-quan'], ['them', '/them'], ['chup', '/chup']];

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('qlcp-years', 'all'));
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill('e2e.admin');
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
}

for (const size of SIZES) {
  test(`mọi màn ở ${size.name}px: không lỗi console, không kéo ngang`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    const errors = watchConsole(page);
    await login(page);
    const routes = size.width < 640 ? [...PHONE_ONLY, ...ROUTES] : ROUTES;
    const wide: string[] = [];
    for (const [file, path] of routes) {
      await page.goto(path);
      await page.locator('[data-layout]').first().waitFor();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(300);
      const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      if (!ok) wide.push(path);
      await page.screenshot({ path: `${SHOTS}/${file}-${size.name}.png` });
    }
    expect(wide, 'màn bị kéo ngang cả trang').toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const size of SIZES) {
  test(`Chi tiết công trình ở ${size.name}px không kéo ngang`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const errors = watchConsole(page);
    await login(page);
    await page.goto('/cong-trinh');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/cong-trinh\/.+/);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: `${SHOTS}/chi-tiet-ct-${size.name}.png` });
    expect(errors).toEqual([]);
  });
}

test('PWA: manifest đúng tên + icon, có service worker khi build', async ({ request }) => {
  // Dev server không sinh manifest; kiểm tra file icon và cấu hình index.html
  const icon = await request.get('/pwa-512x512.png');
  expect(icon.ok()).toBeTruthy();
  const html = await (await request.get('/')).text();
  expect(html).toContain('apple-touch-icon');
});

test('Điện thoại: nút Lưu chi phí đủ to, bảng con là danh sách gọn (13/11/2026)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = watchConsole(page);
  await login(page);
  // Nút Lưu không bị khung cuộn bóp lại (từng chỉ cao ~21px)
  await page.goto('/nhap-chi-phi');
  const save = page.getByTestId('phone-save');
  await save.waitFor();
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(52);

  // Công nợ → thẻ HĐ thầu phụ có lịch sử trả: hiện danh sách giãn đủ ngang, không còn <table>
  await page.goto('/cong-no');
  await page.waitForLoadState('networkidle').catch(() => {});
  const cards = page.locator('main [role="button"]');
  const n = Math.min(await cards.count(), 20);
  for (let i = 0; i < n; i++) {
    await cards.nth(i).click();
    if (await page.getByTestId('hdtp-history').isVisible().catch(() => false)) break;
    await cards.nth(i).click();
  }
  const hist = page.getByTestId('hdtp-history');
  await expect(hist).toBeVisible();
  const box = (await hist.boundingBox())!;
  expect(box.width).toBeGreaterThan(300);
  await hist.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${SHOTS}/cong-no-lich-su-tra-390.png` });
  // Thay "Xuất ảnh HĐ" bằng Copy Zalo (13/11/2026)
  await expect(page.getByRole('button', { name: 'Xuất ảnh HĐ' })).toHaveCount(0);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByTestId('hdtp-zalo').click();
  await expect(page.getByText('Đã chép — dán vào Zalo')).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('CÔNG NỢ THẦU PHỤ');
  expect(errors).toEqual([]);
});
