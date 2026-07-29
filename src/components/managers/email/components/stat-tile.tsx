import { cn } from 'lib/utility';
import Text from 'ui/components/text';

export type StatTone = 'default' | 'muted' | 'warning' | 'error';

// Brand-token tiles: black/gray by default, amber (warning) for in-flight, red only
// for failures/loss. No pastel washes — border + text tone carry meaning.
const TONE_BORDER: Record<StatTone, string> = {
  default: 'border-textColor',
  muted: 'border-textInactiveColor',
  warning: 'border-warning',
  error: 'border-error',
};

const TONE_VALUE: Record<StatTone, string> = {
  default: 'text-textColor',
  muted: 'text-textInactiveColor',
  warning: 'text-warning',
  error: 'text-error',
};

export function StatTile({
  label,
  value,
  sub,
  tone = 'default',
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1 border p-3', TONE_BORDER[tone], className)}>
      <Text variant='label' size='small' className='uppercase'>
        {label}
      </Text>
      <Text size='large' className={cn('tabular-nums', TONE_VALUE[tone])}>
        {value}
      </Text>
      {sub != null && (
        <Text variant='inactive' size='small' className='tabular-nums'>
          {sub}
        </Text>
      )}
    </div>
  );
}

// Number formatting shared across dispatch/metrics surfaces.
export function fmtInt(n: number | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '0';
  return Math.round(n).toLocaleString();
}

// Backend rates are fractions in [0,1]; render as a percentage. Defensive against a
// backend that ever hands back 0–100 already (values > 1.5 are treated as percents).
export function fmtRate(r: number | undefined): string {
  if (typeof r !== 'number' || Number.isNaN(r)) return '—';
  const pct = r > 1.5 ? r : r * 100;
  return `${pct.toFixed(1)}%`;
}
