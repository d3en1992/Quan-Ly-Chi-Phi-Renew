// Trợ lý AI (nút AI — trước là "Chụp đa năng" GĐ9) — phần DÙNG CHUNG giữa Edge Function `scan-document` (Deno) và app (Vite):
// kiểu kết quả, câu lệnh cho AI (mẫu JSON viết trong câu lệnh), hàm chuẩn hóa kết quả AI trả về (hàm thuần, có test).
// Không import gì để chạy được ở cả hai nơi.
//
// Đầu vào: ảnh / PDF / chữ (Excel đã đổi thành chữ ở trình duyệt) / ghi âm giọng nói + ghi chú. AI tự nhận 1 trong các loại:
// hóa đơn (chi tiết, hoặc sổ cộng tiền), tiền ứng thầu phụ, thu tiền khách, hợp đồng / dự toán, danh sách vật tư cần mua, phiếu chấm công,
// LƯU THÔNG TIN: CCCD / danh thiếp (id_card → Danh Bạ: khách hàng, công nhân, thầu phụ, nhà cung cấp, nhân viên) và ảnh bảng hiệu cửa hàng
// (shop → Danh Bạ › Cửa hàng). Nút "Lưu thông tin" = kind 'save_info' (AI chọn giữa id_card và shop).

export type ScanKind = 'invoice' | 'advance' | 'receipt' | 'contract' | 'material_list' | 'timesheet' | 'id_card' | 'shop';
export type ScanRequestKind = 'auto' | 'save_info' | ScanKind;
/** Các loại nút AI tự nhận (khi "AI tự nhận") — mỗi loại còn lọc theo quyền */
export const AUTO_KINDS: readonly ScanKind[] = ['invoice', 'advance', 'receipt', 'contract', 'material_list', 'timesheet', 'id_card', 'shop'];
/** Nút "Lưu thông tin": giấy tờ / danh thiếp người, hoặc bảng hiệu cửa hàng */
export const SAVE_INFO_KINDS: readonly ScanKind[] = ['id_card', 'shop'];

/** Chuyển khoản / tiền mặt / chưa rõ */
export type PayMethod = 'transfer' | 'cash' | '';

export type InvoiceLine = {
  name: string; unit: string; quantity: number; unit_price: number; amount: number;
  /** Ngày riêng của dòng (sổ cộng tiền / phiếu giao nhiều ngày), '' = theo ngày hóa đơn */
  date: string;
  /** Ô AI không chắc trong dòng này: 'name' | 'unit' | 'quantity' | 'unit_price' | 'amount' */
  low_confidence: string[];
};
export type InvoiceScan = {
  date: string;              // YYYY-MM-DD hoặc ''
  invoice_no: string;
  supplier_name: string;     // tên cửa hàng in trên hóa đơn
  supplier_address: string;
  /** SĐT đầu tiên (giữ để tương thích) — xem supplier_phones */
  supplier_phone: string;
  /** Tối đa 2 số điện thoại cửa hàng, chỉ chữ số */
  supplier_phones: string[];
  /** Ô "Khách hàng" / địa chỉ giao hàng ghi trên phiếu, chép nguyên (vd "Chú Hữu PT Hòa") — để đoán công trình */
  customer_text: string;
  /** Tên trong danh mục AI cho là khớp ('' = không khớp ai) */
  supplier_match: string;
  project_match: string;
  expense_type_match: string;
  buyer_match: string;
  printed_total: number;     // số TỔNG in trên hóa đơn (0 = không thấy)
  /** Sổ cộng tiền / bảng tổng hợp nhiều hóa đơn (chỉ có ngày + số tiền) — có thể đã ghi từng hóa đơn lẻ rồi */
  is_summary: boolean;
  lines: InvoiceLine[];
  /** Ô đầu phiếu AI không chắc: date, invoice_no, supplier_name, supplier_address, supplier_phone, printed_total, project_match, expense_type_match */
  low_confidence: string[];
};
/** Tiền ứng / thanh toán cho THẦU PHỤ hoặc NHÀ CUNG CẤP (giọng nói hoặc ảnh chuyển khoản) */
export type AdvanceScan = {
  date: string; amount: number;
  /** Người nhận là thầu phụ (phiếu Tạm ứng / Thanh toán đợt TP) hay nhà cung cấp (phiếu Trả nợ NCC) */
  party: 'subcontractor' | 'supplier';
  /** Tên người nhận như nghe / đọc được (vd "Hà điện nước", "sắt thép An Phú") */
  subcontractor_text: string;
  subcontractor_match: string;
  /** NCC trong danh mục khi party = 'supplier' */
  supplier_match: string;
  project_match: string;
  /** 'advance' = tạm ứng · 'progress' = thanh toán đợt */
  pay_kind: 'advance' | 'progress';
  method: PayMethod;
  note: string;
  low_confidence: string[];
};
/** Thu tiền của KHÁCH (chủ nhà) */
export type ReceiptScan = {
  date: string; amount: number;
  customer_text: string;
  customer_match: string;
  project_match: string;
  /** Tạm ứng / Giai đoạn / Quyết toán / Khác */
  receipt_kind: 'advance' | 'stage' | 'settlement' | 'other';
  method: PayMethod;
  note: string;
  low_confidence: string[];
};
export type FloorAreaScan = { name: string; area: number };
export type ContractScan = {
  customer_name: string; customer_full_name: string; customer_address: string; customer_phone: string;
  value: number; date: string; description: string;
  customer_match: string; project_match: string;
  /** Diện tích từng phần (Móng, Trệt, Lầu 1…, Mái) — đã nhân hệ số trong dự toán, m² */
  floor_areas: FloorAreaScan[];
  /** Đơn giá phần thô / m² (nếu có) */
  unit_price: number;
  /** Đây là bảng DỰ TOÁN (chưa ký), không phải hợp đồng */
  is_estimate: boolean;
  low_confidence: string[];
};
export type MaterialItem = { name: string; quantity: number; unit: string; note: string };
/** Danh sách vật tư cần mua (tin nhắn Zalo, giấy ghi tay) → bảng để copy gửi nhà cung cấp; KHÔNG lưu vào chi phí */
export type MaterialListScan = {
  title: string;
  /** NCC hợp với loại hàng (vd cốp pha → cửa hàng cốp pha) nếu có trong danh mục */
  supplier_match: string;
  project_match: string;
  /** Ghi chú giao hàng ("Giao qua chùa") */
  delivery_note: string;
  items: MaterialItem[];
};
/** 1 dòng công nhân trên phiếu chấm công tuần */
export type TimesheetRowScan = {
  /** Tên như viết trên phiếu ("Sơn", "Thanh Lé") */
  name: string;
  /** Tên trong danh mục Công nhân ('' = chưa khớp được) */
  worker_match: string;
  /** Cột T/P: 'C' cai · 'T' thợ · 'P' phụ · '' không rõ */
  role: string;
  /** 7 ô CN, T2 … T7 — số công (1, 0.5, 0, 1.3…) */
  days: number[];
  /** 'name' hoặc '0'…'6' (ô ngày thứ mấy, 0 = CN) đọc không chắc */
  low_confidence: string[];
};
export type TimesheetPurchaseScan = { name: string; amount: number };
/** Phiếu chấm công tuần viết tay (mẫu in của công ty): bảng tên + công CN..T7, phần GHI CHÚ (MUA ĐỒ) = hóa đơn mua lẻ của cai */
export type TimesheetScan = {
  /** Chủ nhật đầu tuần nếu phiếu có ghi ngày / tuần, không thì '' (app tự chọn tuần) */
  week_start: string;
  project_match: string;
  rows: TimesheetRowScan[];
  /** Các khoản mua lẻ ghi trên phiếu (cộng vào ô HĐ mua lẻ của người đầu phiếu — cai) */
  purchases: TimesheetPurchaseScan[];
  /** Số tổng mua lẻ người ta tự cộng trên phiếu (0 = không ghi) */
  purchase_total: number;
  /** Ghi chú khác trên phiếu ("Tăng ca bốc ngói 30 phút", "Ông Hoàng làm chủ nhật 3 công") */
  note: string;
  /** Căn cứ chọn công trình: 'note' ghi chú · 'crew' lịch sử chấm công của tổ · 'ai' AI đoán · '' chưa chọn */
  project_by: 'note' | 'crew' | 'ai' | '';
  low_confidence: string[];
};
export type IdCardScan = {
  full_name: string; id_number: string; date_of_birth: string; gender: string;
  hometown: string; permanent_address: string; id_issued_on: string; id_issued_place: string;
  /** 'worker' | 'customer' | 'employee' | 'subcontractor' | 'supplier' | '' — theo lời nhắn ("thầu phụ Đảng" → subcontractor) */
  contact_kind: string;
  /** Tên gọi trong danh bạ AI cho là cùng người ('' = không thấy) */
  contact_match: string;
  /** Tên gọi người dùng nói ("thầu phụ Đảng" → "Đảng"), '' = không nói */
  short_name: string;
  /** SĐT (lời nói / danh thiếp), chỉ chữ số */
  phone: string;
  /** Địa chỉ liên hệ / cửa hàng trên danh thiếp (khác nơi thường trú CCCD) */
  address: string;
  /** Lĩnh vực (thầu phụ: điện nước, sơn…) hoặc mặt hàng (nhà cung cấp) */
  field: string;
  /** Ghi chú từ lời nói, mỗi ý 1 dòng ngắn */
  note_lines: string[];
  /** 'cccd' | 'business_card' | 'none' (chỉ lời nói) */
  doc_type: string;
  low_confidence: string[];
};
/** Ảnh mặt tiền / bảng hiệu cửa hàng → Danh Bạ › Cửa hàng */
export type ShopScan = {
  name: string; address: string;
  /** Khu vực: quận / huyện, tỉnh — để tìm theo vùng */
  area: string;
  phones: string[];
  /** Mặt hàng / ghi chú, mỗi ý 1 gạch đầu dòng ngắn */
  details: string[];
  /** NCC trong danh mục có vẻ cùng cửa hàng */
  supplier_match: string;
  /** Ô đọc không chắc (mờ / khuất): 'phone', 'address', 'name', 'area' */
  low_confidence: string[];
};

