/* =====================================================================
   XUẤT SỐ CHUẨN TỪ APP CŨ — CHỈ ĐỌC, KHÔNG SỬA DỮ LIỆU
   Cách dùng (anh Tình làm 1 lần, khoảng 2 phút):
   1. Mở app cũ trên máy tính (Chrome), đăng nhập ADMIN.
   2. Ở ô chọn năm, chọn "Tất cả năm", chờ chấm đồng bộ xanh (đã tải đủ mọi năm).
   3. Bấm F12 → tab Console → dán TOÀN BỘ file này → Enter.
   4. Trình duyệt tải về file so-chuan.json → chép vào ban-moi/du-lieu/so-chuan.json
   Đoạn này chỉ ĐỌC các hàm tính toán có sẵn của app cũ, rồi trả ô chọn năm về như cũ.
   ===================================================================== */
(async () => {
  const keepYears = new Set(activeYears);
  const round = n => Math.round(Number(n) || 0);
  const out = { taoLuc: new Date().toISOString(), ghiChu: 'Số chuẩn app cũ: lnTinhCongTrinh + calcTongDoanhThu + allocateCompanyCost', nam: {} };

  // Các năm có dữ liệu
  const yrs = new Set();
  const add = (arr, f) => (arr || []).forEach(r => { const d = r && r[f]; if (d && d.length >= 4) yrs.add(+d.slice(0, 4)); });
  add(loadView('inv_v3', []), 'ngay'); add(loadView('ung_v1', []), 'ngay'); add(loadView('cc_v2', []), 'fromDate');
  add(loadView('thu_v1', []), 'ngay'); add(loadView('tb_v1', []), 'ngay');
  const years = [...yrs].sort().map(String).concat(['TAT_CA']);

  for (const y of years) {
    activeYears = (y === 'TAT_CA') ? new Set() : new Set([+y]);
    _syncActiveYearCompat();
    if (typeof _invalidateInvoiceCache === 'function') _invalidateInvoiceCache();
    const ctx = _lnContext();
    const rows = [];
    getAllProjects().forEach(p => {
      if (!p || p.deletedAt || p.id === 'COMPANY') return;
      const r = lnTinhCongTrinh(p, ctx);
      const d = calcTongDoanhThu(p);
      rows.push({
        id: p.id, ten: p.name,
        A: round(r.A), A_hoaDon: round(r.aHd), A_ungNcc: round(r.aUng), B_ungThauPhu: round(r.B), C_chiPhiChung: round(r.C),
        tongDaChi: round(r.chi), tongDaThu: round(r.dt), loiNhuan: round(r.ln),
        X_hdGoc: round(r.X), Y_quyetToan: round(r.Y), giaTriHD: round(d.tongDT), conPhaiThu: round(d.conPhaiThu)
      });
    });
    const invs = getInvoicesCached().filter(i => !i.deletedAt && inActiveYear(i.ngay));
    const bySrc = {};
    invs.forEach(i => { const k = i.source || 'manual'; bySrc[k] = (bySrc[k] || 0) + round(i.thanhtien || i.tien); });
    out.nam[y] = {
      chiPhiChungCongTy: round(typeof getCompanyCost === 'function' ? getCompanyCost() : 0),
      phanBo: (typeof allocateCompanyCost === 'function' ? allocateCompanyCost() : []).map(a => ({ id: a.p.id, ten: a.p.name, trongSo: a.weight, tiLe: a.pct, phanBo: round(a.allocated) })),
      tongHoaDonTheoNguon: bySrc,
      soHoaDon: invs.length,
      congTrinh: rows,
      tongCong: rows.reduce((t, r) => { for (const k of ['A','B_ungThauPhu','C_chiPhiChung','tongDaChi','tongDaThu','loiNhuan']) t[k] = (t[k] || 0) + r[k]; return t; }, {})
    };
  }

  // Đếm bản ghi để đối chiếu khi chuyển dữ liệu
  out.soBanGhi = {};
  ['inv_v3','cc_v2','ung_v1','thu_v1','tb_v1','thauphu_v1','quyettoan_v1','projects_v1','customers_v1'].forEach(k => {
    const v = load(k, []); out.soBanGhi[k] = Array.isArray(v) ? v.filter(r => !r.deletedAt).length : Object.keys(v || {}).length;
  });

  // Trả ô chọn năm về như cũ
  activeYears = keepYears; _syncActiveYearCompat();
  if (typeof _invalidateInvoiceCache === 'function') _invalidateInvoiceCache();

  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'so-chuan.json'; a.click();
  console.log('✅ Đã xuất so-chuan.json:', years.length, 'mốc năm,', out.nam.TAT_CA.congTrinh.length, 'công trình');
})();
