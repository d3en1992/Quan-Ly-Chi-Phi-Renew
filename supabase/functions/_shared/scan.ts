// Trợ lý AI (nút AI — trước là "Chụp đa năng" GĐ9) — phần DÙNG CHUNG giữa Edge Function `scan-document` (Deno) và app (Vite):
// kiểu kết quả, câu lệnh cho AI (mẫu JSON viết trong câu lệnh), hàm chuẩn hóa kết quả AI trả về (hàm thuần, có test).
// Không import gì để chạy được ở cả hai nơi.
//
// Đầu vào: ảnh / PDF / chữ (Excel đã đổi thành chữ ở trình duyệt) / ghi âm giọng nói + ghi chú. AI tự nhận 1 trong các loại:
// hóa đơn (chi tiết, hoặc sổ cộng tiền), tiền ứng thầu phụ, thu tiền khách, hợp đồng / dự toán, danh sách vật tư cần mua.
// CCCD chỉ còn dùng ở nút "Chụp CCCD" của Danh Bạ (kind = 'id_card'), không nằm trong nút AI.

export type ScanKind = 'invoice' | 'advance' | 'receipt' | 'contract' | 'material_list' | 'id_card';
export type ScanRequestKind = 'auto' | ScanKind;
/** Các loại nút AI tự nhận (không có CCCD) */
export const AUTO_KINDS: readonly ScanKind[] = ['invoice', 'advance', 'receipt', 'contract', 'material_list'];

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
/** Tiền ứng / thanh toán cho THẦU PHỤ (giọng nói hoặc ảnh chuyển khoản) */
export type AdvanceScan = {
  date: string; amount: number;
  /** Tên người nhận như nghe / đọc được (vd "Hà điện nước") */
  subcontractor_text: string;
  subcontractor_match: string;
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
export type IdCardScan = {
  full_name: string; id_number: string; date_of_birth: string; gender: string;
  hometown: string; permanent_address: string; id_issued_on: string; id_issued_place: string;
  /** 'worker' | 'customer' | 'employee' | '' — theo ghi chú ("CCCD thợ Hiền" → worker) */
  contact_kind: string;
  /** Tên gọi trong danh bạ AI cho là cùng người ('' = không thấy) */
  contact_match: string;
  low_confidence: string[];
};

export type ScanResult =
  | { kind: 'invoice'; invoice: InvoiceScan }
  | { kind: 'advance'; advance: AdvanceScan }
  | { kind: 'receipt'; receipt: ReceiptScan }
  | { kind: 'contract'; contract: ContractScan }
  | { kind: 'material_list'; material_list: MaterialListScan }
  | { kind: 'id_card'; id_card: IdCardScan };

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
  id_card: 'Đây là CĂN CƯỚC CÔNG DÂN (id_card). Đọc cả hai mặt nếu có.',
};

/** Cách nhận ra từng loại (chỉ đưa các loại được phép) */
const KIND_RULES: Record<Exclude<ScanKind, 'id_card'>, string> = {
  invoice: '- "invoice": hóa đơn / phiếu giao hàng / biên nhận của cửa hàng có tên hàng, số lượng, đơn giá, hoặc SỔ CỘNG TIỀN (chỉ có các dòng ngày + số tiền rồi cộng tổng). Nói "mua …" có số tiền cũng là invoice.',
  advance: '- "advance": tiền ỨNG / trả cho THẦU PHỤ (người trong danh mục Thầu phụ, vd "ứng Hà điện nước 5 triệu", "ứng Đỏ 6tr"), hoặc ẢNH CHUYỂN KHOẢN ngân hàng mà người NHẬN là thầu phụ.',
  receipt: '- "receipt": KHÁCH HÀNG / chủ nhà đưa tiền / chuyển tiền cho công ty (vd "anh Nhật đưa 100 triệu", "khách chuyển 200tr"), hoặc ảnh chuyển khoản mà người GỬI là khách hàng.',
  contract: '- "contract": hợp đồng thi công với chủ nhà, hoặc bảng DỰ TOÁN công trình (có diện tích Móng, Trệt, Lầu, Mái… và đơn giá / m²).',
  material_list: '- "material_list": danh sách vật tư CẦN MUA do thợ / cai gửi (tin nhắn Zalo, chữ viết trên ván, giấy), chưa có giá tiền.',
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
  "subcontractor_text": "",    // tên người nhận như nghe / đọc được
  "subcontractor_match": "",   // tên trong DANH MỤC Thầu phụ
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
  id_card: ` "id_card": {
  "full_name": "IN HOA CÓ DẤU", "id_number": "12 chữ số", "date_of_birth": "YYYY-MM-DD", "gender": "Nam hoặc Nữ",
  "hometown": "", "permanent_address": "", "id_issued_on": "YYYY-MM-DD", "id_issued_place": "",
  "contact_kind": "worker hoặc customer hoặc employee hoặc unknown",  // theo ghi chú: thợ → worker, khách → customer, nhân viên → employee
  "contact_match": "",      // tên trong DANH MỤC (Công nhân / Khách hàng / Nhân viên) nếu cùng người
  "low_confidence": []
 }`,
};

