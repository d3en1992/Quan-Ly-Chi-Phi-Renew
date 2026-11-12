// Lấy địa chỉ + key của Supabase CHẠY TRÊN MÁY (Docker) bằng `npx supabase status`.
// Mặc định KHÔNG BAO GIỜ trỏ tới Supabase online. Chỉ khi lệnh có cờ `--online` mới đọc .env
// (SUPABASE_ONLINE_URL + SUPABASE_ONLINE_SECRET_KEY) để đổ dữ liệu / tạo tài khoản lên bản online anh chỉ định.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const ONLINE = process.argv.includes('--online');

function readDotEnv() {
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function onlineEnv() {
  const env = readDotEnv();
  const url = env.SUPABASE_ONLINE_URL, serviceKey = env.SUPABASE_ONLINE_SECRET_KEY;
  if (!url || !serviceKey) throw new Error('Thiếu SUPABASE_ONLINE_URL / SUPABASE_ONLINE_SECRET_KEY trong ban-moi/.env');
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) throw new Error('SUPABASE_ONLINE_URL phải dạng https://<mã>.supabase.co');
  console.log(`⚠️  Chạy trên Supabase ONLINE: ${url}`);
  return { url: url.replace(/\/$/, ''), anonKey: env.SUPABASE_ONLINE_PUBLISHABLE_KEY ?? '', serviceKey };
}

export function localSupabaseEnv() {
  if (ONLINE) return onlineEnv();
  const out = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const s = JSON.parse(out.slice(out.indexOf('{')));
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(s.API_URL)) {
    throw new Error('Supabase không phải bản chạy trên máy — dừng để an toàn');
  }
  return { url: s.API_URL, anonKey: s.ANON_KEY, serviceKey: s.SERVICE_ROLE_KEY };
}

export function localAdminClient() {
  const { url, serviceKey } = localSupabaseEnv();
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const COMPANY_ID = '00000000-0000-0000-0000-000000000001';
export const COMPANY_SLUG = 'nguyenhuu';
export const ROLE_IDS = {
  admin: '00000000-0000-0000-0000-0000000000a1',
  director: '00000000-0000-0000-0000-0000000000a2',
  manager: '00000000-0000-0000-0000-0000000000a3',
  accountant: '00000000-0000-0000-0000-0000000000a4',
  viewer: '00000000-0000-0000-0000-0000000000a5',
};

/** Tạo (hoặc cập nhật) 1 tài khoản + profile. Trả về true nếu vừa tạo / đặt lại mật khẩu. */
export async function upsertAccount(admin, { username, displayName, roleId, password, mustChange = true, reset = false }) {
  const email = `${username}@${COMPANY_SLUG}.qlcp`;
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  let user = list.users.find((u) => u.email === email);
  let changed = false;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName },
    });
    if (error) throw error;
    user = data.user;
    changed = true;
  } else if (reset) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, ban_duration: 'none' });
    if (error) throw error;
    changed = true;
  }
  const row = {
    id: user.id,
    company_id: COMPANY_ID,
    username,
    display_name: displayName,
    role_id: roleId,
  };
  if (changed) Object.assign(row, { must_change_password: mustChange, is_locked: false });
  const { error: pErr } = await admin.from('profiles').upsert(row, { onConflict: 'id' });
  if (pErr) throw pErr;
  return { id: user.id, changed };
}
