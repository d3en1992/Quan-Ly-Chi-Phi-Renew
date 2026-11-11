// GĐ2 — Chuyển dữ liệu app cũ (snapshot JSON) vào Supabase CHẠY TRÊN MÁY (Docker).
// Chạy lại bao nhiêu lần cũng được: xóa sạch dữ liệu nghiệp vụ của công ty rồi đổ lại (không đụng tài khoản, quyền).
// Chạy:  npm run migrate:legacy        (= chuyển + so sánh, ghi du-lieu/bao-cao-chuyen-du-lieu.md)
// Không bao giờ trỏ tới Supabase online: localAdminClient() chỉ nhận địa chỉ 127.0.0.1 / localhost.
import { COMPANY_ID, localAdminClient } from './local-supabase.mjs';
import { legacyUserMap, loadSnapshot } from './legacy/io.ts';
import { TABLE_ORDER, transformSnapshot } from './legacy/transform.ts';

const admin = localAdminClient();
const { snapshot, path, isFallback } = loadSnapshot();
console.log(`Snapshot: ${path}${isFallback ? '  (BẢN TẠM — chưa có du-lieu/snapshot.json)' : ''}`);

const users = await legacyUserMap(admin, COMPANY_ID);
if (users.missing.length) {
  console.error(`Thiếu tài khoản: ${users.missing.join(', ')}. Chạy "npm run seed:users" trước (để gắn Người TH cũ vào tài khoản).`);
  process.exit(1);
}

const result = transformSnapshot(snapshot, { companyId: COMPANY_ID, userIdByLegacyName: users.map });

const { error: wipeErr } = await admin.rpc('admin_wipe_business_data', { target_company: COMPANY_ID });
if (wipeErr) throw new Error(`Xóa dữ liệu cũ trong kho mới lỗi: ${wipeErr.message}`);

for (const table of TABLE_ORDER) {
  const rows = result.tables[table];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from(table).insert(rows.slice(i, i + 500));
    if (error) throw new Error(`Chèn bảng ${table} (dòng ${i}–${i + 499}) lỗi: ${error.message} ${error.details ?? ''}`);
  }
  console.log(`${table.padEnd(20)} ${String(rows.length).padStart(5)} dòng`);
}
console.log(`Bỏ ${result.dropped.length} bản ghi (có lý do trong báo cáo). Xong.`);
