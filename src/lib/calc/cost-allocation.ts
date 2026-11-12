// TỈ TRỌNG & ĐỊNH MỨC — chép NGUYÊN logic `tytrong.core.js` của app cũ (bản 27/10/2026: 4 NHÓM chi phí,
// Nhóm 1 chia 4 trụ cột + Quỹ phụ phí + Chưa xếp = "6 rổ" trên màn hình).
//
// Khác app cũ đúng 1 chỗ (KẾ HOẠCH mục 4F): app cũ BỎ hóa đơn của NCC đã có tiền ứng và thay bằng phiếu ứng;
// app mới bỏ hóa đơn CHƯA tích "Đã TT" và thay bằng phần tiền trả NCC đã chia cho công trình
// (`payment_allocations`) — trên dữ liệu chuyển từ app cũ hai cách ra cùng số (test so với so-chuan.json).
//
// Tên trường trong `cost_allocations.data` (jsonb) GIỮ như app cũ: nhomTay, theoHdtp, nhomLoai, nhomLuat,
// truLoai, quyMuc, roTay / roLoai / roLuat (đời cũ, tự chuyển khi đọc), dgNhom, dgRo1, ro1…
import type { CalcExpense, CalcPayment, CalcPaymentAllocation, CalcTimesheetLine, CalcTimesheetWeek, IsoDate } from './types';
import { weekEnd, type YearFilter, inYear } from './year';

export const ALLOC_TYPE_SUBCONTRACT = 'Thầu Phụ'; // loại cho tiền trả thầu phụ
export const ALLOC_TYPE_SUPPLIER = 'Ứng Nhà Cung Cấp'; // dự phòng khi không đoán được loại của NCC
export const ALLOC_TYPE_OTHER = 'Chi Phí Khác'; // hóa đơn thiếu loại
/** NCC mặc định của dòng sinh từ chấm công (app cũ: CC_DEFAULT_NCC) */
export const TIMESHEET_PARTY = 'CÔNG TY NGUYỄN HỮU';

/** `_tytBoDau`: bỏ dấu, thường, cắt khoảng trắng đầu / cuối */
export function stripVi(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();
}
/** `tytLoaiKey`: khóa so sánh tên loại chi phí */
export function typeKey(type: unknown): string {
  return stripVi(type).replace(/\s+/g, ' ').trim();
}

// ══ BẢNG M2 SÀN ═══════════════════════════════════════════════════════
export type FloorRow = { ten?: string; dvt?: string; kl?: number | string | null; heSo?: number | string | null; tinh?: boolean };

const klNum = (v: unknown): number => {
  const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : 0;
};
const klFactor = (r: FloorRow): number => {
  const n = parseFloat(String(r?.heSo));
  return isFinite(n) && n >= 0 ? n : 1;
};
/** Tổng diện tích sàn quy đổi = Σ (KL × hệ số) của các dòng được tính (`tytTongSanRows`) */
export function floorAreaTotal(rows: readonly FloorRow[] | null | undefined): number {
  return (rows ?? []).reduce((s, r) => s + (r && r.tinh === false ? 0 : klNum(r?.kl) * klFactor(r)), 0);
}

// ══ CÁC DÒNG CHI PHÍ ═════════════════════════════════════════════════
export type AllocLineKind = 'inv' | 'cc' | 'ungtp' | 'ungncc';
export type AllocItem = { name: string | null; amount: number; quantity?: number | null; unit_price?: number | null };
export type AllocPart = {
  ten: string; tien: number; mon: boolean;
  nhom: number; nhomSrc: 'tay' | 'hdtp' | 'luat' | 'loai' | 'macdinh'; nhomRef: string;
  tru: PillarKey | null; truSrc: string;
};
export type AllocLine = {
  /** khóa ỔN ĐỊNH cho nhomTay: 'inv:<id>' | 'ung:<id phiếu chi>' | 'cc|<chủ nhật>|<id công trình>|<đuôi>' */
  key: string;
  kind: AllocLineKind;
  ngay: IsoDate;
  loai: string;
  nd: string;
  doiTuong: string;
  tien: number;
  items: AllocItem[] | null;
  hdtpId: string;
  /** id hóa đơn / phiếu chi / tuần chấm công gốc (để mở xem) */
  refId: string;
  parts: AllocPart[];
  nhomChinh: number;
  nhomNhieu: boolean;
};

export type AllocSubcontract = { id: string; project_id: string; subcontractor_id: string; date: IsoDate | null; value: number; legacy_variation: number; description?: string | null };

export type AllocSource = {
  expenses: readonly CalcExpense[];
  /** dòng vật tư theo id hóa đơn, đã xếp theo `position` */
  expenseLines: ReadonlyMap<string, readonly AllocItem[]>;
  timesheetWeeks: readonly CalcTimesheetWeek[];
  timesheetLines: readonly CalcTimesheetLine[];
  payments: readonly CalcPayment[];
  paymentAllocations: readonly CalcPaymentAllocation[];
  subcontracts: readonly AllocSubcontract[];
  catalogName: ReadonlyMap<string, string>;
  supplierName: ReadonlyMap<string, string>;
  workerName: ReadonlyMap<string, string>;
  subcontractorName: ReadonlyMap<string, string>;
};

const vnDayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

type RawLine = Omit<AllocLine, 'parts' | 'nhomChinh' | 'nhomNhieu'>;

/**
 * `tytCostLines`: các dòng cấu thành TỔNG CHI THỰC TẾ của 1 công trình
 * = hóa đơn Đã TT + lương / HĐ lẻ từ chấm công + tiền trả thầu phụ + tiền trả NCC đã chia cho công trình.
 */
export function allocCostLines(projectId: string, src: AllocSource, years: YearFilter): RawLine[] {
  const lines: RawLine[] = [];
  // Đếm loại chi phí của hóa đơn mua nợ từng NCC → tiền trả NCC xếp vào loại phổ biến nhất của NCC đó
  const supplierTypes = new Map<string, Map<string, number>>();

  for (const e of src.expenses) {
    if (e.project_id !== projectId || !e.date || !inYear(e.date, years)) continue;
    const loai = (e.expense_type_id && src.catalogName.get(e.expense_type_id)) || ALLOC_TYPE_OTHER;
    const supplier = (e.supplier_id && src.supplierName.get(e.supplier_id)) || '';
    if (!e.paid_at_purchase) {
      const k = e.supplier_id ?? '';
      const m = supplierTypes.get(k) ?? new Map<string, number>();
      m.set(loai, (m.get(loai) ?? 0) + e.amount);
      supplierTypes.set(k, m);
      continue;
    }
    const items = src.expenseLines.get(e.id);
    lines.push({
      key: 'inv:' + e.id, kind: 'inv', ngay: e.date, loai, nd: e.description ?? '',
      doiTuong: supplier || (e.buyer_id && src.catalogName.get(e.buyer_id)) || '', tien: e.amount,
      items: items && items.length ? [...items] : null, hdtpId: '', refId: e.id,
    });
  }

  // Dòng sinh từ chấm công (như `buildInvoices`): HĐ mua lẻ từng người, rồi 1 dòng Nhân Công mỗi tuần
  const byWeek = new Map<string, CalcTimesheetLine[]>();
  for (const l of src.timesheetLines) {
    const arr = byWeek.get(l.week_id);
    if (arr) arr.push(l); else byWeek.set(l.week_id, [l]);
  }
  for (const w of src.timesheetWeeks) {
    if (w.project_id !== projectId || !w.week_start) continue;
    const ls = byWeek.get(w.id);
    if (!ls || !ls.length) continue;
    const to = weekEnd(w.week_start);
    if (!inYear(to, years)) continue;
    const pfx = `cc|${w.week_start}|${projectId}|`;
    for (const l of ls) {
      if (!(l.retail_purchase > 0)) continue;
      const name = (l.worker_id && src.workerName.get(l.worker_id)) || '';
      lines.push({
        key: pfx + name + '|hdml', kind: 'cc', ngay: to, loai: 'Hóa Đơn Lẻ',
        nd: l.note || `HĐ mua lẻ – ${name} (${vnDayMonth(w.week_start)}–${vnDayMonth(to)})`,
        doiTuong: TIMESHEET_PARTY, tien: l.retail_purchase, items: null, hdtpId: '', refId: w.id,
      });
    }
    const wage = ls.reduce((s, l) => s + (l.day_units ?? []).reduce((a: number, v) => a + (Number(v) || 0), 0) * (l.daily_wage || 0) + (l.allowance || 0), 0);
    if (wage > 0) {
      lines.push({
        key: pfx + 'nhanCong', kind: 'cc', ngay: to, loai: 'Nhân Công', nd: `Lương tuần ${vnDayMonth(w.week_start)}–${vnDayMonth(to)}`,
        doiTuong: TIMESHEET_PARTY, tien: wage, items: null, hdtpId: '', refId: w.id,
      });
    }
  }

  const topType = (supplierId: string): string => {
    const m = supplierTypes.get(supplierId);
    if (!m) return '';
    return [...m.keys()].sort((a, b) => m.get(b)! - m.get(a)!)[0] ?? '';
  };
  // Phần tiền trả NCC đã chia cho công trình này, gom theo phiếu chi
  const supplierShare = new Map<string, number>();
  for (const a of src.paymentAllocations) {
    if (a.project_id === projectId) supplierShare.set(a.payment_id, (supplierShare.get(a.payment_id) ?? 0) + a.amount);
  }
  for (const p of src.payments) {
    if (!p.date || !inYear(p.date, years)) continue;
    if (p.kind === 'supplier_payment') {
      const tien = supplierShare.get(p.id);
      if (tien === undefined) continue;
      const sid = p.supplier_id ?? '';
      lines.push({
        key: 'ung:' + p.id, kind: 'ungncc', ngay: p.date, loai: topType(sid) || ALLOC_TYPE_SUPPLIER,
        nd: p.note || 'Ứng nhà cung cấp', doiTuong: src.supplierName.get(sid) ?? '', tien, items: null, hdtpId: '', refId: p.id,
      });
    } else if ((p.kind === 'advance' || p.kind === 'progress') && p.project_id === projectId) {
      lines.push({
        key: 'ung:' + p.id, kind: 'ungtp', ngay: p.date, loai: ALLOC_TYPE_SUBCONTRACT,
        nd: p.note || 'Ứng thầu phụ', doiTuong: (p.subcontractor_id && src.subcontractorName.get(p.subcontractor_id)) || '',
        tien: p.amount, items: null, hdtpId: p.subcontract_id ?? '', refId: p.id,
      });
    }
  }

  // Mới nhất lên đầu
  lines.sort((a, b) => String(b.ngay).localeCompare(String(a.ngay)));
  return lines;
}

