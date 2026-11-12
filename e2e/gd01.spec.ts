// GĐ1: đăng nhập, menu theo vai trò, đổi ô quyền → menu đổi, đổi mật khẩu lần đầu, 3 khổ màn hình
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { ALL_NAV_KEYS, E2E_ACCOUNTS, E2E_PASSWORD, MOCK_HIDE } from './accounts';

const SHOTS = 'anh-chup/GD01';
mkdirSync(SHOTS, { recursive: true });

/** Bắt lỗi console (bỏ qua lỗi tải font khi máy không có mạng) */
function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function login(page: Page, username: string, password = E2E_PASSWORD) {
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  // Chờ xong: vào app, hoặc màn đổi mật khẩu, hoặc báo lỗi
  await page.locator('[data-layout], [role="alert"], form[aria-label="Đổi mật khẩu"]').first().waitFor();
}

async function logout(page: Page) {
  await page.evaluate(() => localStorage.removeItem('qlcp-auth'));
}

async function visibleNavKeys(page: Page) {
  await expect(page.locator('aside [data-nav]').first()).toBeVisible();
  return page.locator('aside [data-nav]').evaluateAll((els) => els.map((e) => e.getAttribute('data-nav')));
}

test.describe('Đăng nhập + menu theo vai trò', () => {
  for (const acc of E2E_ACCOUNTS.filter((a) => !a.mustChange)) {
    test(`${acc.mockRole} thấy đúng menu như giao diện mẫu`, async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await login(page, acc.username);
      const keys = await visibleNavKeys(page);
      const expected = ALL_NAV_KEYS.filter((k) => !MOCK_HIDE[acc.mockRole]!.includes(k));
      expect(keys).toEqual(expected);
      await expect(page.getByTestId('account-chip')).toContainText(acc.displayName);
      // Bấm qua mọi tab được thấy: không lỗi
      for (const k of keys) {
        await page.locator(`aside [data-nav="${k}"]`).click();
        await expect(page.locator('main')).not.toContainText('Không tìm thấy trang');
      }
      // Gõ thẳng đường dẫn bị ẩn → báo không có quyền
      if (MOCK_HIDE[acc.mockRole]!.includes('taikhoan')) {
        await page.goto('/tai-khoan');
        await expect(page.getByText('Không có quyền xem mục này')).toBeVisible();
      }
      expect(errors).toEqual([]);
    });
  }

  test('sai mật khẩu báo lỗi tiếng Việt', async ({ page }) => {
    await login(page, 'e2e.ql', 'sai-mat-khau-1');
    await expect(page.getByRole('alert')).toContainText('Sai tên đăng nhập hoặc mật khẩu');
  });
});

test('3 tài khoản seed đăng nhập được và bị bắt đổi mật khẩu lần đầu', async ({ page }) => {
  const file = 'du-lieu/tai-khoan-tam.txt';
  test.skip(!existsSync(file), 'Chưa chạy npm run seed:users');
  const rows = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^(\S+)\s+\|\s+(\S+)\s+\|/))
    .filter((m): m is RegExpMatchArray => !!m && m[1] !== 'Tên');
  expect(rows.map((r) => r[1])).toEqual(['tinh', 'chay', 'lam']);
  for (const [, username, password] of rows) {
    await login(page, username!, password!);
    // Mật khẩu tạm còn nguyên → màn đổi mật khẩu lần đầu (không đổi để giữ mật khẩu tạm cho anh)
    await expect(page.getByRole('heading', { name: 'Đổi mật khẩu lần đầu' })).toBeVisible();
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  }
});

