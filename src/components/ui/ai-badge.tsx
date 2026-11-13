// Biểu tượng Trợ lý AI: nền chuyển sắc xanh → tím → hồng, nổi hơn các tab khác (menu máy tính, nút giữa thanh dưới điện thoại, đầu trang)
import { cn } from '@/lib/utils';

export const AI_GRADIENT = 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 55%, #db2777 100%)';

export function AiBadge({ size = 40, className, glow = true }: { size?: number; className?: string; glow?: boolean }) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-xl text-white', glow && 'shadow-[0_4px_14px_rgba(124,58,237,0.45)]', className)}
      style={{ width: size, height: size, background: AI_GRADIENT }}
    >
      <span className="ms leading-none" aria-hidden="true" style={{ fontSize: Math.round(size * 0.58) }}>auto_awesome</span>
    </span>
  );
}
