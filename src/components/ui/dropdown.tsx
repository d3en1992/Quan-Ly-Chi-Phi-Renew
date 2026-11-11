import * as DM from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DropdownMenu = DM.Root;
export const DropdownTrigger = DM.Trigger;

export function DropdownContent({
  children,
  align = 'end',
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-[200px] rounded-[var(--r)] border border-line bg-surface p-1 shadow-card', className)}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function DropdownItem({
  children,
  onSelect,
  danger,
}: {
  children: ReactNode;
  onSelect?: (e: Event) => void;
  danger?: boolean;
}) {
  return (
    <DM.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-surface-2',
        danger ? 'text-bad' : 'text-fg',
      )}
    >
      {children}
    </DM.Item>
  );
}

export function DropdownCheckItem({
  children,
  checked,
  onToggle,
}: {
  children: ReactNode;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <DM.CheckboxItem
      checked={checked}
      onSelect={(e) => {
        e.preventDefault(); // giữ menu mở khi chọn nhiều năm
        onToggle();
      }}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"
    >
      <span className={cn('ms text-[18px]', checked ? 'text-accent' : 'text-faint')} aria-hidden="true">
        {checked ? 'check_box' : 'check_box_outline_blank'}
      </span>
      {children}
    </DM.CheckboxItem>
  );
}

export const DropdownSeparator = () => <DM.Separator className="my-1 h-px bg-line-soft" />;
export const DropdownLabel = ({ children }: { children: ReactNode }) => (
  <DM.Label className="px-2.5 py-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">{children}</DM.Label>
);
