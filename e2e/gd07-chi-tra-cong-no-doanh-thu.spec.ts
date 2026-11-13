// GĐ7 — Chi Trả TP/NCC, Công Nợ Phải Trả, Doanh Thu, Quyết Toán.
// Kịch bản "Xong khi": 1 phiếu trả NCC theo cục (ví dụ VLXD Phương, mục 4J), 1 phiếu thu, 1 quyết toán → Công Nợ, Lợi Nhuận đổi đúng.
// Chạy trên Supabase trong máy; dữ liệu test đặt năm 2030, tên bắt đầu "E2E GD07", dọn sau khi xong.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { localAdminClient } from '../scripts/local-supabase.mjs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD07';
mkdirSync(SHOTS, { recursive: true });
const admin = localAdminClient();
const COMPANY = '00000000-0000-0000-0000-000000000001';
const N = Date.now() % 100_000;
const NHUT = `E2E GD07 A NHỰT ${N}`, HUYNH = `E2E GD07 A HUYNH ${N}`, NCC = `E2E GD07 VLXD ${N}`, TP = `E2E GD07 TP ${N}`;
let nhutId = '', huynhId = '', nccId = '', tpId = '';
const inv: Record<string, string> = {};

const ids = async (table: string, col: string) => ((await admin.from(table).select('id').like(col, 'E2E GD07%')).data ?? []).map((r: { id: string }) => r.id);
async function cleanup() {
  const [projects, suppliers, subs] = await Promise.all([ids('projects', 'name'), ids('suppliers', 'name'), ids('subcontractors', 'name')]);
  if (suppliers.length) await admin.from('payments').delete().in('supplier_id', suppliers);
  if (subs.length) {
    await admin.from('payments').delete().in('subcontractor_id', subs);
    await admin.from('payable_closures').delete().in('subcontractor_id', subs);
    await admin.from('subcontracts').delete().in('subcontractor_id', subs);
  }
  if (projects.length) {
    for (const t of ['payments', 'receipts', 'settlements', 'main_contracts', 'subcontracts', 'expenses']) await admin.from(t).delete().in('project_id', projects);
    await admin.from('projects').delete().in('id', projects);
  }
  if (suppliers.length) await admin.from('suppliers').delete().in('id', suppliers);
  if (subs.length) await admin.from('subcontractors').delete().in('id', subs);
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
const one = async <T,>(q: PromiseLike<{ data: T[] | null; error: unknown }>) => { const { data, error } = await q; expect(error).toBeNull(); return data ?? []; };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await cleanup();
  const pj = await one(admin.from('projects').insert([
    { company_id: COMPANY, name: NHUT, kind: 'small_repair', status: 'active', owner_name: 'E2E CHỦ NHÀ' },
    { company_id: COMPANY, name: HUYNH, kind: 'small_repair', status: 'active' },
  ]).select('id,name'));
  nhutId = pj.find((p: { name: string }) => p.name === NHUT)!.id; huynhId = pj.find((p: { name: string }) => p.name === HUYNH)!.id;
  nccId = (await one(admin.from('suppliers').insert({ company_id: COMPANY, name: NCC, buys_on_credit: true }).select('id')))[0]!.id;
  tpId = (await one(admin.from('subcontractors').insert({ company_id: COMPANY, name: TP }).select('id')))[0]!.id;
  const type = (await one(admin.from('catalog_items').select('id').eq('kind', 'expense_type').is('deleted_at', null).limit(1)))[0]!.id;
  // Ví dụ mục 4J: A Nhựt 05/10 (20 tr) + 12/10 (30,037 tr); A Huynh 08/10 (30,11 tr) — đều mua nợ
  const base = { company_id: COMPANY, expense_type_id: type, supplier_id: nccId, paid_at_purchase: false, source: 'quick' };
  const ex = await one(admin.from('expenses').insert([
    { ...base, project_id: nhutId, date: '2030-10-05', amount: 20_000_000, description: 'n1' },
    { ...base, project_id: nhutId, date: '2030-10-12', amount: 30_037_000, description: 'n2' },
    { ...base, project_id: huynhId, date: '2030-10-08', amount: 30_110_000, description: 'h1' },
  ]).select('id,description'));
  for (const e of ex as { id: string; description: string }[]) inv[e.description] = e.id;
});
test.afterAll(cleanup);

