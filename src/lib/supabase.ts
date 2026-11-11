import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Thiếu cấu hình thì app hiện thông báo thay vì trắng trang. */
export const supabaseConfigError =
  !url || !anonKey ? 'Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong .env.local (xem README).' : null;

export const supabase = createClient<Database>(url ?? 'http://127.0.0.1:54321', anonKey ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'qlcp-auth' },
});

/** Đuôi email ẩn của công ty: <tên đăng nhập>@<slug>.qlcp */
export const COMPANY_SLUG = (import.meta.env.VITE_COMPANY_SLUG as string | undefined) ?? 'nguyenhuu';