// ══ HỢP ĐỒNG THẦU PHỤ CỦA 1 CÔNG TRÌNH ═══════════════════════════════
export type AllocContract = { id: string; ten: string; tenKey: string; giaTri: number; ngay: string; nd: string };
export function allocContracts(projectId: string, src: Pick<AllocSource, 'subcontracts' | 'subcontractorName'>): AllocContract[] {
  return src.subcontracts.filter((r) => r.project_id === projectId).map((r) => {
    const ten = (src.subcontractorName.get(r.subcontractor_id) ?? '').trim();
    return { id: r.id, ten, tenKey: stripVi(ten), giaTri: (r.value || 0) + (r.legacy_variation || 0), ngay: r.date ?? '', nd: r.description ?? '' };
  });
}

// ══ 4 NHÓM CHI PHÍ ════════════════════════════════════════════════════
// THỨ TỰ XẾP NHÓM cho 1 khoản (hoặc 1 MÓN của hóa đơn chi tiết):
//   ① gán tay → ② HĐ thầu phụ → ③ luật từ khóa (dùng chung) → ④ bảng Loại chi phí → Nhóm → ⑤ mặc định theo tên loại → Chưa xếp.
export const COST_GROUPS: Record<number, { ten: string; ngan: string; mo: string }> = {
  1: { ten: 'Phần thô & Nhân công hoàn thiện', ngan: 'Thô & NC', mo: 'Vật tư thô, toàn bộ nhân công, thầu phụ thô, quỹ phụ phí công trường' },
  2: { ten: 'Vật tư & Thi công hoàn thiện', ngan: 'Hoàn thiện', mo: 'Gạch ốp lát, TBVS, đèn, cửa · TP điện nước, máy lạnh, chống sét, thạch cao, sơn…' },
  3: { ten: 'Nội thất & Tiện ích bổ sung', ngan: 'Nội thất', mo: 'Đồ gỗ rời & liền tường · thang máy, điện mặt trời, smarthome · sân vườn, hồ bơi…' },
  4: { ten: 'Chi phí khác ngoài gói chính', ngan: 'Ngoài gói', mo: 'Thiết kế - xin phép, ép cọc, phát sinh chủ nhà, khoản theo dõi riêng / máy móc công ty' },
  0: { ten: 'Chưa xếp nhóm', ngan: 'Chưa xếp', mo: 'Cần chọn nhóm' },
};
export const COST_GROUP_IDS = [1, 2, 3, 4] as const;

