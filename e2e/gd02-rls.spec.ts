// GĐ2: quyền trong kho dữ liệu (RLS) trên dữ liệu đã chuyển từ app cũ. Không mở trình duyệt — gọi thẳng Supabase trong máy.
// Cần chạy trước: npm run migrate:legacy
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { COMPANY_ID, COMPANY_SLUG, localAdminClient, localSupabaseEnv } from '../scripts/local-supabase.mjs';
import { E2E_PASSWORD } from './accounts';

const env = localSupabaseEnv();
const admin = localAdminClient();

async function signIn(username: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: `${username}@${COMPANY_SLUG}.qlcp`, password: E2E_PASSWORD });
  expect(error, `đăng nhập ${username}`).toBeNull();
  return { client, userId: data.user!.id };
}

async function count(client: SupabaseClient, table: string, filter?: (q: any) => any): Promise<number> {
  let q = client.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: c, error } = await q;
  expect(error, `đếm ${table}`).toBeNull();
  return c ?? 0;
}

test.beforeAll(async () => {
  expect(await count(admin, 'expenses'), 'Chưa có dữ liệu — chạy "npm run migrate:legacy" trước').toBeGreaterThan(0);
});

test('Kế toán không đọc được thu tiền, HĐ chính, quyết toán; vẫn đọc được chi phí', async () => {
  const { client: kt } = await signIn('e2e.kt');
  for (const table of ['receipts', 'main_contracts', 'settlements']) {
    expect(await count(admin, table), `${table} có dữ liệu`).toBeGreaterThan(0);
    expect(await count(kt, table), `Kế toán đọc ${table}`).toBe(0);
  }
  // Mục bị ẩn với Kế toán: tỉ trọng, thiết bị
  expect(await count(kt, 'cost_allocations')).toBe(0);
  expect(await count(kt, 'equipment')).toBe(0);
  // Mục Kế toán được dùng
  for (const table of ['expenses', 'expense_lines', 'timesheet_weeks', 'timesheet_lines', 'payments', 'wage_advances', 'projects', 'suppliers', 'catalog_items']) {
    expect(await count(kt, table), `Kế toán đọc ${table}`).toBe(await count(admin, table));
  }
});

test('Kế toán: thêm hóa đơn được, sửa dòng mình được, không sửa dòng người khác, không thêm phiếu thu', async () => {
  const { client: kt, userId } = await signIn('e2e.kt');
  const { data: other } = await admin.from('expenses').select('id, project_id, expense_type_id, description, created_by').is('deleted_at', null).limit(1).single();
  expect(other).toBeTruthy();

  // Thêm: created_by luôn là người đang đăng nhập, dù cố gửi id người khác
  const { data: mine, error: insErr } = await kt.from('expenses')
    .insert({ project_id: other!.project_id, expense_type_id: other!.expense_type_id, date: '2026-11-11', amount: 12345, description: 'E2E GD02', created_by: other!.created_by })
    .select().single();
  expect(insErr).toBeNull();
  try {
    expect(mine!.created_by).toBe(userId);
    expect(mine!.company_id).toBe(COMPANY_ID);
    expect(mine!.paid_at_purchase).toBe(true); // mặc định tích Đã TT

    // Sửa dòng của mình (kể cả xóa mềm)
    const { data: upd } = await kt.from('expenses').update({ description: 'E2E GD02 đã sửa' }).eq('id', mine!.id).select();
    expect(upd).toHaveLength(1);
    // Không sửa được dòng người khác nhập
    const { data: updOther } = await kt.from('expenses').update({ description: 'bị sửa trộm' }).eq('id', other!.id).select();
    expect(updOther).toHaveLength(0);
    const { data: still } = await admin.from('expenses').select('description').eq('id', other!.id).single();
    expect(still!.description).toBe(other!.description);
    // Không xóa hẳn được (không có quyền xóa vĩnh viễn)
    const { data: del } = await kt.from('expenses').delete().eq('id', mine!.id).select();
    expect(del).toHaveLength(0);
    // Không thêm được phiếu thu
    const { error: thuErr } = await kt.from('receipts').insert({ project_id: other!.project_id, date: '2026-11-11', amount: 1 });
    expect(thuErr).not.toBeNull();
  } finally {
    await admin.from('expenses').delete().eq('id', mine!.id);
  }
});

test('Quản lý đọc được doanh thu; SĐT chỉ người có quyền mới thấy rõ', async () => {
  const { client: ql } = await signIn('e2e.ql');
  const { client: kt } = await signIn('e2e.kt');
  for (const table of ['receipts', 'main_contracts', 'settlements', 'equipment', 'cost_allocations']) {
    expect(await count(ql, table), `Quản lý đọc ${table}`).toBe(await count(admin, table));
  }
  const privateRows = await count(admin, 'contact_private');
  expect(privateRows).toBeGreaterThan(0);
  expect(await count(ql, 'contact_private')).toBe(privateRows);
  expect(await count(kt, 'contact_private')).toBe(0);

  const { data: clear } = await ql.rpc('list_contact_private_masked');
  const { data: masked, error } = await kt.rpc('list_contact_private_masked');
  expect(error).toBeNull();
  expect(masked).toHaveLength(privateRows);
  expect((clear as { phone: string }[]).every((r) => /^\d+$/.test(r.phone))).toBe(true);
  expect((masked as { phone: string }[]).every((r) => r.phone.includes('•••'))).toBe(true);
});

test('Chỉ xem: chỉ thấy công trình được giao, không thấy tiền thu', async () => {
  const { client: cx, userId } = await signIn('e2e.cx');
  // Phạm vi công trình nằm ở từng tài khoản (profiles.project_scope) — đặt "được giao" cho tài khoản test rồi trả lại sau
  const { data: before } = await admin.from('profiles').select('project_scope').eq('id', userId).single();
  await admin.from('profiles').update({ project_scope: 'assigned' }).eq('id', userId);
  await admin.from('profile_projects').delete().eq('profile_id', userId);
  expect(await count(cx, 'projects')).toBe(0);
  expect(await count(cx, 'expenses')).toBe(0);

  const { data: exp } = await admin.from('expenses').select('project_id').is('deleted_at', null).limit(1).single();
  const projectId = exp!.project_id as string;
  await admin.from('profile_projects').insert({ profile_id: userId, project_id: projectId, company_id: COMPANY_ID });
  try {
    expect(await count(cx, 'projects')).toBe(1);
    expect(await count(cx, 'expenses')).toBe(await count(admin, 'expenses', (q) => q.eq('project_id', projectId)));
    expect(await count(cx, 'timesheet_weeks')).toBe(await count(admin, 'timesheet_weeks', (q) => q.eq('project_id', projectId)));
    expect(await count(cx, 'receipts')).toBe(0);
    expect(await count(cx, 'main_contracts')).toBe(0);
    const { error } = await cx.from('expenses').insert({ project_id: projectId, expense_type_id: projectId, date: '2026-11-11', amount: 1 });
    expect(error).not.toBeNull();
  } finally {
    await admin.from('profile_projects').delete().eq('profile_id', userId);
    await admin.from('profiles').update({ project_scope: before!.project_scope }).eq('id', userId);
  }
});

test('Chưa đăng nhập không đọc được gì', async () => {
  const anon = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const table of ['projects', 'expenses', 'receipts', 'customers', 'workers', 'catalog_items']) {
    const { data } = await anon.from(table).select('id').limit(1);
    expect(data ?? [], `anon đọc ${table}`).toHaveLength(0);
  }
});
