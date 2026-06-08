// ============================================================================
//  modules/projects/projects.stats.js  —  TẦNG GIAO DIỆN (Layer 6): Modal chi tiết CT
// ----------------------------------------------------------------------------
//  @module projects.stats
//
//  Lo PHẦN BÁO CÁO TÀI CHÍNH của 1 công trình:
//    1. computeProjectFinance() — hàm THUẦN (không đụng DOM, không đọc DB): nhận
//       sẵn dữ liệu các bảng con → trả về 3 con số cốt lõi + các giá trị gốc.
//       Tách thuần để KIỂM THỬ dễ (bơm dữ liệu giả, không cần IndexedDB).
//    2. getProjectFinance() — loader: đọc các store từ DB rồi gọi hàm thuần.
//    3. openProjectDetail() — modal hiển thị số liệu (gọi từ tab Công Trình).
//
//  BA CÔNG THỨC CỐT LÕI (theo thiết kế tab Công Trình §5):
//    ① Đỏ  (redValue)  = directCost + ứng thầu phụ + ứng NCC − hóa đơn NCC đã ứng
//    ② Xám (grayValue) = redValue + chi phí chung CÔNG TY phân bổ cho CT này
//    ③ Lãi/Lỗ (profit) = tổng đã thu − redValue
//
//  🛡️ CHỐNG TÍNH TRÙNG: chỉ trừ hóa đơn của những NHÀ CUNG CẤP mà CT này ĐÃ ỨNG
//  tiền (tiền ứng NCC và hóa đơn công nợ NCC là 2 mặt của cùng dòng tiền).
//
//  LIÊN KẾT: mọi bảng con gom về CT qua projectId; lọc theo NĂM đang chọn
//  (getSelectedYear); year = 0 nghĩa là "tất cả các năm".
// ============================================================================

import { STORE } from '../../core/db.js';
import { load, activeOnly } from '../../core/store.js';
import { formatMoney } from '../../utils/fmt.js';
import { toast, setLoading } from '../../utils/ui.js';
import { normalizeVietnamese } from '../../utils/autocomplete.js';
import { getProjectById, getSortedProjects, allocateCompanyCost, COMPANY } from './projects.data.js';
import { getSelectedYear } from '../../topbar.js';
import { navigate } from '../../router.js';

// ----------------------------------------------------------------------------
//  TIỆN ÍCH NHỎ (nội bộ)
// ----------------------------------------------------------------------------

// num(x) — Ép về số an toàn (null/"" /rác → 0).
function num(x) { return Number(x) || 0; }

// round1(x) — Làm tròn 1 chữ số thập phân (dùng cho tổng công của 1 công nhân).
function round1(x) { return Math.round(x * 10) / 10; }

// sum(arr, pick) — Cộng dồn arr theo hàm lấy giá trị pick(item).
function sum(arr, pick) { return (arr || []).reduce((s, it) => s + num(pick(it)), 0); }

// yearOf(val) — Lấy NĂM (số) từ 1 giá trị ngày: chuỗi 'YYYY-MM-DD' hoặc mốc ms.
// Không đọc được → 0.
function yearOf(val) {
  if (val == null || val === '') return 0;
  const m = String(val).match(/^(\d{4})-\d{2}-\d{2}/);
  if (m) return Number(m[1]);
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? 0 : d.getFullYear();
}

// inYear(rec, field, year) — Bản ghi có thuộc NĂM đang lọc không?
// year = 0 → nhận hết (tất cả các năm).
function inYear(rec, field, year) {
  if (!Number(year)) return true;
  return yearOf(rec[field]) === Number(year);
}

// escapeHtml(s) — Chống XSS khi đổ tên CT (do người dùng nhập) vào innerHTML.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// laborCostOfWeeks(weeks) — Tổng LƯƠNG (chi phí nhân công) của các tuần chấm công.
// Mỗi công nhân: tổng công (cộng 7 ngày, làm tròn 0.1) × lương/ngày.
// (Khớp "dòng lương ảo" mà tab Thống Kê đọc từ chấm công — KHÔNG gồm phụ cấp/vay/nợ.)
function laborCostOfWeeks(weeks) {
  let total = 0;
  for (const w of weeks) {
    for (const wk of (w.workers || [])) {
      const days = (wk.days || []).reduce((s, v) => s + num(v), 0);
      total += round1(days) * num(wk.wage);
    }
  }
  return total;
}

