// XUẤT SỐ CHUẨN BẰNG CHÍNH CODE APP CŨ, CHẠY TRONG NODE (không mở trình duyệt, không đụng Firebase).
//
// Cách làm: nạp nguyên các file .js của `../ban-dang-dung` (CHỈ ĐỌC) vào một "hộp cát" (node:vm) với
// document / window / mạng đều là đồ giả, đổ `du-lieu/snapshot.json` vào bộ nhớ của app cũ (_mem),
// gọi `_reloadGlobals()` rồi chạy đúng nội dung `mega-prompt/xuat-so-chuan.js`.
// → `du-lieu/so-chuan.json` = số do hàm `lnTinhCongTrinh`, `calcTongDoanhThu`, `allocateCompanyCost`
//   của app cũ tính ra trên đúng snapshot đã chuyển sang kho mới.
//
// Chạy:  node scripts/legacy/xuat-so-chuan-node.mjs            (ghi du-lieu/so-chuan.json)
//        node scripts/legacy/xuat-so-chuan-node.mjs --luc 2026-11-11T10:00:00.000Z   (cố định "bây giờ")
//
// "Bây giờ" quan trọng: công trình chưa có ngày kết thúc thì số ngày thi công tính tới lúc xuất
// (getProjectDays dùng Date.now()) → phần chi phí chung (C) đổi theo giờ xuất. File ghi lại `taoLuc`
// để test tính lại đúng thời điểm đó.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OLD = join(ROOT, '..', 'ban-dang-dung');
const SNAP = join(ROOT, 'du-lieu', 'snapshot.json');
const OUT = join(ROOT, 'du-lieu', 'so-chuan.json');
if (!existsSync(SNAP)) { console.error('Chưa có du-lieu/snapshot.json'); process.exit(1); }

const lucArg = process.argv.indexOf('--luc');
const NOW = lucArg > 0 ? new Date(process.argv[lucArg + 1]).getTime() : Date.now();
if (!Number.isFinite(NOW)) { console.error('--luc không phải ngày giờ hợp lệ'); process.exit(1); }

// App cũ tính ngày theo giờ máy (Việt Nam). Ép múi giờ để máy nào chạy cũng ra cùng số.
process.env.TZ = 'Asia/Ho_Chi_Minh';

// ── Đồ giả: mọi thuộc tính / lời gọi đều trả về chính nó ──
const stub = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === 'length' ? 0 : k === Symbol.iterator ? function* () {} : stub),
  apply: () => stub,
  construct: () => stub,
  set: () => true,
  has: () => true,
  deleteProperty: () => true,
});
const ls = new Map();
let captured = null;
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}
const sandbox = {
  console: { log() {}, info() {}, debug() {}, warn() {}, error() {}, table() {}, group() {}, groupEnd() {}, time() {}, timeEnd() {} },
  document: stub, navigator: { onLine: false, userAgent: 'node', serviceWorker: stub, clipboard: stub }, location: { hash: '', href: 'http://localhost/', search: '', pathname: '/', reload() {} },
  history: stub, indexedDB: stub, Dexie: stub, firebase: stub, bootstrap: stub, XLSX: stub, html2canvas: stub,
  localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => void ls.set(k, String(v)), removeItem: (k) => void ls.delete(k), clear: () => ls.clear(), key: () => null, get length() { return ls.size; } },
  sessionStorage: stub,
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, requestIdleCallback: () => 0,
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, matchMedia: () => stub, getComputedStyle: () => stub, alert() {}, confirm: () => false, prompt: () => null,
  fetch: () => new Promise(() => {}), // KHÔNG có mạng: mọi lời gọi cloud treo vĩnh viễn
  XMLHttpRequest: stub, WebSocket: stub, BroadcastChannel: stub, MutationObserver: stub, ResizeObserver: stub, IntersectionObserver: stub,
  Image: stub, FileReader: stub, CustomEvent: stub, Event: stub, HTMLElement: stub, Element: stub, Node: stub,
  crypto: globalThis.crypto, TextEncoder, TextDecoder, structuredClone, Intl, JSON, Math,
  Date: FakeDate,
  URL: Object.assign(function () { return stub; }, { createObjectURL: () => 'blob:', revokeObjectURL() {} }),
  Blob: function (parts) { captured = parts.join(''); },
  innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, screen: { width: 1440, height: 900 },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox;
vm.createContext(sandbox);

// ── Nạp script theo đúng thứ tự trong index.html của app cũ ──
const html = readFileSync(join(OLD, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script[^>]*src="(js\/[^"]+)"/g)].map((m) => m[1]);
const loadErrors = [];
for (const f of files) {
  try { vm.runInContext(readFileSync(join(OLD, f), 'utf8'), sandbox, { filename: f }); }
  catch (e) { loadErrors.push(`${f}: ${e.message}`); }
}