for (const size of [{ name: '1440', width: 1440, height: 900 }, { name: '800', width: 800, height: 1000 }, { name: '390', width: 390, height: 844 }]) {
  test(`4 tab GĐ7 ở ${size.name}px: mở được, không lỗi, không kéo ngang`, async ({ page }) => {
    const errors = watchConsole(page);
    const phone = size.width < 640;
    await page.setViewportSize({ width: size.width, height: size.height });
    await login(page, 'e2e.gd');
    const shot = async (name: string) => { expect(await noSideScroll(page)).toBe(true); await page.screenshot({ path: `${SHOTS}/${name}-${size.name}.png`, fullPage: true }); };
    // Tab con của Thầu Phụ & NCC: cùng dải tab con ở mọi khổ (điện thoại hiện nhãn ngắn, tên đủ ở aria-label)
    const sub = (name: string) => page.getByRole('tab', { name, exact: true });

    await page.goto('/chi-tra');
    await expect(page.getByTestId('pay-summary')).toBeVisible();
    await shot('chi-tra');

    await page.goto('/cong-no');
    await expect(page.getByText('Tổng giá trị HĐ')).toBeVisible();
    await shot('cong-no-thau-phu');
    await sub('NHÀ CUNG CẤP').click();
    await expect(page.getByText('Còn nợ NCC')).toBeVisible();
    await shot('cong-no-ncc');
    await sub('TẤT TOÁN').click();
    await expect(page.getByText('Chờ tất toán')).toBeVisible();
    await shot('cong-no-tat-toan');

    await page.goto('/doanh-thu');
    await page.getByRole('tab', { name: 'HỢP ĐỒNG CHÍNH' }).click();
    await expect(page.getByText('Danh sách hợp đồng')).toBeVisible();
    await shot('doanh-thu-hop-dong');
    await page.getByRole('tab', { name: 'THU TIỀN' }).click();
    await expect(page.getByText(phone ? 'Phiếu thu gần đây' : 'Sổ thu tiền')).toBeVisible();
    await shot('doanh-thu-thu-tien');

    await page.goto('/quyet-toan');
    await expect(page.getByText(phone ? /lần quyết toán/ : 'Lịch sử quyết toán')).toBeVisible();
    await shot('quyet-toan');
    expect(errors).toEqual([]);
  });
}