const GROUP_BY_TYPE: Record<string, number> = {
  'nhan cong': 1, 'hoa don le': 1, 'dao dat - san lap': 1, 'sat thep': 1, 'be tong tuoi': 1, 'vat lieu xay dung': 1,
  'van chuyen': 1, 'xa ban - do rac': 1, 'dien nuoc': 1, 'copha': 1, 'giai khat': 1, 'copha thue': 1,
  'vat tu dien nuoc': 1, 'do be tong': 1, 'be tong tay': 1, 'do thi': 1, 'bao hiem tai nan cn': 1, 'giu cong trinh': 1,
  'ngoai giao': 1, 'thue may moc - thiet bi': 1, 'phu cap an uong': 1, 'thi cong sat thep': 1, 'op lat gach': 1,
  'thau phu': 1,
  'gach op lat': 2, 'vat tu son nuoc': 2, 'thi cong tran thach cao': 2, 'tiep dia - chong set': 2, 'vat tu dien lanh': 2,
  'thi cong da hoa cuong': 2, 'thi cong dien nuoc': 2,
  'thiet bi gia dung': 3,
  'thiet ke - xin phep': 4, 'ep coc': 4, 'sua may': 4, 'van phong': 4, 'luong khoi van phong': 4, 'mua may - thiet bi': 4,
  'bao hiem xa hoi': 4, 'khao sat - do dat': 4, 'thue phi': 4,
};
// Loại lạ → đoán theo TỪ trong tên. Xét Nhóm 4 → 3 → 2 → 1, so theo TỪ NGUYÊN VẸN.
const GROUP_WORDS: [number, string[]][] = [
  [4, ['ep coc', 'thiet ke', 'xin phep', 'hoan cong', 'khao sat', 'mua may', 'sua may', 'khau hao', 'van phong',
    'bao hiem xa hoi', 'thue phi', 'thao do', 'phat sinh']],
  [3, ['noi that', 'thang may', 'homelift', 'nang luong mat troi', 'dien mat troi', 'smarthome', 'nha thong minh',
    'may lanh trung tam', 'san vuon', 'tieu canh', 'ho ca', 'ho boi', 'rem cua', 'gian phoi', 'gia dung', 'do go', 'tu bep', 'sofa']],
  [2, ['gach op', 'op lat', 'gach lat', 'gach men', 'granite', 'da hoa cuong', 'marble', 'san go', 'thiet bi ve sinh', 'tbvs',
    'bon cau', 'lavabo', 'sen tam', 'voi sen', 'bon tam', 'bong den', 'den led', 'den trang tri', 'cong tac', 'o cam',
    'nhom kinh', 'xingfa', 'cua cuon', 'cua go', 'lan can', 'sat my thuat', 'son', 'thach cao', 'dien lanh', 'ong dong',
    'may lanh', 'dieu hoa', 'chong set', 'tiep dia', 'hoan thien']],
  [1, ['sat thep', 'be tong', 'dao dat', 'san lap', 'nhan cong', 'copha', 'vat lieu', 'vat tu', 'xi mang', 'gach xay', 'cat', 'da',
    'van chuyen', 'thue may', 'giai khat', 'xa ban', 'giu cong trinh', 'hoa don le', 'do thi', 'ngoai giao', 'phu cap',
    'bao hiem tai nan', 'chong tham', 'dien nuoc', 'thau phu', 'khoan coc', 'gian giao']],
];
/** `tytNhomTheoChu`: đoán nhóm theo TỪ trong 1 đoạn chữ. Không đoán được → 0 */
export function groupByWords(txt: unknown): number {
  const s = ' ' + stripVi(txt).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  if (!s.trim()) return 0;
  for (const [n, words] of GROUP_WORDS) if (words.some((t) => s.includes(' ' + t + ' '))) return n;
  return 0;
}
/** `tytNhomMacDinh` */
export function defaultGroupOfType(type: unknown): number {
  const k = typeKey(type);
  if (!k) return 0;
  if (Object.prototype.hasOwnProperty.call(GROUP_BY_TYPE, k)) return GROUP_BY_TYPE[k]!;
  return groupByWords(type);
}
/** `_tytRoCuSangNhom`: Rổ cũ (trước 27/10/2026) → Nhóm mới */
export function legacyBucketToGroup(ro: unknown, txt: unknown): number {
  const r = Number(ro);
  if (r === 1) return 1;
  if (r === 3) return 4;
  if (r === 2) { const n = groupByWords(txt); return n >= 2 ? n : 4; }
  return 0;
}

export type GroupRule = { id: string; loai: string; tuKhoa: string; nhom: number };
export const DEFAULT_GROUP_RULES: Omit<GroupRule, 'id'>[] = [
  { loai: 'Điện Nước', tuKhoa: 'bóng đèn, đèn led, đèn trang trí, công tắc, ổ cắm, bồn cầu, vòi sen, sen tắm, lavabo, bồn tắm, máy bơm, máy nước nóng, quạt', nhom: 2 },
  { loai: 'Vật Liệu Xây Dựng', tuKhoa: 'gạch ốp, gạch lát, gạch men, gạch granite, đá hoa cương, granite, marble, sàn gỗ', nhom: 2 },
  { loai: '', tuKhoa: 'thang máy, năng lượng mặt trời, điện mặt trời, smarthome, hồ bơi, hồ cá, sân vườn, rèm cửa, giàn phơi, nội thất', nhom: 3 },
  { loai: '', tuKhoa: 'ép cọc, tháo dỡ', nhom: 4 },
  { loai: 'Khác', tuKhoa: 'xà bần, giải khát, đô thị, giữ công trình', nhom: 1 },
];
export const defaultGroupRules = (): GroupRule[] => DEFAULT_GROUP_RULES.map((l, i) => ({ id: 'nd' + i, ...l }));

// ══ TRỤ CỘT CỦA NHÓM 1 (= 6 rổ: Sắt / Bê tông / Nhân công / Thầu phụ / Quỹ / Khác) ═══════════
export type PillarKey = 'sat' | 'bt' | 'nc' | 'tp' | 'quy' | '';
export const PILLARS: Record<PillarKey, { ten: string; ngan: string; mo: string }> = {
  sat: { ten: 'Sắt thép', ngan: 'Sắt', mo: 'Sắt thép, thi công sắt thép' },
  bt: { ten: 'Bê tông & VL thô', ngan: 'Bê tông', mo: 'Bê tông, copha, VLXD thô (cát, đá, xi măng, gạch xây), đào đất, vận chuyển' },
  nc: { ten: 'Nhân công', ngan: 'Nhân công', mo: 'Toàn bộ công thợ thô + hoàn thiện, phụ cấp' },
  tp: { ten: 'Thầu phụ thô & phụ trợ', ngan: 'Thầu phụ', mo: 'Khoán thầu phụ phần thô + vật tư hệ thống âm (điện nước…)' },
  quy: { ten: 'Quỹ phụ phí', ngan: 'Quỹ', mo: 'Giải khát, xà bần, giữ CT, hóa đơn lẻ, đô thị, ngoại giao' },
  '': { ten: 'Chưa xếp trụ cột', ngan: 'Khác', mo: 'Chọn ở tab CẤU HÌNH RỔ' },
};
export const MAIN_PILLARS: PillarKey[] = ['sat', 'bt', 'nc', 'tp'];
export const PILLAR_ORDER: PillarKey[] = ['sat', 'bt', 'nc', 'tp', 'quy', ''];
export const DEFAULT_FUND_RATE = 50000;

