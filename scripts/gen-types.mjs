// Sinh kiểu TypeScript từ schema Supabase trên máy → src/types/db.ts  (npm run gen:types)
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = execSync('npx supabase gen types typescript --local --schema public', { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
if (!out.includes('export type Database')) throw new Error('supabase gen types không trả về kiểu — Supabase trên máy đã chạy chưa?');
const file = join(root, 'src', 'types', 'db.ts');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `// TỰ SINH bằng "npm run gen:types" từ supabase/migrations — KHÔNG sửa tay.\n${out.replace(/\r\n/g, '\n')}`, 'utf8');
console.log(`Đã ghi ${file} (${out.split('\n').length} dòng)`);
