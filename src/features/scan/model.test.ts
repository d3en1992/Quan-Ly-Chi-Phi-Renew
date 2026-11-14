import { describe, expect, it } from 'vitest';
import {
  addressForms, applyProjectGuess, buildPrompt, foldVi, guessProjectFromHistory, keepIfSimilar, matchName, matchProjectByNote, normalizeScan, pickFixture, promptKinds, bulletLines,
  scanExtras, supplierRecentProjects, toIsoDate, toMoney, toPhones, type ExpenseHistoryRow, type ProjectMeta, type ScanContext,
} from '@shared/scan';
import fxNew from '../../../supabase/functions/scan-document/fixtures/hoa-don-ncc-moi.json';
import fxBlur from '../../../supabase/functions/scan-document/fixtures/hoa-don-chu-mo.json';
import fxId from '../../../supabase/functions/scan-document/fixtures/cccd.json';
import fxContract from '../../../supabase/functions/scan-document/fixtures/hop-dong.json';
import fxShop from '../../../supabase/functions/scan-document/fixtures/cua-hang.json';
import { appendNote } from './ScanIdCard';
import { printedTotalGap } from '@/lib/calc';
import { exportFileName, sheetName, vnDate } from '@/lib/export/ten-file';
import { checkPrintedTotal, contactNameFromSaid, contractCustomer, guessContactKind, idCardCandidates, invoiceFromScan, shortNameFromFull, supplierPlan } from './model';
import { materialsText, materialsTsv, methodNote } from './shared';

const ctx: ScanContext = {
  projects: ['CT A Huynh (PTH, TP)'], expense_types: ['Copha', 'Sắt Thép'], suppliers: ['SẮT THÉP AN PHÚ'], buyers: ['KS LAM'],
  workers: ['HIỀN', 'LONG'], customers: ['A Huynh'], employees: [],
};
const lists = {
  projects: [{ id: 'p1', name: 'CT A Huynh (PTH, TP)' }], types: [{ id: 't1', name: 'Copha' }, { id: 't2', name: 'Sắt Thép' }],
  buyers: [{ id: 'b1', name: 'KS LAM' }], suppliers: [{ id: 's1', name: 'SẮT THÉP AN PHÚ', address: null, phone: null, buys_on_credit: true }],
};

describe('_shared/scan — chuẩn hóa kết quả AI', () => {
  it('tiền, ngày', () => {
    expect(toMoney('1.250.000')).toBe(1250000);
    expect(toMoney(-5)).toBe(0);
    expect(toIsoDate('09/11/2026')).toBe('2026-11-09');
    expect(toIsoDate('2026-1-5')).toBe('2026-01-05');
    expect(toIsoDate('32/13/2026')).toBe('');
  });
  it('tên khớp chỉ giữ nếu có trong danh sách (AI hay bịa)', () => {
    const r = normalizeScan({ kind: 'invoice', invoice: { supplier_match: 'VLXD KHÔNG CÓ', expense_type_match: 'copha', lines: [] } }, ctx);
    expect(r.kind === 'invoice' && r.invoice.supplier_match).toBe('');
    expect(r.kind === 'invoice' && r.invoice.expense_type_match).toBe('Copha');
  });
  it('chọn fixture giả lập theo loại / ghi chú', () => {
    expect(pickFixture('auto', '')).toBe('hoa-don-ncc-moi');
    expect(pickFixture('invoice', 'chữ mờ quá')).toBe('hoa-don-chu-mo');
    expect(pickFixture('auto', 'CCCD thợ Hiền')).toBe('cccd');
    expect(pickFixture('contract', '')).toBe('hop-dong');
  });
});

