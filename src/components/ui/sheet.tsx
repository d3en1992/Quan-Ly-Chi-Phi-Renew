// Bảng trượt phải (drawer) — giống .drawer của mẫu. Trên điện thoại chiếm cả màn.
import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { Button, Icon } from './button';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Bảng rộng hơn (form có bảng dòng vật tư) */
  wide?: boolean;
};

export function Sheet({ open, onOpenChange, title, children, footer, wide }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-[-12px_0_32px_rgba(0,0,0,.12)] ${wide ? 'sm:w-[min(680px,100vw)]' : 'sm:w-[400px]'}`}>
          <header className="flex items-center gap-2 border-b border-line px-4 py-3.5">
            <Dialog.Title className="m-0 flex-1 text-[15px] font-bold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button size="icon" aria-label="Đóng">
                <Icon name="close" />
              </Button>
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          <div className="grid content-start gap-3 overflow-auto p-4">{children}</div>
          {footer ? <footer className="mt-auto flex gap-2 border-t border-line px-4 py-3">{footer}</footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
