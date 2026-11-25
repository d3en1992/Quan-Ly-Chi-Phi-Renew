// Ảnh / tệp kèm phiếu chi, phiếu thu, hợp đồng, ảnh CCCD (migration …021).
// Lời gọi AI bị chặn và trả kết quả mẫu; lưu tệp + quyền chạy thật trên Supabase trong máy. Dữ liệu test tên "E2E TEP", dọn sau khi xong.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { COMPANY_SLUG, localAdminClient, localSupabaseEnv } from '../scripts/local-supabase.mjs';
import { E2E_PASSWORD } from './accounts';

const SHOTS = 'anh-chup/GD99';
mkdirSync(SHOTS, { recursive: true });
const admin = localAdminClient();
const env = localSupabaseEnv();
const COMPANY = '00000000-0000-0000-0000-000000000001';
const CT = 'E2E TEP CT', SUB = 'E2E TEP THẦU PHỤ', SUP = 'E2E TEP NCC', WORKER = 'E2E TEP THỢ';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
let pid = '';
const paths: Record<string, string> = {};

async function cleanup() {
  const ids = async (t: string, n: string) => ((await admin.from(t).select('id').like('name', n)).data ?? []).map((r: { id: string }) => r.id);
  const projects = await ids('projects', 'E2E TEP%'), sups = await ids('suppliers', 'E2E TEP%'), subs = await ids('subcontractors', 'E2E TEP%'), workers = await ids('workers', 'E2E TEP%');
  const files: string[] = [];
  for (const t of ['payments', 'receipts', 'main_contracts']) {
    const rows = (await admin.from(t).select('id, attachment_paths').in('project_id', projects)).data ?? [];
    for (const r of rows as { attachment_paths: string[] | null }[]) files.push(...(r.attachment_paths ?? []));
  }
  const ps = ((await admin.from('payments').select('id, attachment_paths').in('supplier_id', sups)).data ?? []) as { id: string; attachment_paths: string[] | null }[];
  for (const r of ps) files.push(...(r.attachment_paths ?? []));
  await admin.from('payment_allocations').delete().in('payment_id', ps.map((p) => p.id));
  await admin.from('payments').delete().in('supplier_id', sups);
  for (const t of ['payments', 'receipts', 'main_contracts']) await admin.from(t).delete().in('project_id', projects);
  if (files.length) await admin.storage.from('documents').remove(files);
  const priv = ((await admin.from('contact_private').select('id, id_image_paths').in('worker_id', workers)).data ?? []) as { id_image_paths: string[] | null }[];
  const cards = priv.flatMap((r) => r.id_image_paths ?? []);
  await admin.from('contact_private').delete().in('worker_id', workers);
  if (cards.length) await admin.storage.from('id-cards').remove(cards);
  for (const [t, list] of [['workers', workers], ['subcontractors', subs], ['suppliers', sups], ['projects', projects]] as const) await admin.from(t).delete().in('id', list);
}

async function signIn(username: string): Promise<SupabaseClient> {
  const c = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: `${username}@${COMPANY_SLUG}.qlcp`, password: E2E_PASSWORD });
  expect(error).toBeNull();
  return c;
}
async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('qlcp-years', 'all'));
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill('e2e.admin');
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('[data-layout]').first().waitFor();
}
/** Gửi một tệp cho Trợ lý AI; AI "trả lời" bằng `resp` */
async function scan(page: Page, resp: object, file = { name: 'a.png', mimeType: 'image/png', buffer: PNG }) {
  await page.unroute('**/functions/v1/scan-document').catch(() => undefined);
  await page.route('**/functions/v1/scan-document', (r) => r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
    : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ mode: 'gemini', ...resp }) }));
  await page.goto('/tro-ly-ai');
  await page.getByTestId('scan-file').setInputFiles(file);
  await page.getByTestId('scan-read').click();
}
const one = async (table: string, col: string, val: string, sel: string) => {
  const { data, error } = await admin.from(table).select(sel).eq(col, val);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  return data![0] as unknown as Record<string, string[] & string>;
};

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  await cleanup();
  const p = await admin.from('projects').insert({ company_id: COMPANY, name: CT, kind: 'new_build', status: 'active' }).select('id').single();
  expect(p.error).toBeNull();
  pid = p.data!.id as string;
  expect((await admin.from('subcontractors').insert({ company_id: COMPANY, name: SUB })).error).toBeNull();
  expect((await admin.from('suppliers').insert({ company_id: COMPANY, name: SUP })).error).toBeNull();
});
test.afterAll(cleanup);