test('đổi mật khẩu lần đầu rồi vào app', async ({ page }) => {
  await login(page, 'e2e.moi');
  await expect(page.getByRole('heading', { name: 'Đổi mật khẩu lần đầu' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/doi-mat-khau-lan-dau.png` });
  await page.locator('input[name="new-password"]').fill('ngan');
  await page.locator('input[name="confirm-password"]').fill('ngan');
  await page.getByRole('button', { name: /Lưu mật khẩu mới/ }).click();
  await expect(page.getByRole('alert')).toContainText('ít nhất 8');
  await page.locator('input[name="new-password"]').fill('MatKhauMoi-2026');
  await page.locator('input[name="confirm-password"]').fill('MatKhauMoi-2026');
  await page.getByRole('button', { name: /Lưu mật khẩu mới/ }).click();
  await expect(page.locator('aside [data-nav="congtrinh"]')).toBeVisible();
});

test('Admin đổi ô quyền → menu vai trò đó đổi theo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Quản lý đang thấy Theo Dõi TB
  await login(page, 'e2e.ql');
  expect(await visibleNavKeys(page)).toContain('thietbi');
  await logout(page);

  // Admin bấm ô "Theo dõi thiết bị × Quản lý": Toàn quyền → Ẩn
  await login(page, 'e2e.admin');
  await page.locator('aside [data-nav="taikhoan"]').click();
  await expect(page.locator('[data-account="tinh"]')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tai-khoan-1440.png` });
  await page.getByRole('tab', { name: 'VAI TRÒ & QUYỀN' }).click();
  const cell = page.locator('[data-cell="Quản lý|equipment"]');
  await expect(cell).toContainText('Toàn quyền');
  await cell.click();
  await expect(cell).toContainText('Ẩn');
  await page.waitForTimeout(500); // chờ lưu xong
  await page.screenshot({ path: `${SHOTS}/vai-tro-quyen-1440.png` });
  // Ô của Admin không bấm được
  await expect(page.locator('[data-cell="Admin|equipment"]')).toBeDisabled();
  await logout(page);

  // Quản lý đăng nhập lại: mất Theo Dõi TB, vào thẳng đường dẫn bị chặn
  await login(page, 'e2e.ql');
  const keys = await visibleNavKeys(page);
  expect(keys).not.toContain('thietbi');
  await page.goto('/thiet-bi');
  await expect(page.getByText('Không có quyền xem mục này')).toBeVisible();
  await logout(page);

  // Trả lại như cũ: Ẩn → Xem → Nhập → Toàn quyền
  await login(page, 'e2e.admin');
  await page.goto('/tai-khoan');
  await page.getByRole('tab', { name: 'VAI TRÒ & QUYỀN' }).click();
  for (const label of ['Xem', 'Nhập', 'Toàn quyền']) {
    await cell.click();
    await expect(cell).toContainText(label);
  }
});

test('Admin tạo tài khoản, đặt lại mật khẩu, khóa', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.admin');
  await page.goto('/tai-khoan');
  const uname = `e2e.tao${Date.now() % 100000}`;
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await page.locator('input[name="display_name"]').fill('E2E Tạo Thử');
  await page.locator('input[name="username"]').fill(uname);
  await page.screenshot({ path: `${SHOTS}/tao-tai-khoan-1440.png` });
  await page.getByRole('button', { name: /Tạo \+ copy thông tin/ }).click();
  await expect(page.getByTestId('credentials')).toContainText(`Tên đăng nhập: ${uname}`);
  const creds = await page.getByTestId('credentials').innerText();
  const tempPw = creds.match(/Mật khẩu tạm: (\S+)/)![1]!;
  await page.getByRole('button', { name: 'Đóng', exact: true }).first().click();
  const row = page.locator(`[data-account="${uname}"]`);
  await expect(row).toContainText('Chờ đổi mật khẩu');

  // Đăng nhập được bằng mật khẩu tạm
  await logout(page);
  await login(page, uname, tempPw);
  await expect(page.getByRole('heading', { name: 'Đổi mật khẩu lần đầu' })).toBeVisible();
  await logout(page);

  // Khóa → không đăng nhập được
  await login(page, 'e2e.admin');
  await page.goto('/tai-khoan');
  await row.getByRole('button', { name: 'Khóa' }).click();
  await page.getByRole('button', { name: 'Khóa', exact: true }).last().click();
  await expect(row).toContainText('Đã khóa');
  await logout(page);
  await login(page, uname, tempPw);
  await expect(page.getByRole('alert')).toContainText('khóa');
});

test.describe('3 khổ màn hình', () => {
  const sizes = [
    { name: '1440', width: 1440, height: 900, layout: 'desktop' },
    { name: '820', width: 820, height: 1180, layout: 'tablet' },
    { name: '390', width: 390, height: 844, layout: 'phone' },
  ];
  for (const s of sizes) {
    test(`khổ ${s.name}px`, async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: s.width, height: s.height });
      await login(page, 'e2e.admin');
      await expect(page.locator(`[data-layout="${s.layout}"]`)).toBeVisible();
      if (s.layout === 'phone') {
        await expect(page.locator('[data-bottom]')).toHaveCount(5);
        await expect(page.getByRole('button', { name: /Chụp hóa đơn/ })).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/tong-quan-${s.name}.png` });
        await page.locator('[data-bottom="more"]').click();
        await expect(page.getByTestId('phone-more')).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/them-${s.name}.png` });
        await page.locator('[data-more="taikhoan"]').click();
        await expect(page.locator('main')).toContainText('TÀI KHOẢN');
      } else {
        await page.goto('/thiet-bi'); // tab chưa làm (GĐ8) vẫn hiện trang "Đang làm"
        await expect(page.locator('main')).toContainText('Đang làm');
        await page.screenshot({ path: `${SHOTS}/dang-lam-${s.name}.png` });
        await page.goto('/tai-khoan');
      }
      await expect(page.getByText('TÀI KHOẢN', { exact: true })).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/tai-khoan-${s.name}.png`, fullPage: true });
      // Không kéo ngang cả trang
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }

  test('đăng nhập trên điện thoại', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dang-nhap');
    await page.screenshot({ path: `${SHOTS}/dang-nhap-390.png` });
  });
});
