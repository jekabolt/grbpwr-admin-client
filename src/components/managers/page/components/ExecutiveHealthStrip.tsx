import type { BusinessMetrics } from 'api/proto-http/admin';
import { type FC } from 'react';
import { Link } from 'react-router-dom';
import Text from 'ui/components/text';
import { computeExecutiveAlerts, deriveHealthStatus, type HealthStatus } from '../executiveAlerts';
import { SectionHead } from './SectionHead';

const STATUS_LABEL: Record<HealthStatus, string> = {
  needs_attention: 'Needs attention',
  mixed: 'Mixed signals',
  on_track: 'On track',
};

// Status pill: colored border + text on a gray surface (no coral/opacity-red wash).
const STATUS_SHELL: Record<HealthStatus, string> = {
  needs_attention: 'border-error text-error bg-bgSecondary',
  mixed: 'border-warning text-warning bg-bgSecondary',
  on_track: 'border-textInactiveColor text-textColor bg-bgSecondary',
};

// Alert title: high = red, warning = blue (the design's warning token), matching the stub a-t.crit / a-t.warn.
const ALERT_TITLE_CLASS: Record<'high' | 'warning', string> = {
  high: 'text-error',
  warning: 'text-warning',
};

export interface ExecutiveHealthStripProps {
  metrics: BusinessMetrics | undefined;
  compareEnabled: boolean;
  revenueHref: string;
  currentPeriodLabel: string;
  comparePeriodLabel: string | null;
}

/** Health / act now (config: Health=pill) — a status pill + the act-now list, matching the
 *  approved today-config stub: sec-h header → pill + count → ranked issues with an Open link. */
export const ExecutiveHealthStrip: FC<ExecutiveHealthStripProps> = ({
  metrics,
  compareEnabled,
  revenueHref,
  currentPeriodLabel,
  comparePeriodLabel,
}) => {
  const alerts = computeExecutiveAlerts(metrics, compareEnabled, { revenue: revenueHref });
  const status = deriveHealthStatus(alerts, metrics, compareEnabled);

  return (
    <section className='space-y-2.5'>
      <SectionHead title='Health / act now' sub='— what needs a decision this period' />

      <div className='flex flex-wrap items-center gap-3'>
        <span
          className={`inline-flex items-center border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${STATUS_SHELL[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
        <Text variant='uppercase' className='text-labelColor text-[11px]'>
          {alerts.length === 0
            ? 'Nothing needs action this period'
            : `${alerts.length} thing${alerts.length === 1 ? '' : 's'} to act on`}
        </Text>
      </div>

      {compareEnabled && comparePeriodLabel && (
        <Text className='text-labelColor text-textBaseSize'>
          {currentPeriodLabel} vs {comparePeriodLabel}
        </Text>
      )}

      {alerts.length > 0 && (
        <ul className='divide-y divide-textInactiveColor/50 border-t border-textInactiveColor/50'>
          {alerts.map((a, i) => (
            <li key={`${a.title}-${i}`} className='py-2 text-textBaseSize leading-snug'>
              <span className={`font-bold ${ALERT_TITLE_CLASS[a.severity]}`}>{a.title}</span>
              {a.detail && (
                <Text className='text-labelColor text-textBaseSize mt-0.5 block'>{a.detail}</Text>
              )}
              {a.href && (
                <Link
                  to={a.href}
                  replace
                  className='mt-0.5 inline-block text-textBaseSize underline underline-offset-2 hover:text-textColor'
                >
                  Open ▸
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