test('Trả NCC theo cục 50 tr → chia vào hóa đơn cũ nhất trước; Công Nợ, Đối chiếu, Lợi Nhuận đổi đúng (mục 4J)', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.gd');
  await page.goto('/chi-tra');
  await page.getByRole('button', { name: 'Trả nợ NCC', exact: true }).click();
  await page.getByLabel('Ngày dòng 1').fill('2030-10-31');
  await page.getByRole('combobox', { name: 'Đối tác dòng 1' }).fill(NCC.toLowerCase());
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Đối tác dòng 1' })).toHaveValue(NCC);
  await expect(page.getByTestId('pay-grid-debt')).toContainText('80.147.000');
  await page.getByLabel('Số tiền dòng 1').fill('50000000');
  await page.getByLabel('Nội dung dòng 1').fill('Trả một cục');
  await page.screenshot({ path: `${SHOTS}/chi-tra-dang-nhap.png`, fullPage: true });
  await page.getByTestId('pay-grid-save').click();
  await expect(page.getByText(/Đã lưu 1 phiếu chi/)).toBeVisible();

  // Kho: phiếu không gắn công trình, chia 20 tr vào hóa đơn 05/10 (A Nhựt) + 30 tr vào hóa đơn 08/10 (A Huynh)
  const pays = await one(admin.from('payments').select('id,project_id,allocation_mode,amount').eq('supplier_id', nccId).is('deleted_at', null));
  expect(pays).toEqual([{ id: pays[0]!.id, project_id: null, allocation_mode: 'fifo', amount: 50_000_000 }]);
  const allocs = await one(admin.from('payment_allocations').select('expense_id,project_id,amount').eq('payment_id', pays[0]!.id).order('amount'));
  expect(allocs).toEqual([{ expense_id: inv.n1, project_id: nhutId, amount: 20_000_000 }, { expense_id: inv.h1, project_id: huynhId, amount: 30_000_000 }]);

  // Lịch sử phiếu chi
  await page.getByPlaceholder('Tìm thầu phụ, NCC…').fill(NCC);
  await expect(page.getByTestId('pay-history').getByRole('row', { name: new RegExp(NCC) })).toContainText('Theo cục · 2 công trình');

  // Công nợ NCC: còn 30.147.000; Đối chiếu từng hóa đơn
  await page.goto('/cong-no');
  await page.getByRole('tab', { name: 'NHÀ CUNG CẤP' }).click();
  await page.getByPlaceholder('Tìm nhà cung cấp…').fill(NCC);
  const row = page.getByTestId('ncc-table').getByRole('row', { name: new RegExp(NCC) });
  await expect(row).toContainText('80.147.000');
  await expect(row).toContainText('30.147.000');
  await expect(page.getByTestId('ncc-debt-total')).toHaveText('30.147.000');
  await row.getByRole('button', { name: 'Đối chiếu' }).click();
  await expect(page.getByTestId('dc-debt')).toHaveText('30.147.000');
  const dc = page.getByTestId('dc-table');
  await expect(dc.getByRole('row').nth(1)).toContainText('Đã trả');            // 05/10 trả hết
  await expect(dc.getByRole('row').nth(2)).toContainText('110.000');           // 08/10 còn thiếu 0,11 tr
  await expect(dc.getByRole('row').nth(3)).toContainText('30.037.000');        // 12/10 chưa trả
  await page.screenshot({ path: `${SHOTS}/doi-chieu-ncc.png`, fullPage: true });
  await page.keyboard.press('Escape');

  // Lợi Nhuận: A của A Nhựt = 20 tr, A Huynh = 30 tr (tiền thực chi, theo phần đã chia)
  await page.goto('/loi-nhuan');
  await expect(page.getByRole('row', { name: new RegExp(NHUT) })).toContainText('20.000.000');
  await expect(page.getByRole('row', { name: new RegExp(HUYNH) })).toContainText('30.000.000');

  // Xóa phiếu → dòng chia bị gỡ, nợ quay lại 80.147.000
  await page.goto('/chi-tra');
  await page.getByPlaceholder('Tìm thầu phụ, NCC…').fill(NCC);
  await page.getByTestId('pay-history').getByRole('row', { name: new RegExp(NCC) }).click();
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).last().getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(page.getByText('Đã xóa phiếu chi')).toBeVisible();
  expect(await one(admin.from('payment_allocations').select('amount').eq('payment_id', pays[0]!.id))).toEqual([]);

  // Trả riêng hóa đơn 12/10 bằng "Trả NCC theo hóa đơn…"
  await page.getByTestId('pay-add').click();
  await page.getByRole('combobox', { name: 'Nhà cung cấp' }).fill(NCC);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('pay-debt')).toContainText('80.147.000');
  await page.getByRole('row', { name: /30\.037\.000/ }).click();
  await expect(page.getByTestId('pay-picked')).toHaveText('30.037.000');
  await page.getByRole('button', { name: 'Lấy làm số tiền' }).click();
  await page.getByLabel('Ngày', { exact: true }).fill('2030-11-02');
  await page.getByTestId('pay-sheet-save').click();
  await expect(page.getByText(/Đã ghi phiếu chi 30\.037\.000/)).toBeVisible();
  const manual = await one(admin.from('payments').select('id,allocation_mode').eq('supplier_id', nccId).is('deleted_at', null));
  expect(manual.map((p: { allocation_mode: string }) => p.allocation_mode)).toEqual(['manual']);
  expect(await one(admin.from('payment_allocations').select('expense_id,amount').eq('payment_id', manual[0]!.id))).toEqual([{ expense_id: inv.n2, amount: 30_037_000 }]);
  expect(errors).toEqual([]);
});