test('AI: thầu phụ, NCC, phiếu thu, hợp đồng PDF, CCCD đều lưu kèm tệp', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const adv = { date: '2026-11-20', amount: 1_000_000, subcontractor_text: '', pay_kind: 'advance', method: 'transfer', note: 'e2e tep', low_confidence: [] };
  await scan(page, { kind: 'advance', advance: { ...adv, party: 'subcontractor', subcontractor_match: SUB, supplier_match: '', project_match: CT } });
  await page.getByTestId('advance-save').click();
  await expect(page.getByText(/Đã lưu phiếu trả thầu phụ/)).toBeVisible();
  const sub = await one('payments', 'project_id', pid, 'id, attachment_paths');
  expect(sub.attachment_paths).toHaveLength(1);
  paths.payment = sub.attachment_paths![0]!;

  await scan(page, { kind: 'advance', advance: { ...adv, party: 'supplier', subcontractor_match: '', supplier_match: SUP, project_match: '' } });
  await page.getByTestId('advance-save').click();
  await expect(page.getByText(/Đã lưu phiếu trả NCC/)).toBeVisible();

  await scan(page, { kind: 'receipt', receipt: { date: '2026-11-20', amount: 5_000_000, customer_text: '', customer_match: '', project_match: CT, receipt_kind: 'stage', method: 'transfer', note: '', low_confidence: [] } });
  await page.getByTestId('receipt-save').click();
  await expect(page.getByText(/Đã lưu phiếu thu/)).toBeVisible();
  paths.receipt = (await one('receipts', 'project_id', pid, 'attachment_paths')).attachment_paths![0]!;

  const con = { customer_name: '', customer_full_name: '', customer_address: '', customer_phone: '', value: 9_000_000, date: '2026-11-01', description: 'e2e', customer_match: '', project_match: CT, floor_areas: [], unit_price: 0, is_estimate: false, low_confidence: [] };
  const uncheck = async () => { await page.getByText('Thêm khách hàng mới').click(); };
  await scan(page, { kind: 'contract', contract: con }, { name: 'hd.pdf', mimeType: 'application/pdf', buffer: PDF });
  await uncheck();
  await page.getByTestId('contract-save').click();
  await expect(page.getByText(/Đã lưu hợp đồng chính/)).toBeVisible();
  const c1 = (await one('main_contracts', 'project_id', pid, 'attachment_paths')).attachment_paths!;
  expect(c1).toHaveLength(1);
  expect(c1[0]).toMatch(/\.pdf$/);
  // Đã có hợp đồng: bỏ tích "Lưu hợp đồng chính" → tệp gắn thêm vào hợp đồng đó
  await scan(page, { kind: 'contract', contract: con });
  await uncheck();
  await page.getByText('Lưu hợp đồng chính', { exact: true }).click();
  await page.getByTestId('contract-save').click();
  await expect(page.getByTestId('capture-form')).toBeVisible();
  expect((await one('main_contracts', 'project_id', pid, 'attachment_paths')).attachment_paths).toHaveLength(2);

  await scan(page, { kind: 'id_card', id_card: { full_name: 'NGUYỄN E2E TEP', id_number: '079000000000', date_of_birth: '', gender: '', hometown: '', permanent_address: '', id_issued_on: '', id_issued_place: '', contact_kind: 'worker', contact_match: '', short_name: WORKER, phone: '', address: '', field: '', note_lines: [], doc_type: 'cccd', low_confidence: [] } });
  await page.getByText('Tạo công nhân mới').click();
  await page.getByLabel('Tên gọi trong danh bạ').fill(WORKER);
  await page.getByTestId('idcard-save').click();
  await expect(page.getByText(/Đã thêm công nhân/)).toBeVisible();
  const w = await one('workers', 'name', WORKER, 'id');
  const pv = await one('contact_private', 'worker_id', w.id as string, 'id_number, id_image_paths');
  expect(pv.id_image_paths).toHaveLength(1);
  paths.card = pv.id_image_paths![0]!;
});

