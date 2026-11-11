// Tạo tài khoản dùng riêng cho test (mỗi vai trò 1 tài khoản, mật khẩu test cố định, chỉ trên Supabase trong máy).
// Không đụng mật khẩu tạm của tinh / chay / lam.
import { localAdminClient, ROLE_IDS, upsertAccount } from '../scripts/local-supabase.mjs';
import { E2E_ACCOUNTS, E2E_PASSWORD } from './accounts';

export default async function globalSetup() {
  const admin = localAdminClient();
  for (const a of E2E_ACCOUNTS) {
    await upsertAccount(admin, {
      username: a.username,
      displayName: a.displayName,
      roleId: (ROLE_IDS as Record<string, string>)[a.roleKey],
      password: E2E_PASSWORD,
      mustChange: a.mustChange ?? false,
      reset: true,
    });
  }
  // Trả bảng quyền mục "Theo dõi thiết bị" của Quản lý về mặc định (test đổi ô quyền có thể để lại)
  await admin
    .from('role_permissions')
    .update({ level: 'full' })
    .eq('role_id', ROLE_IDS.manager)
    .eq('module', 'equipment');
  // Xóa vai trò test cũ
  await admin.from('roles').delete().like('name', 'E2E %');
}
