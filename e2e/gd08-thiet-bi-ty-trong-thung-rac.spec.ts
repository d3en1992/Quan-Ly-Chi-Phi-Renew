// GĐ8 — Theo Dõi TB, Tỉ Trọng & Định Mức, Thùng Rác.
// "Xong khi": xóa → vào thùng rác → khôi phục → số liệu trở lại như trước; thêm / chuyển thiết bị; lưu định mức.
// Chạy trên Supabase trong máy; dữ liệu test tên bắt đầu "E2E GD08", năm 2030, dọn sau khi xong.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { localAdminClient } from '../scripts/local-supabase.mjs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD08';
mkdirSync(SHOTS, { recursive: true });
const admin = localAdminClient();
const COMPANY = '00000000-0000-0000-0000-000000000001';
const N = Date.now() % 100_000;
const CT = `E2E GD08 CT ${N}`, TB = `E2E GD08 Máy ${N}`;
let projectId = '', nameId = '', expenseId = '', weekId = '';

const one = async <T,>(q: PromiseLike<{ data: T[] | null; error: unknown }>) => { const { data, error } = await q; expect(error).toBeNull(); return data ?? []; };
const ids = async (table: string, col: string) => ((await admin.from(table).select('id').like(col, 'E2E GD08%')).data ?? []).map((r: { id: string }) => r.id);
async function cleanup() {
  const [projects, names] = await Promise.all([ids('projects', 'name'), ids('catalog_items', 'name')]);
  await admin.from('cost_allocations').delete().like('name', '%E2E GD08%');
  if (names.length) await admin.from('equipment').delete().in('name_id', names);
  if (projects.length) {
    const weeks = ((await admin.from('timesheet_weeks').select('id').in('project_id', projects)).data ?? []).map((r: { id: string }) => r.id);
    if (weeks.length) await admin.from('timesheet_lines').delete().in('week_id', weeks);
    for (const t of ['timesheet_weeks', 'cost_allocations', 'equipment', 'expenses']) await admin.from(t).delete().in('project_id', projects);
    await admin.from('projects').delete().in('id', projects);
  }
  if (names.length) await admin.from('catalog_items').delete().in('id', names);
}

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}
async function login(page: Page, username: string) {
  await page.addInitScript(() => localStorage.setItem('qlcp-years', 'all'));
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
}
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function openAlloc(page: Page) {
  await page.goto('/ti-trong');
  await page.getByLabel('Công trình', { exact: true }).selectOption({ label: CT });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await cleanup();
  projectId = (await one(admin.from('projects').insert({ company_id: COMPANY, name: CT, kind: 'new_build', status: 'active', floor_areas: [{ ten: 'Trệt', dvt: 'm²', kl: 100, heSo: 1 }] }).select('id')))[0]!.id;
  nameId = (await one(admin.from('catalog_items').insert({ company_id: COMPANY, kind: 'equipment_name', name: TB }).select('id')))[0]!.id;
  const type = (await one(admin.from('catalog_items').select('id').eq('kind', 'expense_type').eq('name', 'Sắt Thép').is('deleted_at', null).limit(1)))[0]!.id;
  expenseId = (await one(admin.from('expenses').insert({ company_id: COMPANY, project_id: projectId, expense_type_id: type, date: '2030-03-05', amount: 5_000_000, description: 'E2E GD08 sắt phi 10', paid_at_purchase: true, source: 'quick' }).select('id')))[0]!.id;
  const worker = (await one(admin.from('workers').select('id').is('deleted_at', null).limit(1)))[0]!.id;
  weekId = (await one(admin.from('timesheet_weeks').insert({ company_id: COMPANY, project_id: projectId, week_start: '2030-03-03' }).select('id')))[0]!.id;
  await one(admin.from('timesheet_lines').insert({ company_id: COMPANY, week_id: weekId, worker_id: worker, day_units: [1, 1, 1, 1, 0, 0, 0], daily_wage: 500_000, allowance: 0, retail_purchase: 0 }).select('id'));
});
test.afterAll(cleanup);