describe('Chụp hóa đơn → form', () => {
  it('NCC mới: giữ tên in trên hóa đơn, gợi ý thêm vào danh mục kèm địa chỉ / SĐT', () => {
    const r = normalizeScan(fxNew, ctx);
    if (r.kind !== 'invoice') throw new Error('sai loại');
    const d = invoiceFromScan(r.invoice, lists, '2026-11-12');
    expect(d.draft.supplier).toBe('CH VLXD THANH BÌNH');
    expect(d.draft.type).toBe('Copha');
    expect(d.draft.buyer).toBe('KS LAM');
    expect(d.draft.project).toBe('');
    expect(d.unsureHead).toContain('project');
    expect(d.draft.lines).toHaveLength(6);
    expect(d.unsureCells).toHaveLength(2);
    expect(checkPrintedTotal(d.draft, d.printedTotal)).toEqual({ status: 'match', printed: 8500000 });
    const plan = supplierPlan(d.draft.supplier, r.invoice, lists.suppliers);
    expect(plan).toEqual({ kind: 'new', name: 'CH VLXD THANH BÌNH', address: '128 Tỉnh lộ 8, Tân An Hội, Củ Chi', phone: '0908123456' });
  });
  it('chữ mờ: NCC có sẵn (Mua nợ → bỏ tích Đã TT), thiếu địa chỉ / SĐT → hỏi bổ sung; tổng lệch số in', () => {
    const r = normalizeScan(fxBlur, ctx);
    if (r.kind !== 'invoice') throw new Error('sai loại');
    const d = invoiceFromScan(r.invoice, lists, '2026-11-12');
    expect(d.draft.supplier).toBe('SẮT THÉP AN PHÚ');
    expect(d.draft.paid).toBe(false);
    expect(d.unsureHead).toEqual(expect.arrayContaining(['date', 'project']));
    const t = checkPrintedTotal(d.draft, d.printedTotal);
    expect(t.status).toBe('diff');
    expect(t.status === 'diff' && t.gap).toBe(600000);
    const plan = supplierPlan(d.draft.supplier, r.invoice, lists.suppliers);
    expect(plan).toMatchObject({ kind: 'existing', id: 's1', missingAddress: '45 Nguyễn Văn Quá, Q12', missingPhone: '0283888999' });
    // người dùng đổi sang NCC khác → không gợi ý địa chỉ của cửa hàng in trên hóa đơn
    expect(supplierPlan('VLXD KHÁC', r.invoice, lists.suppliers)).toEqual({ kind: 'new', name: 'VLXD KHÁC', address: '', phone: '' });
  });
  it('printedTotalGap', () => {
    expect(printedTotalGap(0, 100)).toBeNull();
    expect(printedTotalGap(100, 100)).toBe(0);
    expect(printedTotalGap(100, 90)).toBe(10);
  });
});

describe('Chụp CCCD / hợp đồng', () => {
  it('CCCD: khớp tên gọi HIỀN ↔ NGUYỄN THỊ HIỀN, người chưa có CCCD đứng trước', () => {
    const r = normalizeScan(fxId, ctx);
    if (r.kind !== 'id_card') throw new Error('sai loại');
    expect(r.id_card.contact_match).toBe('HIỀN');
    const c = idCardCandidates(r.id_card, {
      workers: [{ id: 'w1', name: 'HIỀN', full_name: null }, { id: 'w2', name: 'LONG', full_name: null }, { id: 'w3', name: 'HIỀN BC', full_name: null }],
      customers: [], employees: [],
    }, (id) => id === 'w3');
    expect(c.map((x) => x.id)).toEqual(['w1', 'w3']);
    expect(guessContactKind('', 'CCCD khách hàng chủ nhà')).toBe('customer');
    expect(guessContactKind('', '')).toBe('worker');
    expect(shortNameFromFull('NGUYỄN THỊ HIỀN', 'worker')).toBe('HIỀN');
  });
  it('hợp đồng: khách hàng mới / có sẵn', () => {
    const r = normalizeScan(fxContract, ctx);
    if (r.kind !== 'contract') throw new Error('sai loại');
    expect(r.contract.value).toBe(1850000000);
    expect(contractCustomer(r.contract, [{ id: 'c1', name: 'A Huynh', full_name: null }])).toBeUndefined();
    expect(contractCustomer({ ...r.contract, customer_name: 'a huynh' }, [{ id: 'c1', name: 'A Huynh', full_name: null }])?.id).toBe('c1');
  });
});

describe('lib/export/ten-file', () => {
  it('tên sheet bỏ ngoặc, ký tự cấm, khử trùng', () => {
    const used = new Set<string>();
    expect(sheetName('CT Cô Sáu (42 CVT, TB)', used)).toBe('CT Cô Sáu');
    expect(sheetName('CT Cô Sáu (khác)', used)).toBe('CT Cô Sáu (2)');
    expect(sheetName('A/B:C*?', used)).toBe('A B C');
    expect(sheetName('x'.repeat(40), used)).toHaveLength(28);
  });
  it('tên file, ngày', () => {
    expect(exportFileName(new Date(2026, 10, 12, 9, 5))).toBe('DuLieu_2026-11-12_0905.xlsx');
    expect(vnDate('2026-11-09')).toBe('09/11/2026');
  });
});

