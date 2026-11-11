import { z } from 'zod';
import { isValidUsername, normalizeUsername } from '@shared/username';
import { LEVELS } from '@/lib/permissions';

export const accountRowSchema = z.object({
  id: z.string(),
  username: z.string(),
  display_name: z.string(),
  role_id: z.string(),
  role_name: z.string(),
  project_scope: z.enum(['all', 'assigned']),
  must_change_password: z.boolean(),
  is_locked: z.boolean(),
  last_sign_in_at: z.string().nullable(),
  created_at: z.string(),
  project_ids: z.array(z.string()),
});
export type AccountRow = z.infer<typeof accountRowSchema>;

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  is_admin: z.boolean(),
  sort_order: z.number(),
  see_contact_ids: z.boolean(),
  edit_others: z.boolean(),
  purge_trash: z.boolean(),
  default_project_scope: z.enum(['all', 'assigned']),
});
export type Role = z.infer<typeof roleSchema>;

export const rolePermissionSchema = z.object({
  role_id: z.string(),
  module: z.string(),
  level: z.enum(LEVELS),
});
export type RolePermission = z.infer<typeof rolePermissionSchema>;

export const appModuleSchema = z.object({ key: z.string(), label: z.string(), sort_order: z.number() });
export type AppModule = z.infer<typeof appModuleSchema>;

/** Form tạo tài khoản */
export const createAccountSchema = z.object({
  display_name: z.string().trim().min(1, 'Nhập tên hiển thị'),
  username: z
    .string()
    .transform(normalizeUsername)
    .refine(isValidUsername, 'Tên đăng nhập 2–32 ký tự: chữ không dấu, số, dấu chấm, gạch'),
  role_id: z.string().min(1, 'Chọn vai trò'),
  password: z.string().min(8, 'Mật khẩu tạm ít nhất 8 ký tự'),
  project_scope: z.enum(['all', 'assigned']),
  must_change_password: z.boolean(),
});
export type CreateAccountInput = z.input<typeof createAccountSchema>;

/** Gợi ý tên đăng nhập từ tên hiển thị: "PHẠM VĂN LAM" → "lam", "KẾ TOÁN THẢO" → "thao" */
export function suggestUsername(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return normalizeUsername(parts[parts.length - 1] ?? '');
}

export function accountStatus(a: Pick<AccountRow, 'is_locked' | 'must_change_password'>): {
  label: string;
  tone: 'good' | 'warn' | 'bad';
} {
  if (a.is_locked) return { label: 'Đã khóa', tone: 'bad' };
  if (a.must_change_password) return { label: 'Chờ đổi mật khẩu', tone: 'warn' };
  return { label: 'Đang dùng', tone: 'good' };
}
