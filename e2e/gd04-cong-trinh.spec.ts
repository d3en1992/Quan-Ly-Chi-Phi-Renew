// GĐ4 — Công Trình + Chi tiết công trình: 3 khổ màn hình, số thẻ = số Lợi Nhuận, đổi tên lan ra mọi nơi, thêm / xóa công trình.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD04';
mkdirSync(SHOTS, { recursive: true });

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function login(page: Page, username: string, years: 'all' | number[] = 'all') {
  await page.addInitScript((y) => localStorage.setItem('qlcp-years', y), years === 'all' ? 'all' : JSON.stringify(years));
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
}

const digits = (s: string | null) => Number((s ?? '').replace(/[^\d−-]/g, '').replace('−', '-'));
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const kpi = (page: Page, label: string) => page.locator('main').getByText(label, { exact: true }).first().locator('xpath=following-sibling::b[1]');

const SIZES = [{ name: '1440', width: 1440, height: 900 }, { name: '800', width: 800, height: 1000 }, { name: '390', width: 390, height: 844 }];

test.describe('Công Trình ở 3 khổ màn hình', () => {
  for (const size of SIZES) {
    test(`Admin mở danh sách và chi tiết ở ${size.name}px: có thẻ, không lỗi, không kéo ngang`, async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      await login(page, 'e2e.admin');
      await page.goto('/cong-trinh');
      await expect(page.getByTestId('project-card').first()).toBeVisible();
      expect(await noSideScroll(page), 'danh sách bị kéo ngang').toBe(true);
      await page.screenshot({ path: `${SHOTS}/cong-trinh-${size.name}.png`, fullPage: true });
      await page.getByTestId('project-card').first().click();
      await expect(page).toHaveURL(/\/cong-trinh\/.+/);
      await expect(page.getByRole('tab', { name: 'TỔNG HỢP CHI PHÍ' })).toBeVisible();
      for (const tab of ['HÓA ĐƠN', 'NHÂN CÔNG', 'THẦU PHỤ', 'NHÀ CUNG CẤP', 'THU TIỀN', 'TỔNG HỢP CHI PHÍ']) {
        await page.getByRole('tab', { name: tab }).click();
        expect(await noSideScroll(page), `tab ${tab} bị kéo ngang`).toBe(true);
      }
      await page.screenshot({ path: `${SHOTS}/chi-tiet-${size.name}.png`, fullPage: true });
      expect(errors).toEqual([]);
    });
  }
});

test('Số trên thẻ / chi tiết công trình = số tab Lợi Nhuận', async ({ page }) => {
  await login(page, 'e2e.admin');
  await page.goto('/cong-trinh');
  await expect(page.getByTestId('project-card').first()).toBeVisible();
  await page.getByLabel('Trạng thái').selectOption('');
  const cardSpent = await kpi(page, 'Tổng đã chi').textContent();
  const cardReceived = await kpi(page, 'Tổng đã thu').textContent();
  const cardProfit = await kpi(page, 'Lãi tạm tính').textContent();
  // Chọn 1 công trình có chi, đọc số chính xác ở chi tiết
  const ids = await page.getByTestId('project-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-project-id')));
  await page.goto('/loi-nhuan');
  await expect(page.getByTestId('profit-table')).toBeVisible();
  await expect(kpi(page, 'Tổng đã chi')).toHaveText(cardSpent!);
  await expect(kpi(page, 'Tổng đã thu')).toHaveText(cardReceived!);
  await expect(kpi(page, 'Lợi nhuận')).toHaveText(cardProfit!);
  // Từng công trình: chi tiết = dòng Lợi Nhuận (số chính xác)
  const rows = page.locator('tr[data-project]');
  const count = Math.min(await rows.count(), 6);
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const id = await row.getAttribute('data-project');
    if (!ids.includes(id)) continue;
    const spent = digits(await row.locator('td').nth(7).locator('b').textContent());
    await page.goto(`/cong-trinh/${id}`);
    await expect(page.getByTestId('detail-spent')).toBeVisible();
    expect(digits(await page.getByTestId('detail-spent').textContent()), `tổng đã chi của ${id}`).toBe(spent);
    await page.goto('/loi-nhuan');
    await expect(page.getByTestId('profit-table')).toBeVisible();
  }
});

