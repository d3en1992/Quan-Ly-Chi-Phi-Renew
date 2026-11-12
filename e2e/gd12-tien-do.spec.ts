// GĐ12 — Tiến Độ Thi Công, Phần 1.
// "Xong khi": lập tiến độ cho 1 công trình từ mẫu, sửa %, Gantt cập nhật. Thêm: báo cáo Zalo, dòng tiến độ ở Chi tiết CT,
// xóa kế hoạch → Thùng rác chỉ hiện 1 dòng → khôi phục về đủ, 3 khổ màn.
// Chạy trên Supabase trong máy; công trình test tên "E2E GD12 …", dọn sau khi xong.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { localAdminClient } from '../scripts/local-supabase.mjs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD12';
mkdirSync(SHOTS, { recursive: true });
const admin = localAdminClient();
const COMPANY = '00000000-0000-0000-0000-000000000001';
const N = Date.now() % 100_000;
const CT = `E2E GD12 CT ${N}`;
let projectId = '';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

async function cleanup() {
  const projects = ((await admin.from('projects').select('id').like('name', 'E2E GD12%')).data ?? []).map((r: { id: string }) => r.id);
  if (!projects.length) return;
  for (const t of ['schedule_notes', 'schedule_tasks', 'schedule_phases', 'schedule_plans']) await admin.from(t).delete().in('project_id', projects);
  await admin.from('projects').delete().in('id', projects);
}
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
/** Bề rộng phần đã làm của thanh việc (% so với thanh) */
const barFill = (page: Page, name: string) => page.getByTestId('td-gantt').locator(`.gbar[title^="${name} ·"] i`).evaluate((el) => (el as HTMLElement).style.width);

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  await cleanup();
  const { data, error } = await admin.from('projects').insert({ company_id: COMPANY, name: CT, kind: 'new_build', status: 'active', start_date: daysAgo(20) }).select('id');
  expect(error).toBeNull();
  projectId = data![0]!.id;
});
test.afterAll(cleanup);

test('Lập tiến độ từ mẫu Xây mới, sửa %, Gantt + số tổng cập nhật', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = watchConsole(page);
  await login(page, 'e2e.admin');
  await page.goto(`/tien-do?project=${projectId}`);

  // Màn lập: mẫu gợi ý theo loại công trình (CT → Xây mới), khởi công 20 ngày trước → có việc đã quá hạn
  await expect(page.getByLabel('Mẫu giai đoạn')).toHaveValue('new_build');
  await page.getByLabel('Ngày khởi công').fill(daysAgo(20));
  await page.screenshot({ path: `${SHOTS}/lap-tien-do-1440.png`, fullPage: true });
  await page.getByTestId('td-create').click();
  await expect(page.getByText('Đã lập kế hoạch tiến độ')).toBeVisible();

  const gantt = page.getByTestId('td-gantt');
  await expect(gantt.getByTestId('td-row')).toHaveCount(23); // 5 giai đoạn, 23 việc + mốc
  await expect(page.getByTestId('td-kpi-pct')).toHaveText('0%');
  await expect(page.getByTestId('td-today')).toBeVisible();
  const lateBars = await gantt.locator('.gbar.late, .gmile.late').count();
  expect(lateBars).toBeGreaterThan(0); // quá ngày kết thúc mà 0% → tô đỏ

  const plan = (await admin.from('schedule_plans').select('id,rest_days,template_key').eq('project_id', projectId).is('deleted_at', null)).data ?? [];
  expect(plan).toHaveLength(1);
  expect(plan[0]).toMatchObject({ rest_days: 'sun', template_key: 'new_build' });

  // Sửa % ngay trên bảng: việc đầu 100% → thanh xanh lá đầy, hết trễ, số tổng tăng
  await page.getByLabel('% xong Dọn mặt bằng, định vị').selectOption('100');
  await expect.poll(() => barFill(page, 'Dọn mặt bằng, định vị')).toBe('100%');
  await expect(gantt.locator('.gbar.done')).toHaveCount(1);
  await expect(page.getByTestId('td-kpi-pct')).not.toHaveText('0%');
  expect(await gantt.locator('.gbar.late, .gmile.late').count()).toBe(lateBars - 1);

  // Chi tiết việc: bấm 50% + ghi chú → nhật ký có dòng 50%
  await gantt.getByRole('button', { name: /^Ép \/ khoan cọc/ }).click();
  await page.getByRole('button', { name: '50%', exact: true }).click();
  await page.getByLabel('Ghi chú lần cập nhật').fill('xong nửa số cọc');
  await page.getByRole('combobox', { name: 'Người phụ trách' }).fill('Đội cọc Hùng');
  await page.getByTestId('td-task-save').click();
  await expect(page.getByText('Đã lưu việc')).toBeVisible();
  await expect.poll(() => barFill(page, 'Ép / khoan cọc')).toBe('50%');
  await expect(gantt.getByTestId('td-row').filter({ hasText: 'Ép / khoan cọc' })).toContainText('Đội cọc Hùng');
  const task = (await admin.from('schedule_tasks').select('id,progress_pct,status').eq('project_id', projectId).eq('name', 'Ép / khoan cọc')).data![0]!;
  expect(task).toMatchObject({ progress_pct: 50, status: 'doing' });
  const notes = (await admin.from('schedule_notes').select('progress_pct,content').eq('task_id', task.id)).data ?? [];
  expect(notes).toEqual([{ progress_pct: 50, content: 'xong nửa số cọc' }]);

  // Thêm việc nhanh cuối giai đoạn "Bàn giao"
  await page.getByLabel('Thêm việc vào Bàn giao').fill('Lắp camera');
  await page.getByLabel('Thêm việc vào Bàn giao').press('Enter');
  await expect(gantt.getByTestId('td-row')).toHaveCount(24);
  await page.screenshot({ path: `${SHOTS}/tien-do-1440.png`, fullPage: true });

  // Lọc "Trễ" chỉ còn việc trễ
  await page.getByRole('button', { name: /^Trễ \d+/ }).click();
  const lateRows = await gantt.getByTestId('td-row').count();
  expect(lateRows).toBeGreaterThan(0);
  expect(lateRows).toBeLessThan(24);
  await page.getByRole('button', { name: /^Tất cả \d+/ }).click();

  // Báo cáo Zalo
  await page.getByTestId('td-zalo').click();
  const text = await page.getByTestId('td-zalo-text').inputValue();
  expect(text).toContain(`BÁO CÁO TIẾN ĐỘ — ${CT}`);
  expect(text).toContain('Việc trễ');
  expect(text).toContain('- Ép / khoan cọc: 50%');
  await page.screenshot({ path: `${SHOTS}/bao-cao-zalo-1440.png` });
  await page.getByRole('button', { name: 'Đóng', exact: true }).first().click();

  // Chi tiết công trình: 1 dòng "Tiến độ x% · trễ n việc"
  await page.goto(`/cong-trinh/${projectId}`);
  await expect(page.getByTestId('ct-schedule-line')).toContainText(/Tiến độ \d+% · trễ \d+ việc/);
  await page.screenshot({ path: `${SHOTS}/chi-tiet-ct-1440.png` });
  expect(errors).toEqual([]);
});

