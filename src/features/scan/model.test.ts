import { describe, expect, it } from 'vitest';
import { buildPrompt, foldVi, matchProjectByNote, normalizeScan, pickFixture, toIsoDate, toMoney, type ProjectMeta, type ScanContext } from '@shared/scan';
import fxNew from '../../../supabase/functions/scan-document/fixtures/hoa-don-ncc-moi.json';
import fxBlur from '../../../supabase/functions/scan-document/fixtures/hoa-don-chu-mo.json';
import fxId from '../../../supabase/functions/scan-document/fixtures/cccd.json';
import fxContract from '../../../supabase/functions/scan-document/fixtures/hop-dong.json';
import { printedTotalGap } from '@/lib/calc';
import { exportFileName, sheetName, vnDate } from '@/lib/export/ten-file';
import { checkPrintedTotal, contractCustomer, guessContactKind, idCardCandidates, invoiceFromScan, shortNameFromFull, supplierPlan } from './model';

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
    expect(plan).toEqual({ kind: 'new', name: 'CH VLXD THANH BÌNH', address: '128 Tỉnh lộ 8, Tân An Hội, Củ Chi', phone: '0908 123 456' });
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
    expect(plan).toMatchObject({ kind: 'existing', id: 's1', missingAddress: '45 Nguyễn Văn Quá, Q12', missingPhone: '0283 888 999' });
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