for (const size of [{ name: '1440', width: 1440, height: 900 }, { name: '820', width: 820, height: 1000 }, { name: '390', width: 390, height: 844 }]) {
  test(`3 màn mở được ở ${size.name}px, không lỗi console, không kéo ngang`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const errors = watchConsole(page);
    await login(page, 'e2e.admin');
    for (const [path, shot, ready] of [['/thiet-bi', 'thiet-bi', '[data-testid="tb-add"]'], ['/ti-trong', 'ti-trong', size.width < 640 ? 'select[aria-label="Công trình"]' : '[data-testid="tyt-kpis"]'], ['/thung-rac', 'thung-rac', size.width < 640 ? '[data-testid="trash-count"]' : '[role="tablist"]']] as const) {
      await page.goto(path);
      await page.locator(ready).first().waitFor();
      expect(await noSideScroll(page), `${path} kéo ngang ở ${size.name}`).toBe(true);
      await page.screenshot({ path: `${SHOTS}/${shot}-${size.name}.png`, fullPage: true });
    }
    if (size.width >= 640) {
      await page.goto('/ti-trong');
      for (const [tab, shot] of [['ĐỊNH MỨC', 'dinh-muc'], ['CẤU HÌNH RỔ', 'cau-hinh-ro']] as const) {
        await page.getByRole('tab', { name: tab }).click();
        await page.waitForTimeout(200);
        expect(await noSideScroll(page)).toBe(true);
        await page.screenshot({ path: `${SHOTS}/${shot}-${size.name}.png`, fullPage: true });
      }
    }
    expect(errors).toEqual([]);
  });
}

