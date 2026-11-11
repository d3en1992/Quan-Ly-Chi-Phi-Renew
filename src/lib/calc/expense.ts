// CÔNG THỨC TIỀN lúc NHẬP chi phí: thành tiền 1 dòng vật tư, tổng hóa đơn, tổng lưới nhập.
// Chép `calcRowMoney` (hoadon.quick-entry.js) và `calcDetailTotals` (hoadon.detail-entry.js) của app cũ.
// Khác app cũ đúng 1 chỗ đã chốt (KẾ HOẠCH mục 4E): KHÔNG nhận gõ tắt "1tr", "1,5tr" — chỉ nhận chữ số.

/** "5.350.000" / "5,350,000 đ" → 5350000; chỉ giữ chữ số (ô tiền chỉ nhận số) */
export function parseMoneyDigits(raw: string | number | null | undefined): number {
  const s = String(raw ?? '').replace(/\D/g, '');
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isSafeInteger(n) ? n : 0;
}

/**
 * Tiền dán từ Excel: "5.350.000", "5,350,000", "5350000", "5350000.00", "5.350.000 đ" → 5350000.
 * Phần thập phân (đúng 1–2 chữ số sau dấu cuối cùng) bị bỏ, làm tròn về đồng.
 */
export function parsePastedMoney(raw: string | number | null | undefined): number {
  const s = String(raw ?? '').trim().replace(/[\sđ₫]|vnd/gi, '');
  if (!s) return 0;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let whole = s;
  let frac = 0;
  const cut = (i: number) => { whole = s.slice(0, i); frac = Number(`0.${s.slice(i + 1).replace(/\D/g, '')}`) || 0; };
  if (dots && commas) cut(Math.max(s.lastIndexOf('.'), s.lastIndexOf(',')));   // "5,350,000.00" / "5.350.000,00"
  else if (dots + commas === 1) {
    const i = Math.max(s.indexOf('.'), s.indexOf(','));
    if (s.length - i - 1 !== 3) cut(i);                                         // "5350000.5"; còn "5.350" = 5350
  }
  return Math.round(parseMoneyDigits(whole) + frac);
}

/**
 * Thành tiền một dòng vật tư = số lượng × đơn giá, trừ chiết khấu của dòng.
 * `discount`: '' → không giảm · "5%" → giảm 5% · "50000" / "50.000" → giảm số tiền cố định.
 */
export function lineAmount(quantity: number, unitPrice: number, discount?: string | null): number {
  const base = quantity * unitPrice;
  const ck = String(discount ?? '').trim();
  if (!ck) return Math.round(base);
  if (ck.endsWith('%')) return Math.round(base * (1 - (parseFloat(ck.replace(',', '.')) || 0) / 100));
  return Math.round(base - parseMoneyDigits(ck));
}

/** Tổng hóa đơn chi tiết = cộng cột Thành tiền của mọi dòng (chiết khấu đã tính riêng từng dòng) */
export function sumAmounts(amounts: readonly (number | null | undefined)[]): number {
  let t = 0;
  for (const a of amounts) t += Math.round(Number(a) || 0);
  return t;
}
