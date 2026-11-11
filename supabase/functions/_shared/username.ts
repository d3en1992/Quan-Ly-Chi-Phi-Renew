// Dùng chung cho app (src/) và Edge Function admin-users. Không import gì để chạy được ở cả 2 nơi.

/** Bỏ dấu tiếng Việt: "Phạm Văn Lâm" → "Pham Van Lam" */
export function stripVietnamese(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Chuẩn hóa tên đăng nhập: chữ thường, không dấu, chỉ a-z 0-9 . _ - */
export function normalizeUsername(input: string): string {
  return stripVietnamese(input.trim())
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '');
}

export const USERNAME_PATTERN = /^[a-z0-9._-]{2,32}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

/** Supabase Auth bắt buộc email → đổi tên đăng nhập thành email nội bộ ẩn (không gửi thư). */
export function toLoginEmail(username: string, companySlug: string): string {
  return `${normalizeUsername(username)}@${companySlug}.qlcp`;
}

/** Mật khẩu tạm dễ đọc qua Zalo, ví dụ "K7mq-42xa" (bỏ các ký tự dễ nhầm 0/O, 1/l/I). */
export function generateTempPassword(random: (max: number) => number): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set: string) => set.charAt(random(set.length));
  const head = pick(letters).toUpperCase() + pick(digits) + pick(letters) + pick(letters);
  const tail = pick(digits) + pick(digits) + pick(letters) + pick(letters);
  return `${head}-${tail}`;
}

/** Hàm random an toàn dùng crypto (có ở cả trình duyệt, Node 20+ và Deno). */
export function cryptoRandom(max: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0] ?? 0) % max;
}
