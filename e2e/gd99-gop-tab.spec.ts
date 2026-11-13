// Gộp menu 18 mục → 9 tab (tai-lieu/KE-HOACH-GOP-TAB.md): từng vai trò thấy đúng tab + tab con,
// đường dẫn cũ chuyển đúng chỗ, gõ thẳng tab con không có quyền → bị chặn, còn 1 tab con thì không hiện dải tab con.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GOP-TAB';
mkdirSync(SHOTS, { recursive: true });

async function login(page: Page, username: string) {
  await page.goto('/dang-nhap');
  await page.evaluate(() => localStorage.clear()); // bỏ phiên cũ + tab con đã nhớ
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
}

async function navKeys(page: Page) {
  await expect(page.locator('aside [data-nav]').first()).toBeVisible();
  return page.locator('aside [data-nav]').evaluateAll((els) => els.map((e) => e.getAttribute('data-nav')));
}

async function subTabs(page: Page) {
  if (!(await page.getByTestId('tab-subs').count())) return [];
  return page.getByTestId('tab-subs').getByRole('tab').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim()));
}

// Bảng "ai thấy gì" theo quyền mặc định (KE-HOACH-GOP-TAB mục 1)
const CASES: { user: string; tabs: string[]; subs: Record<string, string[]>; blocked: string[] }[] = [
  {
    user: 'e2e.kt',
    tabs: ['congtrinh', 'chiphi', 'chamcong', 'thauphu', 'kehoach', 'caidat'],
    subs: { '/ke-hoach': [], '/cai-dat': ['DANH BẠ', 'XUẤT DỮ LIỆU', 'THÙNG RÁC'], '/chi-phi': ['NHẬP', 'TRA CỨU'] },
    blocked: ['/ke-hoach/dinh-muc', '/thu-lai/loi-nhuan', '/cai-dat/phan-quyen', '/dashboard'],
  },
  {
    user: 'e2e.cx',
    tabs: ['congtrinh', 'chiphi', 'kehoach', 'caidat'],
    subs: { '/chi-phi': [], '/ke-hoach': [], '/cai-dat': [] },
    blocked: ['/chi-phi/nhap', '/thau-phu/phieu-chi', '/cai-dat/thung-rac'],
  },
  {
    user: 'e2e.gd',
    tabs: ['congtrinh', 'chiphi', 'chamcong', 'thauphu', 'thulai', 'kehoach', 'thietbi', 'dashboard', 'caidat'],
    subs: { '/thu-lai': ['HỢP ĐỒNG CHÍNH', 'THU TIỀN', 'QUYẾT TOÁN', 'LỢI NHUẬN'], '/cai-dat': ['DANH BẠ', 'DANH MỤC', 'XUẤT DỮ LIỆU', 'THÙNG RÁC'] },
    blocked: ['/cai-dat/tai-khoan', '/cai-dat/phan-quyen'],
  },
];

test.describe('Menu 9 tab theo vai trò', () => {
  for (const c of CASES) {
    test(c.user, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await login(page, c.user);
      expect(await navKeys(page)).toEqual(c.tabs);
      for (const [path, subs] of Object.entries(c.subs)) {
        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`${path}/[a-z-]+`));
        await expect(page.locator('main')).not.toContainText('Không có quyền xem mục này');
        expect(await subTabs(page), path).toEqual(subs);
      }
      for (const path of c.blocked) {
        await page.goto(path);
        await expect(page.getByText('Không có quyền xem mục này'), path).toBeVisible();
      }
    });
  }
});

test('Đường dẫn cũ chuyển sang tab con mới (giữ ?query)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.admin');
  const pairs: [string, string][] = [
    ['/nhap-chi-phi', '/chi-phi/nhap'], ['/thong-ke-cp-hd', '/chi-phi/tra-cuu'], ['/chi-tra', '/thau-phu/phieu-chi'],
    ['/cong-no', '/thau-phu/hop-dong'], ['/doanh-thu', '/thu-lai/hop-dong'], ['/quyet-toan', '/thu-lai/quyet-toan'],
    ['/loi-nhuan', '/thu-lai/loi-nhuan'], ['/ti-trong', '/ke-hoach/ti-trong'], ['/danh-ba', '/cai-dat/danh-ba'],
    ['/danh-muc', '/cai-dat/danh-muc'], ['/tai-khoan', '/cai-dat/tai-khoan'], ['/xuat-du-lieu', '/cai-dat/xuat'], ['/thung-rac', '/cai-dat/thung-rac'],
  ];
  for (const [from, to] of pairs) {
    await page.goto(from);
    await expect(page, from).toHaveURL(new RegExp(`${to}$`));
  }
  await page.goto('/tien-do?project=abc');
  await expect(page).toHaveURL(/\/ke-hoach\/tien-do\?project=abc$/);
});

test('Bấm tab con, nhớ tab con lần trước; Ctrl K tìm được tên cũ', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.admin');
  await page.locator('aside [data-nav="thulai"]').click();
  await expect(page).toHaveURL(/\/thu-lai\/hop-dong$/);
  await page.getByTestId('tab-subs').getByRole('tab', { name: 'QUYẾT TOÁN' }).click();
  await expect(page).toHaveURL(/\/thu-lai\/quyet-toan$/);
  await page.screenshot({ path: `${SHOTS}/thu-lai-1440.png` });
  await page.locator('aside [data-nav="congtrinh"]').click();
  await page.locator('aside [data-nav="thulai"]').click();
  await expect(page).toHaveURL(/\/thu-lai\/quyet-toan$/);
  // Tỉ trọng: nút "Luật tự gán" chuyển sang tab con Cấu hình rổ
  await page.goto('/ke-hoach/ti-trong');
  await page.screenshot({ path: `${SHOTS}/ke-hoach-1440.png` });
  // Ctrl K: gõ tên cũ "công nợ" ra "Hợp đồng thầu phụ"
  await page.getByRole('button', { name: /Tìm công trình, hóa đơn/ }).click();
  await page.getByRole('dialog').getByPlaceholder('Tìm công trình, hóa đơn, công nhân…').fill('cong no');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/thau-phu\/hop-dong$/);
});

test('Bảng Phân quyền xếp theo tab, có nút cả nhóm', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.admin');
  await page.goto('/cai-dat/phan-quyen');
  await expect(page.locator('[data-group="Thu & Lãi"]')).toBeVisible();
  await expect(page.locator('[data-group-cell="Quản lý|Kế Hoạch"]')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/phan-quyen-1440.png`, fullPage: true });
});

test('Điện thoại: mục Thêm 6 tab, dải tab con cuộn trong khung', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'e2e.admin');
  await page.locator('[data-bottom="more"]').click();
  await expect(page.getByTestId('phone-more').locator('[data-more]')).toHaveCount(6);
  await page.screenshot({ path: `${SHOTS}/them-390.png` });
  await page.locator('[data-more="thulai"]').click();
  await expect(page).toHaveURL(/\/thu-lai\/thu-tien$/); // điện thoại mở Thu tiền trước
  await expect(page.getByTestId('tab-subs')).toBeVisible();
  await page.waitForLoadState('networkidle').catch(() => {});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/thu-lai-390.png` });
  await page.locator('[data-bottom="ai"]').click();
  await page.getByRole('link', { name: 'Nhập tay' }).click();
  await expect(page).toHaveURL(/\/chi-phi\/nhap$/);
});