// ── Đổ snapshot vào bộ nhớ app cũ, xem bằng mắt ADMIN (thấy dữ liệu nháp, như lúc anh xuất) ──
const snapshot = JSON.parse(readFileSync(SNAP, 'utf8'));
sandbox.__data = snapshot.data ?? snapshot;
vm.runInContext(`
  isAdmin = () => true;
  _dbSave = () => Promise.resolve();
  Object.keys(__data).forEach(k => { _mem[k] = __data[k]; });
  _reloadGlobals();
`, sandbox, { filename: 'nap-snapshot' });

// ── Chạy đúng script xuất số chuẩn của anh ──
const exporter = readFileSync(join(ROOT, 'mega-prompt', 'xuat-so-chuan.js'), 'utf8');
await vm.runInContext(exporter.replace(/\}\)\(\);\s*$/, '})()'), sandbox, { filename: 'xuat-so-chuan.js' });
if (!captured) { console.error('Không xuất được số chuẩn. Lỗi nạp file:\n' + loadErrors.join('\n')); process.exit(1); }

const out = JSON.parse(captured);
// ── GĐ6: phiếu lương từng người × từng tuần (`ccPayslipData` = cột Thực Lãnh của Tổng Lương Tuần) + nợ còn lại ──
out.chamCong = vm.runInContext(`(() => {
  const live = ccData.filter(w => !w.deletedAt && w.fromDate);
  const tuan = {};
  [...new Set(live.map(w => w.fromDate))].sort().forEach(from => {
    const to = ccSaturdayISO(from);
    const names = [...new Set(live.filter(w => w.fromDate === from).flatMap(w => (w.workers || []).map(k => k.name)).filter(Boolean))];
    tuan[from] = names.map(n => { const d = ccPayslipData(n, from, to);
      return { ten: n, cong: d.congs, luong: d.luong, phuCap: d.pc, hdml: d.hdml, ung: d.ung, tra: d.tra, thucLanh: d.net, noCon: d.debt }; });
  });
  const names = new Set();
  live.forEach(w => (w.workers || []).forEach(k => k.name && names.add(k.name)));
  ungRecords.forEach(r => { if (!r.deletedAt && r.loai === 'congnhan' && r.tp) names.add(r.tp); });
  const no = {};
  names.forEach(n => { no[n] = ccWorkerDebtUpTo(n, '9999-12-31'); });
  return JSON.stringify({ tuan, no });
})()`, sandbox, { filename: 'xuat-cham-cong' });
out.chamCong = JSON.parse(out.chamCong);
// ── GĐ8: Tỉ trọng — `tytTongHop` trọn vòng đời của từng công trình (4 nhóm, 6 trụ cột, theo loại, từng khoản) ──
out.tyTrong = JSON.parse(vm.runInContext(`(() => {
  const res = {};
  getAllProjects().filter(p => p && p.id !== 'COMPANY' && !p.deletedAt).forEach(p => {
    const r = tytTongHop(p, { allYears: true });
    res[p.id] = { ten: p.name, tongChi: r.tongChi, tongSan: r.tongSan, theoNhom: r.theoNhom,
      theoTru: { sat: r.theoTru.sat, bt: r.theoTru.bt, nc: r.theoTru.nc, tp: r.theoTru.tp, quy: r.theoTru.quy, khac: r.theoTru[''] },
      theoLoai: r.theoLoai, chuaNhom: r.chuaNhom.length,
      khoan: r.lines.map(l => ({ key: l.key, tien: l.tien, loai: l.loai, nhom: l.parts.map(pt => pt.nhom + ':' + pt.tien).join(',') })) };
  });
  return JSON.stringify(res);
})()`, sandbox, { filename: 'xuat-ty-trong' }));
out.taoLuc = new Date(NOW).toISOString();
out.nguon = 'node: scripts/legacy/xuat-so-chuan-node.mjs (code app cũ chạy trên du-lieu/snapshot.json)';
out.snapshotXuatLuc = snapshot.exportedAt ?? snapshot.meta?.exportedAt ?? null;
writeFileSync(OUT, JSON.stringify(out, null, 2));
const years = Object.keys(out.nam);
console.log(`Đã ghi du-lieu/so-chuan.json: ${years.length} mốc năm (${years.join(', ')}), ${out.nam.TAT_CA.congTrinh.length} công trình`);
console.log('Tổng (Tất cả năm):', JSON.stringify(out.nam.TAT_CA.tongCong));
if (loadErrors.length) console.log(`(${loadErrors.length} file app cũ báo lỗi khi nạp ngoài trình duyệt, không ảnh hưởng công thức)\n  ` + loadErrors.join('\n  '));