test('Thiết bị: thêm vào kho, chuyển một phần sang công trình, tìm không dấu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.admin');
  await page.goto('/thiet-bi');
  await page.getByTestId('tb-add').click();
  await page.getByLabel('Nơi đặt thiết bị').selectOption('warehouse');
  await page.getByLabel('Tên thiết bị dòng 1').fill(TB);
  await page.getByLabel('Số lượng dòng 1').fill('5');
  await page.getByLabel('Thông tin máy dòng 1').fill('máy thử');
  await page.getByTestId('tb-save').click();
  await expect(page.getByText('Đã lưu 1 thiết bị')).toBeVisible();

  // tìm không dấu
  await page.getByPlaceholder(/Tìm tên thiết bị/).fill(`e2e gd08 may ${N}`);
  const stockRow = page.getByTestId('tb-stock').locator('tbody tr');
  await expect(stockRow).toHaveCount(1);
  await stockRow.click();
  await page.getByLabel('Nơi chuyển đến').selectOption({ label: CT });
  await page.getByLabel('Số lượng chuyển').fill('2');
  await page.getByTestId('tb-transfer-save').click();
  await expect(page.getByText(/Đã chuyển 2/)).toBeVisible();
  await expect(page.getByTestId('tb-site').locator('tbody tr', { hasText: TB })).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/thiet-bi-sau-chuyen-1440.png`, fullPage: true });

  const rows = await one(admin.from('equipment').select('location,project_id,quantity').eq('name_id', nameId).is('deleted_at', null));
  expect(rows.map((r: { location: string; quantity: number }) => `${r.location}:${Number(r.quantity)}`).sort()).toEqual(['project:2', 'warehouse:3']);

  // thêm lần nữa cùng nơi + tình trạng + thông tin máy → cộng dồn vào dòng cũ
  await page.getByTestId('tb-add').click();
  await page.getByLabel('Nơi đặt thiết bị').selectOption('warehouse');
  await page.getByLabel('Tên thiết bị dòng 1').fill(TB);
  await page.getByLabel('Số lượng dòng 1').fill('4');
  await page.getByLabel('Thông tin máy dòng 1').fill('Máy  Thử');
  await page.getByTestId('tb-save').click();
  await expect(page.getByText('Đã lưu 1 thiết bị')).toBeVisible();
  await expect.poll(async () => (await one(admin.from('equipment').select('quantity').eq('name_id', nameId).is('deleted_at', null))).map((r: { quantity: number }) => Number(r.quantity)).sort()).toEqual([2, 7]);
});

test('Tỉ trọng: tổng chi / m² / rổ của công trình, lưu làm định mức', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.admin');
  await openAlloc(page);
  // 5.000.000 hóa đơn Sắt Thép + 2.000.000 lương tuần (4 công × 500.000)
  await expect(page.getByTestId('tyt-total')).toHaveText('7.000.000');
  await expect(page.locator('[data-bucket="sat"]')).toContainText('50.000 đ/m²');
  await expect(page.locator('[data-bucket="nc"]')).toContainText('20.000 đ/m²');
  await expect(page.locator('[data-group-total="1"]')).toHaveText('7.000.000');
  await page.screenshot({ path: `${SHOTS}/ti-trong-cong-trinh-1440.png`, fullPage: true });

  // bấm ô Sắt Thép × Nhóm 1 → gán tay sang Nhóm 2
  await page.getByTestId('tyt-matrix').locator('tbody tr', { hasText: 'Sắt Thép' }).locator('td').nth(1).click();
  await page.getByLabel(/Chọn E2E GD08 sắt/).check();
  await page.getByLabel('Nhóm gán hàng loạt').selectOption('2');
  await page.getByTestId('tyt-bulk-assign').click();
  await expect(page.getByText('Đã gán 1 khoản vào Nhóm 2')).toBeVisible();
  await page.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await expect(page.locator('[data-group-total="2"]')).toHaveText('5.000.000');
  await expect(page.locator('[data-group-total="1"]')).toHaveText('2.000.000');

  await page.getByTestId('tyt-save-benchmark').click();
  await page.getByTestId('tyt-dm-save').click();
  await expect(page.getByText('Đã lưu định mức')).toBeVisible();
  await expect(page.getByTestId('tyt-benchmarks').locator('tbody tr', { hasText: CT })).toHaveCount(1);
  const dm = await one(admin.from('cost_allocations').select('data').eq('kind', 'benchmark').like('name', `%${CT}%`));
  const d = (dm[0] as { data: { dgTong: number; dgRo1: number; ro1: Record<string, number>; dgNhom: Record<string, number> } }).data;
  expect([d.dgTong, d.dgRo1, d.ro1.nc, d.dgNhom['2']]).toEqual([70_000, 20_000, 20_000, 50_000]);
});

test('Thùng rác: xóa hóa đơn + tuần chấm công → số giảm → khôi phục → số trở lại như trước', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.admin');
  // xóa mềm như app làm: tuần + dòng cùng 1 mốc giờ
  const ts = new Date().toISOString();
  await admin.from('expenses').update({ deleted_at: ts }).eq('id', expenseId);
  await admin.from('timesheet_lines').update({ deleted_at: ts }).eq('week_id', weekId);
  await admin.from('timesheet_weeks').update({ deleted_at: ts }).eq('id', weekId);
  await openAlloc(page);
  await expect(page.getByTestId('tyt-total')).toHaveText('0');

  await page.goto('/thung-rac');
  await page.getByPlaceholder(/Tìm nội dung/).fill(`E2E GD08 CT ${N}`);
  const table = page.getByTestId('trash-table');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr', { hasText: 'Tuần chấm công' })).toContainText('2.000.000');
  await page.screenshot({ path: `${SHOTS}/thung-rac-co-muc-1440.png`, fullPage: true });
  await table.locator('tbody tr', { hasText: 'Hóa đơn' }).getByTestId('trash-restore').click();
  await expect(page.getByText(/Đã khôi phục: Hóa đơn/)).toBeVisible();
  await table.locator('tbody tr', { hasText: 'Tuần chấm công' }).getByTestId('trash-restore').click();
  await expect(page.getByText(/Đã khôi phục: Tuần chấm công/)).toBeVisible();

  const lines = await one(admin.from('timesheet_lines').select('deleted_at').eq('week_id', weekId));
  expect(lines.every((l: { deleted_at: string | null }) => l.deleted_at === null)).toBe(true);
  await openAlloc(page);
  await expect(page.getByTestId('tyt-total')).toHaveText('7.000.000');
});

test('Thùng rác: Kế toán không có nút Xóa hẳn; Admin xóa vĩnh viễn được', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const eq = (await one(admin.from('equipment').insert({ company_id: COMPANY, name_id: nameId, location: 'scaffold', quantity: 9, condition: 'working', deleted_at: new Date().toISOString() }).select('id')))[0]!.id;
  await admin.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', expenseId);

  await login(page, 'e2e.kt');
  await page.goto('/thung-rac');
  await page.getByPlaceholder(/Tìm nội dung/).fill(`E2E GD08`);
  await expect(page.getByTestId('trash-table').locator('tbody tr', { hasText: 'Hóa đơn' })).toHaveCount(1);
  await expect(page.getByTestId('trash-purge')).toHaveCount(0);
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());

  await login(page, 'e2e.admin');
  await page.goto('/thung-rac');
  await page.getByRole('tab', { name: /KHÁC/ }).click();
  await page.getByPlaceholder(/Tìm nội dung/).fill(TB);
  const row = page.getByTestId('trash-table').locator('tbody tr', { hasText: TB }).filter({ hasText: '× 9' });
  await row.getByTestId('trash-purge').click();
  await page.getByRole('button', { name: 'Xóa vĩnh viễn', exact: true }).click();
  await expect(page.getByText('Đã xóa vĩnh viễn 1 mục')).toBeVisible();
  expect((await one(admin.from('equipment').select('id').eq('id', eq))).length).toBe(0);
  await admin.from('expenses').update({ deleted_at: null }).eq('id', expenseId);
});
