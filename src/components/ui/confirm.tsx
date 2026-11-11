// Hộp hỏi xác nhận (xóa, khóa, đặt lại mật khẩu…)
import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { Button } from './button';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({ open, onOpenChange, title, message, confirmLabel, danger, busy, onConfirm }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[var(--r)] border border-line bg-surface p-4 shadow-card">
          <Dialog.Title className="m-0 text-[15px] font-bold">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-2 text-[13px] text-muted">{message}</div>
          </Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
