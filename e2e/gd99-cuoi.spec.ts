// GĐ99 — Kiểm tra cuối: đăng nhập từng vai trò (Admin, Giám đốc, Quản lý, Kế toán, Chỉ xem), mở mọi tab ở
// 1536 (laptop anh Tình) / 1440 / 820 / 390px: không lỗi console, không kéo ngang cả trang. Ảnh: anh-chup/CUOI/<vai trò>/.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/CUOI';
const ROLES = [
  { user: 'e2e.admin', dir: 'admin' }, { user: 'e2e.gd', dir: 'giam-doc' }, { user: 'e2e.ql', dir: 'quan-ly' },
  { user: 'e2e.kt', dir: 'ke-toan' }, { user: 'e2e.cx', dir: 'chi-xem' },
];
const SIZES = [
  { name: '1536', width: 1536, height: 860 }, { name: '1440', width: 1440, height: 900 },
  { name: '820', width: 820, height: 1180 }, { name: '390', width: 390, height: 844 },
];
// Menu 9 tab + tab con (gộp 13/11/2026)
const ROUTES: [string, string][] = [
  ['cong-trinh', '/cong-trinh'], ['nhap-chi-phi', '/chi-phi/nhap'], ['tra-cuu', '/chi-phi/tra-cuu'],
  ['cham-cong', '/cham-cong'], ['hd-thau-phu', '/thau-phu/hop-dong'], ['ncc', '/thau-phu/ncc'], ['tat-toan', '/thau-phu/tat-toan'],
  ['phieu-chi', '/thau-phu/phieu-chi'], ['hd-chinh', '/thu-lai/hop-dong'], ['thu-tien', '/thu-lai/thu-tien'],
  ['quyet-toan', '/thu-lai/quyet-toan'], ['loi-nhuan', '/thu-lai/loi-nhuan'], ['tien-do', '/ke-hoach/tien-do'],
  ['ti-trong', '/ke-hoach/ti-trong'], ['dinh-muc', '/ke-hoach/dinh-muc'], ['cau-hinh', '/ke-hoach/cau-hinh'],
  ['thiet-bi', '/thiet-bi'], ['dashboard', '/dashboard'], ['danh-ba', '/cai-dat/danh-ba'], ['danh-muc', '/cai-dat/danh-muc'],
  ['tai-khoan', '/cai-dat/tai-khoan'], ['phan-quyen', '/cai-dat/phan-quyen'], ['xuat-du-lieu', '/cai-dat/xuat'], ['thung-rac', '/cai-dat/thung-rac'],
];
const PHONE_ONLY: [string, string][] = [['tong-quan', '/tong-quan'], ['them', '/them'], ['chup', '/chup']];

function watchConsole(page: Page, where: { path: string }) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|Failed to load resource/.test(m.text())) errors.push(`${where.path}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${where.path}: ${String(e)}`));
  return errors;
}

async function login(page: Page, user: string) {
  await page.addInitScript(() => localStorage.setItem('qlcp-years', 'all'));
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill(user);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
}

for (const role of ROLES) {
  for (const size of SIZES) {
    test(`${role.dir} ở ${size.name}px: mọi tab mở được, không lỗi console, không kéo ngang`, async ({ page }) => {
      test.setTimeout(300_000);
      mkdirSync(`${SHOTS}/${role.dir}`, { recursive: true });
      await page.setViewportSize({ width: size.width, height: size.height });
      const where = { path: '/dang-nhap' };
      const errors = watchConsole(page, where);
      await login(page, role.user);
      const routes = size.width < 640 ? [...PHONE_ONLY, ...ROUTES] : ROUTES;
      const wide: string[] = [];
      for (const [file, path] of routes) {
        where.path = path;
        await page.goto(path);
        await page.locator('[data-layout]').first().waitFor();
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(250);
        const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        if (!ok) wide.push(path);
        await page.screenshot({ path: `${SHOTS}/${role.dir}/${size.name}-${file}.png` });
      }
      expect(wide, 'màn bị kéo ngang cả trang').toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