test('HĐ thầu phụ: thêm, trả nhanh, Chi Trả hiện "còn phải trả", Tất toán tạo phiếu chi phần còn lại, Hoàn tác', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.gd');
  await page.goto('/cong-no');
  await page.getByLabel('Ngày hợp đồng').fill('2030-10-01');
  await page.getByRole('combobox', { name: 'Thầu phụ' }).fill(TP);
  await page.keyboard.press('Enter');
  await page.getByLabel('Công trình', { exact: true }).first().selectOption(nhutId);
  await page.getByLabel('Giá trị HĐ').fill('10000000');
  await page.getByLabel('Nội dung hợp đồng').fill('Nhân công sơn nước');
  await page.getByTestId('hdtp-save').click();
  await expect(page.getByText(/Đã thêm hợp đồng thầu phụ/)).toBeVisible();

  await page.getByPlaceholder('Tìm thầu phụ…').fill(TP);
  const row = page.getByTestId('hdtp-table').getByRole('row', { name: new RegExp(TP) });
  await expect(row).toContainText('10.000.000');
  await row.click();
  await page.getByLabel('Ngày trả').fill('2030-10-10');
  await page.getByLabel('Số tiền trả').fill('4000000');
  await page.getByTestId('hdtp-pay').click();
  await expect(page.getByText(/Đã ghi phiếu chi 4\.000\.000/)).toBeVisible();
  await expect(page.getByTestId('hdtp-debt-total')).toHaveText('6.000.000');
  await page.screenshot({ path: `${SHOTS}/hd-thau-phu-mo-dong.png`, fullPage: true });

  // Chi Trả: chọn thầu phụ + công trình → hiện còn phải trả 6.000.000
  await page.goto('/chi-tra');
  await page.getByRole('combobox', { name: 'Đối tác dòng 1' }).fill(TP);
  await page.keyboard.press('Enter');
  await page.getByLabel('Công trình dòng 1').selectOption(nhutId);
  await expect(page.getByTestId('pay-grid-debt')).toContainText('6.000.000');

  // Tất toán: tạo phiếu chi 6.000.000, rồi Hoàn tác
  await page.goto('/cong-no');
  await page.getByRole('tab', { name: 'TẤT TOÁN' }).click();
  await page.getByText('Hiện cả khoản còn nợ').click();
  await page.getByTestId('tt-waiting').getByRole('row', { name: new RegExp(TP) }).getByRole('button', { name: 'Tất toán' }).click();
  await page.getByLabel('Ngày phiếu chi').fill('2030-10-20');
  await page.getByTestId('tt-ok').click();
  await expect(page.getByText(/Đã tất toán/).first()).toBeVisible();
  await expect(page.getByTestId('tt-done').getByRole('row', { name: new RegExp(TP) })).toContainText('6.000.000');
  const auto = await one(admin.from('payments').select('amount,kind,closure_id').eq('subcontractor_id', tpId).not('closure_id', 'is', null).is('deleted_at', null));
  expect(auto).toHaveLength(1);
  expect(auto[0]).toMatchObject({ amount: 6_000_000, kind: 'progress' });
  await page.screenshot({ path: `${SHOTS}/tat-toan.png`, fullPage: true });

  await page.getByTestId('tt-undo').click();
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.getByText('Đã hoàn tác lần tất toán')).toBeVisible();
  expect(await one(admin.from('payments').select('id').eq('subcontractor_id', tpId).not('closure_id', 'is', null).is('deleted_at', null))).toEqual([]);
  expect(errors).toEqual([]);
});