const FUND_WORDS = ['giai khat', 'xa ban', 'giu cong trinh', 'hoa don le', 'do thi', 'ngoai giao'];
const PILLAR_WORDS: [PillarKey, string[]][] = [
  ['quy', FUND_WORDS],
  ['nc', ['nhan cong', 'phu cap', 'bao hiem tai nan', 'op lat gach']],
  ['sat', ['sat thep']],
  ['bt', ['be tong', 'copha', 'vat lieu', 'dao dat', 'san lap', 'van chuyen', 'thue may', 'xi mang']],
  ['tp', ['thau phu', 'thi cong', 'dien nuoc', 'vat tu', 'tiep dia', 'dien lanh', 'chong tham']],
];
/** `tytTruMacDinh` */
export function defaultPillarOfType(type: unknown): PillarKey {
  const k = typeKey(type);
  if (!k) return '';
  for (const [t, words] of PILLAR_WORDS) if (words.some((w) => k.includes(w))) return t;
  return '';
}

// ══ CẤU HÌNH DÙNG CHUNG + PHÂN NHÓM CỦA 1 CÔNG TRÌNH ══════════════════
export type AllocConfig = { nhomLoai: Record<string, number>; nhomLuat: GroupRule[]; truLoai: Record<string, string>; quyMuc: number; coBanGhi: boolean };
type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

/** `tytNhomCfg`: đọc bản ghi cấu hình (data jsonb), tự chuyển roLoai / roLuat đời cũ */
export function readAllocConfig(data: unknown): AllocConfig {
  const r = isObj(data) ? data : null;
  const nhomLoai: Record<string, number> = {};
  let nhomLuat: GroupRule[];
  if (r && isObj(r.nhomLoai)) for (const [k, v] of Object.entries(r.nhomLoai)) nhomLoai[k] = Number(v) || 0;
  else if (r && isObj(r.roLoai)) {
    for (const k of Object.keys(r.roLoai)) {
      const ro = Number(r.roLoai[k]) || 0;
      const md = defaultGroupOfType(k);
      const n = ro === 2 && md >= 2 ? md : legacyBucketToGroup(ro, k);
      if (n !== md) nhomLoai[k] = n;
    }
  }
  if (r && Array.isArray(r.nhomLuat)) nhomLuat = (r.nhomLuat as Json[]).map((l) => ({ id: String(l.id ?? ''), loai: String(l.loai ?? ''), tuKhoa: String(l.tuKhoa ?? ''), nhom: Number(l.nhom) || 0 }));
  else {
    nhomLuat = defaultGroupRules();
    if (r && Array.isArray(r.roLuat)) {
      (r.roLuat as Json[]).filter((l) => l && !/^rd\d+$/.test(String(l.id ?? ''))).forEach((l, i) => {
        const n = legacyBucketToGroup(l.ro, l.tuKhoa);
        if (n) nhomLuat.push({ id: String(l.id || 'q' + i), loai: String(l.loai ?? ''), tuKhoa: String(l.tuKhoa ?? ''), nhom: n });
      });
    }
  }
  const q = r?.quyMuc;
  return {
    nhomLoai, nhomLuat,
    truLoai: r && isObj(r.truLoai) ? Object.fromEntries(Object.entries(r.truLoai).map(([k, v]) => [k, String(v ?? '')])) : {},
    quyMuc: r && q !== '' && q !== null && q !== undefined && Number(q) >= 0 ? Number(q) : DEFAULT_FUND_RATE,
    coBanGhi: !!r,
  };
}

export type AllocStruct = { nhomTay: Record<string, number>; theoHdtp: Record<string, { nhom: number }> };
/** `tytStructOf`: phân nhóm của 1 công trình — tự chuyển roTay / theoHdtp.ro đời cũ */
export function readAllocStruct(data: unknown, contractText: (id: string) => string = () => ''): AllocStruct {
  const r = isObj(data) ? data : null;
  const nhomTay: Record<string, number> = {};
  if (r && isObj(r.nhomTay)) for (const [k, v] of Object.entries(r.nhomTay)) nhomTay[k] = Number(v) || 0;
  else if (r && isObj(r.roTay)) {
    for (const k of Object.keys(r.roTay)) { const n = legacyBucketToGroup(r.roTay[k], ''); if (n) nhomTay[k] = n; }
  }
  const theoHdtp: Record<string, { nhom: number }> = {};
  if (r && isObj(r.theoHdtp)) {
    for (const id of Object.keys(r.theoHdtp)) {
      const v = (isObj(r.theoHdtp[id]) ? r.theoHdtp[id] : {}) as Json;
      const n = Number(v.nhom) || legacyBucketToGroup(v.ro, contractText(id));
      if (n) theoHdtp[id] = { nhom: n };
    }
  }
  return { nhomTay, theoHdtp };
}