describe('_shared/scan — khớp công trình theo ghi chú', () => {
  const ps: ProjectMeta[] = [
    { name: 'CT Cô Phụng (137 Thoại Ngọc Hầu, TP)', status: 'closed', owner_name: 'Cô Phụng' },
    { name: 'CT A Huynh (PTH, TP)', status: 'active', owner_name: 'A Huynh' },
    { name: 'SC Nhà Tình Đăng - 213 Quang Trung, GV', status: 'active', owner_name: 'Tình' },
    { name: 'CT Nhà Tình (925 Âu Cơ, TP)', status: 'active', owner_name: 'Tình' },
    { name: 'NB Tình (840 HL2, BT)', status: 'closed', owner_name: 'Tình' },
    { name: 'SN A Sang - Thi Công WC', status: 'closed', owner_name: 'A Sang', aliases: ['sn - a sang (le quat, tp)'] },
  ];
  it('bỏ dấu, không phân biệt hoa thường', () => {
    expect(foldVi('Cô Phụng')).toBe('co phung');
    expect(matchProjectByNote('cô phụng', ps)).toBe('CT Cô Phụng (137 Thoại Ngọc Hầu, TP)');
    expect(matchProjectByNote('sắt thép CT co phung', ps)).toBe('CT Cô Phụng (137 Thoại Ngọc Hầu, TP)');
    expect(matchProjectByNote('A Huynh', ps)).toBe('CT A Huynh (PTH, TP)');
  });
  it('không khớp / khớp nhiều công trình đang thi công → để trống', () => {
    expect(matchProjectByNote('Copha', ps)).toBe('');           // loại chi phí, không phải công trình
    expect(matchProjectByNote('', ps)).toBe('');
    expect(matchProjectByNote('chú Tình', ps)).toBe('');        // 3 công trình "Tình", 2 đang thi công
    expect(matchProjectByNote('nhà Tình', ps)).toBe('CT Nhà Tình (925 Âu Cơ, TP)');
    expect(matchProjectByNote('Tình Đăng', ps)).toBe('SC Nhà Tình Đăng - 213 Quang Trung, GV');
  });
  it('câu lệnh có quy tắc số viết tắt + mẫu JSON + mô tả công trình', () => {
    const p = buildPrompt('invoice', 'Cô Phụng', { ...ctx, project_hints: { 'CT A Huynh (PTH, TP)': 'ĐANG THI CÔNG' }, today: '2026-11-13' });
    expect(p).toContain('"313Đ" = 313000');
    expect(p).toContain('"printed_total"');
    expect(p).toContain('- CT A Huynh (PTH, TP) (ĐANG THI CÔNG)');
    expect(p).toContain('Hôm nay là 2026-11-13');
    expect(p).not.toContain('id_card');
  });
});

