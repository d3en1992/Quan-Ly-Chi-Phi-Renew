// GĐ9 — Chụp đa năng (chế độ GIẢ LẬP, chưa có key Gemini) + TN02 Xuất Dữ Liệu.
// "Xong khi": 3 fixture (hóa đơn NCC mới, hóa đơn chữ mờ, CCCD) chạy hết luồng tới Lưu; xuất Excel đúng số; quyền dữ liệu cá nhân (403).
// Chạy trên Supabase trong máy; dữ liệu test tên bắt đầu "E2E GD09", dọn sau khi xong.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { localAdminClient, localSupabaseEnv } from '../scripts/local-supabase.mjs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD09';
mkdirSync(SHOTS, { recursive: true });
const admin = localAdminClient();
const COMPANY = '00000000-0000-0000-0000-000000000001';
const N = Date.now() % 100_000;
const CT = `E2E GD09 CT ${N}`;
const NEW_SUPPLIER = 'CH VLXD THANH BÌNH';
const AN_PHU = 'SẮT THÉP AN PHÚ';
let projectId = '';
let anPhuBefore: { address: string | null; phone: string | null } = { address: null, phone: null };

// Ảnh PNG 1×1 (giả lập không đọc nội dung ảnh)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function cleanup() {
  const projects = ((await admin.from('projects').select('id').like('name', 'E2E GD09%')).data ?? []).map((r: { id: string }) => r.id);
  if (projects.length) {
    const exps = ((await admin.from('expenses').select('id, receipt_image_path').in('project_id', projects)).data ?? []) as { id: string; receipt_image_path: string | null }[];
    const paths = exps.map((e) => e.receipt_image_path).filter((p): p is string => !!p);
    if (paths.length) await admin.storage.from('receipts').remove(paths);
    if (exps.length) {
      await admin.from('payment_allocations').delete().in('expense_id', exps.map((e) => e.id));
      await admin.from('expense_lines').delete().in('expense_id', exps.map((e) => e.id));
    }
    for (const t of ['expenses', 'main_contracts']) await admin.from(t).delete().in('project_id', projects);
    await admin.from('projects').delete().in('id', projects);
  }
  await admin.from('suppliers').delete().eq('name', NEW_SUPPLIER).eq('company_id', COMPANY);
  const workers = ((await admin.from('workers').select('id').like('name', 'E2E GD09%')).data ?? []).map((r: { id: string }) => r.id);
  if (workers.length) { await admin.from('contact_private').delete().in('worker_id', workers); await admin.from('workers').delete().in('id', workers); }
  const customers = ((await admin.from('customers').select('id').like('name', 'E2E GD09%')).data ?? []).map((r: { id: string }) => r.id);
  if (customers.length) { await admin.from('contact_private').delete().in('customer_id', customers); await admin.from('customers').delete().in('id', customers); }
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
async function pickImageAndRead(page: Page, opts: { kind?: string; note?: string } = {}) {
  await page.getByTestId('scan-file').setInputFiles({ name: 'anh.png', mimeType: 'image/png', buffer: PNG });
  if (opts.kind) await page.getByRole('radio', { name: opts.kind, exact: true }).click();
  if (opts.note) await page.getByLabel('Ghi chú cho AI').fill(opts.note);
  await page.getByTestId('scan-read').click();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await cleanup();
  const { data, error } = await admin.from('projects').insert({ company_id: COMPANY, name: CT, kind: 'new_build', status: 'active', address: '1 Lê Lợi, Q1' }).select('id');
  expect(error).toBeNull();
  projectId = data![0]!.id;
  const s = (await admin.from('suppliers').select('address, phone').eq('name', AN_PHU).maybeSingle()).data as typeof anPhuBefore | null;
  anPhuBefore = s ?? anPhuBefore;
});
test.afterAll(async () => {
  await cleanup();
  await admin.from('suppliers').update(anPhuBefore).eq('name', AN_PHU);
});

