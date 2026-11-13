// GĐ3: 3 màn báo cáo chỉ xem (Lợi Nhuận, Dashboard, Thống Kê CP/HĐ) ở 3 khổ, đúng quyền, số trên màn khớp so-chuan.json
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD03';
mkdirSync(SHOTS, { recursive: true });

const PAGES = [
  { key: 'loi-nhuan', path: '/loi-nhuan', ready: '[data-testid="profit-table"]', phoneText: 'Lợi nhuận' },
  { key: 'dashboard', path: '/dashboard', ready: 'svg[role="img"]', phoneText: 'Chi 6 tuần gần nhất' },
  { key: 'thong-ke', path: '/thong-ke-cp-hd', ready: '[data-testid="expense-table"]', phoneText: 'Tổng tiền' },
];
const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '800', width: 800, height: 1000 },
  { name: '390', width: 390, height: 844 },
];

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

test.describe('3 màn báo cáo ở 3 khổ màn hình', () => {
  for (const size of SIZES) {
    test(`Admin mở Lợi Nhuận, Dashboard, Thống Kê ở ${size.name}px: có số, không lỗi, không kéo ngang`, async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      await login(page, 'e2e.admin');
      for (const p of PAGES) {
        await page.goto(p.path);
        if (size.width < 640) await expect(page.locator('main').getByText(p.phoneText).first()).toBeVisible();
        else await expect(page.locator(p.ready).first()).toBeVisible();
        expect(await noSideScroll(page), `${p.key} ${size.name}px bị kéo ngang cả trang`).toBe(true);
        await page.screenshot({ path: `${SHOTS}/${p.key}-${size.name}.png`, fullPage: true });
      }
      expect(errors).toEqual([]);
    });
  }
});

test.describe('Số trên màn Lợi Nhuận khớp app cũ', () => {
  const file = 'du-lieu/so-chuan.json';
  test.skip(!existsSync(file), 'chưa có du-lieu/so-chuan.json');

  test('Tất cả năm: tổng đã thu, tổng đã chi, lợi nhuận = so-chuan.json', async ({ page }) => {
    const gold = JSON.parse(readFileSync(file, 'utf8')).nam.TAT_CA.tongCong as Record<string, number>;
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, 'e2e.admin');
    await page.goto('/loi-nhuan');
    await expect(page.getByTestId('profit-table')).toBeVisible();
    expect(digits(await page.getByTestId('total-received').textContent())).toBe(gold.tongDaThu);
    // so-chuan cộng số đã làm tròn từng công trình; màn hình làm tròn tổng → cho lệch tối đa vài chục đồng
    expect(Math.abs(digits(await page.getByTestId('total-spent').textContent()) - gold.tongDaChi!)).toBeLessThan(40);
    expect(Math.abs(digits(await page.getByTestId('total-profit').textContent()) - gold.loiNhuan!)).toBeLessThan(40);
  });

  test('Đổi năm trên thanh trên → bảng tính lại; tìm không dấu lọc được công trình', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, 'e2e.admin', [2025]);
    await page.goto('/loi-nhuan');
    await expect(page.getByTestId('profit-table')).toBeVisible();
    await expect(page.locator('main')).toContainText('Năm 2025');
    const before = await page.locator('[data-testid="profit-table"] tbody tr').count();
    expect(before).toBeGreaterThan(0);
    await page.getByLabel('Tìm công trình, chủ đầu tư…').fill('khong co cong trinh nao ten nay');
    await expect(page.locator('[data-testid="profit-table"] tbody')).toContainText('Không có công trình');
    await page.screenshot({ path: `${SHOTS}/loi-nhuan-2025-tim.png` });
  });
});

test.describe('Thống Kê CP/HĐ', () => {
  test('Lọc theo loại → tổng đổi; bấm dòng → mở chi tiết', async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, 'e2e.admin');
    await page.goto('/thong-ke-cp-hd');
    await expect(page.getByTestId('expense-table')).toBeVisible();
    const all = digits(await page.getByTestId('expense-total').textContent());
    await page.getByLabel('Loại chi phí', { exact: true }).fill('Nhân Công');
    const wage = digits(await page.getByTestId('expense-total').textContent());
    expect(wage).toBeGreaterThan(0);
    expect(wage).toBeLessThan(all);
    await page.locator('[data-testid="expense-table"] tbody tr').first().click();
    await expect(page.getByRole('dialog')).toContainText('Chi tiết khoản chi');
    await page.screenshot({ path: `${SHOTS}/thong-ke-chi-tiet.png` });
    expect(errors).toEqual([]);
  });
});

test.describe('Quyền', () => {
  test('Quản lý xem được Lợi Nhuận và Dashboard (chỉ xem)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, 'e2e.ql');
    await page.goto('/loi-nhuan');
    await expect(page.locator('main')).not.toContainText('Không có quyền xem mục này');
    await expect(page.locator('main').getByRole('heading', { name: 'Lợi Nhuận' })).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.locator('main').getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // Màn chỉ xem: không có nút thêm / sửa / xóa
    await expect(page.locator('main').getByRole('button', { name: /Thêm|Sửa|Xóa|Lưu/ })).toHaveCount(0);
  });

  test('Kế toán không vào được Lợi Nhuận, Dashboard; vẫn xem được Thống Kê CP/HĐ', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, 'e2e.kt');
    for (const path of ['/loi-nhuan', '/dashboard']) {
      await page.goto(path);
      await expect(page.getByText('Không có quyền xem mục này')).toBeVisible();
    }
    await expect(page.locator('aside [data-nav="thulai"]')).toHaveCount(0);
    await page.goto('/thong-ke-cp-hd');
    await expect(page.locator('main').getByRole('heading', { name: 'Tra Cứu Chi Phí' })).toBeVisible();
  });
});

test('Thống Kê CP/HĐ: bỏ dải số, Tổng tiền góc phải, Lọc nâng cao ẩn Tháng / Người mua / Thanh toán (13/11/2026; bỏ lọc Nguồn khi gộp tab)', async ({ page }) => {
  const errors = watchConsole(page);
  for (const size of [{ w: 1440, h: 900 }, { w: 820, h: 1000 }, { w: 390, h: 844 }]) {
    await page.setViewportSize({ width: size.w, height: size.h });
    if (size.w === 1440) await login(page, 'e2e.admin');
    await page.goto('/thong-ke-cp-hd');
    await expect(page.getByTestId('stats-total')).toContainText('Tổng tiền');
    for (const t of ['Số khoản chi', 'Mua nợ (chưa tích', 'Nhập từ ảnh', 'Loại chi nhiều nhất']) await expect(page.getByText(t)).toHaveCount(0);
    await expect(page.getByLabel('Công trình', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Loại chi phí', { exact: true })).toBeVisible();
    await expect(page.getByLabel('NCC', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Tháng', { exact: true })).toHaveCount(0);
    await page.getByTestId('stats-adv').click();
    await expect(page.getByLabel('Nguồn', { exact: true })).toHaveCount(0);
    for (const l of ['Tháng', 'Người mua', 'Thanh toán']) await expect(page.getByLabel(l, { exact: true })).toBeVisible();
    await page.getByLabel('Thanh toán', { exact: true }).selectOption('credit');
    await expect(page.getByTestId('stats-adv')).toContainText('Lọc nâng cao (1)');
    await page.screenshot({ path: `${SHOTS}/thong-ke-loc-nang-cao-${size.w}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  }
  expect(errors).toEqual([]);
});
