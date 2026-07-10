import type { BusinessMetrics } from 'api/proto-http/admin';
import { type FC } from 'react';
import { Link } from 'react-router-dom';
import Text from 'ui/components/text';
import { computeExecutiveAlerts, deriveHealthStatus, type HealthStatus } from '../executiveAlerts';

const STATUS_LABEL: Record<HealthStatus, string> = {
  needs_attention: 'Needs attention',
  mixed: 'Mixed signals',
  on_track: 'On track',
};

const STATUS_SHELL: Record<HealthStatus, string> = {
  needs_attention: 'border-error text-error bg-error/10',
  mixed: 'border-warning text-textColor bg-warning/10',
  on_track: 'border-textInactiveColor text-textColor bg-bgSecondary/40',
};

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
    <div className='space-y-4 border-2 border-textColor/15 bg-bgSecondary/20 p-4'>
      <div className='space-y-1'>
        <Text variant='uppercase' className='text-[10px] font-semibold text-textInactiveColor'>
          Business health
        </Text>
        <Text className='text-xs text-textColor/90 leading-relaxed'>
          <span className='text-textInactiveColor'>Current: </span>
          {currentPeriodLabel}
          {comparePeriodLabel && (
            <>
              <span className='text-textInactiveColor'> · Compared to: </span>
              {comparePeriodLabel}
            </>
          )}
        </Text>
      </div>

      <div className='flex flex-wrap items-center gap-3'>
        <span
          className={`inline-flex items-center border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_SHELL[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
        <Text className='text-[10px] text-textInactiveColor uppercase'>
          {alerts.length === 0
            ? 'Nothing needs action this period'
            : `${alerts.length} thing${alerts.length === 1 ? '' : 's'} to act on`}
        </Text>
      </div>

      {alerts.length > 0 && (
        <div className='space-y-2 border-t border-textInactiveColor/40 pt-3'>
          <Text variant='uppercase' className='text-[10px] font-semibold text-textInactiveColor'>
            Act now
          </Text>
          <ul className='space-y-2'>
            {alerts.map((a, i) => (
              <li key={`${a.title}-${i}`} className='text-xs leading-snug'>
                <span className={`font-semibold ${ALERT_TITLE_CLASS[a.severity]}`}>{a.title}</span>
                {a.detail && (
                  <Text className='text-textInactiveColor text-[11px] mt-0.5 block'>{a.detail}</Text>
                )}
                {a.href && (
                  <Link
                    to={a.href}
                    replace
                    className='text-[11px] underline underline-offset-2 mt-0.5 inline-block hover:text-textColor'
                  >
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
