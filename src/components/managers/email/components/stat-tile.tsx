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
//
// The counts are int64 in the proto (CampaignMetricCounts, fan-out cursors), and
// grpc-gateway's protojson marshaler emits int64 as a JSON STRING ("1234") — the TS
// client types them as `number` but the wire value is a string, so a `typeof ===
// 'number'` gate would render every count as 0. Coerce first, exactly like
// epochSecondsToRfc3339 does for the *_at fields.
export function toNumber(v: number | string | undefined | null): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function fmtInt(n: number | string | undefined): string {
  const v = toNumber(n);
  if (v === undefined) return '0';
  return Math.round(v).toLocaleString('en-US');
}

// Backend rates are fractions in [0,1]; render as a percentage. Defensive against a
// backend that ever hands back 0–100 already (values > 1.5 are treated as percents).
export function fmtRate(r: number | string | undefined): string {
  const v = toNumber(r);
  if (v === undefined) return '—';
  const pct = v > 1.5 ? v : v * 100;
  return `${pct.toFixed(1)}%`;
}
