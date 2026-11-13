import { describe, expect, it } from 'vitest';
import { MODULES, type Level, type ModuleKey, type PermissionMap } from '@/lib/permissions';
import {
  allEntries, defaultSub, findByPath, firstVisiblePath, LEGACY_REDIRECTS, moduleGroups, NAV_TABS, visibleSubs, visibleTabs,
} from './nav';
import { DEFAULT_ROLE_GRID } from './defaultRoles';

const code: Record<string, Level> = { f: 'full', v: 'view', a: 'add', h: 'none' };
function permsFor(col: number): PermissionMap {
  const out: PermissionMap = {};
  for (const [module, ...cells] of DEFAULT_ROLE_GRID) out[module as ModuleKey] = code[cells[col]!]!;
  return out;
}

/** Ai thấy gì theo bảng quyền mặc định (tai-lieu/KE-HOACH-GOP-TAB.md mục 1). Tab không có tab con ghi []. */
const ALL_SUBS = Object.fromEntries(NAV_TABS.map((t) => [t.key, (t.subs ?? []).map((s) => s.key)]));
const EXPECT: Record<string, Record<string, string[]>> = {
  admin: ALL_SUBS,
  giamdoc: { ...ALL_SUBS, caidat: ['danhba', 'danhmuc', 'xuat', 'thungrac'] },
  quanly: { ...ALL_SUBS, caidat: ['danhba', 'danhmuc', 'xuat', 'thungrac'] },
  ketoan: {
    congtrinh: [], chiphi: ['nhap', 'tracuu'], chamcong: [], thauphu: ['hdtp', 'ncc', 'tattoan', 'phieuchi'],
    kehoach: ['tiendo'], trolyai: [], caidat: ['danhba', 'xuat', 'thungrac'],
  },
  chixem: { congtrinh: [], chiphi: ['tracuu'], kehoach: ['tiendo'], caidat: ['xuat'] },
};
const COLS = ['admin', 'giamdoc', 'quanly', 'ketoan', 'chixem'];

describe('menu theo vai trò', () => {
  COLS.forEach((role, col) => {
    it(role, () => {
      const perms = permsFor(col);
      const seen = Object.fromEntries(visibleTabs(perms).map((t) => [t.key, visibleSubs(perms, t).map((s) => s.key)]));
      expect(seen).toEqual(EXPECT[role]);
    });
  });

  it('menu 10 tab, đúng thứ tự (Trợ lý AI ngay dưới Dashboard)', () => {
    expect(NAV_TABS.map((t) => t.label)).toEqual([
      'Công Trình', 'Chi Phí', 'Chấm Công', 'Thầu Phụ & NCC', 'Thu & Lãi', 'Kế Hoạch', 'Thiết Bị', 'Dashboard', 'Trợ lý AI', 'Cài Đặt',
    ]);
  });

  it('tab có tab con mà không còn tab con nào được thấy thì ẩn; trang đầu là tab đầu tiên được thấy', () => {
    const perms: PermissionMap = { settlements: 'view' };
    expect(visibleTabs(perms).map((t) => t.key)).toEqual(['thulai', 'caidat']);
    expect(firstVisiblePath(perms)).toBe('/thu-lai/quyet-toan');
    expect(firstVisiblePath({})).toBe('/khong-co-quyen');
  });

  it('tab con mặc định: nhớ lần trước nếu còn quyền, điện thoại theo phoneFirst', () => {
    const thulai = NAV_TABS.find((t) => t.key === 'thulai')!;
    const all: PermissionMap = { revenue: 'full', settlements: 'full', profit: 'full' };
    expect(defaultSub(all, thulai)?.key).toBe('hdchinh');
    expect(defaultSub(all, thulai, { phone: true })?.key).toBe('thutien');
    expect(defaultSub(all, thulai, { remembered: 'loinhuan', phone: true })?.key).toBe('loinhuan');
    expect(defaultSub({ settlements: 'view' }, thulai, { remembered: 'loinhuan' })?.key).toBe('quyettoan');
  });
});

describe('đường dẫn', () => {
  it('không trùng đường dẫn, khóa tab con không trùng', () => {
    const paths = allEntries().map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
    const keys = NAV_TABS.flatMap((t) => (t.subs ?? []).map((s) => s.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('tìm tab theo đường dẫn, kể cả chi tiết công trình và tab con', () => {
    expect(findByPath('/cong-trinh/abc')?.item.key).toBe('congtrinh');
    expect(findByPath('/thu-lai/quyet-toan')?.sub?.key).toBe('quyettoan');
    expect(findByPath('/thu-lai')?.item.key).toBe('thulai');
    expect(findByPath('/thu-lai/khong-co')).toBeUndefined();
    expect(findByPath('/dashboard')?.item.key).toBe('dashboard');
  });

  it('mọi đường dẫn cũ đều chuyển tới một tab con có thật', () => {
    const paths = new Set(allEntries().map((e) => e.path));
    expect(Object.keys(LEGACY_REDIRECTS).length).toBe(15); // + /chup → Trợ lý AI
    for (const to of Object.values(LEGACY_REDIRECTS)) expect(paths.has(to)).toBe(true);
  });
});

describe('bảng Phân quyền', () => {
  it('mọi mục quyền nằm trong đúng 1 nhóm tab', () => {
    const mods = moduleGroups().flatMap((g) => g.modules);
    expect([...mods].sort()).toEqual([...MODULES].sort());
    expect(new Set(mods).size).toBe(mods.length);
  });
});