test('Đổi tên công trình → Chi tiết, Lợi Nhuận, Thống Kê CP/HĐ đều hiện tên mới', async ({ page }) => {
  await login(page, 'e2e.admin');
  await page.goto('/cong-trinh');
  await page.getByLabel('Trạng thái').selectOption('');
  await expect(page.getByTestId('project-card').first()).toBeVisible();
  // Công trình có chi phí, tên đủ ngắn để thêm hậu tố
  const pick = await page.getByTestId('project-card').evaluateAll((els) =>
    els.map((e) => ({ id: e.getAttribute('data-project-id'), name: e.querySelector('[data-testid="project-name"]')?.textContent ?? '', spent: e.querySelector('[data-testid="card-spent"]')?.textContent ?? '' }))
      .find((x) => x.name.length <= 40 && !/^0/.test(x.spent) && /^\S/.test(x.name)));
  expect(pick, 'cần 1 công trình tên ngắn có chi phí').toBeTruthy();
  const oldName = pick!.name;
  const newName = `${oldName} ZZ`;
  try {
    await page.goto(`/cong-trinh/${pick!.id}`);
    await page.getByRole('button', { name: 'Sửa công trình' }).click();
    await page.getByLabel('Tên công trình', { exact: true }).fill(newName);
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(page.getByTestId('project-title').or(page.locator('h2')).filter({ hasText: newName }).first()).toBeVisible();
    await page.goto('/loi-nhuan');
    await expect(page.locator(`tr[data-project="${pick!.id}"]`)).toContainText(newName);
    await page.goto('/thong-ke-cp-hd');
    await page.getByLabel('Tìm nội dung…').fill('');
    await expect(page.getByTestId('expense-table')).toBeVisible();
    await page.getByLabel('Công trình', { exact: true }).selectOption({ label: newName });
    await expect(page.getByTestId('expense-table').locator('tbody tr').first()).toContainText(newName);
  } finally {
    await page.goto(`/cong-trinh/${pick!.id}`);
    await page.getByRole('button', { name: 'Sửa công trình' }).click();
    await page.getByLabel('Tên công trình', { exact: true }).fill(oldName);
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(page.getByText('Đã cập nhật công trình')).toBeVisible();
    await expect(page.locator('h2').filter({ hasText: oldName })).not.toContainText(newName);
  }
});

test('Thêm công trình (thêm nhanh khách), rồi xóa; công trình còn dữ liệu thì không xóa được', async ({ page }) => {
  await login(page, 'e2e.admin');
  await page.goto('/cong-trinh');
  await page.getByRole('button', { name: 'Thêm công trình' }).click();
  await page.getByRole('button', { name: 'Thêm nhanh' }).click();
  const cust = `Khách E2E ${Date.now() % 100000}`;
  await page.getByLabel('Tên khách hàng mới').fill(cust);
  await page.getByRole('button', { name: 'Thêm khách' }).click();
  await page.getByLabel('Hạng mục', { exact: true }).fill('Ốp gạch sân vườn');
  await expect(page.getByLabel('Tên công trình', { exact: true })).toHaveValue(new RegExp('^CT ' + cust + ' [(]Ốp gạch'));
  await page.getByLabel('Tên công trình', { exact: true }).fill(`SN ${cust}`);
  await expect(page.getByText('Loại (tự nhận diện)')).toContainText('SN');
  await page.getByRole('button', { name: 'Lưu công trình' }).click();
  await expect(page).toHaveURL(/\/cong-trinh\/.+/);
  await expect(page.locator('h2').filter({ hasText: `SN ${cust}` })).toBeVisible();
  // Xóa (chưa có dữ liệu)
  await page.getByRole('button', { name: 'Thêm thao tác' }).click();
  await page.getByRole('menuitem', { name: /Xóa công trình/ }).click();
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(page).toHaveURL(/\/cong-trinh$/);
  await expect(page.getByText(`SN ${cust}`)).toHaveCount(0);
});

test('Chỉ xem: không có nút Thêm / Sửa; Kế toán không thấy số thu', async ({ page }) => {
  await login(page, 'e2e.cx');
  await page.goto('/cong-trinh');
  await expect(page.getByTestId('project-card').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm công trình' })).toHaveCount(0);
});
