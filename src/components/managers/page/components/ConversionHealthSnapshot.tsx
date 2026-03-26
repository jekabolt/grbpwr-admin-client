import type { ExceptionMetric, NotFoundMetric, WebVitalMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

function fcpAvgMs(webVitals: WebVitalMetric[] | undefined): number | null {
  if (!webVitals?.length) return null;
  let weighted = 0;
  let sessions = 0;
  for (const m of webVitals) {
    const name = (m.metricName || '').toUpperCase();
    if (name !== 'FCP') continue;
    const c = m.sessionCount || 0;
    weighted += (m.avgMetricValue || 0) * c;
    sessions += c;
  }
  if (sessions <= 0) return null;
  return weighted / sessions;
}

function total404Hits(notFound: NotFoundMetric[] | undefined): number {
  if (!notFound?.length) return 0;
  return notFound.reduce((sum, m) => sum + (m.hitCount || 0), 0);
}

function totalJsExceptions(exceptions: ExceptionMetric[] | undefined): number {
  if (!exceptions?.length) return 0;
  return exceptions.reduce((sum, m) => sum + (m.exceptionCount || 0), 0);
}

interface ConversionHealthSnapshotProps {
  webVitals: WebVitalMetric[] | undefined;
  notFound: NotFoundMetric[] | undefined;
  exceptions: ExceptionMetric[] | undefined;
}

/** Funnel-tab footnote: performance issues that drag on conversion; full detail on Technical Issues & Page Speed. */
export const ConversionHealthSnapshot: FC<ConversionHealthSnapshotProps> = ({
  webVitals,
  notFound,
  exceptions,
}) => {
  const location = useLocation();
  const healthHref = `${location.pathname}?tab=site-health`;

  const fcp = fcpAvgMs(webVitals);
  const hits404 = total404Hits(notFound);
  const jsErr = totalJsExceptions(exceptions);

  if (fcp == null && hits404 === 0 && jsErr === 0) return null;

  const parts: string[] = [];
  if (fcp != null) {
    parts.push(`FCP ~${formatNumber(Math.round(fcp))} ms (target under 1.8s)`);
  }
  if (hits404 > 0) {
    parts.push(`${formatNumber(hits404)}× 404 hits`);
  }
  if (jsErr > 0) {
    parts.push(`${formatNumber(jsErr)} JS errors`);
  }

  return (
    <div className='border border-dashed border-textInactiveColor/80 bg-bgSecondary/30 p-3'>
      <Text variant='uppercase' className='text-[10px] font-semibold text-textInactiveColor mb-1 block'>
        Conversion context — speed &amp; reliability
      </Text>
      <Text className='text-xs text-textColor leading-relaxed'>
        {parts.join(' · ')}. Poor load or broken pages hurt the funnel — see{' '}
        <Link to={healthHref} replace className='underline underline-offset-2 hover:text-textInactiveColor'>
          Technical issues &amp; page speed
        </Link>{' '}
        for full vitals, 404s, and exceptions.
      </Text>
    </div>
  );
};
