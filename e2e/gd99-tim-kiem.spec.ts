// Ô TÌM CHUNG (tai-lieu/DE-XUAT-TIM-KIEM.md): gõ → kết quả chia nhóm; bấm dòng → mở đúng trang, ô lọc điền sẵn, dòng được tô sáng;
// điện thoại mở toàn màn hình; tài khoản không có quyền thì không thấy nhóm đó. Dùng dữ liệu app cũ đã đổ vào Supabase trên máy.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/TIM-KIEM';
mkdirSync(SHOTS, { recursive: true });

async function login(page: Page, username: string) {
  await page.goto('/dang-nhap');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
}

async function search(page: Page, text: string) {
  await page.getByTestId('open-search').click();
  const box = page.getByTestId('global-search');
  await expect(box).toBeVisible();
  await box.getByRole('textbox', { name: 'Tìm kiếm' }).fill(text);
  return box;
}

test('máy tính: gõ "cadivi" → nhóm Khoản chi; bấm dòng → Tra cứu lọc sẵn + tô sáng', async ({ page }) => {
  await login(page, 'e2e.admin');
  const box = await search(page, 'cadivi');
  const group = box.getByTestId('group-expense');
  await expect(group).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/may-tinh-ket-qua.png` });

  await group.locator('button').first().click();
  await expect(page).toHaveURL(/\/chi-phi\/tra-cuu/);
  await expect(box).toBeHidden();
  await expect(page.getByLabel('Tìm nội dung…').first()).not.toHaveValue('');
  await expect(page.locator('.search-flash').first()).toBeVisible({ timeout: 8000 });
  await page.screenshot({ path: `${SHOTS}/may-tinh-mo-trang.png` });
});

test('Ctrl+K mở ô tìm, phím ↓ Enter mở trang, gõ không dấu vẫn ra', async ({ page }) => {
  await login(page, 'e2e.admin');
  await page.keyboard.press('Control+k');
  const box = page.getByTestId('global-search');
  await box.getByRole('textbox', { name: 'Tìm kiếm' }).fill('hung long');
  await expect(box.getByTestId('group-project')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/cong-trinh\/[0-9a-f-]{36}/);
});

test('danh bạ: bấm thầu phụ → Danh bạ mở đúng nhóm Thầu phụ', async ({ page }) => {
  await login(page, 'e2e.admin');
  const box = await search(page, 'danh bạ TPDN');
  const group = box.getByTestId('group-contact');
  await expect(group).toBeVisible();
  await group.locator('button').first().click();
  await expect(page).toHaveURL(/\/cai-dat\/danh-ba/);
  await expect(page.getByRole('tab', { name: /THẦU PHỤ/ }).first()).toHaveAttribute('aria-selected', 'true');
});

test('điện thoại: nút 🔍 mở toàn màn hình', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'e2e.admin');
  const box = await search(page, 'xi măng');
  await expect(box.getByTestId('group-expense')).toBeVisible();
  const r = await box.boundingBox();
  expect(r?.width).toBeGreaterThanOrEqual(389);
  await page.screenshot({ path: `${SHOTS}/dien-thoai.png` });
});

test('quyền: Chỉ xem không thấy nhóm Phiếu chi / Hợp đồng thầu phụ', async ({ page }) => {
  await login(page, 'e2e.cx');
  const box = await search(page, 'TPDN');
  await expect(box.getByTestId('search-results')).not.toContainText('Đang tìm…', { timeout: 8000 });
  await expect(box.getByTestId('group-payment')).toHaveCount(0);
  await expect(box.getByTestId('group-subcontract')).toHaveCount(0);
});
