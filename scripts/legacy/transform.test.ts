// @vitest-environment node
// Test quy tắc chuyển dữ liệu cũ (GĐ2) trên một snapshot nhỏ tự dựng.
import { describe, expect, it } from 'vitest';
import { normalizeCatDisplayName, normProjName, projectKindOf, transformSnapshot, uuid5 } from './transform.ts';
import type { Row } from './transform.ts';

const COMPANY = '00000000-0000-0000-0000-000000000001';
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P1 = U(1), P2 = U(2), P3 = U(3);
const N1 = U(11), N2 = U(12), N3 = U(13), L1 = U(21), G1 = U(31), G2 = U(32), T1 = U(41), C1 = U(51), E1 = U(61);
const T0 = Date.UTC(2026, 9, 1);
const rec = (id: string, extra: object, ts = T0) => ({ id, createdAt: ts, updatedAt: ts, deletedAt: null, ...extra });

function snapshot() {
  return {
    meta: { version: 4, exportedAt: Date.UTC(2026, 10, 2) },
    data: {
      projects_v1: [
        rec(P1, { name: 'CT Nhà A (Q1)', status: 'active', startDate: '2026-01-03', heSoTiTrong: 0.5, aliases: ['ct nha a cu'], createdYear: 2026, customerId: U(71), note: '12 Lê Lợi' }),
        rec(P2, { name: 'SC B', status: 'closed', startDate: '2025-05-01', endDate: '2025-08-01' }),
        { ...rec(P3, { name: 'abc', status: 'active' }), deletedAt: T0 + 5 },
      ],
      cat_ct_years: { 'SC B': 2025 },
      customers_v1: [rec(U(71), { name: 'A Huynh', phone: '0909123456', address: 'Q1', email: '' })],
      cat_items_v1: {
        ncc: [
          { id: N1, name: 'vlxd phương', isDeleted: false, updatedAt: T0 },
          { id: N2, name: 'CH LẺ', isDeleted: false, updatedAt: T0 },
          { id: N3, name: 'NCC ĐÃ XÓA', isDeleted: true, updatedAt: T0 },
        ],
        loai: [{ id: L1, name: 'vật liệu xây dựng', isDeleted: false, updatedAt: T0 }],
        nguoi: [{ id: G1, name: 'TÌNH', isDeleted: false, updatedAt: T0 }, { id: G2, name: 'LONG', isDeleted: false, updatedAt: T0 }],
        tp: [{ id: T1, name: 'TP ĐIỆN', isDeleted: false, updatedAt: T0 }],
        cn: [{ id: C1, name: 'HIỀN', isDeleted: false, updatedAt: T0 }],
        tbteb: [{ id: E1, name: 'máy cắt bàn', isDeleted: true, updatedAt: T0 }],
      },
      cat_cn_roles: { 'HIỀN': 'T' },
      inv_v3: [
        rec(U(101), { ngay: '2026-10-05', projectId: P1, congtrinh: 'CT Nhà A (Q1)', loaiId: L1, loai: 'Vật Liệu Xây Dựng', nccId: N1, ncc: 'VLXD PHƯƠNG', nguoiId: G1, nguoi: 'TÌNH', tien: 100, thanhtien: 100, source: 'detail', nd: 'cát', items: [{ ten: 'Cát', dv: 'm3', sl: 2.5, dongia: 40, thanhtien: 100 }] }, T0 + 1),
        rec(U(102), { ngay: '2026-10-12', projectId: P1, loaiId: L1, nccId: N1, nguoiId: G2, nguoi: 'LONG', tien: 200, source: 'quick' }, T0 + 2),
        rec(U(103), { ngay: '2025-06-01', projectId: P2, loaiId: L1, nccId: N1, tien: 50, source: 'excel_invQ' }),          // NCC mua nợ nhưng KHÁC công trình
        rec(U(104), { ngay: '2026-10-06', projectId: P1, loaiId: L1, nccId: N2, tien: 30, source: 'quick' }),               // NCC không mua nợ
        rec(U(105), { ngay: '2026-10-07', congtrinh: 'CT Nha A Cu', loai: 'Vật Liệu Xây Dựng', ncc: 'XE BA GÁC', tien: 7 }), // chỉ có tên cũ + NCC chưa có trong danh mục
        rec(U(106), { ngay: '2026-10-08', projectId: 'COMPANY', congtrinh: 'CÔNG TY', loaiId: L1, tien: 9 }),
        { ...rec(U(107), { ngay: '2026-10-09', projectId: P1, loaiId: L1, tien: 1 }), deletedAt: T0 + 9, purgedAt: T0 + 9 },   // bia mộ
        rec(U(108), { ngay: '2026-10-09', congtrinh: 'Không Có CT Này', loaiId: L1, tien: 1 }),                             // không gắn được công trình
      ],
      ung_v1: [
        rec(U(201), { ngay: '2026-10-31', loai: 'nhacungcap', tpId: N1, tp: 'VLXD PHƯƠNG', projectId: P1, tien: 250, nguoi: 'KS LAM' }, T0 + 1),
        rec(U(202), { ngay: '2026-11-01', loai: 'nhacungcap', tpId: N1, tp: 'VLXD PHƯƠNG', projectId: P1, tien: 100, autoSettle: true, settleId: 'tt_abc', settledBy: 'ADMIN' }, T0 + 2),
        rec(U(203), { ngay: '2026-10-20', loai: 'thauphu', tpId: T1, tp: 'TP ĐIỆN', projectId: P1, tien: 500 }),
        rec(U(204), { ngay: '2026-10-21', loai: 'congnhan', cnKind: 'tra', tpId: C1, tp: 'HIỀN', projectId: P1, tien: 20, tinhVaoThucLanh: true }),
        rec(U(205), { ngay: '2026-10-22', loai: 'congnhan', tpId: C1, tp: 'HIỀN', projectId: P1, tien: 60 }),
      ],
      thauphu_v1: [rec(U(301), { ngay: '2026-10-01', projectId: P1, thauphuId: T1, thauphu: 'TP ĐIỆN', giaTri: 900, phatSinh: 100, items: [] })],
      cc_v2: [
        rec(U(401), { fromDate: '2026-10-25', toDate: '2026-10-31', ct: 'CT Nhà A (Q1)', projectId: P1, workers: [{ name: 'HIỀN', cnId: C1, luong: 500, d: [0, 1, 1, 0.5, 1, 1, 1], phucap: 30, hdmuale: 15, tru: 10, role: 'T' }] }, T0 + 10),
        rec(U(402), { fromDate: '2026-10-25', toDate: '2026-10-31', ct: 'CT Nhà A (Q1)', projectId: P1, workers: [{ name: 'HIỀN', cnId: C1, luong: 1, d: [1, 1, 1, 1, 1, 1, 1] }] }, T0 + 5), // bản cũ hơn, trùng tuần + CT
      ],
      thu_v1: [rec(U(501), { ngay: '2026-10-24', projectId: P1, tien: 1000, nguoi: 'GIÁM ĐỐC', loaiThu: 'quyettoan', auto: true, qtId: U(601) }), rec(U(502), { ngay: '2026-10-25', projectId: P1, tien: 5, nguoi: 'TÌNH' })],
      quyettoan_v1: [rec(U(601), { ngay: '2026-10-23', projectId: P1, giaTri: -300, nguoi: 'TÌNH', chot: true }), rec(U(602), { ngay: '2026-10-23', projectId: P1, loai: 'thaythe', giaTri: 2000 })],
      hopdong_v1: { [P1]: rec('', { projectId: P1, giaTri: 3000, giaTriphu: 200, ngay: '2026-01-03', nguoi: 'TÌNH', khachHang: 'Nguyễn Văn Huynh' }) },
      tb_v1: [
        rec(U(701), { ct: 'KHO TỔNG', projectId: 'COMPANY', tenId: E1, ten: 'Máy Cắt Bàn', soluong: 2, tinhtrang: 'Đang hoạt động' }),
        rec(U(702), { ct: 'KHO TỔNG', projectId: 'COMPANY', tenId: E1, ten: 'Máy Cắt Bàn', soluong: 3, tinhtrang: 'Đang hoạt động' }),
        rec(U(703), { ct: 'CT Nhà A (Q1)', projectId: P1, tenId: E1, soluong: 1, tinhtrang: 'Cần bảo trì', kho: undefined }),
        rec(U(704), { ct: 'KHO THIẾT BỊ CÔNG TY', projectId: 'COMPANY', kho: 'TB', tenId: E1, soluong: 4, tinhtrang: 'Đang hoạt động' }),
      ],
      tytrong_v1: [rec(U(801), { projectId: P1, giaiDoan: [{ id: 'g1' }] }), rec(U(802), { kind: 'dinhmuc', ten: 'Định mức A', dgTong: 5 }), rec(U(803), { kind: 'cauhinh', quyMuc: 1 })],
      import_lots_v1: [{ id: 'x' }],
      trash_v1: null,
    },
  };
}
const OPTS = { companyId: COMPANY, userIdByLegacyName: { 'TÌNH': U(901), 'KS LAM': U(902), 'GIÁM ĐỐC': U(903) } };
const byId = (rows: Row[], id: string) => rows.find((r) => r.id === id)!;

