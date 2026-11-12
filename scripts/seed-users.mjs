// Tạo 3 tài khoản ban đầu trên Supabase chạy trên máy: tinh (Admin), chay (Giám đốc), lam (Quản lý).
// Mật khẩu tạm sinh ngẫu nhiên, ghi vào du-lieu/tai-khoan-tam.txt (thư mục đã gitignore).
// Lần đầu đăng nhập phải đổi mật khẩu.
// Chạy: npm run seed:users          (tài khoản đã có thì giữ nguyên mật khẩu)
//       npm run seed:users -- --reset  (sinh lại mật khẩu tạm cho cả 3)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localAdminClient, localSupabaseEnv, ONLINE, ROLE_IDS, upsertAccount } from './local-supabase.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'du-lieu', ONLINE ? 'tai-khoan-online.txt' : 'tai-khoan-tam.txt');
const reset = process.argv.includes('--reset');

const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
const digits = '23456789';
const rnd = (set) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
const tempPassword = () =>
  `${rnd(letters).toUpperCase()}${rnd(digits)}${rnd(letters)}${rnd(letters)}-${rnd(digits)}${rnd(digits)}${rnd(letters)}${rnd(letters)}`;

const SEED = [
  { username: 'tinh', displayName: 'TÌNH', roleId: ROLE_IDS.admin, roleName: 'Admin' },
  { username: 'chay', displayName: 'NGUYỄN VĂN CHẠY', roleId: ROLE_IDS.director, roleName: 'Giám đốc' },
  { username: 'lam', displayName: 'PHẠM VĂN LAM', roleId: ROLE_IDS.manager, roleName: 'Quản lý' },
];

// Giữ mật khẩu cũ đã ghi (nếu tài khoản không bị đặt lại)
const old = new Map();
if (existsSync(outFile)) {
  for (const line of readFileSync(outFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^(\S+)\s+\|\s+(\S+)\s+\|/);
    if (m) old.set(m[1], m[2]);
  }
}

const admin = localAdminClient();
const lines = [];
for (const acc of SEED) {
  const password = tempPassword();
  const { changed } = await upsertAccount(admin, { ...acc, password, reset });
  const shown = changed ? password : old.get(acc.username) ?? '(giữ mật khẩu cũ — chạy lại với --reset để sinh mới)';
  lines.push(`${acc.username.padEnd(6)} | ${shown} | ${acc.displayName} · ${acc.roleName}`);
  console.log(`${acc.username}: ${changed ? 'đã tạo / đặt lại' : 'đã có, giữ nguyên'}`);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  [
    `TÀI KHOẢN TẠM — ${ONLINE ? `Supabase ONLINE (${localSupabaseEnv().url})` : 'Supabase chạy trên máy (http://127.0.0.1:54321)'}`,
    'Lần đầu đăng nhập phải đổi mật khẩu. File này KHÔNG đưa lên GitHub.',
    '',
    'Tên ĐN | Mật khẩu tạm | Người · Vai trò',
    ...lines,
    '',
  ].join('\n'),
  'utf8',
);
console.log(`Đã ghi ${outFile}`);
