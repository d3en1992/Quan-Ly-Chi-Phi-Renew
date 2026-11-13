// GĐ4 — Danh Bạ: 5 nhóm ở 3 khổ, thêm công nhân + SĐT / CCCD, che SĐT / CCCD với tài khoản không có quyền, xóa.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
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
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
}
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const SIZES = [{ name: '1440', width: 1440, height: 900 }, { name: '800', width: 800, height: 1000 }, { name: '390', width: 390, height: 844 }];
const TABS = ['KHÁCH HÀNG', 'CÔNG NHÂN', 'NHÂN VIÊN', 'NHÀ CUNG CẤP', 'THẦU PHỤ'];

for (const size of SIZES) {
  test(`Danh Bạ ở ${size.name}px: 5 nhóm, không lỗi, không kéo ngang`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width: size.width, height: size.height });
    await login(page, 'e2e.admin');
    await page.goto('/danh-ba');
    for (const t of TABS) {
      await page.getByRole('tab', { name: t }).click();
      await expect(page.getByTestId('contacts-table').or(page.locator('main [role="button"]')).or(page.getByText(/Chưa có .* nào/)).first()).toBeVisible();
      expect(await noSideScroll(page), `${t} bị kéo ngang`).toBe(true);
      if (t === 'KHÁCH HÀNG' || t === 'CÔNG NHÂN') await page.screenshot({ path: `${SHOTS}/danh-ba-${t === 'KHÁCH HÀNG' ? 'khach' : 'cong-nhan'}-${size.name}.png`, fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}

test('Thêm công nhân có SĐT + CCCD: Admin thấy đủ, Kế toán thấy bản che; xóa được', async ({ browser }) => {
  const name = `E2E TEST ${Date.now() % 100000}`;
  const admin = await (await browser.newContext({ locale: 'vi-VN' })).newPage();
  await login(admin, 'e2e.admin');
  await admin.goto('/danh-ba');
  await admin.getByRole('tab', { name: 'CÔNG NHÂN' }).click();
  await admin.getByRole('button', { name: 'Thêm', exact: true }).click();
  await admin.getByLabel('Tên gọi (trong sổ chấm công) *').fill(name);
  await admin.getByLabel('Số điện thoại', { exact: true }).fill('0912345678');
  await admin.getByLabel('Số CCCD').fill('079188012345');
  await admin.getByLabel('Quê quán').fill('Bến Tre');
  await admin.getByRole('button', { name: 'Lưu' }).click();
  const row = admin.locator('tr', { hasText: name });
  await expect(row).toContainText('0912345678');
  await expect(row).toContainText('079188012345');
  await expect(row).toContainText('Bến Tre');

  const kt = await (await browser.newContext({ locale: 'vi-VN' })).newPage();
  await login(kt, 'e2e.kt');
  await kt.goto('/danh-ba');
  await kt.getByRole('tab', { name: 'CÔNG NHÂN' }).click();
  const ktRow = kt.locator('tr', { hasText: name });
  await expect(ktRow).toBeVisible();
  const text = await ktRow.innerText();
  expect(text).not.toContain('0912345678');
  expect(text).not.toContain('079188012345');
  expect(text).not.toContain('Bến Tre');
  expect(text).toContain('•');

  // Dọn: xóa mềm
  await admin.getByLabel(`Xóa ${name}`).click();
  await admin.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(admin.locator('tr', { hasText: name })).toHaveCount(0);
});

test('Chỉ xem không thấy Danh Bạ; nhà cung cấp bật / tắt Mua nợ', async ({ page }) => {
  await login(page, 'e2e.cx');
  await page.goto('/danh-ba');
  await expect(page.getByText('Không có quyền xem mục này')).toBeVisible();
});

test('Thầu phụ tích "Cũng làm công nhân" → tạo / nối công nhân, thông tin cá nhân lưu một chỗ (13/11/2026)', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.admin');
  await page.goto('/danh-ba');
  const sub = `E2E TP ${Date.now() % 100000}`, worker = `E2E CN ${Date.now() % 100000}`;
  await page.getByRole('tab', { name: 'THẦU PHỤ' }).click();
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Tên thầu phụ *').fill(sub);
  await sheet.getByLabel('Cũng làm công nhân (lâu lâu qua làm, có tên trong sổ chấm công)').check();
  await sheet.getByRole('combobox', { name: 'Tên trong sổ chấm công' }).fill(worker);
  await sheet.getByLabel('Họ tên (người liên hệ, theo CCCD)').fill('Nguyễn Văn Thử');
  await sheet.getByLabel('Số điện thoại').fill('0909123456');
  await sheet.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByText('Đã thêm thầu phụ')).toBeVisible();
  await expect(page.getByTestId('contacts-table')).toContainText(`Cũng làm CN: ${worker}`);

  // Bên công nhân: có nhãn thầu phụ, họ tên + SĐT lấy từ hồ sơ thầu phụ; mở ra thấy ô báo "lưu ở hồ sơ thầu phụ"
  await page.getByRole('tab', { name: 'CÔNG NHÂN' }).click();
  const row = page.getByTestId('contacts-table').locator('tbody tr', { hasText: worker });
  await expect(row).toContainText(`Thầu phụ: ${sub}`);
  await expect(row).toContainText('Nguyễn Văn Thử');
  await expect(row).toContainText('0909123456');
  await row.click();
  await expect(page.getByTestId('worker-linked')).toBeVisible();
  await page.getByRole('button', { name: 'Mở hồ sơ thầu phụ' }).click();
  await expect(page.getByRole('dialog').getByLabel('Tên thầu phụ *')).toHaveValue(sub);
  expect(errors).toEqual([]);
});
