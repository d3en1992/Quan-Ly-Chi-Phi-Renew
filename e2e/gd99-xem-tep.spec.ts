// Nén PDF (chỉ ảnh bên trong), quy tắc 3 MB / 15 MB, xem PDF / Excel trong app, lưu .xls / .doc.
// Tệp tự tạo; muốn thử tệp thật: đặt biến TEP_THAT = thư mục chứa tệp. Dữ liệu test tên "E2E XEM", dọn sau khi xong.
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { localAdminClient } from '../scripts/local-supabase.mjs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD99';
mkdirSync(SHOTS, { recursive: true });
const admin = localAdminClient();
const COMPANY = '00000000-0000-0000-0000-000000000001';
const CT = 'E2E XEM CT', SUB = 'E2E XEM TP';
const REAL = process.env.TEP_THAT ?? '';
let payId = '';

async function cleanup() {
  const p = ((await admin.from('projects').select('id').like('name', 'E2E XEM%')).data ?? []).map((r: { id: string }) => r.id);
  const rows = (await admin.from('payments').select('id, attachment_paths').in('project_id', p)).data ?? [];
  const files = rows.flatMap((r) => (r.attachment_paths as string[] | null) ?? []);
  await admin.from('payments').delete().in('project_id', p);
  if (files.length) await admin.storage.from('documents').remove(files);
  await admin.from('subcontractors').delete().like('name', 'E2E XEM%');
  await admin.from('projects').delete().in('id', p);
}
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  await cleanup();
  const p = await admin.from('projects').insert({ company_id: COMPANY, name: CT, kind: 'new_build', status: 'active' }).select('id').single();
  const s = await admin.from('subcontractors').insert({ company_id: COMPANY, name: SUB }).select('id').single();
  const r = await admin.from('payments').insert({ company_id: COMPANY, kind: 'advance', date: '2026-11-25', amount: 1000, project_id: p.data!.id, subcontractor_id: s.data!.id }).select('id').single();
  expect(r.error).toBeNull();
  payId = r.data!.id as string;
});
test.afterAll(cleanup);

async function open(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.addInitScript(() => localStorage.setItem('qlcp-years', 'all'));
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill('e2e.admin');
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
  await page.goto('/thau-phu/phieu-chi');
  await page.getByText(SUB).first().click();
  await expect(page.getByTestId('attach-add')).toBeVisible();
}
const pathsNow = async () => ((await admin.from('payments').select('attachment_paths').eq('id', payId).single()).data!.attachment_paths as string[]);
async function attach(page: Page, name: string, mimeType: string, buffer: Buffer) {
  const n = (await pathsNow()).length;
  await page.getByTestId('attach-file').setInputFiles({ name, mimeType, buffer });
  await expect.poll(async () => (await pathsNow()).length, { timeout: 40_000 }).toBe(n + 1);
  await expect(page.getByTestId('doc-file')).toHaveCount(n + 1, { timeout: 15_000 }); // màn hình đã cập nhật
  const path = (await pathsNow())[n]!;
  const { data } = await admin.storage.from('documents').download(path);
  return { path, bytes: Buffer.from(await data!.arrayBuffer()) };
}

/** PDF nặng ~5,8 MB: ảnh RGB không nén được (nhiễu) + chữ */
async function heavyPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pg = doc.addPage([595, 842]);
  pg.drawText('BAO GIA E2E 123456', { x: 50, y: 780, size: 24, font });
  const w = 1400, h = 1400, px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { const v = (i % w) / 6 + Math.floor(i / w) / 12; px[i * 3] = v + ((i * 7919) % 23); px[i * 3 + 1] = v / 2 + ((i * 104729) % 17); px[i * 3 + 2] = 200 - v / 3; }
  const ref = doc.context.register(doc.context.stream(px, { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }));
  const { pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } = await import('pdf-lib');
  const key = pg.node.newXObject('Anh', ref);
  pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(400, 0, 0, 400, 80, 300), drawObject(key), popGraphicsState());
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

