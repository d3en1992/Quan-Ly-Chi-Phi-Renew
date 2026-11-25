// Trợ lý AI đợt 2 (25/11/2026): dán ảnh Ctrl+V, giữ ghi âm khi AI lỗi, cảnh báo trùng, hợp đồng thầu phụ, bỏ vật tư + ô tìm.
// Lời gọi AI bị chặn, trả kết quả mẫu; kho trên máy chạy thật. Dữ liệu test tên "E2E AI2", dọn sau khi xong.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { localAdminClient } from '../scripts/local-supabase.mjs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD99';
mkdirSync(SHOTS, { recursive: true });
const admin = localAdminClient();
const COMPANY = '00000000-0000-0000-0000-000000000001';
const CT = 'E2E AI2 CT', SUB = 'E2E AI2 THẦU PHỤ';
let pid = '';
test.use({ permissions: ['microphone'], launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

async function cleanup() {
  const ids = async (t: string) => ((await admin.from(t).select('id').like('name', 'E2E AI2%')).data ?? []).map((r: { id: string }) => r.id);
  const projects = await ids('projects'), subs = await ids('subcontractors');
  const exps = (await admin.from('expenses').select('id, receipt_image_path').in('project_id', projects)).data ?? [];
  const con = (await admin.from('subcontracts').select('id, attachment_paths').in('project_id', projects)).data ?? [];
  const targets = [...exps, ...con].map((r) => r.id as string);
  await admin.from('image_fingerprints').delete().in('target_id', targets);
  await admin.from('expense_lines').delete().in('expense_id', exps.map((e) => e.id));
  for (const t of ['expenses', 'subcontracts']) await admin.from(t).delete().in('project_id', projects);
  const photos = exps.map((e) => e.receipt_image_path as string | null).filter((p): p is string => !!p);
  if (photos.length) await admin.storage.from('receipts').remove(photos);
  const docs = con.flatMap((c) => (c.attachment_paths as string[] | null) ?? []);
  if (docs.length) await admin.storage.from('documents').remove(docs);
  await admin.from('subcontractors').delete().in('id', subs);
  await admin.from('projects').delete().in('id', projects);
}
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  await cleanup();
  const p = await admin.from('projects').insert({ company_id: COMPANY, name: CT, kind: 'new_build', status: 'active' }).select('id').single();
  expect(p.error).toBeNull();
  pid = p.data!.id as string;
  expect((await admin.from('subcontractors').insert({ company_id: COMPANY, name: SUB })).error).toBeNull();
});
test.afterAll(cleanup);

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('qlcp-years', 'all'));
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill('e2e.admin');
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
async function ai(page: Page, reply: (n: number, body: { files: { mime_type: string }[] }) => { status: number; body: object } | 'hang') {
  let n = 0;
  await page.unroute('**/functions/v1/scan-document').catch(() => undefined);
  await page.route('**/functions/v1/scan-document', async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: CORS });
    const x = reply(++n, r.request().postDataJSON());
    if (x === 'hang') return; // máy chủ treo
    return r.fulfill({ status: x.status, contentType: 'application/json', headers: CORS, body: JSON.stringify(x.body) });
  });
}
/** Dán một ảnh vẽ sẵn (như copy từ Zalo rồi Ctrl+V) */
const paste = (page: Page, seed = 1) => page.evaluate(async (s) => {
  const c = document.createElement('canvas'); c.width = 600; c.height = 800;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 60; i++) { x.fillStyle = `hsl(${(i * 47 * s) % 360} 70% ${20 + ((i * 13 * s) % 60)}%)`; x.fillRect((i * 97 * s) % 560, (i * 61 * s) % 760, 90, 70); }
  const blob: Blob = await new Promise((ok) => c.toBlob((b) => ok(b!), 'image/png'));
  const dt = new DataTransfer();
  dt.items.add(new File([blob], 'zalo.png', { type: 'image/png' }));
  document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, seed);