describe('_shared/scan — đoán công trình theo hóa đơn đã lưu', () => {
  // Dữ liệu giống thật (Supabase trên máy, 13/11/2026): 2 công trình đang thi công cùng P. Phú Thọ Hòa
  const ps: ProjectMeta[] = [
    { name: 'CT A Huynh (PTH, TP)', status: 'active', owner_name: 'A Huynh', address: '66 Phú Thọ Hòa, P Phú Thọ Hòa, TPHCM' },
    { name: 'SC A Phượng (Cải tạo sân, Đổ giả)', status: 'active', owner_name: 'A Phượng', address: '80/8 Phan Đình Phùng, P Phú Thọ Hòa, HCM' },
    { name: 'CT A Nhựt (205 Thoại Ngọc Hầu, TP)', status: 'active', owner_name: 'A Nhựt', address: '205/15A Thoại Ngọc Hầu, P Phú Thạnh, HCM' },
    { name: 'CT Cô Phụng (137 Thoại Ngọc Hầu, TP)', status: 'completed', owner_name: 'Cô Phụng', address: '137 Thoại Ngọc Hầu, P Phú Thạnh' },
  ];
  const row = (date: string, project: string, supplier = 'SẮT THÉP AN PHÚ', note = ''): ExpenseHistoryRow => ({ date, project, supplier, note });
  const history: ExpenseHistoryRow[] = [
    row('2026-10-25', 'CT A Huynh (PTH, TP)'), row('2026-10-18', 'CT A Huynh (PTH, TP)'), row('2026-10-02', 'CT A Huynh (PTH, TP)'),
    row('2026-09-19', 'CT A Nhựt (205 Thoại Ngọc Hầu, TP)'),
    row('2026-11-05', 'SC A Phượng (Cải tạo sân, Đổ giả)', 'VLXD HOÀNG ANH'),
  ];

  it('viết tắt địa chỉ: Phú Thọ Hòa → pt hoa, pth', () => {
    const f = addressForms('66 Phú Thọ Hòa, P Phú Thọ Hòa, TPHCM');
    expect(f).toEqual(expect.arrayContaining(['phu tho hoa', 'pt hoa', 'pth', 'p tho hoa']));
    expect(f).not.toContain('tp');
  });
  it('ca mẫu: THÉP AN PHÚ, khách "Chú Hữu PT Hòa" → CT A Huynh (địa chỉ khớp 2 CT, lịch sử NCC phân định)', () => {
    expect(guessProjectFromHistory({ supplier: 'SẮT THÉP AN PHÚ', date: '2026-11-12', text: 'Chú Hữu PT Hòa' }, history, ps)).toBe('CT A Huynh (PTH, TP)');
  });
  it('chỉ địa chỉ, NCC mới chưa giao lần nào → 2 công trình ngang nhau → không đoán', () => {
    expect(guessProjectFromHistory({ supplier: 'VLXD MỚI TINH', date: '2026-11-12', text: 'Chú Hữu PT Hòa' }, history, ps)).toBe('');
  });
  it('chỉ địa chỉ, khớp đúng 1 công trình → chọn', () => {
    expect(guessProjectFromHistory({ supplier: '', date: '2026-11-12', text: 'giao 80 Phan Đình Phùng' }, history, ps)).toBe('SC A Phượng (Cải tạo sân, Đổ giả)');
  });
  it('không có tên khách: NCC giao hẳn cho 1 công trình → chọn; chia đều → không đoán', () => {
    expect(guessProjectFromHistory({ supplier: 'SẮT THÉP AN PHÚ', date: '2026-11-12' }, history, ps)).toBe('CT A Huynh (PTH, TP)');
    const even = [row('2026-11-01', 'CT A Huynh (PTH, TP)'), row('2026-11-02', 'CT A Nhựt (205 Thoại Ngọc Hầu, TP)')];
    expect(guessProjectFromHistory({ supplier: 'SẮT THÉP AN PHÚ', date: '2026-11-12' }, even, ps)).toBe('');
  });
  it('hóa đơn cũ hơn 90 ngày không tính; công trình đã xong bị trừ điểm', () => {
    const old = [row('2026-06-01', 'CT A Huynh (PTH, TP)'), row('2026-06-02', 'CT A Huynh (PTH, TP)')];
    expect(guessProjectFromHistory({ supplier: 'SẮT THÉP AN PHÚ', date: '2026-11-12' }, old, ps)).toBe('');
    const done = [row('2026-11-01', 'CT Cô Phụng (137 Thoại Ngọc Hầu, TP)'), row('2026-10-20', 'CT A Nhựt (205 Thoại Ngọc Hầu, TP)')];
    expect(guessProjectFromHistory({ supplier: 'SẮT THÉP AN PHÚ', date: '2026-11-12', text: 'TNH' }, done, ps)).toBe('');
  });
  it('tên khách từng có trong nội dung hóa đơn cũ của công trình → cộng điểm', () => {
    const h = [row('2026-10-01', 'SC A Phượng (Cải tạo sân, Đổ giả)', 'VLXD HOÀNG ANH', 'Cát đá — chú Bảy giao')];
    expect(guessProjectFromHistory({ supplier: 'THÉP KHÁC', date: '2026-11-12', text: 'chú Bảy' }, h, ps)).toBe('SC A Phượng (Cải tạo sân, Đổ giả)');
  });
  it('NCC gần đây giao cho đâu (dòng gửi kèm cho AI)', () => {
    expect(supplierRecentProjects(history)['SẮT THÉP AN PHÚ']).toBe(
      'gần đây giao cho: CT A Huynh (PTH, TP) 3 lần, gần nhất 25/10; CT A Nhựt (205 Thoại Ngọc Hầu, TP) 1 lần, gần nhất 19/09');
  });
  it('thứ tự: ghi chú > lịch sử > AI; không theo ghi chú thì tô vàng', () => {
    const c: ScanContext = { ...ctx, projects: ps.map((p) => p.name), project_meta: ps, recent_expenses: history, today: '2026-11-13' };
    const scan = (project_match = '') => normalizeScan({ kind: 'invoice', invoice: {
      supplier_name: 'THÉP AN PHÚ', customer_text: 'Chú Hữu PT Hòa', date: '12/11/2026', project_match, lines: [],
    } }, c);
    // AI chọn nhầm SC A Phượng → lịch sử sửa thành CT A Huynh, tô vàng
    const a = applyProjectGuess(scan('SC A Phượng (Cải tạo sân, Đổ giả)'), '', c);
    expect(a.kind === 'invoice' && a.invoice.customer_text).toBe('Chú Hữu PT Hòa');
    expect(a.kind === 'invoice' && a.invoice.project_match).toBe('CT A Huynh (PTH, TP)');
    expect(a.kind === 'invoice' && a.invoice.low_confidence).toContain('project_match');
    // Ghi chú thắng, không tô vàng
    const b = applyProjectGuess(scan(), 'A Nhựt', c);
    expect(b.kind === 'invoice' && b.invoice.project_match).toBe('CT A Nhựt (205 Thoại Ngọc Hầu, TP)');
    expect(b.kind === 'invoice' && b.invoice.low_confidence).not.toContain('project_match');
    // Lịch sử không đủ → giữ AI chọn, tô vàng
    const d = applyProjectGuess(scan('SC A Phượng (Cải tạo sân, Đổ giả)'), '', { ...c, recent_expenses: [] });
    expect(d.kind === 'invoice' && d.invoice.project_match).toBe('SC A Phượng (Cải tạo sân, Đổ giả)');
    expect(d.kind === 'invoice' && d.invoice.low_confidence).toContain('project_match');
  });
});