// companyCostInYear(invoices, year) — Tổng chi phí chung CÔNG TY trong năm
// (hóa đơn có projectId === 'COMPANY', chưa xóa mềm).
function companyCostInYear(invoices, year) {
  return sum(
    activeOnly(invoices).filter((i) => i.projectId === COMPANY.id && inYear(i, 'date', year)),
    (i) => i.amount,
  );
}

// ----------------------------------------------------------------------------
//  computeProjectFinance(projectId, data, year, allocatedCompanyCost)
//  HÀM THUẦN: không đọc DB, không đụng DOM → dễ kiểm thử (bơm data giả).
//   - data: { invoices, timesheets, advances, receipts, contracts } (mảng thô, gồm cả đã xóa).
//   - year: năm lọc giao dịch (0 = tất cả năm).
//   - allocatedCompanyCost: phần chi phí chung CÔNG TY phân bổ cho CT này (do
//     loader tính sẵn qua allocateCompanyCost — tách ra để hàm này thuần).
//  Trả về object đầy đủ các giá trị gốc + 3 công thức cốt lõi.
// ----------------------------------------------------------------------------
export function computeProjectFinance(projectId, data = {}, year = 0, allocatedCompanyCost = 0) {
  // Lọc các bảng con: chỉ bản ghi còn dùng + thuộc năm đang xem.
  const inv = activeOnly(data.invoices).filter((r) => inYear(r, 'date', year));
  const ts  = activeOnly(data.timesheets).filter((r) => inYear(r, 'toDate', year));
  const adv = activeOnly(data.advances).filter((r) => inYear(r, 'date', year));
  const rec = activeOnly(data.receipts).filter((r) => inYear(r, 'date', year));
  const con = activeOnly(data.contracts); // hợp đồng chính KHÔNG lọc năm (1 CT = 1 HĐ, giá trị kỳ vọng)

  // ① directCost = hóa đơn vật tư của CT + lương nhân công (từ chấm công).
  const myInvoices = inv.filter((i) => i.projectId === projectId);
  const invoiceCost = sum(myInvoices, (i) => i.amount);
  const laborCost = laborCostOfWeeks(ts.filter((w) => w.projectId === projectId));
  const directCost = invoiceCost + laborCost;

  // Tiền ứng của CT này, tách thầu phụ / nhà cung cấp.
  const myAdv = adv.filter((a) => a.projectId === projectId);
  const subcontractorAdvance = sum(myAdv.filter((a) => a.type === 'subcontractor'), (a) => a.amount);
  const supplierAdvance = sum(myAdv.filter((a) => a.type === 'supplier'), (a) => a.amount);

  // 🛡️ Chống tính trùng: chỉ trừ hóa đơn của NCC mà CT này ĐÃ ỨNG (so tên KHÔNG DẤU).
  const advancedSuppliers = new Set(
    myAdv.filter((a) => a.type === 'supplier' && a.partner)
         .map((a) => normalizeVietnamese(a.partner)),
  );
  const supplierInvoiceTotal = sum(
    myInvoices.filter((i) => i.supplier && advancedSuppliers.has(normalizeVietnamese(i.supplier))),
    (i) => i.amount,
  );

  // ① Đỏ — dòng tiền trực tiếp đã chi cho công trường.
  const redValue = directCost + subcontractorAdvance + supplierAdvance - supplierInvoiceTotal;
  // ② Xám — gánh thêm chi phí chung CÔNG TY phân bổ.
  const allocated = num(allocatedCompanyCost);
  const grayValue = redValue + allocated;

  // Chi phí chung toàn CÔNG TY (để hiển thị "toàn cty / phân bổ").
  const companyCost = sum(inv.filter((i) => i.projectId === COMPANY.id), (i) => i.amount);

  // Doanh thu: đã thu + tổng giá trị hợp đồng → còn phải thu.
  const totalReceived = sum(rec.filter((r) => r.projectId === projectId), (r) => r.amount);
  const contract = con.find((c) => c.projectId === projectId);
  const contractTotal = contract
    ? num(contract.value) + num(contract.addonValue) + num(contract.extraValue)
    : 0;
  const remaining = contractTotal - totalReceived;

  // ③ Lãi / Lỗ hiện tại.
  const profit = totalReceived - redValue;

  return {
    invoiceCost, laborCost, directCost,
    subcontractorAdvance, supplierAdvance, supplierInvoiceTotal,
    redValue, allocatedCompanyCost: allocated, grayValue, companyCost,
    totalReceived, contractTotal, remaining, profit,
  };
}

