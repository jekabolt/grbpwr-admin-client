import { cn } from 'lib/utility';

/**
 * The reference's `.step`: a lifecycle read out as words, not a progress bar.
 *
 *   PAID › PACKED › shipped › delivered
 *
 * Done steps are ink, the current one is ink + bold + underscored, future ones are
 * grey. Separators are hairline `›`. Used for the order lifecycle in the list row and
 * under the order header, and for any two/three-step wizard footer.
 *
 * This is deliberately NOT a `Progress` bar: an order that went straight to
 * `cancelled` has no percentage, but it does have a place it stopped.
 */
export type Step = {
  label: React.ReactNode;
  /** Reached and left behind. */
  done?: boolean;
  /** Where the thing is right now. Exactly one step should carry this. */
  current?: boolean;
};

export function Stepper({
  steps,
  separator = '›',
  className,
}: {
  steps: Step[];
  separator?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      {steps.map((s, i) => (
        <span key={i} className='inline-flex items-center gap-1.5'>
          {i > 0 && (
            <span aria-hidden className='text-borderColor'>
              {separator}
            </span>
          )}
          <span
            aria-current={s.current ? 'step' : undefined}
            className={cn(
              'text-micro uppercase tracking-label',
              s.current
                ? 'border-b-2 border-textColor font-bold text-textColor'
                : s.done
                  ? 'text-textColor'
                  : 'text-labelColor',
            )}
          >
            {s.label}
          </span>
        </span>
      ))}
    </span>
  );
}