/** Các loại đưa vào câu lệnh: loại đã chọn, hoặc (auto) mọi loại nút AI được phép */
export function promptKinds(kind: ScanRequestKind, allowed?: KindPermissions): ScanKind[] {
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

/** Câu lệnh hệ thống (systemInstruction) — học theo bot Telegram n8n "Bot ghi chi phí công trình V4" (mục "Gom danh mục") */
export function buildPrompt(kind: ScanRequestKind, note: string, ctx: ScanContext, allowed?: KindPermissions): string {
  const kinds = promptKinds(kind, allowed);
  const has = (k: ScanKind) => kinds.includes(k);
  return [
    'Bạn là trợ lý ghi chép cho một công ty xây nhà phố ở Việt Nam (Công ty Nguyễn Hữu). Người dùng gửi ảnh / PDF / chữ / ghi âm giọng nói. Đọc và trả về JSON theo MẪU bên dưới.',
    ctx.today ? `Hôm nay là ${ctx.today}.` : '',
    KIND_TEXT[kind],
    kind === 'auto' ? ['CÁCH NHẬN LOẠI:', ...kinds.filter((k): k is Exclude<ScanKind, 'id_card'> => k !== 'id_card').map((k) => KIND_RULES[k])].join('\n') : '',
    '',
    ...NUMBER_RULES,
    '',
    has('invoice') ? INVOICE_RULES.join('\n') : '',
    has('advance') || has('receipt') ? MONEY_RULES.join('\n') : '',
    has('contract') ? CONTRACT_RULES.join('\n') : '',
    has('material_list') ? MATERIAL_RULES.join('\n') : '',
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
    has('invoice') || has('material_list') ? list('Nhà cung cấp', ctx.suppliers, ctx.supplier_hints) : '',
    has('invoice') ? list('Người mua', ctx.buyers) : '',
    has('advance') ? list('Thầu phụ', ctx.subcontractors, ctx.subcontractor_hints) : '',
    has('receipt') || has('contract') || has('id_card') ? list('Khách hàng', ctx.customers) : '',
    has('id_card') ? [list('Công nhân', ctx.workers), list('Nhân viên', ctx.employees)].join('\n') : '',
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
export function toPhones(v: unknown, max = 2): string[] {
  const raw = Array.isArray(v) ? v.map(str) : str(v).split(/\s[-–]\s|[,;/|]|\s{2,}/);
  const out: string[] = [];
  for (const r of raw) {
    const d = r.replace(/\D/g, '');
    if (d.length >= 8 && d.length <= 11 && !out.includes(d)) out.push(d);
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

const ALL_KINDS: readonly ScanKind[] = ['invoice', 'advance', 'receipt', 'contract', 'material_list', 'id_card'];

export function normalizeScan(raw: unknown, ctx: ScanContext, fallbackKind: ScanRequestKind = 'auto'): ScanResult {
  const r = isObj(raw) ? raw : {};
  let kind = str(r.kind) as ScanKind;
  if (!ALL_KINDS.includes(kind)) {
    kind = fallbackKind !== 'auto' ? fallbackKind : ALL_KINDS.find((k) => isObj(r[k])) ?? 'invoice';
  }
  // Model lite đôi khi trả phẳng (các ô nằm ngay ngoài cùng, không bọc trong "invoice": {…}) → dùng chính đối tượng ngoài cùng
  const part = (k: string): Obj => { const v = r[k]; return isObj(v) ? v : r; };
  if (kind === 'id_card') {
    const c = part('id_card');
    const ck = str(c.contact_kind);
    const pool = ck === 'customer' ? ctx.customers : ck === 'employee' ? ctx.employees : ctx.workers;
    return {
      kind, id_card: {
        full_name: str(c.full_name).toUpperCase(), id_number: str(c.id_number).replace(/\D/g, ''), date_of_birth: toIsoDate(c.date_of_birth),
        gender: str(c.gender), hometown: str(c.hometown), permanent_address: str(c.permanent_address),
        id_issued_on: toIsoDate(c.id_issued_on), id_issued_place: str(c.id_issued_place),
        contact_kind: ['worker', 'customer', 'employee'].includes(ck) ? ck : '', contact_match: pick(c.contact_match, pool),
        low_confidence: strs(c.low_confidence),
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
    return {
      kind, advance: {
        date: toIsoDate(a.date), amount: toMoney(a.amount), subcontractor_text: text,
        subcontractor_match: pick(a.subcontractor_match, subs) || matchName(text, subs),
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

/** Chế độ giả lập: chọn fixture theo loại + ghi chú (không cần key) */
export function pickFixture(kind: ScanRequestKind, note: string): string {
  const n = foldVi(note);
  const w = ` ${n} `;
  if (kind === 'id_card' || /cccd|can cuoc/.test(n)) return 'cccd';
  if (kind === 'contract' || /hop dong|du toan/.test(n)) return 'hop-dong';
  if (kind === 'advance' || w.includes(' ung ')) return 'tien-ung';
  if (kind === 'receipt' || /thu tien|chuyen tien/.test(n) || w.includes(' dua ')) return 'thu-tien';
  if (kind === 'material_list' || /vat tu|can mua|cop pha|copha/.test(n)) return 'vat-tu';
  if (w.includes(' mo ') || n.includes('blur')) return 'hoa-don-chu-mo';
  return 'hoa-don-ncc-moi';
}

export const SCAN_FIXTURES = ['hoa-don-ncc-moi', 'hoa-don-chu-mo', 'cccd', 'hop-dong', 'tien-ung', 'thu-tien', 'vat-tu'] as const;