describe('_shared/scan — nút AI: tiền ứng, thu tiền, vật tư, sổ cộng tiền', () => {
  const c2: ScanContext = { ...ctx, subcontractors: ['HÀ ĐIỆN NƯỚC', 'ĐỎ', 'LONG CAI', 'TPDN BÉ'], customers: ['A Huynh', 'A Nhật'], today: '2026-11-13' };
  it('số điện thoại: chỉ chữ số, tối đa 2 số, bỏ trùng', () => {
    expect(toPhones('0903.358.289 - 0903.358.286 - 0909 111 222')).toEqual(['0903358289', '0903358286']);
    expect(toPhones(['0903 358 289', '0903358289', '123'])).toEqual(['0903358289']);
  });
  it('khớp tên nói ra với danh mục (không dấu, bỏ anh/chú)', () => {
    expect(matchName('Hà điện nước', c2.subcontractors!)).toBe('HÀ ĐIỆN NƯỚC');
    expect(matchName('anh Nhật', c2.customers)).toBe('A Nhật');
    expect(matchName('anh Tư', c2.customers)).toBe('');
    expect(matchName('Bé điện nước', c2.subcontractors!)).toBe('TPDN BÉ');
  });
  it('tiền ứng: khớp thầu phụ bằng code khi AI không khớp, hình thức chuyển khoản', () => {
    const r = normalizeScan({ kind: 'advance', advance: { date: '2026-11-13', amount: '5.000.000', subcontractor_text: 'Hà điện nước', method: 'transfer', pay_kind: 'xyz' } }, c2);
    expect(r.kind).toBe('advance');
    if (r.kind !== 'advance') return;
    expect(r.advance).toMatchObject({ amount: 5_000_000, subcontractor_match: 'HÀ ĐIỆN NƯỚC', method: 'transfer', pay_kind: 'advance' });
  });
  it('thu tiền: không nói hình thức → method rỗng; công trình theo tên khách', () => {
    const raw = { kind: 'receipt', question: 'Tiền mặt hay chuyển khoản?', receipt: { amount: 100_000_000, customer_text: 'anh Huynh', receipt_kind: 'stage' } };
    const r = applyProjectGuess(normalizeScan(raw, c2), '', { ...c2, project_meta: [{ name: 'CT A Huynh (PTH, TP)', status: 'active', owner_name: 'A Huynh' }] });
    expect(r.kind === 'receipt' && r.receipt).toMatchObject({ method: '', customer_match: 'A Huynh', project_match: 'CT A Huynh (PTH, TP)' });
    expect(scanExtras(raw).question).toBe('Tiền mặt hay chuyển khoản?');
  });
  it('sổ cộng tiền: dòng chỉ có số tiền → SL 1 × đơn giá = số tiền, giữ ngày dòng', () => {
    const r = normalizeScan({ kind: 'invoice', invoice: { is_summary: true, printed_total: 131_002_000, supplier_phones: ['0903358289', '0903358286', '0909'],
      lines: [{ date: '2026-11-13', name: 'Hóa đơn ngày 13/11', amount: 73_261_000 }, { date: '2026-11-12', name: 'Hóa đơn ngày 12/11', amount: 31_321_000 }] } }, c2);
    if (r.kind !== 'invoice') throw new Error('sai loại');
    expect(r.invoice.is_summary).toBe(true);
    expect(r.invoice.lines[0]).toMatchObject({ quantity: 1, unit_price: 73_261_000, amount: 73_261_000, date: '2026-11-13' });
    expect(r.invoice.supplier_phones).toEqual(['0903358289', '0903358286']);
    expect(r.invoice.supplier_phone).toBe('0903358289');
  });
  it('hợp đồng / dự toán: diện tích từng phần, bỏ dòng tổng', () => {
    const r = normalizeScan({ kind: 'contract', contract: { value: 2_950_960_688, is_estimate: true, unit_price: 3_000_000,
      floor_areas: [{ name: 'Móng cọc', area: 32 }, { name: 'Lầu 4 + ST', area: 39.120000000000005 }, { name: 'TỔNG CỘNG', area: 361.34 }] } }, c2);
    if (r.kind !== 'contract') throw new Error('sai loại');
    expect(r.contract.floor_areas).toEqual([{ name: 'Móng cọc', area: 32 }, { name: 'Lầu 4 + ST', area: 39.12 }]);
    expect(r.contract).toMatchObject({ is_estimate: true, unit_price: 3_000_000 });
  });
  it('danh sách vật tư → chữ gửi Zalo + bảng Excel', () => {
    const r = normalizeScan({ kind: 'material_list', material_list: { title: 'Ván cốp pha', delivery_note: 'Giao qua chùa',
      items: [{ name: 'Ván cốp pha 45 cm', quantity: 8, unit: 'tấm' }, { name: 'Dây điện 1.5', quantity: 2.5, unit: 'cuộn', note: 'xanh' }, { name: '' }] } }, c2);
    if (r.kind !== 'material_list') throw new Error('sai loại');
    expect(r.material_list.items).toHaveLength(2);
    expect(materialsText(r.material_list.items, { title: 'Ván cốp pha', project: 'CT A Huynh', delivery: 'qua chùa' }))
      .toBe('VÁN CỐP PHA — CT A Huynh\n1. Ván cốp pha 45 cm: 8 tấm\n2. Dây điện 1.5: 2,5 cuộn (xanh)\nGiao: qua chùa');
    expect(materialsTsv(r.material_list.items).split('\n')[1]).toBe('1\tVán cốp pha 45 cm\t8\ttấm\t');
  });
  it('phiếu chi ghi hình thức vào nội dung', () => {
    expect(methodNote('transfer', 'Ứng tiền điện nước')).toBe('CK · Ứng tiền điện nước');
    expect(methodNote('cash', '')).toBe('Tiền mặt');
    expect(methodNote('', 'abc')).toBe('abc');
  });
  it('câu lệnh: chỉ đưa loại được phép, có quy tắc lời nói + cốp pha; CCCD không nằm trong AI tự nhận', () => {
    expect(promptKinds('auto', { invoice: true, advance: false, receipt: true })).toEqual(['invoice', 'receipt']);
    const p = buildPrompt('auto', '', c2, { invoice: true, advance: true, receipt: true, contract: true, material_list: true });
    expect(p).toContain('"5 triệu" = 5000000');
    expect(p).toContain('"45:8T"');
    expect(p).toContain('- HÀ ĐIỆN NƯỚC');
    expect(p).not.toContain('"id_card"');
  });
});

