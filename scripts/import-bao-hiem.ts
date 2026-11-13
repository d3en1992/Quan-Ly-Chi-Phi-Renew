// Nhập họ tên + ngày sinh + giới tính + CCCD (+ ngày cấp, quê quán, thường trú nếu có) từ các danh sách BẢO HIỂM TAI NẠN
// vào Danh Bạ (công nhân / thầu phụ / nhân viên).
// Đọc: du-lieu/bao-hiem-tai-nan-*.xlsx (mỗi năm một file; 2 mẫu: cột "HỌ VÀ TÊN" hoặc "HỌ" + "TÊN")
//      du-lieu/bao-hiem-ghep-ten.json  (họ tên → ai trong app; null = chưa biết, bỏ qua)
// Nhiều năm: đọc từ năm cũ tới năm mới — năm mới ghi đè, nhưng ô năm mới bỏ trống thì giữ thông tin năm cũ.
// Các file chỉ nằm trên máy (du-lieu/ không lên GitHub — có CCCD).
// Chạy lại được bao nhiêu lần cũng được (không tạo trùng; không đụng SĐT / tài khoản ngân hàng).
// ⚠️ `npm run migrate:legacy` ghi lại họ tên công nhân từ app cũ → chạy lại lệnh này SAU mỗi lần đổ dữ liệu cũ.
//   node scripts/import-bao-hiem.ts            (Supabase trong máy)
//   node scripts/import-bao-hiem.ts --online   (bản online, đọc khóa trong .env)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { COMPANY_ID, localAdminClient, ONLINE } from './local-supabase.mjs';

type EmpInfo = { title?: string; account?: string; archived?: boolean; note?: string };
type Target = { worker?: string; sub?: string; employee?: EmpInfo; create?: boolean; field?: string } | null;
type Staff = EmpInfo & { full_name: string; gender?: string; date_of_birth?: string; id_number?: string; hometown?: string; permanent_address?: string };
type Person = {
  fullName: string; year: string; gender: string | null; dob: string | null; idNumber: string | null; idIssuedOn: string | null;
  hometown: string | null; address: string | null;
};
type Priv = { id_number?: string | null; id_issued_on?: string | null; date_of_birth?: string | null; gender?: string | null; hometown?: string | null; permanent_address?: string | null };

const ROOT = join(import.meta.dirname, '..');
const DIR = join(ROOT, 'du-lieu');
const MAP = join(DIR, 'bao-hiem-ghep-ten.json');

const norm = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const clean = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ');
const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return 'text' in v ? String(v.text) : 'result' in v ? String(v.result ?? '') : '';
  return String(v).trim();
};
/** "8/1/1978" (ngày/tháng/năm) hoặc "1978-01-01…" → YYYY-MM-DD; chỉ có năm / sai → null */
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
const yearOf = (raw: string) => /(\d{4})/.exec(raw)?.[1] ?? '';

/** Đọc 1 file: tìm dòng tiêu đề, nhận cả 2 mẫu cột */
async function readFile(path: string): Promise<Person[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0]!;
  let head = 0;
  const col: Record<string, number> = {};
  ws.eachRow((row, i) => {
    if (head) return;
    const c: Record<string, number> = {};
    row.eachCell((cell, j) => { const t = cellText(cell.value).toUpperCase().trim(); if (t && !(t in c)) c[t] = j; });
    if (c['HỌ VÀ TÊN'] || (c['HỌ'] && c['TÊN'])) { head = i; Object.assign(col, c); }
  });
  if (!head) throw new Error(`${path}: không thấy dòng tiêu đề HỌ VÀ TÊN / HỌ + TÊN`);
  const pick = (...names: string[]) => names.map((n) => col[n]).find(Boolean);
  const cName = col['HỌ VÀ TÊN'], cHo = col['HỌ'], cTen = col['TÊN'];
  const cGender = pick('GIỚI TÍNH', 'GT'), cDob = pick('NGÀY SINH', 'NĂM SINH'), cId = pick('CCCD/CMND', 'SỐ CMND/CCCD', 'SỐ CMND', 'SỐ CCCD');
  const cIssued = pick('CẤP NGÀY', 'NGÀY CẤP'), cHome = pick('QUÊ QUÁN'), cAddr = pick('ĐC THƯỜNG TRÚ', 'NƠI THƯỜNG TRÚ', 'ĐỊA CHỈ THƯỜNG TRÚ');
  const get = (row: ExcelJS.Row, c: number | undefined) => (c ? cellText(row.getCell(c).value) : '');
  const out: Person[] = [];
  ws.eachRow((row, i) => {
    if (i <= head) return;
    const fullName = clean(cName ? get(row, cName) : `${get(row, cHo)} ${get(row, cTen)}`);
    if (!fullName || !/\p{L}/u.test(fullName) || /^(ngày|công ty|đại diện)/i.test(fullName)) return;
    const g = get(row, cGender).toUpperCase();
    const dobRaw = get(row, cDob);
    out.push({
      fullName, year: yearOf(dobRaw),
      gender: g === 'NAM' ? 'Nam' : g === 'NỮ' || g === 'NU' ? 'Nữ' : null,
      dob: parseDob(dobRaw),
      idNumber: get(row, cId).replace(/\D/g, '') || null,
      idIssuedOn: parseDob(get(row, cIssued)),
      hometown: clean(get(row, cHome)) || null,
      address: clean(get(row, cAddr)) || null,
    });
  });
  return out;
}

