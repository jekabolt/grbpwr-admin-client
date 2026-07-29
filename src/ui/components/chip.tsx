import { cva, VariantProps } from 'class-variance-authority';

/**
 * Interactive counterpart of `Pill` — filters, toggles, removable selections.
 * `selected` fills with ink. Use `ChipRow` as the wrapper so nobody hand-rolls
 * `flex flex-wrap gap-1`.
 */
const chipVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap border px-[7px] py-px text-micro uppercase tracking-pill transition-colors disabled:cursor-not-allowed',
  {
    variants: {
      selected: {
        true: ['border-textColor', 'bg-textColor', 'text-bgColor'],
        false: ['border-borderColor', 'bg-bgColor', 'text-labelColor', 'hover:text-textColor'],
      },
      tone: {
        default: [],
        // A chip pointing at broken data (a dangling piece code, a missing material).
        error: ['border-error', 'text-error'],
      },
      dashed: { true: ['border-dashed'], false: [] },
    },
    compoundVariants: [
      { selected: true, tone: 'error', className: 'bg-error text-bgColor border-error' },
    ],
    defaultVariants: { selected: false, tone: 'default', dashed: false },
  },
);

interface Props extends VariantProps<typeof chipVariants> {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  /** Renders a trailing ✕ that calls this instead of `onClick`. */
  onRemove?: () => void;
  disabled?: boolean;
  title?: string;
  /** Set for toggle chips so screen readers announce the pressed state. */
  pressed?: boolean;
  /** Anything else (draggable, onDragStart, onKeyDown, data-*, role, tabIndex…). */
  [k: string]: unknown;
}

export function Chip({
  children,
  className,
  selected,
  tone,
  dashed,
  onClick,
  onRemove,
  disabled,
  pressed,
  ...props
}: Props) {
  const interactive = !!onClick || !!onRemove;
  const Component = interactive ? 'button' : 'span';
  return (
    <Component
      {...props}
      {...(interactive ? { type: 'button' as const, disabled, onClick } : {})}
      aria-pressed={pressed}
      className={chipVariants({ selected, tone, dashed, className })}
    >
      {children}
      {onRemove && (
        <span
          role='button'
          tabIndex={-1}
          aria-label='remove'
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onRemove();
          }}
          className='cursor-pointer leading-none'
        >
          ✕
        </span>
      )}
    </Component>
  );
}

export function ChipRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`flex flex-wrap items-center gap-1 ${className ?? ''}`}>{children}</div>;
}
