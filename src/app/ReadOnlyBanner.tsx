import { Icon } from '@/components/ui/button';
import { useAccess } from './auth';

/** Dải vàng báo tài khoản chỉ thấy công trình được giao (giống .rocard của mẫu) */
export function ReadOnlyBanner() {
  const access = useAccess();
  if (access.profile.project_scope !== 'assigned') return null;
  const n = access.project_ids.length;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] font-semibold text-warn">
      <Icon name="visibility" className="text-[18px]" />
      Tài khoản chỉ thấy {n > 0 ? `${n} công trình được giao` : 'công trình được giao (chưa giao công trình nào)'}
    </div>
  );
}
