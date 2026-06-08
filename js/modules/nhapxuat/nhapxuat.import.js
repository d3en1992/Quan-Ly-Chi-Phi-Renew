// ============================================================================
//  modules/nhapxuat/nhapxuat.import.js  —  TẦNG TỔNG HỢP (Layer 7): Nhập dữ liệu
// ----------------------------------------------------------------------------
//  @module nhapxuat.import
//
//  NHIỆM VỤ: Đọc file sao lưu JSON do CHÍNH app này xuất (nhapxuat.export) rồi
//  GỘP vào dữ liệu hiện có. Quy trình 3 bước để an toàn:
//    1. parseBackupFile(file) — đọc + JSON.parse + KIỂM TRA meta.app === 'cpct'.
//    2. previewImport(parsed) — đếm trước: mỗi kho có bao nhiêu bản THÊM MỚI / GHI
//       ĐÈ (so id với local) → UI hiện cho người dùng xác nhận trước khi áp.
//    3. applyImport(parsed)   — GỘP theo id bằng LWW + tombstone (dùng lại
//       mergeById/resolveConflict của sync.js): bản mới hơn thắng, bản đã xóa
//       không "sống lại". `users` gộp qua mergeUsers (GIỮ mật khẩu local).
//
//  Vì GỘP (không ghi đè trắng), nhập file cũ KHÔNG xóa mất bản ghi mới hơn ở local.
//  Muốn quay về nguyên trạng 1 thời điểm → dùng backup.restoreSnapshot (ghi đè).
// ============================================================================

import { STORE } from '../../core/db.js';
import { load, save } from '../../core/store.js';
import { mergeById } from '../../core/sync.js';
import { mergeUsers } from '../auth/auth.data.js';
import { toast, setLoading } from '../../utils/ui.js';

const ARRAY_STORES = Object.values(STORE).filter((s) => s !== STORE.CATEGORIES);

// ----------------------------------------------------------------------------
//  parseBackupFile(file) — Đọc 1 File (.json) → { meta, data }. Ném lỗi rõ ràng
//  nếu sai định dạng / không phải file của app này.
// ----------------------------------------------------------------------------
export async function parseBackupFile(file) {
  if (!file) throw new Error('Chưa chọn file.');
  let text;
  try {
    text = await file.text();
  } catch {
    throw new Error('Không đọc được nội dung file.');
  }
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('File không phải JSON hợp lệ.');
  }
  if (!obj || typeof obj !== 'object' || !obj.data || typeof obj.data !== 'object') {
    throw new Error('Cấu trúc file không đúng (thiếu "data").');
  }
  if (obj.meta && obj.meta.app && obj.meta.app !== 'cpct') {
    throw new Error('File không phải bản sao lưu của ứng dụng này.');
  }
  return { meta: obj.meta || {}, data: obj.data };
}

// ----------------------------------------------------------------------------
//  countDiff(local, incoming) — Đếm THÊM MỚI / GHI ĐÈ cho 1 mảng record (theo id).
// ----------------------------------------------------------------------------
function countDiff(local, incoming) {
  const ids = new Set((local || []).map((r) => String(r.id)));
  let add = 0, upd = 0;
  for (const r of (incoming || [])) {
    if (r && r.id != null && ids.has(String(r.id))) upd += 1; else add += 1;
  }
  return { add, upd };
}

// ----------------------------------------------------------------------------
//  previewImport(parsed) — Trả thống kê trước khi áp: { [store]: {add, upd, incoming} }.
//  categories gộp số liệu các nhóm con thành 1 dòng.
// ----------------------------------------------------------------------------
export async function previewImport(parsed) {
  const data = parsed.data || {};
  const out = {};

  for (const name of ARRAY_STORES) {
    const incoming = Array.isArray(data[name]) ? data[name] : [];
    const local = await load(name, []);
    out[name] = { ...countDiff(local, incoming), incoming: incoming.length };
  }

  // categories: cộng dồn theo từng nhóm.
  const incCat = (data[STORE.CATEGORIES] && typeof data[STORE.CATEGORIES] === 'object')
    ? data[STORE.CATEGORIES] : {};
  const locCat = await load(STORE.CATEGORIES, {});
  let cAdd = 0, cUpd = 0, cInc = 0;
  for (const g of Object.keys(incCat)) {
    const inc = Array.isArray(incCat[g]) ? incCat[g] : [];
    const d = countDiff(Array.isArray(locCat[g]) ? locCat[g] : [], inc);
    cAdd += d.add; cUpd += d.upd; cInc += inc.length;
  }
  out[STORE.CATEGORIES] = { add: cAdd, upd: cUpd, incoming: cInc };

  return out;
}

// ----------------------------------------------------------------------------
//  applyImport(parsed) — GỘP dữ liệu file vào local rồi lưu (mỗi save tự đẩy sync).
//  Trả { stores: số kho có thay đổi, records: tổng bản ghi sau gộp ở các kho đó }.
// ----------------------------------------------------------------------------
export async function applyImport(parsed) {
  setLoading(true, 'Đang nhập dữ liệu…');
  try {
    const data = parsed.data || {};
    let changedStores = 0, totalRecords = 0;

    for (const name of ARRAY_STORES) {
      const incoming = Array.isArray(data[name]) ? data[name] : [];
      if (!incoming.length) continue;
      const local = await load(name, []);
      const merged = name === STORE.USERS
        ? mergeUsers(local, incoming)   // users: gộp riêng để GIỮ mật khẩu local
        : mergeById(local, incoming);   // còn lại: LWW + tombstone theo id
      await save(name, merged);
      changedStores += 1;
      totalRecords += merged.length;
    }

    // categories: gộp theo từng nhóm con.
    const incCat = (data[STORE.CATEGORIES] && typeof data[STORE.CATEGORIES] === 'object')
      ? data[STORE.CATEGORIES] : {};
    if (Object.keys(incCat).length) {
      const locCat = await load(STORE.CATEGORIES, {});
      const out = { ...locCat };
      for (const g of Object.keys(incCat)) {
        const inc = Array.isArray(incCat[g]) ? incCat[g] : [];
        out[g] = mergeById(Array.isArray(out[g]) ? out[g] : [], inc);
        totalRecords += out[g].length;
      }
      await save(STORE.CATEGORIES, out);
      changedStores += 1;
    }

    toast(`📥 Đã nhập dữ liệu vào ${changedStores} kho.`, 'success');
    return { stores: changedStores, records: totalRecords };
  } catch (e) {
    toast('⚠ Lỗi khi nhập dữ liệu.', 'error');
    throw e;
  } finally {
    setLoading(false);
  }
}
