// ============================================================================
//  utils/ui.js  —  TẦNG HẠ TẦNG (Layer 1): Tiện ích giao diện dùng chung
// ----------------------------------------------------------------------------
//  Gom các "mảnh giao diện" mà mọi tab đều cần, để không phải viết lại nhiều lần:
//   - toast()           : thông báo nổi ngắn (xanh=thành công, đỏ=lỗi...) tự tắt
//   - setLoading()      : lớp phủ "Đang xử lý…" có vòng xoay, chặn thao tác khi bận
//   - confirm2()        : hộp hỏi Đồng ý/Hủy, trả về Promise<boolean>
//   - validateRequired(): kiểm tra 1 trường bắt buộc, trả về câu báo lỗi hoặc null
//
//  Tất cả dựng bằng class Bootstrap 5 + thao tác DOM thuần, KHÔNG cần nạp file
//  JavaScript của Bootstrap (bootstrap.bundle.js) → nhẹ và chạy ở mọi nơi.
//  Thiết kế ưu tiên di động: toast canh giữa trên, nút bấm đủ to để chạm tay.
// ============================================================================

// ----------------------------------------------------------------------------
//  toast(message, type) — Hiện 1 thông báo nổi, tự biến mất sau ~3.5 giây.
//  type: 'success' (xanh lá) | 'error'/'danger' (đỏ) | 'warning' (vàng) | 'info' (xanh dương)
// ----------------------------------------------------------------------------
export function toast(message, type = 'info') {
  // Bảng màu: ánh xạ loại thông báo → class nền của Bootstrap.
  const mauNen = {
    success: 'text-bg-success',
    error:   'text-bg-danger',
    danger:  'text-bg-danger',
    warning: 'text-bg-warning',
    info:    'text-bg-primary',
  };

  // Tìm (hoặc tạo lần đầu) "khay" chứa toast, ghim giữa-trên màn hình.
  let khay = document.getElementById('toast-host');
  if (!khay) {
    khay = document.createElement('div');
    khay.id = 'toast-host';
    khay.className = 'toast-container position-fixed top-0 start-50 translate-middle-x p-3';
    khay.style.zIndex = '1080';
    document.body.appendChild(khay);
  }

  // Tạo 1 toast và hiện ngay (class 'show').
  const el = document.createElement('div');
  el.className = `toast align-items-center border-0 show ${mauNen[type] || mauNen.info}`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Đóng"></button>
    </div>`;
  // Nút X đóng tay.
  el.querySelector('.btn-close').onclick = () => el.remove();
  khay.appendChild(el);

  // Tự gỡ sau 3.5s.
  setTimeout(() => el.remove(), 3500);
}

// ----------------------------------------------------------------------------
//  setLoading(on, text) — Bật/tắt lớp phủ "đang xử lý" toàn màn hình.
//   setLoading(true)  → hiện vòng xoay, chặn người dùng bấm lung tung khi đang lưu/sync.
//   setLoading(false) → tắt đi.
// ----------------------------------------------------------------------------
export function setLoading(on, text = 'Đang xử lý…') {
  let phu = document.getElementById('loading-overlay');

  if (on) {
    if (!phu) {
      phu = document.createElement('div');
      phu.id = 'loading-overlay';
      phu.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center';
      phu.style.cssText = 'background:rgba(0,0,0,.4);z-index:1090;';
      phu.innerHTML = `
        <div class="spinner-border text-light" role="status"></div>
        <div class="text-light mt-2 fw-semibold">${text}</div>`;
      document.body.appendChild(phu);
    }
  } else if (phu) {
    phu.remove();
  }
}

// ----------------------------------------------------------------------------
//  confirm2(message, options) — Hộp xác nhận thay cho window.confirm mặc định
//  (đẹp hơn, hợp Bootstrap, hợp di động). Trả về Promise:
//     true  nếu bấm Đồng ý
//     false nếu bấm Hủy / bấm ra nền tối.
//  Dùng:  if (await confirm2('Xóa hóa đơn này?')) { ...xóa... }
// ----------------------------------------------------------------------------
export function confirm2(message, { okText = 'Đồng ý', cancelText = 'Hủy', danger = true } = {}) {
  return new Promise((resolve) => {
    // Lớp nền mờ phủ toàn màn hình.
    const nen = document.createElement('div');
    nen.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3';
    nen.style.cssText = 'background:rgba(0,0,0,.5);z-index:1100;';
    nen.innerHTML = `
      <div class="card shadow" style="max-width:380px;width:100%;">
        <div class="card-body">
          <p class="mb-3">${message}</p>
          <div class="d-flex justify-content-end gap-2">
            <button class="btn btn-secondary" data-act="cancel">${cancelText}</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${okText}</button>
          </div>
        </div>
      </div>`;

    // Đóng hộp và trả kết quả.
    const dong = (ketQua) => { nen.remove(); resolve(ketQua); };
    nen.querySelector('[data-act="ok"]').onclick     = () => dong(true);
    nen.querySelector('[data-act="cancel"]').onclick = () => dong(false);
    // Bấm vào vùng nền tối (ngoài thẻ card) = Hủy.
    nen.onclick = (e) => { if (e.target === nen) dong(false); };

    document.body.appendChild(nen);
  });
}

// ----------------------------------------------------------------------------
//  validateRequired(value, label) — Kiểm tra 1 trường BẮT BUỘC.
//  Trả về câu báo lỗi (chuỗi) nếu trống, hoặc null nếu hợp lệ.
//  Ví dụ:  const loi = validateRequired(form.projectId, 'Công trình');
//          if (loi) { toast(loi, 'warning'); return; }
// ----------------------------------------------------------------------------
export function validateRequired(value, label = 'Trường này') {
  const trong = value === null || value === undefined || String(value).trim() === '';
  return trong ? `${label} không được để trống` : null;
}
