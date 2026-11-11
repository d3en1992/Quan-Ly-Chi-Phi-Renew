import { describe, expect, it } from 'vitest';
import type { Level, ModuleKey, PermissionMap } from '@/lib/permissions';
import { ALL_ITEMS, canSeeItem, firstVisiblePath, findItemByPath, visibleGroups } from './nav';
import { DEFAULT_ROLE_GRID } from './defaultRoles';

const code: Record<string, Level> = { f: 'full', v: 'view', a: 'add', h: 'none' };
function permsFor(col: number): PermissionMap {
  const out: PermissionMap = {};
  for (const [module, ...cells] of DEFAULT_ROLE_GRID) out[module as ModuleKey] = code[cells[col]!]!;
  return out;
}

// ACCOUNTS[...].hide của giao diện mẫu (thiet-ke/giao-dien-mau.html dòng 361–367)
const MOCK_HIDE: Record<string, string[]> = {
  admin: [],
  giamdoc: ['taikhoan'],
  quanly: ['taikhoan'],
  // Mẫu quên ẩn 'danhmuc' cho Kế toán, nhưng bảng quyền mẫu ghi Danh mục = Ẩn → theo bảng quyền (TIEN-DO: quyết định AI)
  ketoan: ['taikhoan', 'doanhthu', 'loinhuan', 'quyettoan', 'dashboard', 'tytrong', 'thietbi', 'danhmuc'],
  chixem: ['taikhoan', 'nhap', 'chamcong', 'nhapung', 'congno', 'tytrong', 'thietbi', 'danhmuc', 'danhba', 'doanhthu', 'loinhuan', 'quyettoan', 'dashboard', 'thungrac'],
};
const COLS = ['admin', 'giamdoc', 'quanly', 'ketoan', 'chixem'];

describe('menu theo vai trò = giao diện mẫu', () => {
  COLS.forEach((role, col) => {
    it(role, () => {
      const perms = permsFor(col);
      const hidden = ALL_ITEMS.filter((i) => !canSeeItem(perms, i)).map((i) => i.key).sort();
      expect(hidden).toEqual([...MOCK_HIDE[role]!].sort());
    });
  });

  it('nhóm trống bị bỏ, trang đầu là mục đầu tiên được thấy', () => {
    const perms: PermissionMap = { revenue: 'view' };
    expect(visibleGroups(perms).map((g) => g.title)).toEqual(['Doanh thu & lãi']);
    expect(firstVisiblePath(perms)).toBe('/doanh-thu');
    expect(firstVisiblePath({})).toBe('/khong-co-quyen');
  });

  it('tên tab đổi theo mục 4L', () => {
    const labels = ALL_ITEMS.map((i) => i.label);
    expect(labels).toContain('Chi Trả TP/NCC');
    expect(labels).toContain('Công Nợ Phải Trả');
  });

  it('tìm mục theo đường dẫn, kể cả chi tiết công trình', () => {
    expect(findItemByPath('/cong-trinh/abc')?.key).toBe('congtrinh');
    expect(findItemByPath('/tai-khoan')?.key).toBe('taikhoan');
  });
});