// ----------------------------------------------------------------------------
//  getProjectFinance(projectId, year) — LOADER: đọc 5 store từ DB rồi tính.
//  Mặc định lấy NĂM đang chọn trên topbar. Trả về Promise<đối tượng tài chính>.
// ----------------------------------------------------------------------------
export async function getProjectFinance(projectId, year = getSelectedYear()) {
  const [invoices, timesheets, advances, receipts, contracts] = await Promise.all([
    load(STORE.INVOICES, []),
    load(STORE.TIMESHEETS, []),
    load(STORE.ADVANCES, []),
    load(STORE.RECEIPTS, []),
    load(STORE.CONTRACTS, []),
  ]);
  const data = { invoices, timesheets, advances, receipts, contracts };

  // Phân bổ chi phí chung: tính companyCost trong năm → chia cho các CT theo trọng số.
  const companyCost = companyCostInYear(invoices, year);
  const allocated = allocateCompanyCost(companyCost, year).get(projectId) || 0;

  return computeProjectFinance(projectId, data, year, allocated);
}

// ----------------------------------------------------------------------------
//  getAllProjectsFinance(year) — Tính tài chính cho MỌI công trình đang dùng,
//  chỉ đọc 5 store ĐÚNG 1 LẦN (tránh đọc DB lặp theo từng CT). Trả về
//  Promise<Map<projectId, đối tượng tài chính>>. Dùng cho KPI tổng + lọc lãi/lỗ
//  ở tab Công Trình. (Yêu cầu cache CT đã nạp — caller gọi loadProjects() trước.)
// ----------------------------------------------------------------------------
export async function getAllProjectsFinance(year = getSelectedYear()) {
  const [invoices, timesheets, advances, receipts, contracts] = await Promise.all([
    load(STORE.INVOICES, []),
    load(STORE.TIMESHEETS, []),
    load(STORE.ADVANCES, []),
    load(STORE.RECEIPTS, []),
    load(STORE.CONTRACTS, []),
  ]);
  const data = { invoices, timesheets, advances, receipts, contracts };
  const allocMap = allocateCompanyCost(companyCostInYear(invoices, year), year);

  const out = new Map();
  for (const p of getSortedProjects()) {
    out.set(p.id, computeProjectFinance(p.id, data, year, allocMap.get(p.id) || 0));
  }
  return out;
}

// ----------------------------------------------------------------------------
//  financialStatus(fin) — Phân loại tình trạng tài chính 1 CT cho bộ lọc:
//   'none' = chưa đủ dữ liệu (chưa chi & chưa thu) · 'loss' = đang lỗ · 'profit' = có lãi/hòa.
// ----------------------------------------------------------------------------
export function financialStatus(fin) {
  if (!fin || (fin.redValue === 0 && fin.totalReceived === 0)) return 'none';
  return fin.profit < 0 ? 'loss' : 'profit';
}

// ----------------------------------------------------------------------------
//  profitClass(profit) — Màu chữ Lãi/Lỗ: dương=xanh, âm=đỏ, =0=xám.
// ----------------------------------------------------------------------------
function profitClass(profit) {
  if (profit > 0) return 'text-success';
  if (profit < 0) return 'text-danger';
  return 'text-secondary';
}