export type ScanResult =
  | { kind: 'invoice'; invoice: InvoiceScan }
  | { kind: 'advance'; advance: AdvanceScan }
  | { kind: 'receipt'; receipt: ReceiptScan }
  | { kind: 'contract'; contract: ContractScan }
  | { kind: 'material_list'; material_list: MaterialListScan }
  | { kind: 'timesheet'; timesheet: TimesheetScan }
  | { kind: 'id_card'; id_card: IdCardScan }
  | { kind: 'shop'; shop: ShopScan };

export type ScanResponse = ScanResult & {
  /** 'gemini' = AI đọc thật · 'mock' = chưa có key, đọc từ fixtures */
  mode: 'gemini' | 'mock';
  model?: string;
  warning?: string;
  /** Lời nói AI nghe được (khi gửi ghi âm) — để anh xem AI hiểu đúng chưa */
  transcript?: string;
  /** Câu AI muốn hỏi lại (thiếu / không chắc), '' = không có */
  question?: string;
};

/** Danh sách tên đưa kèm cho AI khớp */
export type ScanContext = {
  projects: string[]; expense_types: string[]; suppliers: string[]; buyers: string[];
  workers: string[]; customers: string[]; employees: string[];
  /** Thầu phụ (tên trong danh mục) + mô tả lĩnh vực */
  subcontractors?: string[];
  subcontractor_hints?: Record<string, string>;
  /** Mô tả thêm cho AI nhận ra công trình / NCC (chủ đầu tư, địa chỉ, đang thi công, tên gọi khác…) — tên → mô tả */
  project_hints?: Record<string, string>;
  supplier_hints?: Record<string, string>;
  /** Để khớp công trình theo ghi chú bằng code (matchProjectByNote) */
  project_meta?: ProjectMeta[];
  /** Hóa đơn chi phí ~90 ngày gần nhất có NCC — để đoán công trình theo lịch sử (guessProjectFromHistory) */
  recent_expenses?: ExpenseHistoryRow[];
  /** Mô tả thêm cho từng công nhân (gần đây chấm công ở công trình nào) */
  worker_hints?: Record<string, string>;
  /** Chấm công ~120 ngày gần nhất — để đoán công trình theo tổ thợ (guessProjectFromCrew) */
  recent_timesheets?: TimesheetHistoryRow[];
  /** Hôm nay (YYYY-MM-DD, giờ VN) — để AI đoán năm khi phiếu ghi thiếu, hiểu "hôm nay / hôm qua" */
  today?: string;
};

/** Loại nút AI nào người dùng được phép (theo quyền) — hàm máy chủ chỉ đưa các loại này vào câu lệnh */
export type KindPermissions = Partial<Record<ScanKind, boolean>>;

// ───────────── Câu lệnh cho AI ─────────────

const KIND_TEXT: Record<ScanRequestKind, string> = {
  auto: 'Tự nhận đây là loại nào trong các loại ở MẪU JSON (kind).',
  invoice: 'Đây là HÓA ĐƠN / phiếu giao hàng / sổ cộng tiền của cửa hàng (invoice).',
  advance: 'Đây là TIỀN ỨNG / thanh toán cho THẦU PHỤ (advance).',
  receipt: 'Đây là THU TIỀN của KHÁCH HÀNG (receipt).',
  contract: 'Đây là HỢP ĐỒNG thi công hoặc DỰ TOÁN công trình (contract).',
  material_list: 'Đây là DANH SÁCH VẬT TƯ CẦN MUA (material_list).',
  timesheet: 'Đây là PHIẾU CHẤM CÔNG tuần của tổ thợ (timesheet).',
  id_card: 'Đây là CĂN CƯỚC CÔNG DÂN / danh thiếp / thông tin một NGƯỜI để lưu danh bạ (id_card). Đọc cả hai mặt nếu có.',
  shop: 'Đây là ẢNH MẶT TIỀN / BẢNG HIỆU CỬA HÀNG vật tư để lưu danh bạ cửa hàng (shop).',
  save_info: 'Người dùng muốn LƯU THÔNG TIN vào danh bạ: ảnh CCCD / danh thiếp / lời nói về một người (id_card), HOẶC ảnh mặt tiền / bảng hiệu cửa hàng (shop). Chọn đúng một kind.',
};

/** Cách nhận ra từng loại (chỉ đưa các loại được phép) */
const KIND_RULES: Record<ScanKind, string> = {
  invoice: '- "invoice": hóa đơn / phiếu giao hàng / biên nhận của cửa hàng có tên hàng, số lượng, đơn giá, hoặc SỔ CỘNG TIỀN (chỉ có các dòng ngày + số tiền rồi cộng tổng). Nói "mua …" có số tiền cũng là invoice.',
  advance: '- "advance": tiền ỨNG / TRẢ cho THẦU PHỤ hoặc NHÀ CUNG CẤP (vd "ứng Hà điện nước 5 triệu", "ứng Đỏ 6tr", "trả sắt thép An Phú 50 triệu", "nhà cung cấp An Phú ứng 50 triệu"), hoặc ẢNH CHUYỂN KHOẢN ngân hàng mà người NHẬN là thầu phụ / cửa hàng. KHÔNG phải hóa đơn mua hàng (không có tên hàng, số lượng).',
  receipt: '- "receipt": KHÁCH HÀNG / chủ nhà đưa tiền / chuyển tiền cho công ty (vd "anh Nhật đưa 100 triệu", "khách chuyển 200tr"), hoặc ảnh chuyển khoản mà người GỬI là khách hàng.',
  contract: '- "contract": hợp đồng thi công với chủ nhà, hoặc bảng DỰ TOÁN công trình (có diện tích Móng, Trệt, Lầu, Mái… và đơn giá / m²).',
  material_list: '- "material_list": danh sách vật tư CẦN MUA do thợ / cai gửi (tin nhắn Zalo, chữ viết trên ván, giấy), chưa có giá tiền.',
  timesheet: '- "timesheet": PHIẾU CHẤM CÔNG tuần (mẫu in có logo NH, bảng TT | TÊN | T/P | CN | T2 … T7 | TIỀN CÔNG, viết tay tên thợ và dấu x / số 1 / số 0), có thể kèm phần GHI CHÚ (MUA ĐỒ) hoặc trang SỔ GHI NHẬT KÝ CÔNG TRÌNH ghi tiền mua lẻ. Dù có ghi tiền mua đồ vẫn là timesheet, KHÔNG phải invoice.',
  id_card: '- "id_card": ảnh CĂN CƯỚC CÔNG DÂN / CMND, DANH THIẾP, hoặc lời nhắn "lưu thông tin / lưu số" của một NGƯỜI (khách hàng, công nhân, thầu phụ, nhà cung cấp, nhân viên) — không có tiền.',
  shop: '- "shop": ảnh chụp MẶT TIỀN / BẢNG HIỆU một cửa hàng (vật liệu xây dựng, điện nước, sắt thép, sơn…) để lưu lại địa chỉ — KHÔNG phải hóa đơn (không có bảng hàng + số tiền).',
};