test('Chụp hóa đơn NCC mới (giả lập) → điền sẵn, ô vàng, tổng khớp, thêm NCC, lưu kèm ảnh', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = watchConsole(page);
  await login(page, 'e2e.admin');
  await page.goto('/nhap-chi-phi');
  await page.getByRole('tab', { name: 'CHỤP HÓA ĐƠN' }).click();
  await pickImageAndRead(page, { kind: 'Hóa đơn' });
  const form = page.getByTestId('scan-invoice');
  await expect(form).toBeVisible();
  await expect(page.getByText('giả lập').first()).toBeVisible();
  await expect(page.getByTestId('new-supplier')).toBeVisible();
  await expect(page.getByLabel('Tên NCC mới')).toHaveValue(NEW_SUPPLIER);
  await expect(page.getByTestId('printed-total')).toContainText('khớp');
  await expect(page.getByLabel('Tên vật tư dòng 4').locator('xpath=ancestor::td')).toHaveClass(/bg-warn-soft/);
  await page.getByLabel('Công trình', { exact: true }).fill(CT);
  await page.screenshot({ path: `${SHOTS}/1440-chup-hoa-don-ncc-moi.png`, fullPage: true });
  await page.getByTestId('scan-save').click();
  await expect(page.getByText(/Đã lưu hóa đơn 6 dòng · 8\.500\.000 đ · kèm ảnh/)).toBeVisible();
  const { data } = await admin.from('expenses').select('id, source, amount, receipt_image_path, supplier_id, paid_at_purchase').eq('project_id', projectId).is('deleted_at', null);
  expect(data).toHaveLength(1);
  expect(data![0]).toMatchObject({ source: 'scan', amount: 8_500_000, paid_at_purchase: true });
  expect(data![0]!.receipt_image_path).toMatch(new RegExp(`^${COMPANY}/2026/`));
  const sup = (await admin.from('suppliers').select('id, address, phone').eq('name', NEW_SUPPLIER).single()).data!;
  expect(sup).toMatchObject({ id: data![0]!.supplier_id, address: '128 Tỉnh lộ 8, Tân An Hội, Củ Chi', phone: '0908 123 456' });
  const img = await admin.storage.from('receipts').download(data![0]!.receipt_image_path!);
  expect(img.error).toBeNull();
  expect(errors).toEqual([]);
});

test('Chụp hóa đơn chữ mờ (giả lập) → tổng lệch, NCC Mua nợ bỏ tích Đã TT, bổ sung địa chỉ / SĐT', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.admin');
  await page.goto('/nhap-chi-phi');
  await page.getByRole('tab', { name: 'CHỤP HÓA ĐƠN' }).click();
  await pickImageAndRead(page, { kind: 'Hóa đơn', note: 'hóa đơn sắt chữ mờ' });
  await expect(page.getByTestId('printed-total')).toContainText('lệch');
  await expect(page.getByTestId('fill-supplier')).toContainText(AN_PHU);
  await expect(page.getByLabel('Ngày hóa đơn')).toHaveClass(/bg-warn-soft/);
  await page.getByLabel('Công trình', { exact: true }).fill(CT);
  await page.screenshot({ path: `${SHOTS}/1440-chup-hoa-don-chu-mo.png`, fullPage: true });
  await page.getByTestId('scan-save').click();
  await expect(page.getByText(/Đã lưu hóa đơn 4 dòng/)).toBeVisible();
  const e = (await admin.from('expenses').select('paid_at_purchase, amount').eq('project_id', projectId).eq('amount', 15_520_000).single()).data!;
  expect(e.paid_at_purchase).toBe(false);
  const s = (await admin.from('suppliers').select('address, phone').eq('name', AN_PHU).single()).data!;
  expect(s.address ?? '').not.toBe('');
});