const invoice = { kind: 'invoice', mode: 'gemini', invoice: {
  date: '2026-11-20', invoice_no: '', supplier_name: '', supplier_address: '', supplier_phone: '', supplier_phones: [], customer_text: '', supplier_match: '', project_match: CT,
  expense_type_match: 'Vật Liệu Xây Dựng', buyer_match: '', printed_total: 435000, is_summary: false,
  lines: [{ name: 'Xi măng', unit: 'bao', quantity: 5, unit_price: 87000, amount: 435000, date: '', low_confidence: [] }], low_confidence: [],
} };

test('màn AI gọn: không còn vật tư cần mua, không còn ô tìm; dán ảnh Ctrl+V → lưu; dán lại → báo trùng ảnh + số liệu', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await ai(page, () => ({ status: 200, body: invoice }));
  await page.goto('/tro-ly-ai');
  await expect(page.getByTestId('capture-form')).toBeVisible();
  await expect(page.getByText(/vật tư cần mua/i)).toHaveCount(0);
  await expect(page.getByTestId('ai-search-bar')).toHaveCount(0);
  await expect(page.getByTestId('scan-paste')).toBeVisible();
  await paste(page);
  await expect(page.getByTestId('zoomable-image')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/ai2-dan-anh.png` });
  await expect(page.getByTestId('image-dup')).toHaveCount(0);
  await page.getByTestId('scan-read').click();
  await expect(page.getByTestId('scan-invoice')).toBeVisible();
  await expect(page.getByTestId('data-dup')).toHaveCount(0);
  await page.getByTestId('scan-save').click();
  await expect(page.getByText(/Đã lưu hóa đơn/)).toBeVisible();
  await expect.poll(async () => (await admin.from('expenses').select('id').eq('project_id', pid)).data?.length).toBe(1);

  await paste(page);
  await expect(page.getByTestId('image-dup')).toContainText('Ảnh / tệp này đã được nhập rồi');
  await expect(page.getByTestId('image-dup')).toContainText('435.000');
  await page.getByTestId('scan-read').click();
  await expect(page.getByTestId('data-dup')).toContainText('Giống 100%');
  await page.screenshot({ path: `${SHOTS}/ai2-trung.png`, fullPage: true });
  // Chỉ cảnh báo: bấm Vẫn lưu thì vẫn lưu được
  await page.getByTestId('scan-save').click();
  await page.getByRole('button', { name: 'Vẫn lưu' }).click();
  await expect.poll(async () => (await admin.from('expenses').select('id').eq('project_id', pid)).data?.length).toBe(2);
  // Ảnh khác thì không báo
  await paste(page, 3);
  await expect(page.getByTestId('zoomable-image')).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('image-dup')).toHaveCount(0);
});

test('nói xong mà AI lỗi / treo: ghi âm còn nguyên, gửi lại được', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const seen: string[] = [];
  await ai(page, (n, body) => {
    seen.push(body.files.map((f) => f.mime_type).join());
    if (n === 1) return { status: 503, body: { error: 'AI của Google đang quá tải. Đợi một lát rồi bấm lại.' } };
    return n === 2 ? 'hang' : { status: 200, body: invoice };
  });
  await page.goto('/tro-ly-ai');
  await page.getByRole('button', { name: 'Bấm để nói' }).click();
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Gửi ghi âm cho AI' }).click();
  await expect(page.getByText(/quá tải.*Ghi âm vẫn còn/)).toBeVisible();
  await expect(page.getByTestId('kept-audio')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/ai2-ghi-am.png` });
  await page.getByTestId('resend-audio').click();
  await page.getByTestId('scan-cancel').click(); // treo → thôi chờ
  await expect(page.getByTestId('kept-audio')).toBeVisible();
  await page.getByTestId('resend-audio').click();
  await expect(page.getByTestId('scan-invoice')).toBeVisible();
  expect(seen).toEqual(['audio/wav', 'audio/wav', 'audio/wav']);
  // Lưu / bỏ xong thì ghi âm cũ không dính vào lần sau
  await page.getByRole('button', { name: 'Bỏ', exact: true }).click();
  await expect(page.getByTestId('capture-form')).toBeVisible();
  await expect(page.getByTestId('kept-audio')).toHaveCount(0);
});