const TPL: Record<ScanKind, string> = {
  invoice: ` "invoice": {
  "date": "YYYY-MM-DD",
  "invoice_no": "",
  "supplier_name": "",      // tên cửa hàng in ở đầu phiếu, ngắn gọn (vd "THÉP AN PHÚ")
  "supplier_address": "",   // 1 địa chỉ cửa hàng, ngắn
  "supplier_phones": [],    // tối đa 2 số điện thoại cửa hàng, chỉ chữ số, bỏ số tài khoản
  "customer_text": "",      // chép NGUYÊN ô Khách hàng / Người nhận / địa chỉ giao hàng trên phiếu (vd "Chú Hữu PT Hòa"), không có thì ""
  "supplier_match": "",     // tên NCC trong DANH MỤC nếu cùng cửa hàng, không thì ""
  "project_match": "",      // tên công trình trong DANH MỤC
  "expense_type_match": "", // loại chi phí trong DANH MỤC
  "buyer_match": "",        // người mua trong DANH MỤC (theo ghi chú), không rõ thì ""
  "printed_total": 0,       // tổng tiền in / viết trên phiếu, đồng
  "is_summary": false,      // true nếu là SỔ CỘNG TIỀN / bảng tổng hợp (các dòng chỉ có ngày + số tiền)
  "lines": [{"date": "", "name": "", "unit": "", "quantity": 0, "unit_price": 0, "amount": 0, "low_confidence": []}],
  "low_confidence": []      // tên các ô đầu phiếu đọc không chắc
 }`,
  advance: ` "advance": {
  "date": "YYYY-MM-DD",
  "amount": 0,                 // đồng
  "party": "subcontractor",    // "subcontractor" = thầu phụ, "supplier" = nhà cung cấp / cửa hàng vật tư
  "subcontractor_text": "",    // LUÔN chép tên người nhận như nghe / đọc được (thầu phụ hay NCC đều ghi ở đây)
  "subcontractor_match": "",   // party = subcontractor: tên trong DANH MỤC Thầu phụ
  "supplier_match": "",        // party = supplier: tên trong DANH MỤC Nhà cung cấp
  "project_match": "",         // tên công trình trong DANH MỤC
  "pay_kind": "advance",       // "advance" = tạm ứng, "progress" = thanh toán đợt / trả theo hợp đồng
  "method": "",                // "transfer" = chuyển khoản, "cash" = tiền mặt, "" = không nói
  "note": "",                  // nội dung ngắn (vd "Ứng tiền điện nước")
  "low_confidence": []
 }`,
  receipt: ` "receipt": {
  "date": "YYYY-MM-DD",
  "amount": 0,
  "customer_text": "",         // tên khách như nghe / đọc được
  "customer_match": "",        // tên trong DANH MỤC Khách hàng
  "project_match": "",         // công trình của khách đó trong DANH MỤC
  "receipt_kind": "stage",     // "advance" = tạm ứng / ứng trước, "stage" = thu theo đợt / giai đoạn, "settlement" = quyết toán, "other"
  "method": "",                // "transfer" = chuyển khoản, "cash" = tiền mặt, "" = không nói
  "note": "",
  "low_confidence": []
 }`,
  contract: ` "contract": {
  "customer_name": "", "customer_full_name": "", "customer_address": "", "customer_phone": "",
  "value": 0,                  // giá trị hợp đồng / tổng giá trị dự toán, đồng
  "date": "YYYY-MM-DD", "description": "",
  "customer_match": "", "project_match": "",   // tên trong DANH MỤC
  "floor_areas": [{"name": "Móng", "area": 0}],  // diện tích từng phần ĐÃ NHÂN hệ số (cột số lượng m²): Móng, Trệt, Lầu 1, Lầu 2…, Sân thượng, Mái
  "unit_price": 0,             // đơn giá phần thô / m² nếu có
  "is_estimate": false,        // true nếu là bảng dự toán (chưa phải hợp đồng ký)
  "low_confidence": []
 }`,
  material_list: ` "material_list": {
  "title": "",                 // tiêu đề ngắn, vd "Vật tư điện" / "Ván cốp pha"
  "supplier_match": "",        // NCC hợp với loại hàng trong DANH MỤC (vd cốp pha → cửa hàng cốp pha), không chắc thì ""
  "project_match": "",
  "delivery_note": "",         // ghi chú giao hàng nếu có (vd "Giao qua chùa")
  "items": [{"name": "", "quantity": 0, "unit": "", "note": ""}]
 }`,
  timesheet: ` "timesheet": {
  "week_start": "",            // YYYY-MM-DD của CHỦ NHẬT đầu tuần nếu phiếu có ghi ngày / tuần; không ghi thì ""
  "project_match": "",         // tên công trình trong DANH MỤC (theo ghi chú, hoặc theo công trình tổ thợ này gần đây làm)
  "rows": [{
    "name": "",                // tên thợ chép như viết trên phiếu, có dấu
    "worker_match": "",        // tên trong DANH MỤC Công nhân nếu cùng người, không chắc thì ""
    "role": "",                // cột T/P: "C" = cai, "T" = thợ, "P" = phụ; chữ khác / trống thì ""
    "days": [0, 0, 0, 0, 0, 0, 0],   // ĐÚNG 7 số theo thứ tự CN, T2, T3, T4, T5, T6, T7
    "low_confidence": []       // "name" hoặc tên cột ngày đọc không chắc: "CN", "T2" … "T7"
  }],
  "purchases": [{"name": "", "amount": 0}],   // từng khoản mua đồ / mua lẻ ghi trên phiếu, tiền là đồng
  "purchase_total": 0,         // số TỔNG mua đồ người ta tự cộng trên phiếu, không ghi thì 0
  "note": "",                  // ghi chú khác trên phiếu (tăng ca, ai làm thêm…), không có thì ""
  "low_confidence": []
 }`,
  id_card: ` "id_card": {
  "full_name": "IN HOA CÓ DẤU", "id_number": "12 chữ số", "date_of_birth": "YYYY-MM-DD", "gender": "Nam hoặc Nữ",
  "hometown": "", "permanent_address": "", "id_issued_on": "YYYY-MM-DD", "id_issued_place": "",
  "doc_type": "cccd",       // "cccd" = căn cước / CMND, "business_card" = danh thiếp, "none" = không có ảnh giấy tờ (chỉ lời nói)
  "contact_kind": "worker | customer | employee | subcontractor | supplier | unknown",  // theo lời nhắn: thợ / công nhân → worker, khách / chủ nhà → customer, thầu phụ → subcontractor, nhà cung cấp / cửa hàng → supplier, nhân viên → employee
  "contact_match": "",      // tên trong DANH MỤC của nhóm đó nếu cùng người
  "short_name": "",         // tên gọi người dùng nói (vd "thầu phụ Đảng" → "Đảng"), không nói thì ""
  "phone": "",              // SĐT trong lời nói / danh thiếp, chỉ chữ số
  "address": "",            // địa chỉ liên hệ / cửa hàng trên danh thiếp hoặc lời nói (KHÔNG phải nơi thường trú CCCD)
  "field": "",              // thầu phụ: lĩnh vực (điện nước, sơn, cốp pha…); nhà cung cấp: mặt hàng chính
  "note_lines": [],         // ý khác trong lời nói, mỗi ý 1 dòng ngắn gọn (vd "Làm kỹ, giá mềm"), không có thì []
  "low_confidence": []
 }`,
  shop: ` "shop": {
  "name": "",               // tên cửa hàng trên bảng hiệu, ngắn gọn (vd "VLXD PHƯƠNG")
  "address": "",            // địa chỉ trên bảng hiệu (số nhà, đường, phường / xã, quận / huyện, tỉnh)
  "area": "",               // khu vực ngắn để tìm: "quận / huyện, tỉnh / thành" (vd "Tân Phú, TP.HCM", "Biên Hòa, Đồng Nai"); không rõ thì ""
  "phones": [],             // tối đa 3 số điện thoại, chỉ chữ số
  "details": [],            // mặt hàng / ghi chú: mỗi ý 1 gạch đầu dòng ngắn (KHÔNG có dấu "-" ở đầu)
  "supplier_match": "",     // tên NCC trong DANH MỤC nếu chính là cửa hàng này, không thì ""
  "low_confidence": []      // "phone" / "address" / "name" nếu chữ mờ, bị che, không chắc
 }`,
};

/** Các loại đưa vào câu lệnh: loại đã chọn, hoặc (auto) mọi loại nút AI được phép */
export function promptKinds(kind: ScanRequestKind, allowed?: KindPermissions): ScanKind[] {
  if (kind === 'save_info') {
    const ks = SAVE_INFO_KINDS.filter((k) => !allowed || allowed[k]);
    return ks.length ? ks : ['shop'];
  }
  if (kind !== 'auto') return [kind];
  const ks = AUTO_KINDS.filter((k) => !allowed || allowed[k]);
  return ks.length ? ks : ['invoice'];
}

function jsonTemplate(kinds: readonly ScanKind[]): string {
  const head = ' "transcript": "",   // nếu có GHI ÂM: chép lại lời nói (tiếng Việt có dấu); không có thì ""\n "question": "",     // câu hỏi lại người dùng nếu thiếu / không chắc điều quan trọng, không có thì ""';
  if (kinds.length === 1) return `{\n "kind": "${kinds[0]}",\n${head},\n${TPL[kinds[0]!]}\n}`;
  return `{\n "kind": "${kinds.join(' hoặc ')}",\n${head},\n  // CHỈ điền MỘT phần đúng với kind:\n${kinds.map((k) => TPL[k]).join(',\n')}\n}`;
}

const list = (title: string, xs: readonly string[] | undefined, hints?: Record<string, string>) =>
  xs?.length ? `${title}:\n${xs.slice(0, 400).map((x) => `- ${x}${hints?.[x] ? ` (${hints[x]})` : ''}`).join('\n')}` : '';

const NUMBER_RULES = [
  'QUY TẮC SỐ (rất quan trọng):',
  '- Tiền là số nguyên đồng (1.250.000 → 1250000).',
  '- Phiếu viết tay ở Việt Nam thường VIẾT TẮT, bỏ 3 số 0 cuối, kèm ký hiệu Đ / đ / D / k / n / dấu gạch: "313Đ" = 313000, "10.642Đ" = 10642000, "31.321Đ" = 31321000, "18,5" = 18500.',
  '- Lời nói / tin nhắn: "5 triệu" = 5000000, "3tr2" / "3 triệu 2" = 3200000, "1tr5" = 1500000, "500k" / "5 trăm nghìn" = 500000, "100 triệu" = 100000000, "1 tỷ 2" = 1200000000.',
  '- Hóa đơn: LUÔN kiểm tra số lượng × đơn giá = thành tiền ở TỪNG dòng, và tổng các dòng = tổng in trên phiếu. Chọn cách hiểu số (nghìn hay đồng) sao cho các phép tính KHỚP. Đơn giá vật liệu xây dựng hiếm khi dưới 1.000 đ. Vẫn không khớp thì ghi đúng từng số đọc được và ghi ô nghi sai vào low_confidence.',
  '- Ngày dạng YYYY-MM-DD, ghi ĐÚNG ngày trên chứng từ (Việt Nam ghi ngày/tháng/năm). Thiếu năm thì lấy năm gần nhất không vượt quá hôm nay. "hôm nay" = ngày hôm nay, "hôm qua" = trước 1 ngày. Không có ngày thì để trống.',
  '- unit (đơn vị tính) viết thường: cái, bao, xe, kg, m, m2, m3, cây, viên, cuộn, lon, thùng, khối, tấm, bộ… Ô ĐVT ghi " hoặc // (ditto) thì để trống.',
];

const INVOICE_RULES = [
  'HÓA ĐƠN:',
  '- Ô "Khách hàng" trên phiếu của cửa hàng thường là tên NGƯỜI MUA / chủ nhà, KHÔNG phải tên công trình — chép nguyên vào customer_text.',
  '- SỔ CỘNG TIỀN (is_summary = true): phiếu chỉ ghi các dòng ngày + số tiền (vd "13/11 … 73.261Đ", "12/11 … 31.321Đ") rồi cộng tổng. Mỗi dòng: date = ngày ghi ở dòng đó, name = "Hóa đơn ngày dd/mm", quantity = 1, unit_price = amount = số tiền dòng đó; printed_total = số tổng. KHÔNG bỏ trống số tiền.',
  '- Nhà cung cấp: tên cửa hàng in ở đầu phiếu, SĐT, tên gọi khác trong danh mục. Loại dịch vụ chung chung (xe ba gát, xe tải, thợ…) KHÔNG đủ để đoán. Nhiều số điện thoại thì lấy 2 số đầu.',
  '- Mỗi hóa đơn chọn 1 loại chi phí hợp với phần lớn hàng (vd sắt thép → loại có chữ Sắt Thép).',
  '- Danh mục NCC có ghi "gần đây giao cho: …": NCC đó hay giao cho công trình nào. Dùng để chọn giữa các công trình cùng khớp địa chỉ / tên khách, KHÔNG đủ để đoán một mình.',
];

