// Sao lưu mỗi đêm: gọi hàm create_backup('nightly') trong kho (giữ 30 bản mới nhất).
// Chạy tay (Supabase trong máy):  node scripts/backup-nightly.ts --local
// Chạy trên máy chủ / GitHub Action: đặt 2 biến môi trường rồi  node scripts/backup-nightly.ts
//     SUPABASE_URL                 địa chỉ project Supabase
//     SUPABASE_SERVICE_ROLE_KEY    key service_role (BÍ MẬT — chỉ để trong Secrets của GitHub, không ghi vào code / log)
//     COMPANY_SLUG                 (tùy chọn) mặc định nguyenhuu
//     BACKUP_DIR                   (tùy chọn) nếu đặt thì ghi thêm 1 file JSON vào thư mục này
// Script KHÔNG in key ra màn hình. Mẫu GitHub Action (chưa bật): scripts/mau-github-action-sao-luu.yml
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

async function makeClient() {
  if (process.argv.includes('--local')) {
    const { localAdminClient } = await import('./local-supabase.mjs');
    return localAdminClient();
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY (hoặc chạy với --local).');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const sb = await makeClient();
const slug = process.env.COMPANY_SLUG ?? 'nguyenhuu';
const { data: company, error: ce } = await sb.from('companies').select('id').eq('slug', slug).single();
if (ce || !company) throw new Error(`Không tìm thấy công ty "${slug}": ${ce?.message ?? ''}`);

const { data: id, error } = await sb.rpc('create_backup', { p_kind: 'nightly', p_note: 'Tự động mỗi đêm', p_company: company.id });
if (error) throw new Error(`Sao lưu lỗi: ${error.message}`);
console.log(`Đã sao lưu: ${id}`);

if (process.env.BACKUP_DIR) {
  const { data, error: e2 } = await sb.from('backups').select('data, created_at').eq('id', id).single();
  if (e2 || !data) throw new Error(`Không đọc lại được bản sao lưu: ${e2?.message ?? ''}`);
  mkdirSync(process.env.BACKUP_DIR, { recursive: true });
  const file = join(process.env.BACKUP_DIR, `sao-luu-${String(data.created_at).slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}.json`);
  writeFileSync(file, JSON.stringify(data.data));
  console.log(`Đã ghi file: ${file}`);
}
