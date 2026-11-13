// GĐ5 — Nhập Chi Phí: lưới nhập nhanh (gõ bằng bàn phím, dán vùng Excel), hóa đơn chi tiết, sửa / xóa, điện thoại,
// và Lợi Nhuận đổi đúng (A tăng khi Đã TT, không tăng khi mua nợ). Chạy trên Supabase trong máy; dọn dữ liệu test sau khi xong.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { localAdminClient } from '../scripts/local-supabase.mjs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD05';
mkdirSync(SHOTS, { recursive: true });
const admin = localAdminClient();
const TAG = `E2E GD05 ${Date.now() % 1_000_000}`;

type Names = { type: string; project: string; buyer: string; supplier: string; creditSupplier: string };
let names: Names;

/** Xóa hẳn hóa đơn do tài khoản test tạo (chỉ dữ liệu test trên máy) để số báo cáo trở về như cũ */
async function cleanup() {
  const { data: users } = await admin.from('profiles').select('id').like('username', 'e2e.%');
  const ids = (users ?? []).map((u: { id: string }) => u.id);
  if (ids.length) await admin.from('expenses').delete().in('created_by', ids).like('description', 'E2E GD05%');
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
const money = async (page: Page, testId: string) => Number((await page.getByTestId(testId).innerText()).replace(/\D/g, ''));
const todayVn = () => { const d = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`; };
async function totalSpent(page: Page) {
  await page.goto('/loi-nhuan');
  await expect(page.getByTestId('profit-table')).toBeVisible();
  return money(page, 'total-spent');
}
async function openEntry(page: Page) {
  await page.goto('/nhap-chi-phi');
  await expect(page.getByTestId('quick-grid')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await cleanup();
  const one = async (table: string, filter: (q: any) => any) => {
    const { data, error } = await filter(admin.from(table).select('name').is('deleted_at', null)).order('name').limit(1);
    expect(error, table).toBeNull();
    expect(data?.length, `cần có dữ liệu ${table} — chạy "npm run migrate:legacy"`).toBe(1);
    return (data![0] as { name: string }).name;
  };
  names = {
    type: await one('catalog_items', (q) => q.eq('kind', 'expense_type').eq('archived', false)),
    buyer: await one('catalog_items', (q) => q.eq('kind', 'person').eq('archived', false)),
    project: await one('projects', (q) => q.eq('is_company_overhead', false).neq('status', 'closed')),
    supplier: await one('suppliers', (q) => q.eq('buys_on_credit', false).eq('archived', false)),
    creditSupplier: await one('suppliers', (q) => q.eq('buys_on_credit', true).eq('archived', false)),
  };
});
test.afterAll(cleanup);

for (const size of [{ name: '1440', width: 1440, height: 900 }, { name: '800', width: 800, height: 1000 }, { name: '390', width: 390, height: 844 }]) {
  test(`Nhập Chi Phí ở ${size.name}px: mở được, không lỗi, không kéo ngang`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width: size.width, height: size.height });
    await login(page, 'e2e.kt');
    await page.goto('/nhap-chi-phi');
    if (size.width < 640) {
      await expect(page.getByTestId('phone-save')).toBeVisible();
    } else {
      await expect(page.getByTestId('quick-grid')).toBeVisible();
      await expect(page.getByText('Người TH:')).toHaveCount(0); // 13/11: bỏ hẳn Người TH khỏi giao diện
      expect(await noSideScroll(page)).toBe(true);
      await page.screenshot({ path: `${SHOTS}/nhap-nhanh-${size.name}.png`, fullPage: true });
      await page.getByRole('tab', { name: 'HÓA ĐƠN CHI TIẾT' }).click();
      await expect(page.getByTestId('invoice-lines')).toBeVisible();
    }
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/${size.width < 640 ? 'nhap-tay' : 'hoa-don-chi-tiet'}-${size.name}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('Gõ 5 dòng chỉ bằng bàn phím → Ctrl+S → đúng số dòng, tổng tiền; Lợi Nhuận chỉ tăng phần Đã TT', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.kt');
  // Kế toán không xem được Lợi Nhuận → đọc số bằng Admin ở trang khác
  const adminPage = await page.context().browser()!.newPage();
  await login(adminPage, 'e2e.admin');
  const before = await totalSpent(adminPage);

  await openEntry(page);
  const amounts = [5_350_000, 15_554_000, 120_000, 999_000, 2_000_000];
  await page.locator('[data-r="0"][data-c="0"]').focus();
  const kb = page.keyboard;
  for (let i = 0; i < 5; i++) {
    await kb.press('Tab');                                        // Ngày: để trống = hôm nay
    await kb.type(names.type); await kb.press('Tab');             // Loại chi phí (gợi ý tự tô sáng, Tab để điền)
    await kb.type(names.project.toLowerCase()); await kb.press('Tab');
    await kb.type(String(amounts[i])); await kb.press('Tab');
    await kb.type(`${TAG} dòng ${i + 1}`); await kb.press('Tab');
    await kb.type(names.buyer); await kb.press('Tab');
    if (i === 1) await kb.type(names.creditSupplier);             // NCC mua nợ → tự bỏ tích Đã TT
    await kb.press('Tab');
    if (i === 3) await kb.press('Space');                         // Space bật / tắt Đã TT
    await kb.press('Tab');                                        // sang dòng kế
  }
  // Ô tiền tự thêm dấu chấm; NCC mua nợ tự bỏ tích; Space bỏ tích dòng 4
  await expect(page.locator('[data-r="0"][data-c="3"]')).toHaveValue('5.350.000');
  await expect(page.locator('[data-r="0"][data-c="2"]')).toHaveValue(names.project);
  await expect(page.getByRole('checkbox', { name: 'Đã TT dòng 1', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('checkbox', { name: 'Đã TT dòng 2', exact: true })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('checkbox', { name: 'Đã TT dòng 4', exact: true })).toHaveAttribute('aria-checked', 'false');
  const sum = amounts.reduce((a, b) => a + b, 0);
  await expect(page.getByTestId('grid-count')).toHaveText('5');
  expect(await money(page, 'grid-total')).toBe(sum);
  await page.screenshot({ path: `${SHOTS}/nhap-nhanh-5-dong.png`, fullPage: true });

  await kb.press('Control+s');
  await expect(page.getByText('Đã lưu 5 hóa đơn')).toBeVisible();
  await expect(page.getByTestId('day-date')).toHaveText(todayVn());
  await expect(page.getByTestId('day-count')).toHaveText('5');
  expect(await money(page, 'day-total')).toBe(sum);
  await expect(page.getByTestId('grid-count')).toHaveText('0');

  // Lợi Nhuận: tổng đã chi chỉ tăng đúng phần Đã TT (dòng 2 mua nợ và dòng 4 bỏ tích không tính)
  const paidSum = amounts[0]! + amounts[2]! + amounts[4]!;
  const after = await totalSpent(adminPage);
  expect(Math.abs(after - before - paidSum)).toBeLessThanOrEqual(100);
  await adminPage.close();
  expect(errors).toEqual([]);
});

test('Dán 20 dòng × 7 cột từ chuỗi TSV → lưu → đúng số dòng và tổng tiền; lưu lại thì cảnh báo trùng', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.kt');
  await openEntry(page);
  const dayBefore = (await page.getByTestId('day-count').count()) ? Number(await page.getByTestId('day-count').innerText()) : 0;
  const totalBefore = dayBefore ? await money(page, 'day-total') : 0;
  const rows = Array.from({ length: 20 }, (_, i) => [
    i === 0 ? todayVn() : '', names.type.toLowerCase(), names.project, `${(i + 1) * 111}.500`, `${TAG} dán ${i + 1}`, names.buyer, i % 4 === 3 ? names.creditSupplier : names.supplier,
  ]);
  const tsv = rows.map((r) => r.join('\t')).join('\r\n');
  const paste = async () => {
    await page.locator('[data-r="0"][data-c="0"]').focus();
    await page.evaluate((text) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, tsv);
  };
  await paste();
  const sum = rows.reduce((a, _r, i) => a + ((i + 1) * 111_000 + 500), 0);
  await expect(page.getByTestId('grid-count')).toHaveText('20');
  expect(await money(page, 'grid-total')).toBe(sum);
  await expect(page.locator('[data-r="19"][data-c="1"]')).toHaveValue(names.type);
  await expect(page.getByRole('checkbox', { name: 'Đã TT dòng 4', exact: true })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('checkbox', { name: 'Đã TT dòng 5', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: `${SHOTS}/nhap-nhanh-dan-20-dong.png`, fullPage: true });
  await page.getByTestId('grid-save').click();
  await expect(page.getByText('Đã lưu 20 hóa đơn')).toBeVisible();
  await expect(page.getByTestId('day-count')).toHaveText(String(dayBefore + 20));
  expect(await money(page, 'day-total')).toBe(totalBefore + sum);
  const { count } = await admin.from('expenses').select('id', { count: 'exact', head: true }).like('description', `${TAG} dán %`).eq('paid_at_purchase', false);
  expect(count).toBe(5);

  // Dán lại đúng 20 dòng đó → hộp cảnh báo trùng; Hủy thì không lưu
  await paste();
  await page.getByTestId('grid-save').click();
  await expect(page.getByTestId('dup-list')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/canh-bao-trung.png` });
  await page.getByRole('button', { name: 'Hủy' }).click();
  await expect(page.getByTestId('day-count')).toHaveText(String(dayBefore + 20));
});