const MONEY_RULES = [
  'TIỀN ỨNG / THU TIỀN (thường là lời nói hoặc ảnh chuyển khoản):',
  '- Ảnh chuyển khoản: amount = số tiền chuyển, date = ngày giao dịch, method = "transfer", note = nội dung chuyển khoản (ngắn). Người NHẬN là thầu phụ → advance; người GỬI là khách hàng / chuyển cho công ty → receipt.',
  '- Lời nói có "chuyển khoản" / "CK" → method = "transfer"; "tiền mặt" → "cash"; không nói → "" và hỏi lại trong "question" (vd "Anh Nhật đưa tiền mặt hay chuyển khoản?").',
  '- Thầu phụ hay được gọi kèm lĩnh vực: "Hà điện nước" = thầu phụ Hà (điện nước). Khớp theo danh mục Thầu phụ (tên + lĩnh vực trong ngoặc).',
  '- Người nhận là NHÀ CUNG CẤP / cửa hàng vật tư (nói "nhà cung cấp", "cửa hàng", tên có trong danh mục Nhà cung cấp, vd "sắt thép An Phú", "VLXD Bá Hòa") → party = "supplier", ghi supplier_match. Thợ / tổ đội / cai trong danh mục Thầu phụ → party = "subcontractor".',
  '- Công trình theo tên chủ nhà: "công trình nhà anh Nhật" = công trình có chủ đầu tư / tên gọi Nhật.',
];

const CONTRACT_RULES = [
  'HỢP ĐỒNG / DỰ TOÁN:',
  '- floor_areas lấy ở bảng "DIỆN TÍCH XÂY DỰNG" / "DIỆN TÍCH VÀ GIÁ TRỊ PHẦN THÔ": mỗi dòng 1 phần (Móng cọc, Trệt + sân, Lầu 1, Lầu 2, Lầu 4 + ST, Mái…), area = số m² ĐÃ nhân hệ số (cột số lượng), làm tròn 2 số lẻ. Bỏ dòng TỔNG CỘNG.',
  '- value = giá trị hợp đồng; với dự toán thì lấy TỔNG GIÁ THÀNH XÂY DỰNG CÔNG TRÌNH (dòng tổng cuối cùng). unit_price = đơn giá phần thô / m².',
  '- Số điện thoại chủ nhà chỉ chữ số. Tên gọi ngắn (customer_name) kiểu "A Nhật", "Cô Sáu", "C Hương".',
];

const MATERIAL_RULES = [
  'DANH SÁCH VẬT TƯ:',
  '- Chép ĐÚNG số lượng người ta ghi, mỗi loại / mỗi quy cách 1 dòng; tên vật tư viết rõ ràng, có dấu, đủ quy cách để cửa hàng soạn hàng.',
  '- Tin nhắn sửa lại ở sau ("Đèn ốp trần 24w: 6 cái thôi nha") thay cho số lượng trước đó của cùng món. Tin nhắn giao hàng ("Giao qua chùa") ghi vào delivery_note, không thành dòng.',
  '- Nhiều màu ghi chung ("Dây 1.5: 4 cuộn (xanh, đỏ, vàng, đen)"): số cuộn bằng số màu thì tách mỗi màu 1 dòng 1 cuộn (Dây điện 1.5 màu xanh – 1 cuộn …); không bằng thì giữ 1 dòng và ghi màu vào note.',
  '- Ký hiệu trên ván / giấy của cai: "45:8T" / "45 8T" = Ván cốp pha 45 cm – 8 tấm; "T" = tấm, "c" = cây, "b" = bao. Số đứng trước dấu ":" là bề rộng ván (cm), số sau là số lượng. Ghi chú của người dùng nói "cốp pha" / "copha" thì đây là ván cốp pha.',
  '- Viết tắt điện nước: "công tắt" = công tắc, "ổ cắm đôi 2 chấu", "rcbo" = RCBO, "đèn 6 tấc" = đèn tuýp 0,6 m. Giữ nguyên thông số (24w, 32A, 2P, m36…).',
];

const TIMESHEET_RULES = [
  'PHIẾU CHẤM CÔNG:',
  '- Mỗi dòng có tên = 1 công nhân, giữ đúng thứ tự trên phiếu (người ĐẦU TIÊN thường là cai). Bỏ dòng trống. Hai trang mở đôi: trang trái là bảng chấm công, trang phải (SỔ GHI NHẬT KÝ CÔNG TRÌNH) là các khoản mua đồ.',
  '- days luôn đủ 7 số theo thứ tự CN, T2, T3, T4, T5, T6, T7. Dóng ô theo TIÊU ĐỀ CỘT in trên phiếu — nhiều phiếu bỏ trống cột CN (CN = 0), đừng dồn các dấu sang trái.',
  '- Dấu "x", "X", dấu tích, số "1" = 1 công. Số "0", chữ "o", vòng tròn, ô TÔ ĐEN / gạch bỏ (ghi nhầm), ô trống = 0. "0,5", "1/2", dấu "/" (nửa chữ x) = 0.5. Số lẻ "1,1" "1,2" "1,3" "1,30" (1 công + tăng ca) → chép đúng số: 1.1, 1.2, 1.3, 1.3.',
  '- Ô nào dấu mờ, viết đè, khó phân biệt x với 0 → ghi tên cột đó ("T5") vào low_confidence của dòng.',
  '- worker_match: so tên viết tay với DANH MỤC Công nhân (không phân biệt hoa thường). Nhiều người cùng tên (vd "SƠN", "SƠN HEO") thì chọn người gần đây làm CÙNG công trình / cùng tổ với những người khác trên phiếu (xem phần trong ngoặc); vẫn không chắc thì "".',
  '- purchases: mọi khoản MUA ĐỒ / trả tiền ghi ở phần GHI CHÚ (MUA ĐỒ), ở các dòng trống trong bảng, cột TIỀN CÔNG hoặc trang nhật ký: name = tên món (vd "Nước uống", "Đinh thép"), amount = số tiền. "42K" = 42000, "210K" = 210000, "80.000" = 80000, "190000" = 190000. Dòng TỔNG (vd "Tổng: 565K", số dưới gạch ngang) KHÔNG phải một khoản — ghi vào purchase_total. KHÔNG tự cộng.',
  '- Câu không có tiền ("Tăng ca bốc ngói 30 phút", "Ông Hoàng quận 12 làm chủ nhật 3 công") ghi vào note.',
  '- project_match: theo ghi chú người dùng; không có thì theo công trình mà cai / tổ thợ trên phiếu gần đây chấm công (xem phần trong ngoặc ở DANH MỤC Công nhân).',
];

const INFO_RULES = [
  'LƯU THÔNG TIN NGƯỜI (id_card):',
  '- Nhóm (contact_kind) theo LỜI NHẮN: "thầu phụ" → subcontractor; "khách hàng" / "chủ nhà" → customer; "công nhân" / "thợ" / "phụ hồ" → worker; "nhà cung cấp" / "cửa hàng" / "đại lý" → supplier; "nhân viên" → employee. Không nói thì unknown.',
  '- CCCD: đọc họ tên (IN HOA có dấu), số CCCD 12 số, ngày sinh, giới tính, quê quán, nơi thường trú, ngày cấp, nơi cấp. Danh thiếp: họ tên, SĐT, địa chỉ, tên công ty / cửa hàng (nhà cung cấp thì short_name = tên cửa hàng).',
  '- SĐT người dùng nói ("không chín ba…") đổi ra chữ số. short_name = tên gọi người dùng nói, giữ nguyên cách gọi (vd "Đảng", "A Huynh").',
  '- Ý khác trong lời nói ("làm kỹ", "bên Bình Dương", "anh Long giới thiệu") → note_lines, mỗi ý 1 dòng ngắn, viết lại cho gọn rõ.',
];

const SHOP_RULES = [
  'CỬA HÀNG (shop):',
  '- Đọc bảng hiệu: tên cửa hàng, địa chỉ, số điện thoại. Chữ mờ / bị che / bị cắt / không chắc → ghi "phone" / "address" / "name" vào low_confidence, KHÔNG bịa.',
  '- Đọc HẾT chữ ở mặt tiền: bảng chính, bảng phụ, bạt che, và các BẢNG NHỎ / tấm bìa dựng trước cửa (vd "Cho thuê giàn giáo", "Thạch cao USG", bảng màu tấm ốp) — mặt hàng ở các bảng nhỏ cũng đưa vào details.',
  '- phones: chỉ số điện thoại / di động, BỎ số Fax và số tài khoản. Có 2 bảng hiệu ghi số khác nhau, hoặc số bị che mất chữ số → chọn số rõ nhất và ghi "phone" vào low_confidence. Ghi đúng các chữ số như in, không tự thêm / đổi đầu số. TUYỆT ĐỐI KHÔNG ĐOÁN chữ số bị che (lá cây, xe, ô dù) hoặc bị cắt ở mép ảnh: chỉ ghi phần nhìn thấy (vd "0903641") và ghi "phone" vào low_confidence.',
  '- Tên cửa hàng: tên riêng to nhất (vd "TIẾN THÀNH", "S.I.K"), không lấy chữ "Công ty TNHH…" hay loại hàng.',
  '- details: nếu người dùng CÓ nói / gõ thêm (vd "bán tôn lá đủ khổ 20cm tới 1m, giá rẻ nhất Tân Phú"), kết hợp lời đó với mặt hàng trên bảng hiệu, diễn đạt lại thành các gạch đầu dòng ngắn gọn, rõ ràng, GIỮ ĐỦ ý của người dùng — kể cả lời khen / chê, so sánh giá, lời dặn (vd "Chống thấm Sika — hàng tốt") (vd "Tôn lá đủ khổ 20 cm – 1 m", "Giá rẻ nhất khu Tân Phú"). Nếu người dùng KHÔNG nói gì thêm, lấy đúng các mặt hàng / dịch vụ in trên bảng hiệu, mỗi nhóm hàng 1 dòng.',
  '- area: quận / huyện + tỉnh / thành rút từ địa chỉ (vd "Dĩ An, Bình Dương").',
];