// ----------------------------------------------------------------------------
//  openProjectDetail(projectId) — Mở modal báo cáo tài chính của 1 công trình.
//  Đọc số liệu theo năm đang chọn → hiển thị Tổng Chi (Đỏ/Xám), chi phí chung
//  (toàn cty/phân bổ), đã thu / còn phải thu, và Lãi/Lỗ.
// ----------------------------------------------------------------------------
export async function openProjectDetail(projectId) {
  const p = getProjectById(projectId);
  if (!p) { toast('Không tìm thấy công trình.', 'error'); return; }

  const year = getSelectedYear();
  setLoading(true);
  let fin;
  try {
    fin = await getProjectFinance(projectId, year);
  } catch (e) {
    setLoading(false);
    toast(e.message || 'Không tính được số liệu tài chính.', 'error');
    return;
  }
  setLoading(false);

  const m = (v) => formatMoney(v); // gõ tắt cho gọn template

  const nen = document.createElement('div');
  nen.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex align-items-start justify-content-center p-3 overflow-auto';
  nen.style.cssText = 'background:rgba(0,0,0,.5);z-index:1100;';
  nen.innerHTML = `
    <div class="card shadow my-3" style="max-width:520px;width:100%;">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
          <div class="min-w-0">
            <h2 class="h6 mb-1 text-truncate">📊 ${escapeHtml(p.name)}</h2>
            <div class="small text-muted">Số liệu năm: <strong>${year || 'Tất cả'}</strong></div>
          </div>
          <button class="btn-close" data-x aria-label="Đóng"></button>
        </div>

        <!-- TỔNG CHI: Đỏ (thực chi) / Xám (đầy đủ) -->
        <div class="border rounded p-2 mb-2">
          <div class="small text-muted mb-1">TỔNG CHI <span class="fst-italic">(Đỏ thực chi / Xám đầy đủ)</span></div>
          <div class="fs-5 fw-bold">
            <span class="text-danger">${m(fin.redValue)}</span>
            <span class="text-muted fw-normal"> / ${m(fin.grayValue)}</span>
          </div>
          <div class="small text-muted mt-1">
            Hóa đơn: ${m(fin.invoiceCost)} · Lương: ${m(fin.laborCost)}
            · Ứng TP: ${m(fin.subcontractorAdvance)} · Ứng NCC: ${m(fin.supplierAdvance)}
            · Trừ HĐ NCC: ${m(fin.supplierInvoiceTotal)}
          </div>
        </div>

        <!-- CHI PHÍ CHUNG: toàn công ty / phân bổ cho CT này -->
        <div class="border rounded p-2 mb-2">
          <div class="small text-muted mb-1">CHI PHÍ CHUNG CÔNG TY <span class="fst-italic">(toàn cty / phân bổ CT)</span></div>
          <div class="fw-semibold">
            ${m(fin.companyCost)} <span class="text-muted fw-normal">/ ${m(fin.allocatedCompanyCost)}</span>
          </div>
        </div>

        <!-- DOANH THU: đã thu / tổng HĐ / còn phải thu -->
        <div class="row g-2 mb-2">
          <div class="col-4">
            <div class="border rounded p-2 text-center h-100">
              <div class="small text-muted">Đã thu</div>
              <div class="fw-semibold">${m(fin.totalReceived)}</div>
            </div>
          </div>
          <div class="col-4">
            <div class="border rounded p-2 text-center h-100">
              <div class="small text-muted">Tổng HĐ</div>
              <div class="fw-semibold">${m(fin.contractTotal)}</div>
            </div>
          </div>
          <div class="col-4">
            <div class="border rounded p-2 text-center h-100">
              <div class="small text-muted">Còn phải thu</div>
              <div class="fw-semibold">${m(fin.remaining)}</div>
            </div>
          </div>
        </div>

        <!-- LÃI / LỖ -->
        <div class="border rounded p-2 mb-3 d-flex justify-content-between align-items-center">
          <span class="text-muted">LÃI / LỖ hiện tại</span>
          <span class="fs-5 fw-bold ${profitClass(fin.profit)}">${m(fin.profit)}</span>
        </div>

        <!-- ĐIỀU HƯỚNG sang tab chi tiết (nút Doanh Thu ẩn với Kế toán qua data-perm) -->
        <div class="d-flex flex-wrap gap-1">
          <button class="btn btn-sm btn-outline-primary" data-go="hoadon">📋 Hóa Đơn</button>
          <button class="btn btn-sm btn-outline-success" data-go="doanhthu" data-perm="viewDoanhThu">💰 Doanh Thu</button>
          <button class="btn btn-sm btn-outline-secondary" data-go="thietbi">🔧 Thiết Bị</button>
          <button class="btn btn-sm btn-secondary ms-auto" data-x>Đóng</button>
        </div>
      </div>
    </div>`;

  const close = () => nen.remove();
  nen.querySelectorAll('[data-x]').forEach((b) => { b.onclick = close; });
  nen.onclick = (e) => { if (e.target === nen) close(); };

  // Nút điều hướng: chuyển sang tab tương ứng. (Lọc sẵn theo CT sẽ nối khi các
  // tab đích được xây ở sprint sau.)
  nen.querySelectorAll('[data-go]').forEach((b) => {
    b.onclick = () => { close(); navigate(b.dataset.go); };
  });

  document.body.appendChild(nen);
}
