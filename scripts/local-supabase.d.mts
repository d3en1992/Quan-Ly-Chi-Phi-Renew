// Kiểu cho scripts/local-supabase.mjs (để script .ts dùng được)
import type { SupabaseClient } from '@supabase/supabase-js';

export function localSupabaseEnv(): { url: string; anonKey: string; serviceKey: string };
export function localAdminClient(): SupabaseClient;
export const COMPANY_ID: string;
export const COMPANY_SLUG: string;
export const ROLE_IDS: { admin: string; director: string; manager: string; accountant: string; viewer: string };
export function upsertAccount(
  admin: SupabaseClient,
  account: { username: string; displayName: string; roleId: string; password: string; mustChange?: boolean; reset?: boolean },
): Promise<{ id: string; changed: boolean }>;
export const ONLINE: boolean;