test('Hóa đơn chi tiết: lưu 2 dòng vật tư → bấm dòng trong ngày để sửa → xóa', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.kt');
  await openEntry(page);
  await page.getByRole('tab', { name: 'HÓA ĐƠN CHI TIẾT' }).click();
  await page.getByLabel('Công trình', { exact: true }).fill(names.project);
  await page.getByLabel('Loại chi phí', { exact: true }).fill(names.type);
  await page.getByLabel('Nhà cung cấp', { exact: true }).fill(names.creditSupplier);
  await expect(page.getByLabel('Số HĐ')).toHaveCount(0); // 13/11/2026: bỏ ô Số HĐ
  await expect(page.getByLabel('Đã thanh toán lúc mua')).not.toBeChecked();   // NCC mua nợ → tự bỏ tích
  await page.getByLabel('Nội dung', { exact: true }).fill(`${TAG} chi tiết`);
  await page.getByLabel('Tên vật tư dòng 1').fill('Ván ép coffa 20 x 4');
  await page.getByLabel('ĐVT dòng 1').fill('tấm');
  await page.getByLabel('Số lượng dòng 1').fill('10');
  await page.getByLabel('Đơn giá dòng 1').fill('140000');
  await page.getByLabel('Tên vật tư dòng 2').fill('Vận chuyển');
  await page.getByLabel('Đơn giá dòng 2').fill('100000');
  await page.getByLabel('Nội dung', { exact: true }).focus();
  expect(await money(page, 'invoice-total')).toBe(1_500_000);
  // Nội dung nằm DƯỚI bảng vật tư; Copy bảng → thêm dòng 3 → Dán bảng (hỏi ghi đè) → còn đúng 2 dòng đã copy
  const tblBox = (await page.getByTestId('invoice-lines').boundingBox())!;
  expect((await page.getByLabel('Nội dung', { exact: true }).boundingBox())!.y).toBeGreaterThan(tblBox.y + tblBox.height);
  await page.getByTestId('lines-copy').click();
  await page.getByLabel('Tên vật tư dòng 3').fill('Dòng tạm');
  await page.getByTestId('lines-paste').click();
  await page.getByRole('dialog', { name: 'Ghi đè dòng vật tư?' }).getByRole('button', { name: 'Ghi đè' }).click();
  await expect(page.getByLabel('Tên vật tư dòng 3')).toHaveCount(0);
  await expect(page.getByLabel('Tên vật tư dòng 2')).toHaveValue('Vận chuyển');
  expect(await money(page, 'invoice-total')).toBe(1_500_000);
  await page.screenshot({ path: `${SHOTS}/hoa-don-chi-tiet-da-nhap.png`, fullPage: true });
  await page.getByTestId('detail-save').click();
  await expect(page.getByText('Đã lưu hóa đơn 2 dòng')).toBeVisible();

  const row = page.getByTestId('day-table').locator('tbody tr', { hasText: `${TAG} chi tiết` });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Mua nợ');
  await expect(row).toContainText('1.500.000');
  await row.click();
  const sheet = page.getByRole('dialog', { name: 'Sửa hóa đơn' });
  await expect(sheet.getByLabel('Tên vật tư dòng 1')).toHaveValue('Ván ép coffa 20 x 4');
  await expect(sheet.getByLabel('Số lượng dòng 1')).toHaveValue('10');
  await sheet.getByLabel('Đơn giá dòng 2').fill('200000');
  await page.screenshot({ path: `${SHOTS}/sua-hoa-don.png` });
  await sheet.getByTestId('edit-save').click();
  await expect(page.getByText('Đã lưu hóa đơn ·')).toBeVisible();
  await expect(row).toContainText('1.600.000');

  await row.click();
  await sheet.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.getByRole('dialog', { name: 'Xóa hóa đơn này?' }).getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(page.getByText('Đã xóa hóa đơn')).toBeVisible();
  await expect(row).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Điện thoại: Nhập tay một khoản chi → hiện trong danh sách ngày', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'e2e.kt');
  await page.goto('/nhap-chi-phi');
  await expect(page.getByTestId('phone-save')).toBeVisible();
  await page.getByLabel('Số tiền').fill('5350000');
  await expect(page.getByLabel('Số tiền')).toHaveValue('5.350.000');
  await page.getByRole('button', { name: 'Khác…' }).click();
  await page.getByLabel('Loại chi phí khác').fill(names.type);
  await page.getByLabel('Công trình').fill(names.project);
  await page.getByLabel('Nội dung').fill(`${TAG} điện thoại`);
  await page.getByLabel('Nhà cung cấp').fill(names.creditSupplier);
  await page.getByLabel('Nội dung').focus();
  await expect(page.getByLabel('Đã thanh toán lúc mua')).not.toBeChecked();
  await page.getByLabel('Đã thanh toán lúc mua').check();
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/nhap-tay-da-nhap-390.png`, fullPage: true });
  await page.getByTestId('phone-save').click();
  await expect(page.getByText('Đã lưu chi phí')).toBeVisible();
  await expect(page.getByRole('button').filter({ hasText: `${TAG} điện thoại` })).toHaveCount(1);
  const { data } = await admin.from('expenses').select('amount,paid_at_purchase,source').eq('description', `${TAG} điện thoại`);
  expect(data).toEqual([{ amount: 5350000, paid_at_purchase: true, source: 'quick' }]);
  expect(errors).toEqual([]);
});

test('Thống Kê CP/HĐ: lọc Thanh toán / Nguồn, mở dòng → Sửa hóa đơn', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.kt');
  await page.goto('/thong-ke-cp-hd');
  await expect(page.getByTestId('expense-table')).toBeVisible();
  await page.getByTestId('stats-adv').click(); // Thanh toán, Nguồn nằm trong Lọc nâng cao
  await page.getByLabel('Thanh toán').selectOption('credit');
  await page.getByLabel('Nguồn').selectOption('quick');
  await page.getByPlaceholder('Tìm nội dung…').fill(`${TAG} dòng 2`);
  const rows = page.getByTestId('expense-table').locator('tbody tr', { hasText: `${TAG} dòng 2` });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Mua nợ');
  await page.screenshot({ path: `${SHOTS}/thong-ke-loc.png`, fullPage: true });
  await rows.first().click();
  await page.getByTestId('stats-edit').click();
  const sheet = page.getByRole('dialog', { name: 'Sửa hóa đơn' });
  await expect(sheet.getByLabel('Số tiền')).toHaveValue('15.554.000');
  await sheet.getByLabel('Đã thanh toán lúc mua').check();
  await sheet.getByTestId('edit-save').click();
  await expect(page.getByText('Đã lưu hóa đơn ·')).toBeVisible();
  await expect(rows).toHaveCount(0);   // đã thành Đã trả nên không còn trong bộ lọc Mua nợ
});
