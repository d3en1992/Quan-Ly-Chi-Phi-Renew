import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Nút theo giao diện mẫu: .btn / .btn.pri / .btn.ghost / .btn.sm / .btn.danger
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none [&_.ms]:text-[18px]',
  {
    variants: {
      variant: {
        default: 'border-line bg-surface text-fg hover:bg-surface-2',
        primary: 'border-accent bg-accent text-accent-fg hover:opacity-90',
        ghost: 'border-transparent bg-transparent text-muted hover:bg-surface-2 hover:text-fg',
        danger: 'border-line bg-surface text-bad hover:bg-bad-soft',
        'ghost-danger': 'border-transparent bg-transparent text-bad hover:bg-bad-soft',
      },
      size: {
        default: 'px-3 py-[7px] text-[13px]',
        sm: 'px-2 py-1 text-xs',
        lg: 'px-4 py-3 text-[15px] font-bold rounded-xl',
        icon: 'size-[34px] p-0 text-muted',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('ms', className)} aria-hidden="true">
      {name}
    </span>
  );
}