test('HĐ chính + phiếu thu + quyết toán (chốt) → phiếu thu tự động, công trình Đã quyết toán, Lợi Nhuận đổi đúng', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'e2e.gd');

  // Hợp đồng chính 100 tr (lấy từ hạng mục: 10 m² × 10.000.000)
  await page.goto('/doanh-thu');
  await page.getByRole('tab', { name: 'HỢP ĐỒNG CHÍNH' }).click();
  await page.getByLabel('Công trình', { exact: true }).first().selectOption(nhutId);
  await expect(page.getByLabel('Chủ đầu tư')).toHaveValue('E2E CHỦ NHÀ');
  await page.getByLabel('Ngày hợp đồng').fill('2030-09-01');
  await page.getByRole('button', { name: 'Thêm dòng' }).click();
  await page.getByLabel('Hạng mục 1', { exact: true }).fill('Phần thô');
  await page.getByLabel('ĐVT 1', { exact: true }).fill('m²');
  await page.getByLabel('Khối lượng 1', { exact: true }).fill('10');
  await page.getByLabel('Đơn giá 1', { exact: true }).fill('10000000');
  await expect(page.getByTestId('items-total')).toHaveText('100.000.000');
  await page.getByRole('button', { name: 'Lấy tổng hạng mục làm Giá trị HĐ chính' }).click();
  await expect(page.getByTestId('hdc-total')).toHaveText('100.000.000');
  await page.getByTestId('hdc-save').click();
  await expect(page.getByText(/Đã lưu hợp đồng/)).toBeVisible();
  await expect(page.getByTestId('hdc-table').getByRole('row', { name: new RegExp(NHUT) })).toContainText('100.000.000');

  // Phiếu thu 30 tr → còn phải thu 70 tr
  await page.getByRole('tab', { name: 'THU TIỀN' }).click();
  await page.getByLabel('Công trình', { exact: true }).first().selectOption(nhutId);
  await page.getByLabel('Ngày thu').fill('2030-10-15');
  await page.getByLabel('Số tiền thu').fill('30000000');
  await page.getByLabel('Ghi chú').fill('Đợt 1');
  await expect(page.getByTestId('thu-after')).toHaveText('70.000.000');
  await page.getByTestId('thu-save').click();
  await expect(page.getByText(/Đã lưu phiếu thu 30\.000\.000/)).toBeVisible();
  const prow = page.getByTestId('thu-progress').locator(`tr[data-project="${nhutId}"]`);
  await expect(prow).toContainText('70.000.000');
  await page.screenshot({ path: `${SHOTS}/thu-tien-sau-luu.png`, fullPage: true });

  await page.goto('/loi-nhuan');
  await expect(page.getByRole('row', { name: new RegExp(NHUT) })).toContainText('30.000.000');

  // Quyết toán tăng 5 tr, chốt + phiếu thu còn lại → 105 tr, phiếu tự động 75 tr
  await page.goto('/quyet-toan');
  await page.getByLabel('Công trình', { exact: true }).first().selectOption(nhutId);
  await page.getByLabel('Ngày quyết toán').fill('2030-11-01');
  await page.getByLabel('Số tiền quyết toán').fill('5000000');
  await page.getByLabel('Nội dung quyết toán').fill('Phát sinh lan can');
  await expect(page.getByTestId('qt-after')).toHaveText('105.000.000');
  await expect(page.getByTestId('qt-receipt')).toHaveText('75.000.000');
  await page.screenshot({ path: `${SHOTS}/quyet-toan-dang-nhap.png`, fullPage: true });
  await page.getByTestId('qt-save').click();
  await page.getByRole('button', { name: 'Vẫn lưu' }).click();
  await expect(page.getByText(/Đã lưu quyết toán/)).toBeVisible();
  await expect(page.getByTestId('qt-history').getByRole('row', { name: new RegExp(NHUT) })).toContainText('+5.000.000');

  const st = await one(admin.from('settlements').select('id,kind,amount,is_final').eq('project_id', nhutId).is('deleted_at', null));
  expect(st).toHaveLength(1);
  expect(st[0]).toMatchObject({ kind: 'increase', amount: 5_000_000, is_final: true });
  const rc = await one(admin.from('receipts').select('amount,kind,is_auto,settlement_id,date').eq('project_id', nhutId).is('deleted_at', null).order('amount'));
  expect(rc).toEqual([
    { amount: 30_000_000, kind: 'stage', is_auto: false, settlement_id: null, date: '2030-10-15' },
    { amount: 75_000_000, kind: 'settlement', is_auto: true, settlement_id: st[0]!.id, date: '2030-11-01' },
  ]);
  expect((await one(admin.from('projects').select('status,closed_date').eq('id', nhutId)))[0]).toEqual({ status: 'closed', closed_date: '2030-11-01' });

  // Sổ thu: phiếu tự động có nhãn, bấm vào không sửa được; Lợi Nhuận: đã thu 105 tr
  await page.goto('/doanh-thu');
  await page.getByRole('tab', { name: 'THU TIỀN' }).click();
  await page.getByPlaceholder('Tìm…').fill(NHUT);
  const autoRow = page.getByTestId('thu-ledger').getByRole('row', { name: /75\.000\.000/ });
  await expect(autoRow).toContainText('Tự động');
  await autoRow.click();
  await expect(page.getByText(/sửa \/ xóa ở tab Quyết Toán/)).toBeVisible();
  await page.goto('/loi-nhuan');
  await expect(page.getByRole('row', { name: new RegExp(NHUT) })).toContainText('105.000.000');

  // Sửa quyết toán: bỏ tick phiếu thu → phiếu tự động bị gỡ
  await page.goto('/quyet-toan');
  await page.getByPlaceholder('Tìm…').fill(NHUT);
  await page.getByTestId('qt-history').getByRole('row', { name: new RegExp(NHUT) }).click();
  await page.getByText('Ghi nhận phiếu thu tiền còn lại (tự động)').click();
  await page.getByTestId('qt-save').click();
  await page.getByRole('button', { name: 'Vẫn lưu' }).click();
  await expect(page.getByText(/đã gỡ phiếu thu tự động/)).toBeVisible();
  expect(await one(admin.from('receipts').select('amount').eq('project_id', nhutId).is('deleted_at', null))).toEqual([{ amount: 30_000_000 }]);
  expect(errors).toEqual([]);
});
