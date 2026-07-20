import { cn } from 'lib/utility';

type Props = {
  balanced?: boolean;
  className?: string;
};

// Trust signal shown on every balance-checked report (TB Σdebit==Σcredit, BS balance_check==0,
// journal-entry footer — 08-ux-guidelines.md §8.1 principle #3: "signals of trust always
// visible"). Colors reuse the repo's existing ok/error convention (text-success / text-error —
// see e.g. production-runs/components/options.ts, page/components/ProfitabilityPanel.tsx,
// tech-card/components/sample-creation-wizard.tsx) rather than inventing a new palette.
// `balanced` undefined (still loading) renders a neutral placeholder instead of flashing red.
export function BalancedBadge({ balanced, className }: Props) {
  if (balanced === undefined) {
    return (
      <span className={cn('text-textBaseSize uppercase text-textInactiveColor', className)}>—</span>
    );
  }
  return (
    <span
      className={cn(
        'whitespace-nowrap text-textBaseSize uppercase',
        balanced ? 'text-success' : 'text-error',
        className,
      )}
    >
      {balanced ? '✓ balanced' : '✗ out of balance'}
    </span>
  );
}