describe('_shared/scan — AI trả JSON phẳng (không bọc theo loại)', () => {
  it('vẫn đọc được các ô nằm ngoài cùng', () => {
    const r = normalizeScan({ kind: 'material_list', title: 'Vật tư điện', delivery_note: 'Giao qua chùa', items: [{ name: 'Băng keo điện', quantity: 6, unit: 'cuộn' }] }, ctx);
    expect(r.kind === 'material_list' && r.material_list).toMatchObject({ title: 'Vật tư điện', delivery_note: 'Giao qua chùa', items: [{ name: 'Băng keo điện', quantity: 6 }] });
  });
});

describe('_shared/scan — lời nói "anh / chị" khớp danh mục "A / C"', () => {
  it('"nhà anh Huynh" → CT A Huynh', () => {
    const ps: ProjectMeta[] = [{ name: 'CT A Huynh (PTH, TP)', status: 'active', owner_name: 'A Huynh' }, { name: 'SC A Phượng', status: 'active', owner_name: 'A Phượng' }];
    expect(matchProjectByNote('ứng Hà điện nước công trình nhà anh Huynh 5 triệu', ps)).toBe('CT A Huynh (PTH, TP)');
    expect(matchProjectByNote('chị Phượng', ps)).toBe('');
  });
});

describe('nút AI — chữ gửi Zalo', () => {
  it('ghi chú giao hàng không lặp chữ "Giao"', () => {
    expect(materialsText([], { delivery: 'Giao qua chùa' })).toBe('Giao qua chùa');
    expect(materialsText([], { delivery: 'qua chùa' })).toBe('Giao: qua chùa');
  });
});