test('hợp đồng thầu phụ: gửi PDF → lưu hợp đồng kèm tệp, xem lại ở tab Thầu phụ', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await ai(page, () => ({ status: 200, body: { kind: 'subcontract', mode: 'gemini', subcontract: {
    date: '2026-11-10', value: 45000000, subcontractor_text: SUB, subcontractor_match: SUB, project_match: CT, description: 'Nhân công điện nước',
    items: [{ name: 'Đi ống', unit: 'm2', quantity: 150, unit_price: 300000 }], low_confidence: [] } } }));
  await page.goto('/tro-ly-ai');
  await page.getByTestId('scan-file').setInputFiles({ name: 'hd.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\ne2e\n%%EOF') });
  await page.getByTestId('scan-read').click();
  await expect(page.getByTestId('scan-subcontract')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/ai2-hd-thau-phu.png`, fullPage: true });
  await page.getByTestId('subcontract-save').click();
  await expect(page.getByText(/Đã lưu hợp đồng thầu phụ/)).toBeVisible();
  const { data } = await admin.from('subcontracts').select('value, attachment_paths, items').eq('project_id', pid);
  expect(data).toHaveLength(1);
  expect(data![0]).toMatchObject({ value: 45_000_000 });
  expect((data![0]!.attachment_paths as string[])[0]).toMatch(/\.pdf$/);
  await page.goto('/thau-phu/hop-dong');
  await page.getByTestId('hdtp-table').locator('tr', { hasText: SUB }).first().click();
  await expect(page.getByTestId('doc-file')).toBeVisible();
});

test('chấm công: phiếu ghi "Sơn", chọn công trình → tên theo tuần trước; điện thoại không kéo ngang', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  // Công trình có SƠN MT (không có SƠN) ở tuần gần nhất
  const { data: weeks } = await admin.from('timesheet_weeks').select('week_start, project:projects(name), lines:timesheet_lines(deleted_at, worker:workers(name))').is('deleted_at', null).order('week_start', { ascending: false }).limit(60);
  const crews = new Map<string, { week: string; names: string[] }>();
  for (const w of (weeks ?? []) as unknown as { week_start: string; project: { name: string }; lines: { deleted_at: string | null; worker: { name: string } }[] }[]) {
    if (!crews.has(w.project.name)) crews.set(w.project.name, { week: w.week_start, names: w.lines.filter((l) => !l.deleted_at).map((l) => l.worker.name) });
  }
  const target = [...crews].filter(([, c]) => c.names.includes('SƠN MT') && !c.names.includes('SƠN')).sort((a, b) => b[1].week.localeCompare(a[1].week))[0];
  test.skip(!target, 'dữ liệu trên máy không có công trình phù hợp');
  await ai(page, () => ({ status: 200, body: { kind: 'timesheet', mode: 'gemini', timesheet: { week_start: '', project_match: '', project_by: '', note: '', purchases: [], purchase_total: 0, low_confidence: [],
    rows: [{ name: 'Sơn', worker_match: 'SƠN', role: '', days: [0, 1, 1, 1, 1, 1, 1], low_confidence: [] }] } } }));
  await page.goto('/tro-ly-ai');
  await page.getByTestId('scan-file').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  await page.getByTestId('scan-read').click();
  await expect(page.getByLabel('Tên công nhân dòng 1')).toHaveValue('SƠN');
  await page.getByLabel('Công trình', { exact: true }).fill(target![0]);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Tên công nhân dòng 1')).toHaveValue('SƠN MT');
  await expect(page.getByTestId('ts-written')).toContainText('Sơn');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/ai2-cham-cong-390.png` });
});
