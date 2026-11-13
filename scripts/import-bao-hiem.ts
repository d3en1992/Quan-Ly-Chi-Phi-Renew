// Nhập họ tên + ngày sinh + giới tính + CCCD từ danh sách BẢO HIỂM TAI NẠN vào Danh Bạ (công nhân / thầu phụ).
// Đọc: du-lieu/bao-hiem-tai-nan-2026.xlsx (cột HỌ VÀ TÊN, GIỚI TÍNH, NGÀY SINH, CCCD/CMND)
//      du-lieu/bao-hiem-ghep-ten.json  (họ tên → tên gọi trong app; null = chưa biết, bỏ qua)
// Cả hai file chỉ nằm trên máy (du-lieu/ không lên GitHub — có CCCD).
// Chạy lại được bao nhiêu lần cũng được (ghi đè đúng các ô này, không đụng SĐT / tài khoản ngân hàng).
// ⚠️ `npm run migrate:legacy` ghi lại họ tên công nhân từ app cũ → chạy lại lệnh này SAU mỗi lần đổ dữ liệu cũ.
//   node scripts/import-bao-hiem.ts            (Supabase trong máy)
//   node scripts/import-bao-hiem.ts --online   (bản online, đọc khóa trong .env)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { COMPANY_ID, localAdminClient, ONLINE } from './local-supabase.mjs';

type Target = { worker?: string; sub?: string } | null;
const ROOT = join(import.meta.dirname, '..');
const XLSX = join(ROOT, 'du-lieu', 'bao-hiem-tai-nan-2026.xlsx');
const MAP = join(ROOT, 'du-lieu', 'bao-hiem-ghep-ten.json');

const norm = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return 'text' in v ? String(v.text) : 'result' in v ? String(v.result) : '';
  return String(v).trim();
};
/** "8/1/1978" (ngày/tháng/năm) hoặc "1978-01-01…" → YYYY-MM-DD; sai → null */
export function parseDob(raw: string): string | null {
  const s = raw.replace(/"/g, '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

async function readPeople() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.worksheets[0]!;
  let head = 0;
  const col: Record<string, number> = {};
  ws.eachRow((row, i) => {
    if (head) return;
    row.eachCell((c, j) => { const t = cellText(c.value).toUpperCase(); if (t) col[t] = j; });
    if (col['HỌ VÀ TÊN']) head = i; else for (const k of Object.keys(col)) delete col[k];
  });
  if (!head) throw new Error('Không thấy dòng tiêu đề "HỌ VÀ TÊN" trong file bảo hiểm');
  const people: { fullName: string; gender: string | null; dob: string | null; idNumber: string | null }[] = [];
  ws.eachRow((row, i) => {
    if (i <= head) return;
    const fullName = cellText(row.getCell(col['HỌ VÀ TÊN']!).value).replace(/\s+/g, ' ');
    if (!fullName) return;
    const g = cellText(row.getCell(col['GIỚI TÍNH']!).value).toUpperCase();
    people.push({
      fullName,
      gender: g === 'NAM' ? 'Nam' : g === 'NỮ' ? 'Nữ' : null,
      dob: parseDob(cellText(row.getCell(col['NGÀY SINH']!).value)),
      idNumber: cellText(row.getCell(col['CCCD/CMND']!).value).replace(/\D/g, '') || null,
    });
  });
  return people;
}

async function main() {
  const sb = localAdminClient();
  const map = JSON.parse(readFileSync(MAP, 'utf8')) as Record<string, Target | string>;
  const people = await readPeople();
  const [{ data: workers, error: we }, { data: subs, error: se }] = await Promise.all([
    sb.from('workers').select('id,name').eq('company_id', COMPANY_ID).is('deleted_at', null),
    sb.from('subcontractors').select('id,name').eq('company_id', COMPANY_ID).is('deleted_at', null),
  ]);
  if (we || se) throw new Error((we ?? se)!.message);
  const byName = (rows: { id: string; name: string }[] | null, name: string) => rows?.find((r) => norm(r.name) === norm(name));

  /** Ghi thông tin riêng (CCCD, ngày sinh, giới tính) cho 1 người — sửa dòng có sẵn, chưa có thì thêm */
  const putPrivate = async (key: 'worker_id' | 'subcontractor_id', id: string, p: (typeof people)[number]) => {
    const patch = { id_number: p.idNumber, date_of_birth: p.dob, gender: p.gender };
    const { data: cur, error } = await sb.from('contact_private').select('id').eq(key, id).is('deleted_at', null).maybeSingle();
    if (error) throw new Error(error.message);
    const r = cur
      ? await sb.from('contact_private').update(patch).eq('id', (cur as { id: string }).id)
      : await sb.from('contact_private').insert({ company_id: COMPANY_ID, [key]: id, ...patch });
    if (r.error) throw new Error(r.error.message);
  };

  const done: string[] = [], skipped: string[] = [], missing: string[] = [];
  for (const p of people) {
    const t = map[p.fullName] as Target | undefined;
    if (!t) { skipped.push(p.fullName); continue; }
    if (t.worker) {
      const w = byName(workers, t.worker);
      if (!w) missing.push(`${p.fullName} → công nhân "${t.worker}" không có trong app`);
      else {
        const { error } = await sb.from('workers').update({ full_name: p.fullName }).eq('id', w.id);
        if (error) throw new Error(error.message);
        await putPrivate('worker_id', w.id, p);
        done.push(`${p.fullName} → công nhân ${w.name}`);
      }
    }
    if (t.sub) {
      const s = byName(subs, t.sub);
      if (!s) missing.push(`${p.fullName} → thầu phụ "${t.sub}" không có trong app`);
      else {
        const { error } = await sb.from('subcontractors').update({ contact_person: p.fullName }).eq('id', s.id);
        if (error) throw new Error(error.message);
        await putPrivate('subcontractor_id', s.id, p);
        done.push(`${p.fullName} → thầu phụ ${s.name}`);
      }
    }
  }
  console.log(`Nhập bảo hiểm tai nạn vào ${ONLINE ? 'bản ONLINE' : 'Supabase trong máy'}: ${people.length} người trong file`);
  console.log(`✔ Đã nhập ${done.length}:\n  ${done.join('\n  ')}`);
  if (skipped.length) console.log(`… Chưa biết là ai (bỏ qua, điền vào du-lieu/bao-hiem-ghep-ten.json): ${skipped.join(', ')}`);
  if (missing.length) { console.log(`✘ Không tìm thấy:\n  ${missing.join('\n  ')}`); process.exitCode = 1; }
}

await main();
