import * as Tooltip from '@radix-ui/react-tooltip';
import type { WebVitalMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';

/** Plain-language copy: what shoppers experience, not browser jargon. */
const METRIC_DESCRIPTIONS: Record<string, string> = {
  LCP:
    'How quickly the main thing on the page (hero image, big headline, etc.) becomes visible. If this is slow, people wait on a blank or half-empty screen. Aim for under about 2.5 seconds.',
  FID:
    "Delay between someone's first tap or click and the page actually responding. Lower feels instant; high feels frozen. (Older metric; INP is the usual focus now.) Aim under about 100 ms.",
  INP:
    'How snappy the page feels when people tap buttons, open menus, or type — time until the screen updates after each action. Aim under about 200 ms so interactions feel immediate.',
  CLS:
    'Whether content jumps or shifts while the page is still loading (e.g. a button moves under your finger). Lower is better — stable layouts feel trustworthy. Aim for a low score (under about 0.1).',
  FCP:
    'How soon the first bit of real content appears (text or an image). It’s the first sign that the page is “showing up,” before the main block is fully ready. Aim under about 1.8 seconds.',
  TTFB:
    'How long it takes from asking for the page until the site starts sending data back. Slow here makes everything downstream feel sluggish. Aim under about 800 ms.',
};

function getMetricDescription(metricName: string): string {
  const key = metricName.toUpperCase();
  return METRIC_DESCRIPTIONS[key] ?? `Speed or experience measure for this page (${metricName}). Hover other rows for examples.`;
}

interface WebVitalsCardProps {
  webVitals: WebVitalMetric[] | undefined;
}

export const WebVitalsCard: FC<WebVitalsCardProps> = ({ webVitals }) => {
  if (!webVitals || webVitals.length === 0) return null;

  const vitalsMap = webVitals.reduce(
    (acc, metric) => {
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
      else if (metric.metricRating === 'needs-improvement')
        acc[key].needsImprovement += metric.sessionCount || 0;
      else if (metric.metricRating === 'poor') acc[key].poorCount += metric.sessionCount || 0;

      return acc;
    },
    {} as Record<
      string,
      {
        metricName: string;
        avgValue: number;
        sessionCount: number;
        goodCount: number;
        needsImprovement: number;
        poorCount: number;
      }
    >,
  );

  const vitals = Object.values(vitalsMap).map((v) => ({
    ...v,
    avgValue: v.sessionCount > 0 ? v.avgValue / v.sessionCount : 0,
    goodPct: v.sessionCount > 0 ? (v.goodCount / v.sessionCount) * 100 : 0,
    poorPct: v.sessionCount > 0 ? (v.poorCount / v.sessionCount) * 100 : 0,
  }));

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className='border border-textInactiveColor p-4'>
        <Text variant='uppercase' className='font-bold mb-4 block'>
          Site speed &amp; stability
        </Text>
        <div className='space-y-4'>
          {vitals.map((vital) => {
            const isPoorPerformance = vital.poorPct > 25;
            return (
              <div key={vital.metricName} className='space-y-1'>
                <div className='flex justify-between items-center'>
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <Text
                        variant='uppercase'
                        component='span'
                        className='text-xs cursor-help border-b border-dotted border-textInactiveColor/60'
                      >
                        {vital.metricName}
                      </Text>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        side='top'
                        sideOffset={4}
                        className='rounded border border-textInactiveColor bg-bgColor px-3 py-2 text-sm text-textColor shadow max-w-sm z-50 leading-relaxed'
                      >
                        {getMetricDescription(vital.metricName)}
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                  <div className='flex gap-3 text-xs'>
                    <Text>
                      Avg:{' '}
                      {vital.metricName.toUpperCase() === 'CLS'
                        ? (vital.avgValue / 1000).toFixed(3)
                        : `${vital.avgValue.toFixed(0)}ms`}
                    </Text>
                    <Text className={isPoorPerformance ? 'text-error font-bold' : ''}>
                      Poor: {vital.poorPct.toFixed(1)}%
                    </Text>
                  </div>
                </div>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <div className='h-4 bg-bgSecondary flex overflow-hidden cursor-help'>
                      <div className='bg-green-600' style={{ width: `${vital.goodPct}%` }} />
                      <div
                        className='bg-yellow-600'
                        style={{ width: `${100 - vital.goodPct - vital.poorPct}%` }}
                      />
                      <div className='bg-error' style={{ width: `${vital.poorPct}%` }} />
                    </div>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side='top'
                      sideOffset={4}
                      className='rounded border border-textInactiveColor bg-bgColor px-3 py-2 text-sm text-textColor shadow max-w-sm leading-relaxed'
                    >
                      {getMetricDescription(vital.metricName)}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </div>
            );
          })}
        </div>
        <div className='mt-3 text-xs text-textInactiveColor space-y-1'>
          <Text>
            Green = most visits felt fast/stable; red = a larger share felt slow or jumpy. Hover each label
            for a plain-English explanation and rough targets.
          </Text>
        </div>
      </div>
    </Tooltip.Provider>
  );
};