describe('_shared/scan — sổ cộng tiền ghi tắt nghìn', () => {
  it('dòng dưới 100.000 đ → nhân 1.000 và tô vàng', () => {
    const r = normalizeScan({ kind: 'invoice', invoice: { is_summary: true, lines: [{ name: 'Hóa đơn ngày 11/11', amount: 26_430 }, { name: 'Hóa đơn ngày 12/11', amount: 31_321_000 }] } }, ctx);
    if (r.kind !== 'invoice') throw new Error('sai loại');
    expect(r.invoice.lines.map((l) => [l.amount, l.unit_price, l.low_confidence])).toEqual([[26_430_000, 26_430_000, ['amount']], [31_321_000, 31_321_000, []]]);
  });
});

describe('_shared/scan — ứng / trả tiền nhà cung cấp', () => {
  const c3: ScanContext = { ...ctx, subcontractors: ['TPDN HÀ', 'ĐỎ'], suppliers: ['SẮT THÉP AN PHÚ', 'VLXD BÁ HÒA'] };
  it('AI nói party = supplier → phiếu trả NCC, khớp NCC', () => {
    const r = normalizeScan({ kind: 'advance', advance: { party: 'supplier', amount: 50_000_000, subcontractor_text: 'sắt thép An Phú', supplier_match: 'SẮT THÉP AN PHÚ' } }, c3);
    expect(r.kind === 'advance' && r.advance).toMatchObject({ party: 'supplier', supplier_match: 'SẮT THÉP AN PHÚ', subcontractor_match: '' });
  });
  it('AI quên party nhưng tên chỉ có trong danh mục NCC → vẫn là NCC', () => {
    const r = normalizeScan({ kind: 'advance', advance: { amount: 50_000_000, subcontractor_text: 'Sắt thép An Phú' } }, c3);
    expect(r.kind === 'advance' && r.advance).toMatchObject({ party: 'supplier', supplier_match: 'SẮT THÉP AN PHÚ' });
  });
  it('thầu phụ giữ nguyên', () => {
    const r = normalizeScan({ kind: 'advance', advance: { amount: 5_000_000, subcontractor_text: 'Hà điện nước' } }, c3);
    expect(r.kind === 'advance' && r.advance).toMatchObject({ party: 'subcontractor', subcontractor_match: 'TPDN HÀ', supplier_match: '' });
  });
});

describe('_shared/scan — AI khớp nhầm người', () => {
  it('tên không có chữ nào trùng → bỏ; có chữ trùng → giữ', () => {
    expect(keepIfSimilar('VLXD ĐẠI HUY LONG', 'VLXD Bá Hòa')).toBe('');
    expect(keepIfSimilar('SẮT THÉP AN PHÚ', 'sắt thép An Phú')).toBe('SẮT THÉP AN PHÚ');
    expect(keepIfSimilar('TPDN HÀ', 'Hà điện nước')).toBe('TPDN HÀ');
    expect(keepIfSimilar('VLXD ĐẠI HUY LONG', '')).toBe('VLXD ĐẠI HUY LONG');
  });
  it('phiếu trả NCC với tên lạ → để trống cho "Thêm NCC mới"', () => {
    const r = normalizeScan({ kind: 'advance', advance: { party: 'supplier', amount: 12_000_000, subcontractor_text: 'VLXD Bá Hòa', supplier_match: 'VLXD ĐẠI HUY LONG' } },
      { ...ctx, suppliers: ['VLXD ĐẠI HUY LONG', 'SẮT THÉP AN PHÚ'] });
    expect(r.kind === 'advance' && r.advance).toMatchObject({ party: 'supplier', supplier_match: '' });
  });
});

