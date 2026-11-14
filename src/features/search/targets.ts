// Mỗi nhóm kết quả: biểu tượng, tên, trang đích + cách lọc sẵn khi bấm (hàm thuần, có test).
import type { SearchKind } from '@shared/search';
import type { NavModule } from '@/app/nav';

export type KindMeta = { label: string; icon: string; sub: string | null; module: NavModule };

/** Thứ tự hiện nhóm: công trình → danh bạ → … (đã chốt ở tai-lieu/DE-XUAT-TIM-KIEM.md) */
export const KIND_META: Record<SearchKind, KindMeta> = {
  project: { label: 'Công trình', icon: 'construction', sub: null, module: 'projects' },
  contact: { label: 'Danh bạ', icon: 'contacts', sub: 'danhba', module: 'contacts' },
  shop: { label: 'Cửa hàng', icon: 'storefront', sub: 'danhba', module: 'contacts' },
  expense: { label: 'Khoản chi', icon: 'receipt_long', sub: 'tracuu', module: 'expense_stats' },
  subcontract: { label: 'Hợp đồng thầu phụ', icon: 'handshake', sub: 'hdtp', module: 'payables' },
  payment: { label: 'Phiếu chi', icon: 'account_balance_wallet', sub: 'phieuchi', module: 'payments' },
  timesheet: { label: 'Sổ chấm công', icon: 'calendar_month', sub: null, module: 'timesheets' },
  equipment: { label: 'Thiết bị', icon: 'build', sub: null, module: 'equipment' },
  main_contract: { label: 'Hợp đồng chính', icon: 'description', sub: 'hdchinh', module: 'revenue' },
  receipt: { label: 'Phiếu thu', icon: 'attach_money', sub: 'thutien', module: 'revenue' },
};
export const KIND_ORDER = Object.keys(KIND_META) as SearchKind[];

/** Đường dẫn trang chính (không có tab con) */
const MAIN_PATH: Partial<Record<SearchKind, string>> = { project: '/cong-trinh', timesheet: '/cham-cong', equipment: '/thiet-bi' };

export type HitLike = { kind: SearchKind; id: string; title: string; sub: string; date: string | null; project_id: string | null; extra: string | null };

export type Target = {
  /** null = trang tab con, tính bằng pathOfSub(sub) */
  path: string | null;
  sub: string | null;
  seed?: string;
  focusText?: string;
  params?: Record<string, string>;
};

const part = (s: string, i: number) => (s.split(' · ')[i] ?? '').trim();
/** Đoạn đầu của nội dung hóa đơn ("Cap 1.5 cadivi, Dây 2.5…" → "Cap 1.5 cadivi") — đủ để ô lọc của trang khớp đúng dòng */
const firstItem = (s: string) => (s.split(',')[0] ?? '').trim().slice(0, 60);

/** Bấm 1 kết quả → mở đâu, lọc gì, tô sáng dòng nào */
export function targetOf(h: HitLike): Target {
  const meta = KIND_META[h.kind];
  const base = { path: MAIN_PATH[h.kind] ?? null, sub: meta.sub };
  switch (h.kind) {
    case 'project':
      return { path: `/cong-trinh/${h.id}`, sub: null };
    case 'contact':
      return { ...base, seed: h.title, focusText: h.title, params: { tab: h.extra ?? 'customer' } };
    case 'shop':
      return { ...base, seed: h.title, focusText: h.title, params: { tab: 'shop' } };
    case 'expense': {
      const seed = firstItem(h.title);
      return { ...base, seed, focusText: seed, params: { project: part(h.sub, 0) } };
    }
    case 'subcontract':
      return { ...base, seed: part(h.title, 0), focusText: part(h.title, 0) };
    case 'payment':
      return { ...base, seed: part(h.title, 1), focusText: part(h.title, 1) };
    case 'timesheet':
      return { ...base, params: { project: h.project_id ?? '', week: h.date ?? '' } };
    case 'equipment':
      return { ...base, seed: h.title, focusText: h.title };
    case 'main_contract':
    case 'receipt':
      return { ...base, seed: part(h.title, 1), focusText: part(h.title, 1) };
  }
}

/** "Xem tất cả" một nhóm → trang của nhóm, ô lọc điền chữ đang tìm */
export function groupTarget(kind: SearchKind, text: string): Target {
  const t: Target = { path: MAIN_PATH[kind] ?? null, sub: KIND_META[kind].sub, seed: text };
  if (kind === 'shop') t.params = { tab: 'shop' };
  return t;
}

/** Năm của dòng (để bật năm đó trên ô chọn năm nếu đang ẩn) */
export const yearOf = (date: string | null): number | null => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null);