const validGroup = (v: unknown): number => ((COST_GROUP_IDS as readonly number[]).includes(Number(v)) ? Number(v) : 0);

/** `tytNhomCuaLoai` */
export function groupOfType(type: unknown, cfg: AllocConfig | null): { nhom: number; src: 'loai' | 'macdinh' } {
  const k = typeKey(type);
  if (cfg && Object.prototype.hasOwnProperty.call(cfg.nhomLoai, k)) return { nhom: Number(cfg.nhomLoai[k]) || 0, src: 'loai' };
  return { nhom: defaultGroupOfType(type), src: 'macdinh' };
}
/** `tytTruCuaLoai` */
export function pillarOfType(type: unknown, cfg: AllocConfig | null): { tru: PillarKey; src: string } {
  const k = typeKey(type);
  if (cfg && Object.prototype.hasOwnProperty.call(cfg.truLoai, k)) {
    const t = cfg.truLoai[k]!;
    return { tru: Object.prototype.hasOwnProperty.call(PILLARS, t) ? (t as PillarKey) : '', src: 'loai' };
  }
  return { tru: defaultPillarOfType(type), src: 'macdinh' };
}

type PartBase = { ten: string; tien: number; mon: boolean };

/** `tytNhomLuatKhop`: luật từ khóa có khớp 1 món không (không dấu, "chứa") */
export function ruleMatches(rule: Pick<GroupRule, 'loai' | 'tuKhoa'>, line: Pick<AllocLine, 'loai' | 'doiTuong' | 'nd'>, part: Pick<PartBase, 'ten' | 'mon'>): boolean {
  if (rule.loai && !typeKey(line.loai).includes(typeKey(rule.loai))) return false;
  const words = String(rule.tuKhoa || '').split(',').map(stripVi).filter(Boolean);
  if (!words.length) return false;
  const txt = stripVi((part.ten || '') + ' ' + (line.doiTuong || '') + (part.mon ? '' : ' ' + (line.nd || '')));
  return words.some((t) => txt.includes(t));
}

function contractWithGroup(line: RawLine, st: AllocStruct, contracts: readonly AllocContract[]): string | null {
  if (!contracts.length) return null;
  const ok = (id: string) => !!st.theoHdtp[id] && validGroup(st.theoHdtp[id]!.nhom) > 0;
  if (line.hdtpId && contracts.some((h) => h.id === line.hdtpId) && ok(line.hdtpId)) return line.hdtpId;
  const k = stripVi(line.doiTuong);
  const hd = k ? contracts.find((h) => h.tenKey === k && ok(h.id)) : null;
  return hd ? hd.id : null;
}
/** `_tytHdtpCua`: HĐ thầu phụ mà 1 khoản THUỘC VỀ (không cần đã chọn nhóm) */
export function contractOfLine(line: Pick<AllocLine, 'hdtpId' | 'doiTuong'>, contracts: readonly AllocContract[]): string | null {
  if (line.hdtpId && contracts.some((h) => h.id === line.hdtpId)) return line.hdtpId;
  const k = stripVi(line.doiTuong);
  const hd = k ? contracts.find((h) => h.tenKey === k) : null;
  return hd ? hd.id : null;
}

/** `tytTachMon`: hóa đơn chi tiết ≥ 2 món → chia tiền theo thành tiền món (món cuối nhận phần lẻ) */
export function splitItems(line: Pick<AllocLine, 'items' | 'nd' | 'tien'>): PartBase[] {
  const its = (line.items ?? []).map((it) => ({ ten: it.name || '', v: Number(it.amount || (it.quantity || 0) * (it.unit_price || 0)) || 0 })).filter((it) => it.v > 0);
  const sum = its.reduce((s, it) => s + it.v, 0);
  if (its.length < 2 || !sum) return [{ ten: line.nd || '', tien: line.tien, mon: false }];
  let rest = line.tien;
  return its.map((it, i) => {
    const t = i === its.length - 1 ? rest : Math.round((line.tien * it.v) / sum);
    rest -= t;
    return { ten: it.ten, tien: t, mon: true };
  });
}

export type AllocSummary = {
  st: AllocStruct; contracts: AllocContract[]; cfg: AllocConfig; lines: AllocLine[];
  tongChi: number; tongSan: number; cpM2: number; cpM2N1: number;
  theoLoai: { loai: string; tien: number; soDong: number }[];
  theoNhom: Record<number, number>;
  theoTru: Record<PillarKey, number>;
  chuaNhom: AllocLine[];
};