test('quyền kho: Kế toán mở được ảnh phiếu chi, không mở được phiếu thu / hợp đồng / CCCD', async () => {
  const get = async (c: SupabaseClient, b: string, p: string) => !(await c.storage.from(b).createSignedUrl(p, 60)).error;
  const ad = await signIn('e2e.admin'), kt = await signIn('e2e.kt'), cx = await signIn('e2e.cx');
  for (const [b, p] of [['documents', paths.payment], ['documents', paths.receipt], ['id-cards', paths.card]] as const) expect(await get(ad, b, p!), p).toBe(true);
  expect(await get(kt, 'documents', paths.payment!)).toBe(true);
  expect(await get(kt, 'documents', paths.receipt!)).toBe(false);
  expect(await get(kt, 'id-cards', paths.card!)).toBe(false);
  // Chỉ xem: mở được tệp khi và chỉ khi đọc được chính phiếu (phạm vi công trình được giao); phiếu thu thì không bao giờ
  const seen = ((await cx.from('payments').select('id').eq('project_id', pid)).data ?? []).length > 0;
  expect(await get(cx, 'documents', paths.payment!)).toBe(seen);
  expect(await get(cx, 'documents', paths.receipt!)).toBe(false);
  expect(await get(cx, 'id-cards', paths.card!)).toBe(false);
  expect((await kt.storage.from('id-cards').list(`${COMPANY}/${new Date().getFullYear()}`)).data ?? []).toHaveLength(0);
  expect((await kt.storage.from('id-cards').upload(`${COMPANY}/2026/${crypto.randomUUID()}.png`, PNG, { contentType: 'image/png' })).error).not.toBeNull();
  // Tệp đang gắn phiếu thì chính người tải lên cũng không xóa được khỏi kho
  await ad.storage.from('documents').remove([paths.payment!]);
  expect((await admin.storage.from('documents').download(paths.payment!)).error).toBeNull();
});

test('xem, thêm, gỡ ảnh ở phiếu chi, sổ thu, hợp đồng, danh bạ', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto('/thau-phu/phieu-chi');
  const row = page.getByTestId('pay-history').locator('tr', { hasText: SUB });
  await row.getByTestId('attachments-button').click();
  await expect(page.getByTestId('zoomable-image')).toBeVisible();
  await page.getByTestId('attach-file').setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Ảnh / tệp phiếu chi (2)')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tep-phieu-chi.png` });
  await page.getByRole('button', { name: 'Gỡ Ảnh / tệp phiếu chi 2' }).click();
  await page.getByRole('button', { name: 'Gỡ', exact: true }).last().click();
  await expect(page.getByText('Ảnh / tệp phiếu chi (1)')).toBeVisible();
  await expect(page.getByTestId('pay-sheet-save')).toHaveCount(0); // bấm nút ảnh không mở phiếu

  await page.goto('/thau-phu/ncc');
  await page.getByLabel('Trạng thái').selectOption('');
  await page.getByTestId('ncc-table').locator('tr', { hasText: SUP }).first().click();
  await page.getByTestId('attachments-button').click();
  await expect(page.getByTestId('zoomable-image')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tep-ncc.png` });

  await page.goto(`/cong-trinh/${pid}`);
  await page.getByRole('tab', { name: 'THU TIỀN' }).click();
  await page.getByTestId('attachments-button').click();
  await expect(page.getByTestId('zoomable-image')).toBeVisible();

  const w = await one('workers', 'name', WORKER, 'id');
  expect(w.id).toBeTruthy();
  await page.goto('/danh-ba');
  await page.getByRole('tab', { name: 'CÔNG NHÂN' }).click();
  await page.getByPlaceholder(/Tìm/).last().fill(WORKER);
  await page.getByText(WORKER, { exact: true }).first().click();
  await expect(page.getByText('Ảnh CCCD / giấy tờ (1)')).toBeVisible();
  await expect(page.getByTestId('zoomable-image')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tep-cccd.png` });
});
