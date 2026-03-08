import type { WebVitalMetric } from 'api/proto-http/admin';
import Tooltip from '@mui/material/Tooltip';
import { FC } from 'react';
import Text from 'ui/components/text';

const METRIC_DESCRIPTIONS: Record<string, string> = {
  LCP: 'Largest Contentful Paint — measures loading performance. Time until the largest image or text block is visible. Good: <2.5s',
  FID: 'First Input Delay — measures interactivity. Time from first user interaction to browser response. Good: <100ms',
  INP: 'Interaction to Next Paint — measures responsiveness. Replaces FID as the preferred interactivity metric. Good: <200ms',
  CLS: 'Cumulative Layout Shift — measures visual stability. Unexpected layout shifts during page load. Good: <0.1',
  FCP: 'First Contentful Paint — measures perceived load speed. When the first text or image is painted. Good: <1.8s',
  TTFB: 'Time to First Byte — measures server response time. Time until the first byte of the response arrives. Good: <800ms',
};

function getMetricDescription(metricName: string): string {
  const key = metricName.toUpperCase();
  return METRIC_DESCRIPTIONS[key] ?? `${metricName} — Core Web Vitals metric`;
}

interface WebVitalsCardProps {
  webVitals: WebVitalMetric[] | undefined;
}

export const WebVitalsCard: FC<WebVitalsCardProps> = ({ webVitals }) => {
  if (!webVitals || webVitals.length === 0) return null;

  const vitalsMap = webVitals.reduce((acc, metric) => {
    const key = metric.metricName || 'unknown';
    if (!acc[key]) {
      acc[key] = {
        metricName: key,
        avgValue: 0,
        sessionCount: 0,
        goodCount: 0,
        needsImprovement: 0,
        poorCount: 0,
      };
    }
    acc[key].avgValue += (metric.avgMetricValue || 0) * (metric.sessionCount || 0);
    acc[key].sessionCount += metric.sessionCount || 0;
    
    if (metric.metricRating === 'good') acc[key].goodCount += metric.sessionCount || 0;
    else if (metric.metricRating === 'needs-improvement') acc[key].needsImprovement += metric.sessionCount || 0;
    else if (metric.metricRating === 'poor') acc[key].poorCount += metric.sessionCount || 0;
    
    return acc;
  }, {} as Record<string, {
    metricName: string;
    avgValue: number;
    sessionCount: number;
    goodCount: number;
    needsImprovement: number;
    poorCount: number;
  }>);

  const vitals = Object.values(vitalsMap).map((v) => ({
    ...v,
    avgValue: v.sessionCount > 0 ? v.avgValue / v.sessionCount : 0,
    goodPct: v.sessionCount > 0 ? (v.goodCount / v.sessionCount) * 100 : 0,
    poorPct: v.sessionCount > 0 ? (v.poorCount / v.sessionCount) * 100 : 0,
  }));

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Core web vitals
      </Text>
      <div className='space-y-4'>
        {vitals.map((vital) => {
          const isPoorPerformance = vital.poorPct > 25;
          return (
            <div key={vital.metricName} className='space-y-1'>
              <div className='flex justify-between items-center'>
                <Text variant='uppercase' className='text-xs'>{vital.metricName}</Text>
                <div className='flex gap-3 text-xs'>
                  <Text>Avg: {vital.avgValue.toFixed(0)}ms</Text>
                  <Text className={isPoorPerformance ? 'text-error font-bold' : ''}>
                    Poor: {vital.poorPct.toFixed(1)}%
                  </Text>
                </div>
              </div>
              <Tooltip title={getMetricDescription(vital.metricName)} placement='top' arrow>
                <div className='h-4 bg-bgSecondary flex overflow-hidden cursor-help'>
                  <div
                    className='bg-green-600'
                    style={{ width: `${vital.goodPct}%` }}
                    title={`Good: ${vital.goodPct.toFixed(1)}%`}
                  />
                  <div
                    className='bg-yellow-600'
                    style={{ width: `${100 - vital.goodPct - vital.poorPct}%` }}
                    title={`Needs improvement: ${(100 - vital.goodPct - vital.poorPct).toFixed(1)}%`}
                  />
                  <div
                    className='bg-error'
                    style={{ width: `${vital.poorPct}%` }}
                    title={`Poor: ${vital.poorPct.toFixed(1)}%`}
                  />
                </div>
              </Tooltip>
            </div>
          );
        })}
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Target: LCP &lt;2.5s, FID &lt;100ms, CLS &lt;0.1</Text>
      </div>
    </div>
  );
};
