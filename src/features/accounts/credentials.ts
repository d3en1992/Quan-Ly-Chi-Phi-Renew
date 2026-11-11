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

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Trình duyệt chặn clipboard (http, iframe…) → cách cũ
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
