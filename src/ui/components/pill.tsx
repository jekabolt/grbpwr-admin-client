import { cva, VariantProps } from 'class-variance-authority';

/**
 * Read-only status marker. If it can be clicked it is a `Chip`, not a `Pill`.
 *
 * Colour semantics (see tmp/ui-redesign/00-design-system.md):
 *   ok        green  — done, approved, in stock, under budget
 *   warn      red    — broken, missing, blocking, over budget
 *   attention blue   — mid-flight, needs a human: in review, unsaved, changed, stale
 *   mut       grey   — neutral / not started / not applicable
 *   gap       grey, DASHED — «not here yet»: an empty count, an unfilled slot, a step not reached.
 *             Not red: red in this admin means a loss (broken, over budget), and an empty list is
 *             not a loss. The dashed edge is the same mark the empty cells and «+ add» chips wear.
 *
 * Border and text share the tone colour; the background is always transparent.
 */
const pillVariants = cva(
  'inline-flex items-center whitespace-nowrap border px-[7px] py-px text-micro uppercase tracking-pill',
  {
    variants: {
      tone: {
        ok: ['border-success', 'text-success'],
        warn: ['border-error', 'text-error'],
        attention: ['border-warning', 'text-warning'],
        mut: ['border-borderColor', 'text-labelColor'],
        ink: ['border-textColor', 'text-textColor'],
        gap: ['border-dashed', 'border-borderColor', 'text-labelColor'],
      },
    },
    defaultVariants: { tone: 'mut' },
  },
);

interface Props extends VariantProps<typeof pillVariants> {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function Pill({ tone, children, className, ...props }: Props) {
  return (
    <span {...props} className={pillVariants({ tone, className })}>
      {children}
    </span>
  );
}