describe('hàm chép từ app cũ', () => {
  it('chuẩn hóa tên danh mục như normalizeCatDisplayName', () => {
    expect(normalizeCatDisplayName('loai', '  vật  liệu xây DỰNG ')).toBe('Vật Liệu Xây Dựng');
    expect(normalizeCatDisplayName('ncc', 'vlxd phương')).toBe('VLXD PHƯƠNG');
  });
  it('bỏ dấu tên công trình và đoán loại công trình', () => {
    expect(normProjName('  CT  Nhà Tình (925 Âu Cơ) ')).toBe('ct nha tinh (925 au co)');
    expect(projectKindOf({ name: 'CT A Nhựt' })).toBe('new_build');
    expect(projectKindOf({ name: 'SC Chú Thỉ' })).toBe('renovation');
    expect(projectKindOf({ name: 'SN - C Di' })).toBe('small_repair');
    expect(projectKindOf({ name: 'NB Tình' })).toBe('small_repair');
    expect(projectKindOf({ name: 'CTY ABC' })).toBe('small_repair'); // "CTY" không phải tiền tố CT
    expect(projectKindOf({ name: 'Nhà X', loaiCongTrinh: 'SC' })).toBe('renovation');
  });
  it('id sinh cố định, đúng dạng UUID', () => {
    expect(uuid5('a')).toBe(uuid5('a'));
    expect(uuid5('a')).not.toBe(uuid5('b'));
    expect(uuid5('a')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('transformSnapshot', () => {
  const r = transformSnapshot(snapshot(), OPTS);
  const t = r.tables;
  const company = t.projects.find((p) => p.is_company_overhead)!;

  it('chạy 2 lần cho cùng kết quả', () => {
    expect(transformSnapshot(snapshot(), OPTS)).toEqual(r);
  });

  it('công trình: giữ id cũ, thêm CÔNG TY, năm tạo lấy từ cat_ct_years, công trình xóa mềm vào thùng rác', () => {
    expect(t.projects).toHaveLength(4);
    expect(byId(t.projects, P1)).toMatchObject({ kind: 'new_build', cost_weight_k: 0.5, created_year: 2026, customer_id: U(71), address: '12 Lê Lợi' });
    expect(byId(t.projects, P2)).toMatchObject({ kind: 'renovation', cost_weight_k: null, created_year: 2025 });
    expect(byId(t.projects, P3).deleted_at).not.toBeNull();
    expect(company).toMatchObject({ name: 'CÔNG TY', kind: null });
    expect(t.contact_private).toHaveLength(1);
    expect(t.contact_private[0]).toMatchObject({ customer_id: U(71), phone: '0909123456' });
  });

  it('gắn công trình theo tên cũ (aliases) và CÔNG TY; bỏ bản không gắn được + bia mộ, có lý do', () => {
    expect(byId(t.expenses, U(105)).project_id).toBe(P1);
    expect(byId(t.expenses, U(106)).project_id).toBe(company.id);
    expect(t.expenses.map((e) => e.id)).not.toContain(U(107));
    expect(t.expenses.map((e) => e.id)).not.toContain(U(108));
    expect(r.dropped.find((x) => x.id === U(107))).toMatchObject({ store: 'inv_v3', alive: false });
    expect(r.dropped.find((x) => x.id === U(108))).toMatchObject({ store: 'inv_v3', alive: true });
    expect(r.dropped.every((x) => x.reason.length > 0)).toBe(true);
  });

  it('Đã TT: chỉ bỏ tích khi NCC có phiếu ứng ở CÙNG công trình (mục 4F điểm 6)', () => {
    expect(byId(t.expenses, U(101)).paid_at_purchase).toBe(false);
    expect(byId(t.expenses, U(102)).paid_at_purchase).toBe(false);
    expect(byId(t.expenses, U(103)).paid_at_purchase).toBe(true); // cùng NCC, khác công trình
    expect(byId(t.expenses, U(104)).paid_at_purchase).toBe(true); // NCC không có tiền ứng
    expect(t.suppliers.filter((s) => s.buys_on_credit).map((s) => s.name)).toEqual(['VLXD PHƯƠNG']);
    expect(r.creditSuppliers).toEqual(['VLXD PHƯƠNG']);
  });

  it('chia phiếu chi NCC cũ vào hóa đơn cùng công trình, cũ nhất trước; phần dư vẫn thuộc công trình (mục 4J)', () => {
    const of = (paymentId: string) => t.payment_allocations.filter((a) => a.payment_id === paymentId).map((a) => [a.expense_id, a.amount, a.project_id]);
    expect(of(U(201))).toEqual(expect.arrayContaining([[U(101), 100, P1], [U(102), 150, P1]]));
    expect(of(U(201))).toHaveLength(2);
    expect(of(U(202))).toEqual(expect.arrayContaining([[U(102), 50, P1], [null, 50, P1]]));
    expect(byId(t.payments, U(201))).toMatchObject({ kind: 'supplier_payment', project_id: P1, allocation_mode: 'project', created_by: null });
    // Tổng chia theo công trình = tổng tiền ứng NCC (A của app cũ)
    expect(t.payment_allocations.reduce((s, a) => s + (a.amount as number), 0)).toBe(350);
  });

  it('ứng thầu phụ gắn HĐ thầu phụ khi cặp thầu phụ + công trình chỉ có 1 HĐ; tất toán thành payable_closures', () => {
    expect(byId(t.payments, U(203))).toMatchObject({ kind: 'advance', subcontract_id: U(301), project_id: P1 });
    expect(t.payable_closures).toHaveLength(1);
    expect(t.payable_closures[0]).toMatchObject({ party_kind: 'supplier', amount: 100, closed_by_name: null });
    expect(byId(t.payments, U(202)).closure_id).toBe(t.payable_closures[0]!.id);
  });

  it('ứng công nhân → tạm ứng lương (thiếu cnKind = ứng)', () => {
    expect(byId(t.wage_advances, U(204))).toMatchObject({ direction: 'repay', counts_in_net_pay: true, amount: 20 });
    expect(byId(t.wage_advances, U(205))).toMatchObject({ direction: 'advance', counts_in_net_pay: false });
  });

  it('Người TH cũ → chỉ thành Người mua (không có người nhập); nguồn excel → import', () => {
    expect(byId(t.expenses, U(101)).created_by).toBeNull();
    expect(byId(t.expenses, U(101)).buyer_id).toBe(G1);
    expect(byId(t.expenses, U(102)).created_by).toBeNull();
    expect(byId(t.expenses, U(102)).buyer_id).toBe(G2);
    expect(byId(t.expenses, U(103)).source).toBe('import');
    expect(byId(t.receipts, U(501))).toMatchObject({ kind: 'settlement', is_auto: true, settlement_id: U(601) });
    expect(byId(t.receipts, U(502))).toMatchObject({ kind: 'other', is_auto: false, settlement_id: null });
  });

  it('chấm công: trùng tuần + công trình giữ bản mới nhất; tách dòng công nhân', () => {
    expect(t.timesheet_weeks.map((w) => w.id)).toEqual([U(401)]);
    expect(r.dropped.find((x) => x.id === U(402))?.reason).toContain('normalizeCC');
    expect(t.timesheet_lines).toHaveLength(1);
    expect(t.timesheet_lines[0]).toMatchObject({ week_id: U(401), worker_id: C1, role: 'T', day_units: [0, 1, 1, 0.5, 1, 1, 1], daily_wage: 500, allowance: 30, retail_purchase: 15, debt_deduction: 10 });
    expect(byId(t.workers, C1)).toMatchObject({ name: 'HIỀN', role: 'T' });
  });

  it('danh mục: chuẩn hóa tên, bỏ mục đã xóa không ai dùng, lưu trữ mục đã xóa còn dùng, tạo mục thiếu', () => {
    expect(byId(t.suppliers, N1).name).toBe('VLXD PHƯƠNG');
    expect(t.suppliers.map((s) => s.id)).not.toContain(N3);
    expect(r.dropped.find((x) => x.id === N3)?.reason).toContain('không bản ghi nào dùng');
    expect(t.suppliers.find((s) => s.name === 'XE BA GÁC')).toMatchObject({ archived: false });
    expect(byId(t.catalog_items, E1)).toMatchObject({ kind: 'equipment_name', name: 'Máy Cắt Bàn', archived: true });
    expect(byId(t.catalog_items, L1).name).toBe('Vật Liệu Xây Dựng');
  });

  it('quyết toán: thiếu loại → suy theo dấu; số tiền luôn dương', () => {
    expect(byId(t.settlements, U(601))).toMatchObject({ kind: 'decrease', amount: 300, is_final: true });
    expect(byId(t.settlements, U(602))).toMatchObject({ kind: 'replace', amount: 2000, is_final: false });
    expect(t.main_contracts[0]).toMatchObject({ project_id: P1, value: 3000, extra_value: 200, customer_name: 'Nguyễn Văn Huynh', created_by: null });
  });

  it('thiết bị: kho cũ → giàn giáo, gộp dòng trùng (cộng số lượng), đúng nơi', () => {
    expect(byId(t.equipment, U(701))).toMatchObject({ location: 'scaffold', project_id: null, quantity: 5 });
    expect(t.equipment.map((e) => e.id)).not.toContain(U(702));
    expect(byId(t.equipment, U(703))).toMatchObject({ location: 'project', project_id: P1, condition: 'needs_maintenance' });
    expect(byId(t.equipment, U(704))).toMatchObject({ location: 'warehouse', quantity: 4 });
  });

  it('tỉ trọng giữ jsonb, phân 3 loại', () => {
    expect(byId(t.cost_allocations, U(801))).toMatchObject({ kind: 'project', project_id: P1, data: { giaiDoan: [{ id: 'g1' }] } });
    expect(byId(t.cost_allocations, U(802))).toMatchObject({ kind: 'benchmark', project_id: null, name: 'Định mức A' });
    expect(byId(t.cost_allocations, U(803)).kind).toBe('config');
  });
});
