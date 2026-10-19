import { cva } from 'class-variance-authority';
import { cn } from 'lib/utility';
import { Button } from './button';

const closeVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-none border-0 bg-transparent leading-4 text-textColor no-underline shadow-none transition-colors underline-offset-2 hover:underline disabled:text-textInactiveColor',
  {
    variants: {
      size: {
        // Dense: the glyph keeps its line height; the 32px / 44px target is an invisible ::after,
        // so a chip or row does not grow around it.
        sm: "relative size-4 p-0 text-micro after:absolute after:-inset-2 after:content-[''] [@media(pointer:coarse)]:after:-inset-3.5",
        default: 'size-8 p-2 text-textBaseSize [@media(pointer:coarse)]:size-11 [@media(pointer:coarse)]:p-3.5',
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
