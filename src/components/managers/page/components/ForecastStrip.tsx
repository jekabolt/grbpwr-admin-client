import type { RevenueForecast } from 'api/proto-http/admin';
import { format, subYears } from 'date-fns';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatCurrencyWhole, parseDecimal } from '../utils';

interface ForecastStripProps {
  forecast: RevenueForecast | undefined;
}

// Backend forecast method → human phrase for the header fine print.
const METHOD_LABEL: Record<string, string> = {
  dow: 'day-of-week pattern',
  'dow+seasonal': 'day-of-week + seasonal',
  closed: 'final',
  run_rate: 'run-rate',
};

// clamp a value to a 0–100 percentage of the bar scale.
const clampPct = (v: number, max: number) => Math.max(0, Math.min(100, (v / max) * 100));

/**
 * Month revenue forecast — "will we hit the month, are we ahead of last year".
 *
 * Calendar-month anchored: the figures come from `revenueForecast.month`, NOT the dashboard
 * period picker, so the copy states the month explicitly and the block reads as its own framed
 * object (heavier border, tinted fill) to separate it from the period-scoped tiles around it.
 */
export const ForecastStrip: FC<ForecastStripProps> = ({ forecast }) => {
  if (!forecast) return null;

  const projected = parseDecimal(forecast.forecast);
  const mtd = parseDecimal(forecast.mtdActual);
  // Nothing to project yet (empty payload or a zero month) — self-hide.
  if (projected <= 0 && mtd <= 0) return null;

  const low = parseDecimal(forecast.forecastLow);
  const high = parseDecimal(forecast.forecastHigh);
  const runRate = parseDecimal(forecast.runRate);
  const ly = parseDecimal(forecast.lastYearMonthTotal);
  const isClosed = forecast.method === 'closed';
  const elapsed = forecast.elapsedDays ?? 0;
  const remaining = forecast.remainingDays ?? 0;
  const totalDays = elapsed + remaining;

  const monthDate = forecast.month ? new Date(forecast.month) : null;
  const monthLabel = monthDate ? format(monthDate, 'MMMM yyyy') : '';
  const lyLabel = monthDate ? format(subYears(monthDate, 1), 'MMMM yyyy') : 'last year';
  const methodLabel = forecast.method
    ? (METHOD_LABEL[forecast.method] ?? forecast.method)
    : null;

  // The solid "already real" figure: for a closed month that's the final total; mid-month it's MTD.
  const actual = isClosed ? projected : mtd;
  // Scale headroom so the LY tick and the interval high both sit inside the track.
  const scaleMax = Math.max(high, ly, projected, actual) * 1.05 || 1;
  const p = (v: number) => clampPct(v, scaleMax);

  // Compare the projection (or final result) to last year's actual.
  const vsLy = ly > 0 ? ((projected - ly) / ly) * 100 : null;
  const vsLyText =
    vsLy == null
      ? null
      : `${isClosed ? '' : 'on track for '}${vsLy > 0 ? '+' : vsLy < 0 ? '−' : ''}${Math.abs(
          vsLy,
        ).toFixed(0)}% vs ${lyLabel} (${formatCurrencyWhole(ly)})`;
  const vsLyColor = vsLy == null || vsLy === 0 ? '' : vsLy > 0 ? 'text-success' : 'text-error';

  // Only surface run-rate when it disagrees with the blended forecast — otherwise it's noise.
  const showRunRate =
    !isClosed && runRate > 0 && projected > 0 && Math.abs(runRate - projected) / projected > 0.05;

  const headlineLabel = isClosed ? 'result' : 'projected';
  const headerLabel = isClosed ? 'Month result' : 'Month forecast';

  const ariaLabel = isClosed
    ? `${monthLabel} final revenue ${formatCurrencyWhole(projected)}`
    : `${monthLabel} projected revenue ${formatCurrencyWhole(projected)}, ${formatCurrencyWhole(
        mtd,
      )} so far, day ${elapsed} of ${totalDays}${ly > 0 ? `, last year ${formatCurrencyWhole(ly)}` : ''}`;

  return (
    <div className='border-2 border-textInactiveColor/40 bg-bgSecondary/30 p-4 space-y-3'>
      <div className='flex flex-wrap items-baseline justify-between gap-2'>
        <Text variant='uppercase' className='font-bold'>
          {headerLabel} · {monthLabel}
        </Text>
        {methodLabel && (
          <Text className='text-textInactiveColor text-textBaseSize lowercase'>
            method: {methodLabel}
          </Text>
        )}
      </div>

      <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
        <Text className='font-bold text-lg'>{formatCurrencyWhole(projected)}</Text>
        <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
          {headlineLabel}
        </Text>
        {!isClosed && high > low && (
          <Text className='text-textInactiveColor text-textBaseSize'>
            ({formatCurrencyWhole(low)} – {formatCurrencyWhole(high)})
          </Text>
        )}
      </div>

      {/* Bullet bar: interval band (faint) · projected remainder (hatched) · actual (solid) · LY tick. */}
      <div
        className='relative mt-4 h-3 w-full bg-bgSecondary/60'
        role='img'
        aria-label={ariaLabel}
      >
        {!isClosed && high > low && (
          <div
            className='absolute inset-y-0 bg-textColor/10'
            style={{ left: `${p(low)}%`, width: `${Math.max(0, p(high) - p(low))}%` }}
          />
        )}
        {!isClosed && projected > actual && (
          <div
            className='absolute inset-y-0 bg-textColor/25'
            style={{ left: `${p(actual)}%`, width: `${Math.max(0, p(projected) - p(actual))}%` }}
          />
        )}
        <div className='absolute inset-y-0 left-0 bg-textColor' style={{ width: `${p(actual)}%` }} />
        {ly > 0 && (
          <div
            className='absolute -inset-y-1 w-px bg-labelColor'
            style={{ left: `${p(ly)}%` }}
            title={`${lyLabel}: ${formatCurrency(ly)}`}
          >
            <span className='absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] uppercase text-labelColor'>
              LY
            </span>
          </div>
        )}
      </div>

      {!isClosed && (
        <div className='flex flex-wrap items-baseline justify-between gap-2'>
          <Text className='text-labelColor text-textBaseSize'>
            {formatCurrencyWhole(mtd)} so far · day {elapsed} of {totalDays}
          </Text>
          <Text className='text-labelColor text-textBaseSize'>{remaining} days left</Text>
        </div>
      )}

      {vsLyText && (
        <Text variant='uppercase' className={`text-textBaseSize ${vsLyColor}`}>
          {vsLy != null && vsLy > 0 ? '↑ ' : vsLy != null && vsLy < 0 ? '↓ ' : ''}
          {vsLyText}
        </Text>
      )}

      <div className='space-y-0.5'>
        {showRunRate && (
          <Text className='text-textInactiveColor text-textBaseSize'>
            run-rate {formatCurrencyWhole(runRate)} · projection blends {methodLabel}
          </Text>
        )}
        {forecast.caveat && (
          <Text className='text-textInactiveColor text-textBaseSize'>{forecast.caveat}</Text>
        )}
        <Text className='text-textInactiveColor text-textBaseSize'>
          calendar month · independent of the selected range
        </Text>
      </div>
    </div>
  );
};