test('Chụp CCCD ở Danh Bạ (giả lập) → tạo công nhân mới, chỉ lưu chữ', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.admin');
  await page.goto('/danh-ba');
  await page.getByRole('button', { name: 'Chụp CCCD / giấy tờ' }).click();
  await pickImageAndRead(page);
  const card = page.getByTestId('scan-idcard');
  await expect(card).toBeVisible();
  await expect(card.getByLabel('Số CCCD')).toHaveValue('079188000123');
  await expect(card.getByText('Khớp: trùng tên gọi').first()).toBeVisible();
  await card.getByText('Tạo công nhân mới').click();
  await card.getByLabel('Tên gọi trong danh bạ').fill(`E2E GD09 HIỀN ${N}`);
  await page.screenshot({ path: `${SHOTS}/1440-chup-cccd.png` });
  await page.getByTestId('idcard-save').click();
  await expect(page.getByText(/Đã thêm công nhân/)).toBeVisible();
  const w = (await admin.from('workers').select('id, full_name').eq('name', `E2E GD09 HIỀN ${N}`).single()).data!;
  expect(w.full_name).toBe('NGUYỄN THỊ HIỀN');
  const p = (await admin.from('contact_private').select('id_number, hometown, date_of_birth').eq('worker_id', w.id).single()).data!;
  expect(p).toMatchObject({ id_number: '079188000123', hometown: 'Bến Tre', date_of_birth: '1988-04-12' });
  // Không có ảnh CCCD nào trong kho
  const list = await admin.storage.from('receipts').list(COMPANY, { limit: 100 });
  expect((list.data ?? []).every((f) => !/cccd/i.test(f.name))).toBe(true);
});

