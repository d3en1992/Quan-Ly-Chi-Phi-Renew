// Đọc snapshot app cũ + các việc chung của 2 script chuyển / so sánh dữ liệu.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TABLE_ORDER } from './transform.ts';
import type { Row, TableName } from './transform.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = join(ROOT, 'du-lieu');
export const REPORT_FILE = join(DATA_DIR, 'bao-cao-chuyen-du-lieu.md');

/** Ưu tiên du-lieu/snapshot.json; chưa có thì dùng tạm snapshot 02/11/2026 trong app cũ (chỉ đọc). */
export function loadSnapshot(): { snapshot: Record<string, unknown>; path: string; isFallback: boolean } {
  const main = join(DATA_DIR, 'snapshot.json');
  const fallback = join(ROOT, '..', 'ban-dang-dung', 'cpct_snapshot_2026-11-02_00-51.json');
  const path = existsSync(main) ? main : fallback;
  if (!existsSync(path)) throw new Error(`Không thấy snapshot: ${main} (và cả bản tạm ${fallback})`);
  return { snapshot: JSON.parse(readFileSync(path, 'utf8')), path: relative(ROOT, path).replaceAll('\\', '/'), isFallback: path !== main };
}

/** Người TH cũ → tài khoản mới (KẾ HOẠCH 4C): TÌNH → tinh, KS LAM → lam, GIÁM ĐỐC → chay */
export const LEGACY_USERS: Record<string, string> = { 'TÌNH': 'tinh', 'KS LAM': 'lam', 'GIÁM ĐỐC': 'chay' };

export async function legacyUserMap(admin: SupabaseClient, companyId: string) {
  const { data, error } = await admin.from('profiles').select('id, username').eq('company_id', companyId).in('username', Object.values(LEGACY_USERS));
  if (error) throw error;
  const idByUsername = new Map((data ?? []).map((p) => [p.username as string, p.id as string]));
  const map: Record<string, string | null> = {};
  const missing: string[] = [];
  for (const [legacyName, username] of Object.entries(LEGACY_USERS)) {
    map[legacyName] = idByUsername.get(username) ?? null;
    if (!map[legacyName]) missing.push(username);
  }
  return { map, missing };
}

/** Đọc hết 1 bảng của công ty (PostgREST trả tối đa 1000 dòng / lần) */
export async function fetchAll(admin: SupabaseClient, table: string, companyId: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select('*').eq('company_id', companyId).order('id').range(from, from + 999);
    if (error) throw new Error(`Đọc bảng ${table} lỗi: ${error.message}`);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function fetchBusinessTables(admin: SupabaseClient, companyId: string): Promise<Record<TableName, Row[]>> {
  const db = {} as Record<TableName, Row[]>;
  for (const t of TABLE_ORDER) db[t] = await fetchAll(admin, t, companyId);
  return db;
}

/** Mã băm nội dung toàn bộ bảng nghiệp vụ (dòng xếp theo id, khóa xếp theo tên) — 2 lần chuyển phải ra cùng mã */
export function contentHash(db: Record<TableName, Row[]>): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(stable)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]))
    : v;
  const h = createHash('sha256');
  for (const t of TABLE_ORDER) {
    h.update(t);
    for (const r of [...db[t]].sort((a, b) => String(a.id).localeCompare(String(b.id)))) h.update(JSON.stringify(stable(r)));
  }
  return h.digest('hex').slice(0, 16);
}
