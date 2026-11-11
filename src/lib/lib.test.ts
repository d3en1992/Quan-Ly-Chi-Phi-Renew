import { describe, expect, it } from 'vitest';
import { formatDate, formatLastSeen, formatMoney, formatShortMoney, initials } from './format';
import { canSeeTrash, hasLevel, nextLevel } from './permissions';
import {
  generateTempPassword,
  isValidUsername,
  normalizeUsername,
  stripVietnamese,
  toLoginEmail,
} from '@shared/username';
import { credentialsText } from '@/features/accounts/credentials';
import { accountStatus, createAccountSchema, suggestUsername } from '@/features/accounts/schema';
import { yearLabel } from '@/app/year';
import { modeForWidth } from '@/app/useLayoutMode';

describe('tên đăng nhập → email ẩn', () => {
  it('bỏ dấu, chữ thường', () => {
    expect(stripVietnamese('Phạm Văn Lâm Đức')).toBe('Pham Van Lam Duc');
    expect(normalizeUsername('  Lâm ')).toBe('lam');
    expect(normalizeUsername('GS A Huynh')).toBe('gs.a.huynh');
  });
  it('email nội bộ', () => {
    expect(toLoginEmail('Tình', 'nguyenhuu')).toBe('tinh@nguyenhuu.qlcp');
  });
  it('kiểm tra hợp lệ', () => {
    expect(isValidUsername('gs.ahuynh')).toBe(true);
    expect(isValidUsername('a')).toBe(false);
    expect(isValidUsername('có dấu')).toBe(false);
  });
  it('mật khẩu tạm dạng Xxxx-xxxx, dài 9', () => {
    let i = 0;
    const pw = generateTempPassword((max) => i++ % max);
    expect(pw).toMatch(/^[A-Z][2-9][a-zA-Z]{2}-[2-9]{2}[a-zA-Z]{2}$/);
  });
  it('gợi ý tên đăng nhập từ tên hiển thị', () => {
    expect(suggestUsername('KẾ TOÁN THẢO')).toBe('thao');
    expect(suggestUsername('PHẠM VĂN LAM')).toBe('lam');
  });
  it('form tạo tài khoản chuẩn hóa tên đăng nhập', () => {
    const r = createAccountSchema.parse({
      display_name: 'Thảo', username: 'Thảo', role_id: 'x', password: 'K7mq-42xa', project_scope: 'all', must_change_password: true,
    });
    expect(r.username).toBe('thao');
    expect(createAccountSchema.safeParse({ display_name: '', username: 'a', role_id: '', password: '1', project_scope: 'all', must_change_password: true }).success).toBe(false);
  });
});

describe('quyền', () => {
  it('bấm ô: Ẩn → Xem → Nhập → Toàn quyền → Ẩn', () => {
    expect(nextLevel('none')).toBe('view');
    expect(nextLevel('view')).toBe('add');
    expect(nextLevel('add')).toBe('full');
    expect(nextLevel('full')).toBe('none');
  });
  it('so mức', () => {
    expect(hasLevel({ expenses: 'add' }, 'expenses', 'view')).toBe(true);
    expect(hasLevel({ expenses: 'add' }, 'expenses', 'full')).toBe(false);
    expect(hasLevel({}, 'expenses')).toBe(false);
  });
  it('Thùng rác: cần Nhập ở ít nhất một mục', () => {
    expect(canSeeTrash({ projects: 'view' })).toBe(false);
    expect(canSeeTrash({ projects: 'view', expenses: 'add' })).toBe(true);
    expect(canSeeTrash({ accounts: 'full' })).toBe(false);
  });
  it('trạng thái tài khoản', () => {
    expect(accountStatus({ is_locked: true, must_change_password: true }).label).toBe('Đã khóa');
    expect(accountStatus({ is_locked: false, must_change_password: true }).label).toBe('Chờ đổi mật khẩu');
    expect(accountStatus({ is_locked: false, must_change_password: false }).label).toBe('Đang dùng');
  });
});

describe('định dạng', () => {
  it('tiền', () => {
    expect(formatMoney(1540136982)).toBe('1.540.136.982');
    expect(formatShortMoney(1540136982)).toBe('1,54 tỷ');
    expect(formatShortMoney(-5350000)).toBe('−5 tr');
  });
  it('ngày + lần đăng nhập gần nhất', () => {
    const now = new Date(2026, 10, 11, 15, 0);
    expect(formatDate(new Date(2026, 9, 31))).toBe('31/10/2026');
    expect(formatLastSeen(new Date(2026, 10, 11, 8, 12).toISOString(), now)).toBe('hôm nay 08:12');
    expect(formatLastSeen(new Date(2026, 10, 10, 21, 40).toISOString(), now)).toBe('hôm qua 21:40');
    expect(formatLastSeen(null, now)).toBe('—');
  });
  it('chữ tắt avatar', () => {
    expect(initials('PHẠM VĂN LAM')).toBe('PL');
    expect(initials('TÌNH')).toBe('TÌ');
  });
  it('nội dung copy gửi Zalo', () => {
    const t = credentialsText({ appUrl: 'https://x.app', username: 'thao', password: 'K7mq-42xa' });
    expect(t).toContain('Tên đăng nhập: thao');
    expect(t).toContain('Mật khẩu tạm: K7mq-42xa');
    expect(t).toContain('App: https://x.app');
  });
  it('nhãn chọn năm', () => {
    expect(yearLabel('all')).toBe('Tất cả');
    expect(yearLabel([2026])).toBe('2026');
    expect(yearLabel([2026, 2025])).toBe('2025, 2026');
    expect(yearLabel([2024, 2026, 2025])).toBe('2024–2026 (3 năm)');
  });
  it('3 khổ màn hình', () => {
    expect(modeForWidth(1440)).toBe('desktop');
    expect(modeForWidth(1024)).toBe('desktop');
    expect(modeForWidth(820)).toBe('tablet');
    expect(modeForWidth(640)).toBe('tablet');
    expect(modeForWidth(390)).toBe('phone');
  });
});