test('Điện thoại 390: nút Chụp → hợp đồng (giả lập) → khách hàng + HĐ chính', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = watchConsole(page);
  await login(page, 'e2e.admin');
  await page.goto('/tong-quan');
  await page.getByRole('button', { name: 'Chụp hóa đơn, CCCD' }).click();
  await expect(page.getByTestId('capture-form')).toBeVisible();
  await page.getByTestId('scan-file').setInputFiles({ name: 'anh.png', mimeType: 'image/png', buffer: PNG });
  await page.screenshot({ path: `${SHOTS}/390-chup-menu.png`, fullPage: true });
  await page.getByRole('radio', { name: 'Hợp đồng', exact: true }).click();
  await page.getByTestId('scan-read').click();
  const f = page.getByTestId('scan-contract');
  await expect(f).toBeVisible();
  await f.getByLabel('Tên gọi khách hàng').fill(`E2E GD09 KH ${N}`);
  await f.getByLabel('Công trình', { exact: true }).fill(CT);
  await page.keyboard.press('Escape');
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/390-chup-hop-dong.png`, fullPage: true });
  await page.getByTestId('contract-save').click();
  await expect(page.getByText(/Đã lưu hợp đồng chính/)).toBeVisible();
  const c = (await admin.from('main_contracts').select('value, customer_name').eq('project_id', projectId).single()).data!;
  expect(c.value).toBe(1_850_000_000);
  expect((await admin.from('customers').select('id').eq('name', `E2E GD09 KH ${N}`)).data).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('Xuất Dữ Liệu: 2 công trình → đếm đúng, nhóm C ít hơn danh bạ, file Excel đúng số dòng', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = watchConsole(page);
  await login(page, 'e2e.admin');
  await page.goto('/xuat-du-lieu');
  await expect(page.getByTestId('export-page')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('radio', { name: /^Đang chọn/ }).check();
  await page.getByLabel('Tìm công trình').fill('co sau');
  await page.getByTestId('project-pick').getByText('CT Cô Sáu (42 CVT, TB)').click();
  await page.getByLabel('Tìm công trình').fill('nha tinh');
  await page.getByTestId('project-pick').getByText('CT Nhà Tình (925 Âu Cơ, TP)').click();
  const count = async (k: string) => Number((await page.locator(`[data-count="${k}"]`).innerText()).replace(/\./g, ''));
  await expect.poll(() => count('expenses')).toBe(410);
  // Nhóm C: công nhân theo công trình < cả danh bạ
  await page.getByText('Danh mục & danh bạ').click();
  const allWorkers = (await admin.from('workers').select('id', { count: 'exact', head: true }).is('deleted_at', null)).count!;
  const byCt = await count('workers');
  expect(byCt).toBeGreaterThan(0);
  expect(byCt).toBeLessThan(allWorkers);
  await page.getByRole('radio', { name: 'Lấy tất cả' }).check();
  await expect.poll(() => count('workers')).toBe(allWorkers);
  await page.getByRole('radio', { name: 'Lọc theo công trình' }).check();
  await page.getByLabel('Công nhân', { exact: true }).check();
  await page.getByLabel('Dòng vật tư', { exact: true }).check();
  await page.screenshot({ path: `${SHOTS}/1440-xuat-du-lieu.png`, fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()]);
  expect(dl.suggestedFilename()).toMatch(/^DuLieu_\d{4}-\d{2}-\d{2}_\d{4}\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync((await dl.path())!) as unknown as ArrayBuffer);
  expect(wb.worksheets.map((w) => w.name)).toEqual(['TONG HOP', 'CT Cô Sáu', 'CT Nhà Tình']);
  const tong = wb.getWorksheet('TONG HOP')!;
  let workerBlock = false;
  tong.eachRow((r) => { if (String(r.getCell(1).value ?? '').includes('CÔNG NHÂN')) workerBlock = true; });
  expect(workerBlock).toBe(true);
  await expect(page.getByText(/Đã xuất .* dòng → DuLieu_/)).toBeVisible();
  // Lịch sử xuất
  await page.getByRole('button', { name: 'Đã xuất gần đây' }).click();
  await expect(page.getByTestId('export-history')).toContainText('Hóa đơn chi phí');
  expect(errors).toEqual([]);
});

test('Dữ liệu cá nhân: Kế toán không thấy ô tick, gọi thẳng hàm kho → 403; Admin xuất được và có nhật ký', async ({ page }) => {
  await login(page, 'e2e.kt');
  await page.goto('/xuat-du-lieu');
  await expect(page.getByTestId('private-locked')).toBeVisible({ timeout: 30_000 });
  const { url, anonKey } = localSupabaseEnv();
  const kt = createClient(url, anonKey, { auth: { persistSession: false } });
  await kt.auth.signInWithPassword({ email: 'e2e.kt@nguyenhuu.qlcp', password: E2E_PASSWORD });
  const r = await kt.rpc('export_contact_private', { note: {} });
  expect(r.status).toBe(403);
  expect(r.error?.code).toBe('42501');
  const ad = createClient(url, anonKey, { auth: { persistSession: false } });
  await ad.auth.signInWithPassword({ email: 'e2e.admin@nguyenhuu.qlcp', password: E2E_PASSWORD });
  const before = (await admin.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'export_private')).count ?? 0;
  const ok = await ad.rpc('export_contact_private', { note: { test: 'e2e' } });
  expect(ok.error).toBeNull();
  const after = (await admin.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'export_private')).count ?? 0;
  expect(after).toBe(before + 1);
  await admin.from('audit_log').delete().eq('action', 'export_private').contains('detail', { test: 'e2e' });
});

test('Các tab con không còn nút "Xuất dữ liệu" (13/11/2026: chỉ xuất ở tab Xuất Dữ Liệu)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.admin');
  for (const path of ['/thong-ke-cp-hd', '/cong-no', '/danh-ba', '/chi-tra']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.getByRole('button', { name: 'Xuất dữ liệu' })).toHaveCount(0);
  }
});

for (const size of [{ name: '1440', width: 1440, height: 900 }, { name: '820', width: 820, height: 1000 }, { name: '390', width: 390, height: 844 }]) {
  test(`Xuất Dữ Liệu + Chụp hóa đơn mở được ở ${size.name}px, không lỗi console, không kéo ngang`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const errors = watchConsole(page);
    await login(page, 'e2e.admin');
    await page.goto('/xuat-du-lieu');
    await expect(page.getByTestId('export-datasets')).toBeVisible({ timeout: 30_000 });
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/${size.name}-xuat-du-lieu.png`, fullPage: true });
    await page.goto(size.width < 640 ? '/chup' : '/nhap-chi-phi');
    if (size.width >= 640) await page.getByRole('tab', { name: 'CHỤP HÓA ĐƠN' }).click();
    await expect(page.getByTestId('capture-form')).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/${size.name}-chup.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