/** `tytTongHop`: xếp nhóm từng món + trụ cột (chỉ Nhóm 1) */
export function allocSummary(args: { projectId: string; floorAreas: readonly FloorRow[] | null | undefined; src: AllocSource; years: YearFilter; projectData: unknown; configData: unknown }): AllocSummary {
  const { projectId, src } = args;
  const contracts = allocContracts(projectId, src);
  const st = readAllocStruct(args.projectData, (id) => { const c = contracts.find((h) => h.id === id); return c ? c.ten + ' ' + c.nd : ''; });
  const cfg = readAllocConfig(args.configData);
  const raw = allocCostLines(projectId, src, args.years);
  const tongChi = raw.reduce((s, l) => s + l.tien, 0);
  const tongSan = floorAreaTotal(args.floorAreas);

  const typeMap = new Map<string, { loai: string; tien: number; soDong: number }>();
  for (const l of raw) {
    const o = typeMap.get(l.loai) ?? { loai: l.loai, tien: 0, soDong: 0 };
    o.tien += l.tien; o.soDong++;
    typeMap.set(l.loai, o);
  }
  const theoNhom: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const theoTru: Record<PillarKey, number> = { sat: 0, bt: 0, nc: 0, tp: 0, quy: 0, '': 0 };
  const lines: AllocLine[] = raw.map((l) => {
    const parts: AllocPart[] = splitItems(l).map((pt) => {
      let x: { nhom: number; src: AllocPart['nhomSrc']; ref: string };
      const manual = validGroup(st.nhomTay[l.key]);
      const hd = manual ? null : contractWithGroup(l, st, contracts);
      const rule = manual || hd ? undefined : cfg.nhomLuat.find((lu) => ruleMatches(lu, l, pt));
      if (manual) x = { nhom: manual, src: 'tay', ref: '' };
      else if (hd) x = { nhom: Number(st.theoHdtp[hd]!.nhom), src: 'hdtp', ref: hd };
      else if (rule) x = { nhom: validGroup(rule.nhom), src: 'luat', ref: rule.id };
      else { const m = groupOfType(l.loai, cfg); x = { nhom: m.nhom, src: m.src, ref: '' }; }
      theoNhom[x.nhom] = (theoNhom[x.nhom] ?? 0) + pt.tien;
      const o: AllocPart = { ...pt, nhom: x.nhom, nhomSrc: x.src, nhomRef: x.ref, tru: null, truSrc: '' };
      if (x.nhom === 1) {
        // `_tytTruPart`: loại chưa có trụ cột mà nội dung có chữ lặt vặt của quỹ → Quỹ phụ phí
        let t = pillarOfType(l.loai, cfg);
        if (!t.tru) {
          const txt = stripVi((pt.ten || '') + ' ' + (pt.mon ? '' : l.nd || ''));
          if (FUND_WORDS.some((w) => txt.includes(w))) t = { tru: 'quy', src: 'tukhoa' };
        }
        o.tru = t.tru; o.truSrc = t.src;
        theoTru[t.tru] += pt.tien;
      }
      return o;
    });
    const by: Record<string, number> = {};
    for (const pt of parts) by[pt.nhom] = (by[pt.nhom] ?? 0) + pt.tien;
    const keys = Object.keys(by);
    return { ...l, parts, nhomChinh: Number(keys.sort((a, b) => by[b]! - by[a]!)[0]), nhomNhieu: keys.length > 1 };
  });

  return {
    st, contracts, cfg, lines, tongChi, tongSan,
    cpM2: tongSan > 0 ? tongChi / tongSan : 0,
    cpM2N1: tongSan > 0 ? theoNhom[1]! / tongSan : 0,
    theoLoai: [...typeMap.values()].sort((a, b) => b.tien - a.tien),
    theoNhom, theoTru,
    chuaNhom: lines.filter((l) => l.parts.some((pt) => pt.nhom === 0)),
  };
}

/** `tytHdtpThongKe`: mỗi HĐ thầu phụ có bao nhiêu khoản / tiền, và phần đang xếp nhóm THEO HĐ */
export function contractStats(r: Pick<AllocSummary, 'contracts' | 'lines'>): Map<string, { soKhoan: number; tien: number; nhan: number; tienNhan: number }> {
  const m = new Map<string, { soKhoan: number; tien: number; nhan: number; tienNhan: number }>();
  r.contracts.forEach((h) => m.set(h.id, { soKhoan: 0, tien: 0, nhan: 0, tienNhan: 0 }));
  for (const l of r.lines) {
    const hd = contractOfLine(l, r.contracts);
    if (hd && m.has(hd)) { const o = m.get(hd)!; o.soKhoan++; o.tien += l.tien; }
    for (const pt of l.parts) if (pt.nhomSrc === 'hdtp' && m.has(pt.nhomRef)) { const o = m.get(pt.nhomRef)!; o.nhan++; o.tienNhan += pt.tien; }
  }
  return m;
}

/** Bảng Loại chi phí × Nhóm (0..4) cho màn PHÂN BỔ: mỗi loại 1 dòng, tiền từng nhóm, sắp theo tổng giảm dần */
export function typeGroupMatrix(r: Pick<AllocSummary, 'lines'>): { loai: string; tong: number; nhom: Record<number, number> }[] {
  const m = new Map<string, { loai: string; tong: number; nhom: Record<number, number> }>();
  for (const l of r.lines) {
    const o = m.get(l.loai) ?? { loai: l.loai, tong: 0, nhom: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 } };
    for (const pt of l.parts) { o.nhom[pt.nhom] = (o.nhom[pt.nhom] ?? 0) + pt.tien; o.tong += pt.tien; }
    m.set(l.loai, o);
  }
  return [...m.values()].sort((a, b) => b.tong - a.tong);
}