/** Câu lệnh hệ thống (systemInstruction) — học theo bot Telegram n8n "Bot ghi chi phí công trình V4" (mục "Gom danh mục") */
export function buildPrompt(kind: ScanRequestKind, note: string, ctx: ScanContext, allowed?: KindPermissions): string {
  const kinds = promptKinds(kind, allowed);
  const has = (k: ScanKind) => kinds.includes(k);
  return [
    'Bạn là trợ lý ghi chép cho một công ty xây nhà phố ở Việt Nam (Công ty Nguyễn Hữu). Người dùng gửi ảnh / PDF / chữ / ghi âm giọng nói. Đọc và trả về JSON theo MẪU bên dưới.',
    ctx.today ? `Hôm nay là ${ctx.today}.` : '',
    KIND_TEXT[kind],
    kind === 'auto' || kind === 'save_info' ? ['CÁCH NHẬN LOẠI:', ...kinds.map((k) => KIND_RULES[k])].join('\n') : '',
    '',
    ...NUMBER_RULES,
    '',
    has('invoice') ? INVOICE_RULES.join('\n') : '',
    has('advance') || has('receipt') ? MONEY_RULES.join('\n') : '',
    has('contract') ? CONTRACT_RULES.join('\n') : '',
    has('material_list') ? MATERIAL_RULES.join('\n') : '',
    has('timesheet') ? TIMESHEET_RULES.join('\n') : '',
    has('id_card') ? INFO_RULES.join('\n') : '',
    has('shop') ? SHOP_RULES.join('\n') : '',
    '',
    'QUY TẮC TÊN:',
    '- Các ô *_match PHẢI chép ĐÚNG Y một tên trong DANH MỤC bên dưới (giữ dấu, chữ hoa, ngoặc). Không chắc thì để trống. Tuyệt đối không bịa tên mới.',
    '- Tên khách / địa chỉ hay VIẾT TẮT tên đường, phường theo chữ đầu: "PT Hòa" / "PTH" = Phú Thọ Hòa, "TNH" = Thoại Ngọc Hầu, "CVT" = Châu Vĩnh Tế, "LLQ" = Lạc Long Quân, "BT" = Bình Tân, "TP" = Tân Phú. So với địa chỉ và phần trong ngoặc của công trình.',
    '- Tên gọi giống nhiều công trình thì ưu tiên công trình ĐANG THI CÔNG.',
    '- KHÔNG ĐOÁN công trình: không có căn cứ rõ (ghi chú, lời nói, địa chỉ giao hàng, tên chủ nhà trùng chủ đầu tư) thì project_match = "".',
    '- Ô nào chữ mờ / viết tay khó đọc / nghe không rõ thì ghi tên ô vào low_confidence.',
    '',
    note.trim() ? `GHI CHÚ CỦA NGƯỜI DÙNG (ưu tiên khi chọn loại, công trình, loại chi phí, người mua): "${note.trim().slice(0, 1000)}"` : 'Người dùng không ghi chú.',
    '',
    'TRẢ VỀ MỘT đối tượng JSON đúng mẫu dưới đây, không viết gì khác (không giải thích, không ```):',
    jsonTemplate(kinds),
    '',
    'DANH MỤC',
    list('Công trình', ctx.projects, ctx.project_hints),
    has('invoice') || has('material_list') ? list('Loại chi phí', ctx.expense_types) : '',
    has('invoice') || has('material_list') || has('advance') || has('shop') || has('id_card') ? list('Nhà cung cấp', ctx.suppliers, ctx.supplier_hints) : '',
    has('invoice') ? list('Người mua', ctx.buyers) : '',
    has('advance') || has('id_card') ? list('Thầu phụ', ctx.subcontractors, ctx.subcontractor_hints) : '',
    has('receipt') || has('contract') || has('id_card') ? list('Khách hàng', ctx.customers) : '',
    has('timesheet') ? list('Công nhân', ctx.workers, ctx.worker_hints) : '',
    has('id_card') ? [has('timesheet') ? '' : list('Công nhân', ctx.workers), list('Nhân viên', ctx.employees)].join('\n') : '',
  ].filter((x) => x !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
}

// ───────────── Chuẩn hóa kết quả AI ─────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** Tiền / số AI trả có thể là "1.250.000" hoặc 1250000 → số nguyên đồng, không âm */
export function toMoney(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  const digits = str(v).replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

/** Số lượng: "2,5" → 2.5 */
export function toQuantity(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const n = Number(str(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Ngày: YYYY-MM-DD hoặc dd/mm/yyyy → YYYY-MM-DD; sai → '' */
export function toIsoDate(v: unknown): string {
  const s = str(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]!; mo = +m[2]!; d = +m[3]!; } else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (!m) return '';
    d = +m[1]!; mo = +m[2]!; y = +m[3]!;
  }
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** SĐT: chỉ chữ số, 8–11 số; tối đa `max` số, bỏ trùng. Nhận mảng hoặc chuỗi nhiều số ("0903.358.289 - 0903.358.286") */
/** min = số chữ số tối thiểu (cửa hàng: 7 — giữ số bị che dở để người dùng thấy và sửa) */
export function toPhones(v: unknown, max = 2, min = 8): string[] {
  const raw = Array.isArray(v) ? v.map(str) : str(v).split(/\s[-–]\s|[,;/|]|\s{2,}/);
  const out: string[] = [];
  for (const r of raw) {
    const d = r.replace(/\D/g, '');
    if (d.length >= min && d.length <= 11 && !out.includes(d)) out.push(d);
    if (out.length >= max) break;
  }
  return out;
}

const toMethod = (v: unknown): PayMethod => (str(v) === 'transfer' ? 'transfer' : str(v) === 'cash' ? 'cash' : '');

/** Chỉ giữ tên *_match nếu nó có thật trong danh sách (AI hay "sáng tác") */
function pick(v: unknown, allowed: readonly string[]): string {
  const s = str(v);
  if (!s) return '';
  const low = s.toLowerCase();
  return allowed.find((a) => a.toLowerCase() === low) ?? '';
}

/**
 * Khớp tên gõ / nói ("Hà điện nước", "anh Nhật") với danh mục bằng code khi AI không khớp được:
 * trùng không dấu → lấy; không thì tên trong danh mục mà mọi chữ (≥ 2 ký tự, bỏ a/c/chú/cô…) đều có trong câu → lấy nếu chỉ 1 tên.
 */
export function matchName(text: string, names: readonly string[]): string {
  const t = foldVi(text);
  if (!t) return '';
  const exact = names.find((n) => foldVi(n) === t);
  if (exact) return exact;
  const words = ` ${t} `;
  const honor = /^(a|anh|c|chi|chu|co|e|em|thay|ong|ba|ct|sc|sn)$/;
  // Bỏ chữ viết tắt không có nguyên âm trong tên danh mục ("TPDN HÀ" = thầu phụ điện nước Hà → chỉ cần "ha")
  const hits = names.filter((n) => {
    const ks = foldVi(n.replace(/\(.*?\)/g, ' ')).split(' ').filter((w) => w.length >= 2 && !honor.test(w) && /[aeiouy]/.test(w));
    return ks.length > 0 && ks.every((k) => words.includes(` ${k} `));
  });
  return hits.length === 1 ? hits[0]! : '';
}

/**
 * Giữ tên AI khớp chỉ khi có ít nhất 1 chữ "thật" (≥ 2 ký tự, có nguyên âm, không phải từ chung như vlxd / cửa hàng / sắt thép)
 * trùng với tên người dùng nói / phiếu ghi. Không có tên để so (text rỗng) → giữ nguyên.
 */
export function keepIfSimilar(match: string, text: string): string {
  if (!match || !text.trim()) return match;
  const common = /^(vlxd|vat|lieu|xay|dung|cua|hang|ch|cty|cong|ty|tnhh|sat|thep|nha|cung|cap|dien|nuoc|kho|gach|tp|tpdn)$/;
  const words = (s: string) => foldVi(s.replace(/\(.*?\)/g, ' ')).split(' ').filter((w) => w.length >= 2 && /[aeiouy]/.test(w) && !common.test(w));
  const said = new Set(words(text));
  const own = words(match);
  return !own.length || own.some((w) => said.has(w)) ? match : '';
}

function normInvoice(i: Obj, ctx: ScanContext): InvoiceScan {
  const lines = Array.isArray(i.lines) ? i.lines.filter(isObj) : [];
  const phones = toPhones(i.supplier_phones ?? i.supplier_phone);
  const summary = i.is_summary === true;
  return {
    date: toIsoDate(i.date), invoice_no: str(i.invoice_no), supplier_name: str(i.supplier_name).replace(/\s+/g, ' '),
    supplier_address: str(i.supplier_address), supplier_phone: phones[0] ?? '', supplier_phones: phones,
    customer_text: str(i.customer_text).replace(/\s+/g, ' ').slice(0, 200),
    supplier_match: pick(i.supplier_match, ctx.suppliers), project_match: pick(i.project_match, ctx.projects),
    expense_type_match: pick(i.expense_type_match, ctx.expense_types), buyer_match: pick(i.buyer_match, ctx.buyers),
    printed_total: toMoney(i.printed_total),
    is_summary: summary,
    lines: lines.map((l) => {
      let amount = toMoney(l.amount);
      let unit_price = toMoney(l.unit_price);
      const low = strs(l.low_confidence);
      // Sổ cộng tiền ghi tắt nghìn ("26.430Đ" = 26.430.000): mỗi lần mua hàng xây dựng hiếm khi dưới 100.000 đ
      // → AI quên 3 số 0 thì tự nhân 1.000 và tô vàng để người dùng xem lại
      if (summary && amount > 0 && amount < 100_000) {
        amount *= 1000; unit_price = unit_price ? unit_price * 1000 : 0;
        if (!low.includes('amount')) low.push('amount');
      }
      // Sổ cộng tiền: dòng chỉ có số tiền → SL 1 × đơn giá = số tiền (để form tính ra đúng thành tiền)
      if (!unit_price && summary) unit_price = amount;
      const quantity = toQuantity(l.quantity) || (summary && amount ? 1 : 0);
      return { name: str(l.name), unit: str(l.unit), quantity, unit_price, amount, date: toIsoDate(l.date), low_confidence: low };
    }).filter((l) => l.name || l.amount || l.unit_price),
    low_confidence: strs(i.low_confidence),
  };
}

const ALL_KINDS: readonly ScanKind[] = ['invoice', 'advance', 'receipt', 'contract', 'material_list', 'timesheet', 'id_card', 'shop'];
const CONTACT_KINDS = ['worker', 'customer', 'employee', 'subcontractor', 'supplier'];
/** Gạch đầu dòng: bỏ dấu "-", "•", "*" ở đầu, bỏ dòng trùng / rỗng */
export function bulletLines(v: unknown, max = 20): string[] {
  const raw = Array.isArray(v) ? v.map(str) : str(v).split(/\n+/);
  const out: string[] = [];
  for (const r of raw) {
    const t = r.replace(/^[\s\-–•*+·]+/, '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Ô ngày công AI trả: số, "x" / "1" = 1, "/" / "1/2" = 0.5, "o" / "" = 0, "1,30" = 1.3. Quá 3 công / ngày coi như đọc sai → 0 */
export function toDayUnit(v: unknown): number {
  if (v === true) return 1;
  let n: number;
  if (typeof v === 'number') n = v;
  else {
    const s = str(v).toLowerCase().replace(/\s/g, '');
    if (!s || s === 'o' || s === '-' || s === '.') return 0;
    if (s === 'x' || s === '✓' || s === '✔' || s === 'v') return 1;
    if (s === '/' || s === '1/2' || s === '½') return 0.5;
    n = Number(s.replace(',', '.'));
  }
  if (!Number.isFinite(n) || n <= 0 || n > 3) return 0;
  return Math.round(n * 100) / 100;
}

function normTimesheet(t: Obj, ctx: ScanContext): TimesheetScan {
  const rows = Array.isArray(t.rows) ? t.rows.filter(isObj) : [];
  const buys = Array.isArray(t.purchases) ? t.purchases.filter(isObj) : [];
  return {
    week_start: toIsoDate(t.week_start),
    project_match: pick(t.project_match, ctx.projects),
    rows: rows.map((r) => {
      const name = str(r.name).replace(/\s+/g, ' ');
      const raw = Array.isArray(r.days) ? r.days : [];
      const role = str(r.role).toUpperCase();
      const low = strs(r.low_confidence).map((x) => {
        const i = DAY_NAMES.indexOf(x.toUpperCase());
        return i >= 0 ? String(i) : x === 'name' || x === 'worker_match' ? 'name' : /^[0-6]$/.test(x) ? x : '';
      }).filter(Boolean);
      return {
        name, worker_match: pick(r.worker_match, ctx.workers),
        role: role === 'C' || role === 'T' || role === 'P' ? role : '',
        days: [0, 1, 2, 3, 4, 5, 6].map((i) => toDayUnit(raw[i])),
        low_confidence: [...new Set(low)],
      };
    }).filter((r) => r.name),
    purchases: buys.map((b) => ({ name: str(b.name).replace(/\s+/g, ' ').slice(0, 120), amount: toMoney(b.amount) })).filter((b) => b.amount > 0),
    purchase_total: toMoney(t.purchase_total),
    note: str(t.note).slice(0, 300),
    project_by: '',
    low_confidence: strs(t.low_confidence),
  };
}

export function normalizeScan(raw: unknown, ctx: ScanContext, fallbackKind: ScanRequestKind = 'auto'): ScanResult {
  const r = isObj(raw) ? raw : {};
  let kind = str(r.kind) as ScanKind;
  if (!ALL_KINDS.includes(kind)) {
    kind = fallbackKind !== 'auto' && fallbackKind !== 'save_info' ? fallbackKind
      : ALL_KINDS.find((k) => isObj(r[k])) ?? (fallbackKind === 'save_info' ? 'shop' : 'invoice');
  }
  // Model lite đôi khi trả phẳng (các ô nằm ngay ngoài cùng, không bọc trong "invoice": {…}) → dùng chính đối tượng ngoài cùng
  const part = (k: string): Obj => { const v = r[k]; return isObj(v) ? v : r; };
  if (kind === 'id_card') {
    const c = part('id_card');
    const ck = str(c.contact_kind);
    const pool = ck === 'customer' ? ctx.customers : ck === 'employee' ? ctx.employees : ck === 'subcontractor' ? ctx.subcontractors ?? []
      : ck === 'supplier' ? ctx.suppliers : ctx.workers;
    const dt = str(c.doc_type);
    return {
      kind, id_card: {
        full_name: str(c.full_name).toUpperCase(), id_number: str(c.id_number).replace(/\D/g, ''), date_of_birth: toIsoDate(c.date_of_birth),
        gender: str(c.gender), hometown: str(c.hometown), permanent_address: str(c.permanent_address),
        id_issued_on: toIsoDate(c.id_issued_on), id_issued_place: str(c.id_issued_place),
        contact_kind: CONTACT_KINDS.includes(ck) ? ck : '', contact_match: pick(c.contact_match, pool),
        short_name: str(c.short_name).replace(/\s+/g, ' ').slice(0, 60), phone: toPhones(c.phone, 1)[0] ?? '',
        address: str(c.address).replace(/\s+/g, ' ').slice(0, 200), field: str(c.field).slice(0, 80),
        note_lines: bulletLines(c.note_lines, 10), doc_type: dt === 'cccd' || dt === 'business_card' ? dt : 'none',
        low_confidence: strs(c.low_confidence),
      },
    };
  }
  if (kind === 'shop') {
    const c = part('shop');
    const phones = toPhones(c.phones ?? c.phone, 3, 7);
    const low = strs(c.low_confidence).map((x) => (x === 'phones' ? 'phone' : x)).filter((x) => ['phone', 'address', 'name', 'area'].includes(x));
    // Số VN đủ là 10 chữ số (di động 0xx…, bàn 028…) — thiếu / thừa (số bàn cũ "08.xxxxxxx", bị che) thì tô vàng cho anh xem lại
    if (phones.some((p) => p.length !== 10 && p.length !== 11)) low.push('phone');
    return {
      kind, shop: {
        name: str(c.name).replace(/\s+/g, ' ').slice(0, 120), address: str(c.address).replace(/\s+/g, ' ').slice(0, 250),
        area: str(c.area).replace(/\s+/g, ' ').slice(0, 80), phones,
        details: bulletLines(c.details), supplier_match: pick(c.supplier_match, ctx.suppliers),
        low_confidence: [...new Set(low)],
      },
    };
  }
  if (kind === 'contract') {
    const c = part('contract');
    const areas = Array.isArray(c.floor_areas) ? c.floor_areas.filter(isObj) : [];
    return {
      kind, contract: {
        customer_name: str(c.customer_name), customer_full_name: str(c.customer_full_name), customer_address: str(c.customer_address),
        customer_phone: toPhones(c.customer_phone, 1)[0] ?? '', value: toMoney(c.value), date: toIsoDate(c.date), description: str(c.description),
        customer_match: pick(c.customer_match, ctx.customers), project_match: pick(c.project_match, ctx.projects),
        floor_areas: areas.map((a) => ({ name: str(a.name), area: Math.round(toQuantity(a.area) * 100) / 100 }))
          .filter((a) => a.name && a.area > 0 && !/^t[oổ]ng/i.test(a.name)),
        unit_price: toMoney(c.unit_price), is_estimate: c.is_estimate === true,
        low_confidence: strs(c.low_confidence),
      },
    };
  }
  if (kind === 'advance') {
    const a = part('advance');
    const subs = ctx.subcontractors ?? [];
    const text = str(a.subcontractor_text);
    // AI chọn tên trong danh mục mà không có chữ nào trùng tên người nói ("VLXD Bá Hòa" → "VLXD ĐẠI HUY LONG") → bỏ,
    // để màn hình hiện "Thêm … mới" thay vì ghi nhầm người
    const subMatch = keepIfSimilar(pick(a.subcontractor_match, subs), text) || matchName(text, subs);
    const supMatch = keepIfSimilar(pick(a.supplier_match, ctx.suppliers), text) || matchName(text, ctx.suppliers);
    // AI nói NCC, hoặc tên chỉ khớp danh mục NCC (không khớp thầu phụ) → phiếu trả NCC
    const party: AdvanceScan['party'] = str(a.party) === 'supplier' || (supMatch && !subMatch) ? 'supplier' : 'subcontractor';
    return {
      kind, advance: {
        date: toIsoDate(a.date), amount: toMoney(a.amount), party, subcontractor_text: text,
        subcontractor_match: party === 'subcontractor' ? subMatch : '', supplier_match: party === 'supplier' ? supMatch : '',
        project_match: pick(a.project_match, ctx.projects), pay_kind: str(a.pay_kind) === 'progress' ? 'progress' : 'advance',
        method: toMethod(a.method), note: str(a.note).slice(0, 300), low_confidence: strs(a.low_confidence),
      },
    };
  }
  if (kind === 'receipt') {
    const a = part('receipt');
    const text = str(a.customer_text);
    const rk = str(a.receipt_kind);
    return {
      kind, receipt: {
        date: toIsoDate(a.date), amount: toMoney(a.amount), customer_text: text,
        customer_match: pick(a.customer_match, ctx.customers) || matchName(text, ctx.customers),
        project_match: pick(a.project_match, ctx.projects),
        receipt_kind: rk === 'advance' || rk === 'settlement' || rk === 'other' ? rk : 'stage',
        method: toMethod(a.method), note: str(a.note).slice(0, 300), low_confidence: strs(a.low_confidence),
      },
    };
  }
  if (kind === 'timesheet') return { kind, timesheet: normTimesheet(part('timesheet'), ctx) };
  if (kind === 'material_list') {
    const m = part('material_list');
    const items = Array.isArray(m.items) ? m.items.filter(isObj) : [];
    return {
      kind, material_list: {
        title: str(m.title), supplier_match: pick(m.supplier_match, ctx.suppliers), project_match: pick(m.project_match, ctx.projects),
        delivery_note: str(m.delivery_note),
        items: items.map((x) => ({ name: str(x.name), quantity: toQuantity(x.quantity), unit: str(x.unit), note: str(x.note) })).filter((x) => x.name),
      },
    };
  }
  return { kind: 'invoice', invoice: normInvoice(part('invoice'), ctx) };
}

/** Lời nói AI chép lại + câu hỏi lại (nằm ngoài phần theo loại) */
export function scanExtras(raw: unknown): { transcript: string; question: string } {
  const r = isObj(raw) ? raw : {};
  return { transcript: str(r.transcript).slice(0, 2000), question: str(r.question).slice(0, 300) };
}

// ───────────── Khớp công trình theo ghi chú (không giao cho AI: model lite hay bỏ qua ghi chú) ─────────────

export type ProjectMeta = {
  name: string; status?: string | null; owner_name?: string | null; aliases?: string[] | null;
  /** Địa chỉ công trình — để khớp địa chỉ / tên viết tắt trên phiếu (guessProjectFromHistory) */
  address?: string | null;
};

/** Bỏ dấu, chữ thường, gom khoảng trắng: "Cô Phụng" → "co phung" */
export function foldVi(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Các cách gọi 1 công trình: tên đầy đủ, tên bỏ tiền tố CT/SC/SN và phần trong ngoặc, chủ đầu tư, tên gọi khác */
function projectKeys(p: ProjectMeta): string[] {
  const core = p.name.replace(/\(.*?\)/g, ' ').replace(/^\s*(CT|SC|SN|NB)\b\s*-?\s*/i, ' ').split(/\s+-\s+/)[0] ?? '';
  const keys = [p.name, core, p.owner_name ?? '', ...(p.aliases ?? [])].map(foldVi);
  return [...keys, ...keys.map((k) => k.replace(/^nha /, ''))].filter((k) => k.length >= 4);
}

/**
 * Ghi chú nhắc tới đúng 1 công trình → tên công trình đó; nhiều công trình khớp thì ưu tiên công trình đang thi công,
 * vẫn còn nhiều (hoặc không khớp) → ''. Khớp nguyên cụm từ (ranh giới từ), không phân biệt dấu.
 */
export function matchProjectByNote(note: string, projects: readonly ProjectMeta[]): string {
  // Lời nói "anh Huynh", "chị Hương", "em Thảo" ↔ danh mục viết tắt "A Huynh", "C Hương", "E Thảo"
  const n = ` ${foldVi(note)} `.replace(/ anh /g, ' a ').replace(/ chi /g, ' c ').replace(/ em /g, ' e ');
  if (n.trim().length < 3) return '';
  // Điểm = độ dài cụm khớp dài nhất ("tinh dang" thắng "tinh"); chỉ giữ các công trình điểm cao nhất
  const scored = projects.map((p) => ({ p, score: Math.max(0, ...projectKeys(p).filter((k) => n.includes(` ${k} `)).map((k) => k.length)) }));
  const best = Math.max(0, ...scored.map((x) => x.score));
  if (!best) return '';
  const hits = scored.filter((x) => x.score === best).map((x) => x.p);
  if (hits.length === 1) return hits[0]!.name;
  const active = hits.filter((p) => p.status === 'active');
  return active.length === 1 ? active[0]!.name : '';
}

// ───────────── Đoán công trình theo hóa đơn đã lưu gần đây ─────────────

/** 1 hóa đơn chi phí đã lưu (đọc ở loadContext): ngày, tên công trình, tên NCC, nội dung / ghi chú cũ */
export type ExpenseHistoryRow = { date: string; project: string; supplier: string; note?: string };

const HISTORY_DAYS = 90;
const HALF_LIFE_DAYS = 30;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
const vnShortDate = (iso: string) => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso);

/** Từ đứng trước tên đường / phường, số nhà — bỏ khi tách địa chỉ */
const ADDRESS_FILLER = new Set(['p', 'q', 'f', 'phuong', 'quan', 'huyen', 'xa', 'duong', 'tp', 'tphcm', 'hcm', 'tx', 'kp', 'ap', 'to', 'so']);

/**
 * Các cách viết 1 địa chỉ trên phiếu: "Phú Thọ Hòa" → "phu tho hoa", "pt hoa", "p tho hoa", "pth".
 * Lấy từng cụm 2–4 chữ liên tiếp trong mỗi đoạn (tách bởi dấu phẩy, số nhà); bỏ cách viết quá ngắn (≤ 2 chữ cái).
 */
export function addressForms(address: string): string[] {
  const out = new Set<string>();
  for (const seg of address.split(/[,;()/]|\d+/)) {
    const words = foldVi(seg).split(' ').filter((w) => w && !ADDRESS_FILLER.has(w) && !/\d/.test(w));
    for (let i = 0; i < words.length; i++) {
      for (let len = 2; len <= 4 && i + len <= words.length; len++) {
        const span = words.slice(i, i + len);
        out.add(span.join(' '));
        for (let k = 1; k < len; k++) out.add([span.slice(0, k).map((w) => w[0]).join(''), ...span.slice(k)].join(' '));
        if (len >= 3) out.add(span.map((w) => w[0]).join(''));
      }
    }
  }
  return [...out].filter((f) => f.replace(/ /g, '').length >= 3);
}

/** Cùng NCC: trùng tên (không dấu), hoặc tên này nằm trọn trong tên kia ("THÉP AN PHÚ" ⊂ "SẮT THÉP AN PHÚ", tên ngắn ≥ 8 ký tự) */
function sameSupplier(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.length >= 8 && ` ${l} `.includes(` ${s} `);
}

/** Các khóa để nhận ra công trình trong ô Khách hàng: tên, chủ đầu tư, tên gọi khác, chữ viết tắt trong ngoặc, địa chỉ */
function projectTextKeys(p: ProjectMeta): string[] {
  const inParen = [...p.name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]!);
  const abbr = inParen.flatMap((s) => s.split(/[,;]/)).map(foldVi).filter((k) => k.length >= 3); // "(PTH, TP)" → "pth"
  return [...new Set([...projectKeys(p), ...abbr, ...addressForms(p.address ?? ''), ...inParen.flatMap(addressForms)])];
}

/**
 * Đoán công trình cho hóa đơn KHÔNG có ghi chú, dựa vào hóa đơn đã lưu ~90 ngày gần nhất. Chấm điểm từng công trình:
 * - NCC đó giao cho công trình này bao nhiêu (tính nặng lần gần đây, nửa đời 30 ngày): tối đa 4 điểm, +1 nếu là nơi giao gần nhất;
 * - ô Khách hàng / địa chỉ giao trên phiếu khớp địa chỉ, tên viết tắt, chủ đầu tư ("PT Hòa" = Phú Thọ Hòa): +3;
 * - tên khách đó từng xuất hiện trong nội dung hóa đơn cũ của công trình: +2;
 * - đang thi công +1, đã xong / đã đóng −2.
 * Chỉ trả tên công trình khi có căn cứ (lịch sử hoặc địa chỉ), điểm ≥ 3 và hơn công trình thứ hai ≥ 2 điểm; không thì ''.
 */
export function guessProjectFromHistory(
  invoice: { supplier: string; date?: string; text?: string },
  history: readonly ExpenseHistoryRow[],
  projects: readonly ProjectMeta[],
): string {
  const sup = foldVi(invoice.supplier ?? '');
  const text = ` ${foldVi(invoice.text ?? '')} `;
  const date = invoice.date || history.reduce((m, r) => (r.date > m ? r.date : m), '');
  if (!projects.length || (!sup && text.trim().length < 3)) return '';

  // Lịch sử NCC: trọng số theo độ gần, chỉ lấy hóa đơn trong 90 ngày trước ngày phiếu (cho lệch 3 ngày)
  const weight = new Map<string, number>();
  let latest = { project: '', date: '' };
  if (sup) {
    for (const r of history) {
      if (!sameSupplier(foldVi(r.supplier), sup)) continue;
      const age = date ? dayDiff(date, r.date) : 0;
      if (age < -3 || age > HISTORY_DAYS) continue;
      weight.set(r.project, (weight.get(r.project) ?? 0) + 0.5 ** (Math.max(0, age) / HALF_LIFE_DAYS));
      if (r.date > latest.date) latest = { project: r.project, date: r.date };
    }
  }
  const total = [...weight.values()].reduce((a, b) => a + b, 0);
  const customer = foldVi(invoice.text ?? '');

  const scored = projects.map((p) => {
    const hist = total ? 4 * ((weight.get(p.name) ?? 0) / total) + (latest.project === p.name ? 1 : 0) : 0;
    const addr = text.trim().length >= 3 && projectTextKeys(p).some((k) => text.includes(` ${k} `)) ? 3 : 0;
    const seen = customer.length >= 4 && history.some((r) => r.project === p.name && r.note && ` ${foldVi(r.note)} `.includes(` ${customer} `)) ? 2 : 0;
    const status = p.status === 'active' ? 1 : p.status === 'completed' || p.status === 'closed' ? -2 : 0;
    return { name: p.name, score: hist + addr + seen + status, evidence: hist > 0 || addr > 0 || seen > 0 };
  }).filter((x) => x.evidence).sort((a, b) => b.score - a.score);

  const [best, second] = scored;
  if (!best || best.score < 3) return '';
  if (second && best.score - second.score < 2) return '';
  return best.name;
}

/** Mỗi NCC gần đây giao cho công trình nào (tối đa 2 nơi, nhiều lần nhất trước) — gửi kèm danh mục NCC cho AI */
export function supplierRecentProjects(history: readonly ExpenseHistoryRow[]): Record<string, string> {
  const by = new Map<string, Map<string, { n: number; last: string }>>();
  for (const r of history) {
    if (!r.supplier || !r.project) continue;
    const m = by.get(r.supplier) ?? new Map<string, { n: number; last: string }>();
    const x = m.get(r.project) ?? { n: 0, last: '' };
    x.n += 1;
    if (r.date > x.last) x.last = r.date;
    m.set(r.project, x);
    by.set(r.supplier, m);
  }
  const out: Record<string, string> = {};
  for (const [sup, m] of by) {
    const top = [...m].sort((a, b) => b[1].n - a[1].n || b[1].last.localeCompare(a[1].last)).slice(0, 2);
    out[sup] = `gần đây giao cho: ${top.map(([p, x]) => `${p} ${x.n} lần, gần nhất ${vnShortDate(x.last)}`).join('; ')}`;
  }
  return out;
}

/**
 * Chọn công trình cho kết quả AI (hàm máy chủ gọi sau normalizeScan). Thứ tự: ghi chú (matchProjectByNote) > lịch sử hóa đơn
 * (guessProjectFromHistory) > AI tự đoán. Không dựa vào ghi chú thì tô vàng ô công trình (low_confidence 'project_match').
 */
export function applyProjectGuess(result: ScanResult, note: string, ctx: ScanContext, transcript = ''): ScanResult {
  const said = [note, transcript].filter(Boolean).join(' ');
  const meta = ctx.project_meta ?? [];
  const byNote = matchProjectByNote(said, meta);
  if (result.kind === 'contract') {
    if (byNote) result.contract.project_match = byNote;
    return result;
  }
  if (result.kind === 'timesheet') return applyTimesheetGuess(result, byNote, ctx);
  if (result.kind === 'advance' || result.kind === 'receipt' || result.kind === 'material_list') {
    const part = result.kind === 'advance' ? result.advance : result.kind === 'receipt' ? result.receipt : result.material_list;
    // Thu tiền: tên khách → công trình có chủ đầu tư đó (khi lời nói không nhắc công trình)
    const byCustomer = result.kind === 'receipt' && !byNote
      ? matchProjectByNote([result.receipt.customer_match, result.receipt.customer_text].filter(Boolean).join(' '), meta) : '';
    if (byNote || byCustomer) part.project_match = byNote || byCustomer;
    else if (part.project_match && 'low_confidence' in part && !part.low_confidence.includes('project_match')) part.low_confidence.push('project_match');
    return result;
  }
  if (result.kind !== 'invoice') return result;
  const inv = result.invoice;
  if (byNote) {
    inv.project_match = byNote;
    return result;
  }
  const byHistory = guessProjectFromHistory(
    { supplier: inv.supplier_match || inv.supplier_name, date: inv.date || ctx.today, text: [inv.customer_text, said].filter(Boolean).join(' ') },
    ctx.recent_expenses ?? [], meta,
  );
  if (byHistory) inv.project_match = byHistory;
  if (inv.project_match && !inv.low_confidence.includes('project_match')) inv.low_confidence.push('project_match');
  return result;
}

// ───────────── Phiếu chấm công: khớp tên thợ + đoán công trình theo lịch sử chấm công ─────────────

/** 1 dòng chấm công đã lưu: tuần (Chủ nhật), tên công trình, tên công nhân, có phải người đầu phiếu (cai) */
export type TimesheetHistoryRow = { week_start: string; project: string; worker: string; first?: boolean };

const CREW_DAYS = 120;

/** Công trình (các công trình) của TUẦN GẦN NHẤT mà công nhân này được chấm, trong 120 ngày trước `date` */
function latestProjects(worker: string, history: readonly TimesheetHistoryRow[], date: string): string[] {
  let last = '';
  const mine = history.filter((r) => {
    if (r.worker !== worker || !r.project) return false;
    const age = date ? dayDiff(date, r.week_start) : 0;
    if (age < -7 || age > CREW_DAYS) return false;
    if (r.week_start > last) last = r.week_start;
    return true;
  });
  return [...new Set(mine.filter((r) => r.week_start === last).map((r) => r.project))];
}

/**
 * Đoán công trình của phiếu chấm công theo tổ thợ: mỗi người trên phiếu "bỏ phiếu" cho công trình của tuần gần nhất họ được chấm
 * (Toán đang làm nhà A Phượng, trước đó nhà Tình → tính nhà A Phượng). Người đầu phiếu (cai) nặng 3 phiếu, người khác 1 phiếu;
 * tuần gần nhất chấm 2 công trình thì chia đều. Chỉ trả tên khi hơn công trình thứ hai ≥ 1 phiếu; không thì ''.
 */
export function guessProjectFromCrew(workers: readonly string[], history: readonly TimesheetHistoryRow[], date = ''): string {
  const score = new Map<string, number>();
  workers.forEach((w, i) => {
    if (!w) return;
    const ps = latestProjects(w, history, date);
    for (const p of ps) score.set(p, (score.get(p) ?? 0) + (i === 0 ? 3 : 1) / ps.length);
  });
  const [best, second] = [...score].sort((a, b) => b[1] - a[1]);
  if (!best || best[1] < 1) return '';
  if (second && best[1] - second[1] < 1) return '';
  return best[0];
}

/** Mỗi công nhân gần đây chấm công ở đâu — gửi kèm danh mục Công nhân cho AI */
export function workerRecentProjects(history: readonly TimesheetHistoryRow[]): Record<string, string> {
  const last = new Map<string, { week: string; projects: Set<string>; first: boolean }>();
  for (const r of history) {
    if (!r.worker || !r.project) continue;
    const x = last.get(r.worker);
    if (!x || r.week_start > x.week) last.set(r.worker, { week: r.week_start, projects: new Set([r.project]), first: !!r.first });
    else if (r.week_start === x.week) { x.projects.add(r.project); x.first ||= !!r.first; }
  }
  const out: Record<string, string> = {};
  for (const [w, x] of last) out[w] = `${x.first ? 'cai; ' : ''}gần đây làm: ${[...x.projects].slice(0, 2).join(', ')}, tuần ${vnShortDate(x.week)}`;
  return out;
}

/**
 * Khớp tên viết tay với danh mục công nhân khi AI không khớp: trùng không dấu → lấy; không thì các tên trong danh mục BẮT ĐẦU bằng
 * tên đó ("Sơn" → "SƠN", "SƠN HEO") hoặc ngược lại — còn 1 người thì lấy, nhiều người thì ưu tiên người thuộc `crew` (tổ gần đây
 * của công trình) nếu chỉ có 1. `taken` = tên đã dùng cho dòng khác (1 người không chấm 2 dòng).
 */
export function matchWorker(text: string, workers: readonly string[], crew: ReadonlySet<string>, taken: ReadonlySet<string>): string {
  const t = foldVi(text);
  if (!t) return '';
  const free = workers.filter((w) => !taken.has(w));
  const exact = free.filter((w) => foldVi(w) === t);
  if (exact.length === 1) return exact[0]!;
  const near = exact.length ? exact : free.filter((w) => { const f = foldVi(w); return f.startsWith(`${t} `) || t.startsWith(`${f} `); });
  if (near.length === 1) return near[0]!;
  const inCrew = near.filter((w) => crew.has(w));
  return inCrew.length === 1 ? inCrew[0]! : '';
}

/**
 * Phiếu chấm công (hàm máy chủ gọi qua applyProjectGuess): giữ tên AI khớp nếu giống tên viết trên phiếu, khớp lại bằng code;
 * công trình: ghi chú > lịch sử chấm công của tổ (guessProjectFromCrew) > AI đoán; rồi khớp nốt tên còn mơ hồ theo tổ của công trình đó.
 * Tên khớp nhờ đoán và công trình không theo ghi chú đều tô vàng.
 */
export function applyTimesheetGuess(result: Extract<ScanResult, { kind: 'timesheet' }>, byNote: string, ctx: ScanContext): ScanResult {
  const ts = result.timesheet;
  const history = ctx.recent_timesheets ?? [];
  const date = ts.week_start || ctx.today || '';
  const taken = new Set<string>();
  const none = new Set<string>();
  const flag = (r: TimesheetRowScan) => { if (!r.low_confidence.includes('name')) r.low_confidence.push('name'); };
  // Lượt 1: AI khớp (phải giống tên viết) hoặc khớp chắc bằng code
  for (const r of ts.rows) {
    let m = keepIfSimilar(r.worker_match, r.name);
    if (m && taken.has(m)) m = '';
    r.worker_match = m || matchWorker(r.name, ctx.workers, none, taken);
    if (r.worker_match) taken.add(r.worker_match);
  }
  const byCrew = byNote ? '' : guessProjectFromCrew(ts.rows.map((r) => r.worker_match), history, date);
  const project = byNote || byCrew || ts.project_match;
  ts.project_match = project;
  ts.project_by = byNote ? 'note' : byCrew ? 'crew' : project ? 'ai' : '';
  if (project && !byNote && !ts.low_confidence.includes('project_match')) ts.low_confidence.push('project_match');
  // Lượt 2: tên còn mơ hồ → người trong tổ gần đây của công trình
  if (project) {
    const crew = new Set(history.filter((h) => h.project === project).map((h) => h.worker));
    for (const r of ts.rows) {
      if (r.worker_match) continue;
      r.worker_match = matchWorker(r.name, ctx.workers, crew, taken);
      if (r.worker_match) { taken.add(r.worker_match); flag(r); }
    }
  }
  for (const r of ts.rows) if (!r.worker_match) flag(r);
  return result;
}

/** Chế độ giả lập: chọn fixture theo loại + ghi chú (không cần key) */
export function pickFixture(kind: ScanRequestKind, note: string): string {
  const n = foldVi(note);
  const w = ` ${n} `;
  if (kind === 'shop' || /cua hang|bang hieu|mat tien/.test(n)) return 'cua-hang';
  if (kind === 'id_card' || kind === 'save_info' || /cccd|can cuoc/.test(n)) return 'cccd';
  if (kind === 'contract' || /hop dong|du toan/.test(n)) return 'hop-dong';
  if (kind === 'advance' || w.includes(' ung ')) return 'tien-ung';
  if (kind === 'receipt' || /thu tien|chuyen tien/.test(n) || w.includes(' dua ')) return 'thu-tien';
  if (kind === 'timesheet' || /cham cong|ngay cong/.test(n)) return 'cham-cong';
  if (kind === 'material_list' || /vat tu|can mua|cop pha|copha/.test(n)) return 'vat-tu';
  if (w.includes(' mo ') || n.includes('blur')) return 'hoa-don-chu-mo';
  return 'hoa-don-ncc-moi';
}

export const SCAN_FIXTURES = ['hoa-don-ncc-moi', 'hoa-don-chu-mo', 'cccd', 'hop-dong', 'tien-ung', 'thu-tien', 'vat-tu', 'cham-cong', 'cua-hang'] as const;