async function main() {
  const sb = localAdminClient();
  const map = JSON.parse(readFileSync(MAP, 'utf8')) as Record<string, Target | string | Staff[]>;
  const files = readdirSync(DIR).filter((f) => /^bao-hiem-tai-nan-.*\.xlsx$/i.test(f)).sort();
  if (!files.length) throw new Error('Không có file du-lieu/bao-hiem-tai-nan-*.xlsx');

  const [{ data: workers, error: we }, { data: subs, error: se }] = await Promise.all([
    sb.from('workers').select('id,name').eq('company_id', COMPANY_ID).is('deleted_at', null),
    sb.from('subcontractors').select('id,name').eq('company_id', COMPANY_ID).is('deleted_at', null),
  ]);
  if (we || se) throw new Error((we ?? se)!.message);
  const byName = (rows: { id: string; name: string }[] | null, name: string) => rows?.find((r) => norm(r.name) === norm(name));

  // Gộp mọi năm theo NGƯỜI ĐÍCH (công nhân / thầu phụ / nhân viên): năm sau ghi đè ô có giá trị
  type Merged = { kind: 'worker' | 'sub' | 'employee'; name: string; t: NonNullable<Target>; fullName: string; priv: Priv };
  const merged = new Map<string, Merged>();
  const skipped = new Set<string>();
  for (const f of files) {
    for (const p of await readFile(join(DIR, f))) {
      const t = (map[`${p.fullName} (${p.year})`] ?? map[p.fullName]) as Target | undefined;
      if (!t) { skipped.add(`${p.fullName}${p.year ? ` (${p.year})` : ''}`); continue; }
      const priv: Priv = { id_number: p.idNumber, id_issued_on: p.idIssuedOn, date_of_birth: p.dob, gender: p.gender, hometown: p.hometown, permanent_address: p.address };
      const targets: [Merged['kind'], string][] = [];
      if (t.worker) targets.push(['worker', t.worker]);
      if (t.sub) targets.push(['sub', t.sub]);
      if (t.employee) targets.push(['employee', p.fullName]);
      for (const [kind, name] of targets) {
        const key = `${kind}:${norm(name)}`;
        const m = merged.get(key) ?? { kind, name, t, fullName: p.fullName, priv: {} };
        m.fullName = p.fullName;
        for (const [k, v] of Object.entries(priv) as [keyof Priv, string | null][]) if (v) m.priv[k] = v;
        merged.set(key, m);
      }
    }
  }

  /** Ghi thông tin riêng — sửa dòng có sẵn (chỉ các ô có giá trị), chưa có thì thêm */
  const putPrivate = async (key: 'worker_id' | 'subcontractor_id' | 'employee_id', id: string, patch: Priv) => {
    const p = Object.fromEntries(Object.entries(patch).filter(([, v]) => v));
    if (!Object.keys(p).length) return; // chưa có thông tin (vd. chú Quang) → không tạo dòng trống
    const { data: cur, error } = await sb.from('contact_private').select('id').eq(key, id).is('deleted_at', null).maybeSingle();
    if (error) throw new Error(error.message);
    const r = cur
      ? await sb.from('contact_private').update(p).eq('id', (cur as { id: string }).id)
      : await sb.from('contact_private').insert({ company_id: COMPANY_ID, [key]: id, ...p });
    if (r.error) throw new Error(r.error.message);
  };
  const created: string[] = [], done: string[] = [], missing: string[] = [];
  /** Chưa có công nhân / thầu phụ mà bảng ghép tên ghi create: true → tạo mới */
  const ensure = async (table: 'workers' | 'subcontractors', rows: { id: string; name: string }[] | null, name: string, extra: Record<string, string>) => {
    const { data, error } = await sb.from(table).insert({ company_id: COMPANY_ID, name, ...extra }).select('id,name').single();
    if (error) throw new Error(error.message);
    rows?.push(data as { id: string; name: string });
    created.push(`${table === 'workers' ? 'công nhân' : 'thầu phụ'} ${name}`);
    return data as { id: string; name: string };
  };
  /** Nhân viên: tìm theo họ tên, chưa có thì thêm; gắn tài khoản app theo tên đăng nhập */
  const putEmployee = async (fullName: string, { title, account, archived, note }: EmpInfo = {}) => {
    let profileId: string | null = null;
    if (account) {
      const { data: prof } = await sb.from('profiles').select('id').eq('company_id', COMPANY_ID).eq('username', account).maybeSingle();
      profileId = (prof as { id: string } | null)?.id ?? null;
    }
    const { data: cur, error } = await sb.from('employees').select('id').eq('company_id', COMPANY_ID).ilike('full_name', fullName).is('deleted_at', null).maybeSingle();
    if (error) throw new Error(error.message);
    // archived = đã nghỉ (vẫn giữ để tra cứu); note = ghi chú (vd. "Nghỉ từ cuối năm 2025")
    const row = { full_name: fullName, title: title ?? null, profile_id: profileId, archived: !!archived, ...(note ? { note } : {}) };
    const r = cur ? await sb.from('employees').update(row).eq('id', (cur as { id: string }).id).select('id').single()
      : await sb.from('employees').insert({ company_id: COMPANY_ID, ...row }).select('id').single();
    if (r.error) throw new Error(r.error.message);
    return { id: (r.data as { id: string }).id, linked: !!profileId };
  };

  for (const m of merged.values()) {
    if (m.kind === 'worker') {
      const w = byName(workers, m.name) ?? (m.t.create ? await ensure('workers', workers, m.name, {}) : undefined);
      if (!w) { missing.push(`${m.fullName} → công nhân "${m.name}" không có trong app`); continue; }
      const { error } = await sb.from('workers').update({ full_name: m.fullName }).eq('id', w.id);
      if (error) throw new Error(error.message);
      await putPrivate('worker_id', w.id, m.priv);
      done.push(`${m.fullName} → công nhân ${w.name}`);
    } else if (m.kind === 'sub') {
      const s = byName(subs, m.name) ?? (m.t.create ? await ensure('subcontractors', subs, m.name, m.t.field ? { field: m.t.field } : {}) : undefined);
      if (!s) { missing.push(`${m.fullName} → thầu phụ "${m.name}" không có trong app`); continue; }
      const { error } = await sb.from('subcontractors').update({ contact_person: m.fullName }).eq('id', s.id);
      if (error) throw new Error(error.message);
      await putPrivate('subcontractor_id', s.id, m.priv);
      done.push(`${m.fullName} → thầu phụ ${s.name}`);
    } else {
      const e = await putEmployee(m.fullName, m.t.employee);
      await putPrivate('employee_id', e.id, m.priv);
      done.push(`${m.fullName} → nhân viên (${m.t.employee?.title ?? ''}${e.linked ? `, tài khoản ${m.t.employee?.account}` : ''}${m.t.employee?.archived ? ', đã nghỉ' : ''})`);
    }
  }

  // Nhân viên nhập tay từ CCCD (mục _nhan_vien) — ghi sau cùng nên ưu tiên hơn số liệu trong file bảo hiểm
  for (const s of (map._nhan_vien as Staff[] | undefined) ?? []) {
    const e = await putEmployee(s.full_name, s);
    await putPrivate('employee_id', e.id, {
      id_number: s.id_number, date_of_birth: s.date_of_birth, gender: s.gender, hometown: s.hometown, permanent_address: s.permanent_address,
    });
    done.push(`${s.full_name} → nhân viên (${s.title ?? ''}${e.linked ? `, tài khoản ${s.account}` : ''}) — nhập tay`);
  }

  console.log(`Nhập bảo hiểm tai nạn vào ${ONLINE ? 'bản ONLINE' : 'Supabase trong máy'} — file: ${files.join(', ')}`);
  if (created.length) console.log(`+ Tạo mới: ${created.join(', ')}`);
  console.log(`✔ Đã nhập ${done.length}:\n  ${done.join('\n  ')}`);
  if (skipped.size) console.log(`… Chưa biết là ai (bỏ qua, điền vào du-lieu/bao-hiem-ghep-ten.json): ${[...skipped].join(', ')}`);
  if (missing.length) { console.log(`✘ Không tìm thấy:\n  ${missing.join('\n  ')}`); process.exitCode = 1; }
}

await main();
