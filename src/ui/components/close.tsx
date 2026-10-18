import { cva } from 'class-variance-authority';
import { cn } from 'lib/utility';
import { Button } from './button';

const closeVariants = cva(
  'inline-flex size-8 shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-2 leading-4 text-textColor no-underline shadow-none transition-colors underline-offset-2 hover:underline disabled:text-textInactiveColor [@media(pointer:coarse)]:size-11 [@media(pointer:coarse)]:p-3.5',
  {
    variants: {
      size: {
        sm: 'text-micro',
        default: 'text-textBaseSize',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

interface CloseProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'size'> {
  /** Preserve Button's Slot escape hatch for fieldset-safe span-role controls. */
  asChild?: boolean;
  /** Dense row/chip glyph; both sizes keep the same 32px / 44px pointer target. */
  size?: 'sm' | 'default';
  /** Name the exact action when “close” is ambiguous, for example “remove attachment”. */
  'aria-label'?: string;
}

/** @primitive Close / remove ×  */
export function Close({
  size,
  className,
  asChild,
  'aria-label': ariaLabel = 'close',
  ...props
}: CloseProps) {
  return (
    <Button
      {...props}
      asChild={asChild}
      aria-label={ariaLabel}
      role={asChild ? 'button' : undefined}
      className={cn(closeVariants({ size }), className)}
    >
      {asChild ? <span>×</span> : '×'}
    </Button>
  );
}