test('PDF nặng: nén rồi lưu, còn chữ, xem được trong app; Excel xem bảng; .xls / .doc lưu + tải về', async ({ page }) => {
  test.setTimeout(150_000);
  await open(page, 1440, 900);
  const heavy = await heavyPdf();
  expect(heavy.length).toBeGreaterThan(3 * 1024 * 1024);
  const r = await attach(page, 'bao-gia.pdf', 'application/pdf', heavy);
  expect(r.bytes.length).toBeLessThan(3 * 1024 * 1024);
  expect((await PDFDocument.load(r.bytes)).getPageCount()).toBe(1);
  await page.getByTestId('doc-open').first().click();
  await expect(page.getByTestId('pdf-page').locator('canvas')).toBeVisible();
  // Đã vẽ thật (không trắng trơn)
  await expect.poll(() => page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="pdf-page"] canvas');
    if (!c || !c.width) return 0;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 400) if (d[i + 3]! > 0 && d[i]! < 240) n++;
    return n;
  }), { timeout: 15_000 }).toBeGreaterThan(100);
  await page.screenshot({ path: `${SHOTS}/xem-pdf.png` });
  await page.getByRole('button', { name: 'Phóng to' }).click();
  await expect(page.getByTestId('file-zoom')).toHaveText('125%');
  // Nhấn giữ kéo = cuộn
  const top = () => page.evaluate(() => document.querySelector('[data-testid="file-viewer"] > div')!.scrollTop);
  const t0 = await top();
  await page.mouse.move(700, 700); await page.mouse.down(); await page.mouse.move(700, 400, { steps: 5 }); await page.mouse.up();
  expect(await top()).toBeGreaterThan(t0 + 200);
  const dl = page.waitForEvent('download');
  await page.getByTestId('file-download').click();
  expect((await dl).suggestedFilename()).toMatch(/\.pdf$/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('file-viewer')).toHaveCount(0);
  await expect(page.getByTestId('attach-add')).toBeVisible(); // phiếu vẫn mở

  // Nhẹ: lưu nguyên từng byte
  const light = Buffer.from(await (async () => { const d = await PDFDocument.create(); d.addPage(); return d.save(); })());
  expect((await attach(page, 'nhe.pdf', 'application/pdf', light)).bytes.equals(light)).toBe(true);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Dự toán');
  ws.addRow(['Hạng mục', 'Khối lượng', 'Thành tiền']); ws.addRow(['Móng cọc', 32.5, 12345678]);
  wb.addWorksheet('Ghi chú').addRow(['Trang hai']);
  await attach(page, 'dt.xlsx', '', Buffer.from(await wb.xlsx.writeBuffer()));
  await page.getByTestId('doc-open').last().click();
  await expect(page.getByTestId('sheet-view')).toContainText('12.345.678');
  await page.getByRole('tab', { name: 'Ghi chú' }).click();
  await expect(page.getByTestId('sheet-view')).toContainText('Trang hai');
  await page.keyboard.press('Escape');

  expect((await attach(page, 'cu.xls', 'application/vnd.ms-excel', Buffer.from('xls'))).path).toMatch(/\.xls$/);
  expect((await attach(page, 'hd.doc', 'application/msword', Buffer.from('doc'))).path).toMatch(/\.doc$/);
  await expect(page.getByText('Tệp Word')).toBeVisible();

  // Trên 15 MB: không nhận
  const n = (await pathsNow()).length;
  await page.getByTestId('attach-file').setInputFiles({ name: 'to.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(16 * 1024 * 1024, 32) });
  await expect(page.getByText(/chỉ nhận tới 15 MB/)).toBeVisible();
  // 3–15 MB mà không nén được: không lưu, có báo
  await page.getByTestId('attach-file').setInputFiles({ name: 'khoa.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(4 * 1024 * 1024, 32) });
  await expect(page.getByText(/không nén được/)).toBeVisible();
  expect((await pathsNow()).length).toBe(n);
});

test('điện thoại: xem PDF vừa bề ngang, không kéo ngang cả trang', async ({ page }) => {
  await open(page, 390, 844);
  await page.getByTestId('doc-open').first().click();
  await expect(page.getByTestId('pdf-page').locator('canvas')).toBeVisible();
  const b = (await page.getByTestId('pdf-page').boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('tệp thật của anh (chỉ chạy khi có TEP_THAT)', async ({ page }) => {
  test.skip(!REAL || !existsSync(REAL), 'không có TEP_THAT');
  test.setTimeout(240_000);
  await open(page, 1440, 900);
  for (const f of readdirSync(REAL).filter((x) => /\.(pdf|xlsx?|doc)$/i.test(x))) {
    const before = statSync(join(REAL, f)).size;
    const r = await attach(page, f, '', readFileSync(join(REAL, f)));
    console.log(f.slice(0, 40), Math.round(before / 1024), 'KB →', Math.round(r.bytes.length / 1024), 'KB');
    if (!/\.(pdf|xlsx)$/i.test(f)) continue;
    await page.getByTestId('doc-open').last().click();
    await expect(page.locator('[data-testid="pdf-page"] canvas, [data-testid="sheet-view"]').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOTS}/that-${f.slice(0, 8)}.png` });
    await page.keyboard.press('Escape');
  }
});