describe('Lưu thông tin — CCCD / danh thiếp / bảng hiệu cửa hàng', () => {
  it('nút Lưu thông tin: chỉ CCCD + cửa hàng, lọc theo quyền; AI tự nhận cũng nhận được khi có quyền', () => {
    expect(promptKinds('save_info', { id_card: true, shop: true })).toEqual(['id_card', 'shop']);
    expect(promptKinds('save_info', { id_card: false, shop: true })).toEqual(['shop']);
    expect(promptKinds('auto', { invoice: true, id_card: true, shop: true })).toEqual(['invoice', 'id_card', 'shop']);
    const p = buildPrompt('save_info', 'cửa hàng này bán tôn lá', { ...ctx, subcontractors: ['TP ĐẢNG'] }, { id_card: true, shop: true });
    expect(p).toContain('"shop"');
    expect(p).toContain('subcontractor');
    expect(p).toContain('- TP ĐẢNG');
    expect(p).toContain('- SẮT THÉP AN PHÚ');
  });
  it('chuẩn hóa cửa hàng: gạch đầu dòng sạch, SĐT chỉ chữ số, ô mờ giữ lại để tô vàng', () => {
    const r = normalizeScan(fxShop, ctx, 'save_info');
    if (r.kind !== 'shop') throw new Error('sai loại');
    expect(r.shop.name).toBe('VLXD PHƯƠNG');
    expect(r.shop.phones).toEqual(['0909123456', '02743777888']);
    expect(r.shop.details).toEqual(['Gạch, cát, đá, xi măng', 'Sắt thép xây dựng', 'Giao hàng tận công trình']);
    expect(r.shop.low_confidence).toEqual(['phone']);
    expect(r.shop.supplier_match).toBe('');
    expect(bulletLines('- a\n• b\n\nA')).toEqual(['a', 'b']);
    expect(pickFixture('save_info', 'bảng hiệu cửa hàng')).toBe('cua-hang');
    expect(pickFixture('save_info', 'thầu phụ Đảng')).toBe('cccd');
  });
  it('lưu người: nhóm thầu phụ / nhà cung cấp, SĐT + ghi chú từ lời nói, khớp tên gọi anh nói', () => {
    const r = normalizeScan({ kind: 'id_card', id_card: {
      doc_type: 'cccd', full_name: 'Trần Văn Đảng', contact_kind: 'subcontractor', contact_match: 'TP BỊA', short_name: 'Đảng',
      phone: '0909 123 456', note_lines: ['- làm kỹ', 'giá mềm'],
    } }, { ...ctx, subcontractors: ['TP ĐẢNG'] });
    if (r.kind !== 'id_card') throw new Error('sai loại');
    expect(r.id_card).toMatchObject({ full_name: 'TRẦN VĂN ĐẢNG', contact_kind: 'subcontractor', contact_match: '', phone: '0909123456', note_lines: ['làm kỹ', 'giá mềm'], doc_type: 'cccd' });
    const c = idCardCandidates(r.id_card, {
      workers: [], customers: [], employees: [],
      subcontractors: [{ id: 's1', name: 'TP ĐẢNG', contact_person: null }, { id: 's2', name: 'TP HÀ', contact_person: null }],
      suppliers: [{ id: 'n1', name: 'VLXD PHƯƠNG' }],
    }, () => false);
    expect(c.map((x) => [x.id, x.reason])).toEqual([['s1', 'short_name']]);
    expect(guessContactKind('', 'lưu thông tin thầu phụ Đảng')).toBe('subcontractor');
    expect(guessContactKind('', 'nhà cung cấp gạch')).toBe('supplier');
    expect(shortNameFromFull('Vật liệu Phương', 'supplier')).toBe('VẬT LIỆU PHƯƠNG');
    expect(contactNameFromSaid('Thành', 'worker')).toBe('THÀNH');
    expect(appendNote('làm kỹ', ['Làm kỹ', 'ở Dĩ An'])).toBe('làm kỹ\nở Dĩ An');
    expect(appendNote(null, [])).toBeNull();
  });
});