for (const size of [{ name: '1440', width: 1440, height: 900 }, { name: '820', width: 820, height: 1000 }, { name: '390', width: 390, height: 844 }]) {
  test(`Tiến Độ mở được ở ${size.name}px, không lỗi console, không kéo ngang`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const errors = watchConsole(page);
    await login(page, 'e2e.admin');
    await page.goto(`/tien-do?project=${projectId}`);
    await expect(page.getByTestId('td-kpi-pct')).toBeVisible();
    if (size.width < 640) {
      // MP.tiendo: thẻ việc, bấm thẻ mở chi tiết, nút THÊM VIỆC
      await expect(page.getByRole('button', { name: /THÊM VIỆC/ })).toBeVisible();
      await page.getByRole('button', { name: /Ép \/ khoan cọc/ }).click();
      await expect(page.getByTestId('td-pct')).toHaveText('50%');
      await page.screenshot({ path: `${SHOTS}/chi-tiet-viec-${size.name}.png` });
      await page.getByRole('button', { name: 'Hủy' }).click();
    } else {
      await expect(page.getByTestId('td-gantt')).toBeVisible();
    }
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/tien-do-${size.name}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('Chỉ xem: thấy tiến độ, không sửa được', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.cx');
  await page.goto(`/tien-do?project=${projectId}`);
  // tài khoản Chỉ xem có thể không được giao công trình test → thấy trang nhưng không có nút sửa
  await expect(page.getByText('Tính năng phụ: theo dõi kế hoạch thi công')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm việc' })).toHaveCount(0);
  await expect(page.locator('select[aria-label^="% xong"]')).toHaveCount(0);
});

test('Xóa kế hoạch → Thùng rác 1 dòng → khôi phục về đủ', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.admin');
  await page.goto(`/tien-do?project=${projectId}`);
  await page.getByRole('button', { name: 'Cài đặt tiến độ' }).click();
  await page.getByRole('button', { name: 'Xóa kế hoạch tiến độ' }).click();
  await page.getByRole('dialog', { name: 'Xóa kế hoạch tiến độ?' }).getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(page.getByText('Đã xóa kế hoạch tiến độ')).toBeVisible();
  await expect(page.getByTestId('td-create')).toBeVisible(); // về màn lập

  await page.goto('/thung-rac');
  await page.getByPlaceholder(/Tìm nội dung/).fill(CT);
  const table = page.getByTestId('trash-table');
  await expect(table.locator('tbody tr')).toHaveCount(1); // giai đoạn + việc đi theo kế hoạch, không hiện riêng
  await expect(table.locator('tbody tr')).toContainText('Kế hoạch tiến độ');
  await table.locator('tbody tr').getByTestId('trash-restore').click();
  await expect(page.getByText(/Đã khôi phục/)).toBeVisible();

  await page.goto(`/tien-do?project=${projectId}`);
  await expect(page.getByTestId('td-gantt').getByTestId('td-row')).toHaveCount(24);
});
