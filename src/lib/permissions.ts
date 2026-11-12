// Mức quyền và kiểm tra quyền phía giao diện. Kho dữ liệu kiểm tra lại bằng has_permission() trong RLS.

export const LEVELS = ['none', 'view', 'add', 'full'] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABEL: Record<Level, string> = {
  none: 'Ẩn',
  view: 'Xem',
  add: 'Nhập',
  full: 'Toàn quyền',
};

export const MODULES = [
  'projects', 'expenses', 'expense_stats', 'timesheets', 'payments', 'payables',
  'cost_allocation', 'equipment', 'schedule', 'contacts',
  'revenue', 'settlements', 'profit', 'dashboard', 'catalog', 'accounts',
] as const;
export type ModuleKey = (typeof MODULES)[number];

export type PermissionMap = Partial<Record<ModuleKey, Level>>;

export const SPECIALS = ['see_contact_ids', 'edit_others', 'purge_trash'] as const;
export type SpecialKey = (typeof SPECIALS)[number];
export const SPECIAL_LABEL: Record<SpecialKey, string> = {
  see_contact_ids: 'Xem SĐT, số CCCD',
  edit_others: 'Sửa / xóa dòng người khác nhập',
  purge_trash: 'Xóa vĩnh viễn trong Thùng rác',
};

export function levelRank(level: Level | undefined | null): number {
  return level ? LEVELS.indexOf(level) : 0;
}

/** Bấm một ô quyền: Ẩn → Xem → Nhập → Toàn quyền → Ẩn */
export function nextLevel(level: Level): Level {
  return LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length]!;
}

export function hasLevel(perms: PermissionMap, module: ModuleKey, min: Level = 'view'): boolean {
  return levelRank(perms[module]) >= levelRank(min);
}

/** Thùng Rác hiện khi tài khoản được Nhập ở ít nhất một mục (Chỉ xem thì ẩn — giống mẫu). */
export function canSeeTrash(perms: PermissionMap): boolean {
  return MODULES.some((m) => m !== 'accounts' && levelRank(perms[m]) >= levelRank('add'));
}

/** Tab Xuất Dữ Liệu (TN02): thấy khi được Xem ít nhất một mục có dữ liệu (không thêm quyền mới) */
export function canSeeExport(perms: PermissionMap): boolean {
  return MODULES.some((m) => m !== 'accounts' && levelRank(perms[m]) >= levelRank('view'));
}
