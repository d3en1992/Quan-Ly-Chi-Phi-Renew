// Nội dung nút "Copy thông tin đăng nhập" để gửi qua Zalo

export function credentialsText(p: { appUrl: string; username: string; password: string; displayName?: string }): string {
  return [
    p.displayName ? `Tài khoản app Quản lý chi phí cho ${p.displayName}` : 'Tài khoản app Quản lý chi phí',
    `App: ${p.appUrl}`,
    `Tên đăng nhập: ${p.username}`,
    `Mật khẩu tạm: ${p.password}`,
    'Lần đầu đăng nhập, app sẽ bắt đổi mật khẩu.',
  ].join('\n');
}

export { copyText } from '@/lib/clipboard';