// ══ BỘ ĐƠN GIÁ ĐỊNH MỨC ═══════════════════════════════════════════════
export type Benchmark = {
  loaiCT: string; nguonPid: string; nguonTen: string; nam: string; tongSan: number; tongChi: number; dgTong: number;
  dgLoai: Record<string, number>; dgNhom: Record<string, number>; dgRo1: number; ro1: Record<string, number>; nhapTay: boolean;
};

/** `_tytDmFields`: số liệu 1 định mức từ kết quả tổng hợp của công trình nguồn (đ/m², làm tròn đồng). Cần tongSan > 0. */
export function benchmarkFields(project: { id: string; name: string; kindLabel?: string }, r: AllocSummary, yearLabel: string): Benchmark {
  const san = r.tongSan;
  const dgLoai: Record<string, number> = {};
  r.theoLoai.forEach((o) => { dgLoai[o.loai] = Math.round(o.tien / san); });
  const dgNhom: Record<string, number> = {};
  COST_GROUP_IDS.forEach((n) => { dgNhom[n] = Math.round((r.theoNhom[n] || 0) / san); });
  const ro1: Record<string, number> = {};
  PILLAR_ORDER.forEach((t) => { ro1[t === '' ? 'khac' : t] = Math.round((r.theoTru[t] || 0) / san); });
  return {
    loaiCT: project.kindLabel ?? '', nguonPid: project.id, nguonTen: project.name, nam: yearLabel,
    tongSan: Math.round(san * 100) / 100, tongChi: r.tongChi, dgTong: Math.round(r.tongChi / san), dgLoai, dgNhom,
    dgRo1: Math.round(r.theoNhom[1]! / san), ro1, nhapTay: false,
  };
}

/** Đọc 1 bản ghi định mức (data jsonb) — thiếu trường thì coi như 0 / rỗng */
export function readBenchmark(data: unknown): Benchmark {
  const r = isObj(data) ? data : {};
  const numMap = (v: unknown) => (isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x) || 0])) : {});
  return {
    loaiCT: String(r.loaiCT ?? ''), nguonPid: String(r.nguonPid ?? ''), nguonTen: String(r.nguonTen ?? ''), nam: String(r.nam ?? ''),
    tongSan: Number(r.tongSan) || 0, tongChi: Number(r.tongChi) || 0, dgTong: Number(r.dgTong) || 0,
    dgLoai: numMap(r.dgLoai), dgNhom: numMap(r.dgNhom), dgRo1: Number(r.dgRo1) || 0, ro1: numMap(r.ro1), nhapTay: r.nhapTay === true,
  };
}
/** `tytDmCoRo1` */
export const benchmarkHasPillars = (dm: Pick<Benchmark, 'ro1'> | null | undefined): boolean => !!dm && MAIN_PILLARS.some((t) => Number(dm.ro1[t]) > 0);

/** So đơn giá Nhóm 1 của công trình với định mức: % lệch (dương = cao hơn định mức). Không so được → null */
export function compareToBenchmark(r: Pick<AllocSummary, 'cpM2N1' | 'tongSan'>, dm: Pick<Benchmark, 'dgRo1'> | null | undefined): number | null {
  if (!dm || !(dm.dgRo1 > 0) || !(r.tongSan > 0)) return null;
  return ((r.cpM2N1 - dm.dgRo1) / dm.dgRo1) * 100;
}

// ══ KIỂM SOÁT ĐỊNH MỨC NHÓM 1 (`tytKiemSoat`) ═════════════════════════
export type ControlRow = { k: PillarKey; ten: string; dg: number; ns: number; tt: number; conLai: number; pct: number; vuot: boolean };
export function benchmarkControl(dm: Pick<Benchmark, 'ro1'> | null, area: number, r: Pick<AllocSummary, 'theoTru' | 'cfg'>) {
  const ro1 = dm?.ro1 ?? {};
  const mk = (k: PillarKey, dg: unknown): ControlRow => {
    const d = Number(dg) || 0;
    const ns = Math.round(d * area);
    const tt = r.theoTru[k] || 0;
    return { k, ten: PILLARS[k].ten, dg: d, ns, tt, conLai: ns - tt, vuot: tt - ns >= 1000, pct: ns ? (tt / ns) * 100 : tt ? Infinity : 0 };
  };
  const rows = MAIN_PILLARS.map((k) => mk(k, ro1[k]));
  rows.push(mk('quy', r.cfg.quyMuc));
  const other = mk('', ro1.khac);
  if (other.tt || other.dg) rows.push(other);
  const ns = rows.reduce((s, x) => s + x.ns, 0), tt = rows.reduce((s, x) => s + x.tt, 0);
  return {
    rows, soVuot: rows.filter((x) => x.vuot).length,
    tong: { dg: rows.reduce((s, x) => s + x.dg, 0), ns, tt, conLai: ns - tt, vuot: tt - ns >= 1000, pct: ns ? (tt / ns) * 100 : 0 },
  };
}
