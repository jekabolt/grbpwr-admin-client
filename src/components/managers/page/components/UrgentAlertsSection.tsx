import type { GetMetricsResponse } from 'api/proto-http/admin';
import { FC } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

const REVENUE_CONCENTRATION_TOP_N = 3;
const REVENUE_CONCENTRATION_ALERT_PCT = 80;
const OOS_TOTAL_LOST_REVENUE_ALERT = 500;
const ABANDONMENT_RATE_ALERT_PCT = 70;
const PAYMENT_FAILURE_COUNT_ALERT = 5;
const PAYMENT_FAILURE_VALUE_ALERT = 1000;

interface UrgentAlertsSectionProps {
  metricsResponse: GetMetricsResponse;
}

export const UrgentAlertsSection: FC<UrgentAlertsSectionProps> = ({ metricsResponse }) => {
  const { pathname } = useLocation();
  const technicalHref = `${pathname}?tab=technical`;

  const notFound = metricsResponse.notFound || [];
  const exceptions = metricsResponse.exceptions || [];
  const oosImpact = metricsResponse.oosImpact || [];

  const top404 = notFound.reduce(
    (acc, metric) => {
      const path = metric.pagePath || 'unknown';
      if (!acc[path]) {
        acc[path] = { pagePath: path, hitCount: 0 };
      }
      acc[path].hitCount += metric.hitCount || 0;
      return acc;
    },
    {} as Record<string, { pagePath: string; hitCount: number }>,
  );

  const top404s = Object.values(top404)
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, 3);

  const checkoutExceptions = exceptions
    .filter((ex) => {
      const path = (ex.pagePath || '').toLowerCase();
      return path.includes('checkout') || path.includes('payment') || path.includes('cart');
    })
    .reduce(
      (acc, metric) => {
        const key = `${metric.pagePath}-${metric.description}`;
        if (!acc[key]) {
          acc[key] = {
            pagePath: metric.pagePath,
            description: metric.description,
            exceptionCount: 0,
          };
        }
        acc[key].exceptionCount += metric.exceptionCount || 0;
        return acc;
      },
      {} as Record<
        string,
        {
          pagePath: string | undefined;
          description: string | undefined;
          exceptionCount: number;
        }
      >,
    );

  const topCheckoutExceptions = Object.values(checkoutExceptions)
    .sort((a, b) => b.exceptionCount - a.exceptionCount)
    .slice(0, 3);

  const oosAggregated = oosImpact.reduce(
    (acc, metric) => {
      const key = `${metric.productId}-${metric.sizeId}`;
      if (!acc[key]) {
        acc[key] = {
          productId: metric.productId,
          productName: metric.productName,
          sizeId: metric.sizeId,
          sizeName: metric.sizeName,
          clickCount: 0,
          estimatedLostRevenue: 0,
        };
      }
      acc[key].clickCount += metric.clickCount || 0;
      acc[key].estimatedLostRevenue += parseDecimal(metric.estimatedLostRevenue);
      return acc;
    },
    {} as Record<
      string,
      {
        productId: string | undefined;
        productName: string | undefined;
        sizeId: number | undefined;
        sizeName: string | undefined;
        clickCount: number;
        estimatedLostRevenue: number;
      }
    >,
  );

  const topOOS = Object.values(oosAggregated)
    .sort((a, b) => b.estimatedLostRevenue - a.estimatedLostRevenue)
    .slice(0, 3);

  const totalOOSLostRevenue = Object.values(oosAggregated).reduce(
    (sum, r) => sum + r.estimatedLostRevenue,
    0,
  );
  const showOOSTotal = totalOOSLostRevenue >= OOS_TOTAL_LOST_REVENUE_ALERT;

  const revenuePareto = metricsResponse.revenuePareto || [];
  const topNPareto = revenuePareto
    .slice()
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .slice(0, REVENUE_CONCENTRATION_TOP_N);
  const topNCumulativePct =
    topNPareto.length > 0 ? (topNPareto[topNPareto.length - 1].cumulativePct ?? 0) : 0;
  const showConcentration =
    topNPareto.length >= REVENUE_CONCENTRATION_TOP_N &&
    topNCumulativePct > REVENUE_CONCENTRATION_ALERT_PCT;

  const abandonedCart = metricsResponse.abandonedCart || [];
  const avgAbandonmentRate =
    abandonedCart.length > 0
      ? abandonedCart.reduce((s, r) => s + (r.abandonmentRate ?? 0), 0) / abandonedCart.length
      : 0;
  const showAbandonment = abandonedCart.length > 0 && avgAbandonmentRate >= ABANDONMENT_RATE_ALERT_PCT;

  const paymentFailures = metricsResponse.paymentFailures || [];
  const totalFailureCount = paymentFailures.reduce((s, r) => s + (r.failureCount ?? 0), 0);
  const totalFailedValue = paymentFailures.reduce(
    (s, r) => s + parseDecimal(r.totalFailedValue),
    0,
  );
  const topFailures = paymentFailures
    .reduce(
      (acc, r) => {
        const key = r.errorCode ?? 'unknown';
        if (!acc[key]) {
          acc[key] = { errorCode: key, paymentType: r.paymentType, failureCount: 0, totalFailedValue: 0 };
        }
        acc[key].failureCount += r.failureCount ?? 0;
        acc[key].totalFailedValue += parseDecimal(r.totalFailedValue);
        return acc;
      },
      {} as Record<string, { errorCode: string; paymentType: string | undefined; failureCount: number; totalFailedValue: number }>,
    );
  const topFailureRows = Object.values(topFailures)
    .sort((a, b) => b.totalFailedValue - a.totalFailedValue)
    .slice(0, 3);
  const showPaymentFailures =
    totalFailureCount >= PAYMENT_FAILURE_COUNT_ALERT ||
    totalFailedValue >= PAYMENT_FAILURE_VALUE_ALERT;

  const hasAnyAlerts =
    top404s.length > 0 ||
    topCheckoutExceptions.length > 0 ||
    topOOS.length > 0 ||
    showOOSTotal ||
    showConcentration ||
    showAbandonment ||
    showPaymentFailures;

  if (!hasAnyAlerts) return null;

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' className='font-bold text-sm'>
          Urgent alerts
        </Text>
        <Link
          to={technicalHref}
          replace
          className='text-xs underline underline-offset-2 text-textInactiveColor hover:text-textColor'
        >
          View all in Site Health →
        </Link>
      </div>

      <div className='space-y-3'>
        {top404s.length > 0 && (
          <div className='border border-error/40 bg-error/5 p-3'>
            <Text className='text-error font-semibold text-xs mb-2'>Top 404 Errors</Text>
            <div className='space-y-1'>
              {top404s.map((row, idx) => (
                <div key={idx} className='flex justify-between items-center text-xs'>
                  <Text className='font-mono text-[10px] truncate max-w-[300px]' title={row.pagePath}>
                    {row.pagePath}
                  </Text>
                  <Text className='font-bold text-error ml-2'>{formatNumber(row.hitCount)}</Text>
                </div>
              ))}
            </div>
          </div>
        )}

        {topCheckoutExceptions.length > 0 && (
          <div className='border border-error/40 bg-error/5 p-3'>
            <Text className='text-error font-semibold text-xs mb-2'>
              Checkout/Payment Exceptions
            </Text>
            <div className='space-y-1'>
              {topCheckoutExceptions.map((row, idx) => (
                <div key={idx} className='text-xs space-y-0.5'>
                  <div className='flex justify-between items-start'>
                    <Text className='truncate max-w-[250px]' title={row.description || ''}>
                      {row.description || '-'}
                    </Text>
                    <Text className='font-bold text-error ml-2'>
                      {formatNumber(row.exceptionCount)}
                    </Text>
                  </div>
                  <Text className='font-mono text-[9px] text-textInactiveColor truncate max-w-[300px]'>
                    {row.pagePath || '-'}
                  </Text>
                </div>
              ))}
            </div>
          </div>
        )}

        {topOOS.length > 0 && (
          <div className='border border-warning/40 bg-warning/5 p-3'>
            <Text className='text-warning font-semibold text-xs mb-2'>
              Out-of-Stock High Demand Items
            </Text>
            <div className='space-y-1'>
              {topOOS.map((row, idx) => (
                <div key={idx} className='flex justify-between items-center text-xs'>
                  <div className='flex-1 min-w-0'>
                    <Text className='truncate max-w-[200px]' title={row.productName || ''}>
                      {row.productName || `#${row.productId}`}
                    </Text>
                    <Text className='text-[10px] text-textInactiveColor'>{row.sizeName}</Text>
                  </div>
                  <div className='text-right ml-2'>
                    <Text className='font-bold'>{formatNumber(row.clickCount)} clicks</Text>
                    <Text className='text-[10px] text-error'>
                      {formatCurrency(row.estimatedLostRevenue)} lost
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showOOSTotal && (
          <div className='border border-warning/40 bg-warning/5 p-3'>
            <Text className='text-warning font-semibold text-xs mb-1'>
              Total Estimated Lost Revenue from Out-of-Stock
            </Text>
            <Text className='text-xs'>
              <span className='font-bold text-error'>{formatCurrency(totalOOSLostRevenue)}</span>
              {' '}in potential sales lost across{' '}
              {formatNumber(Object.keys(oosAggregated).length)} product-size combinations
            </Text>
            <Text className='text-[10px] text-textInactiveColor mt-1'>
              Restock high-demand items to recover this revenue.
            </Text>
          </div>
        )}

        {showConcentration && (
          <div className='border border-warning/40 bg-warning/5 p-3'>
            <Text className='text-warning font-semibold text-xs mb-1'>
              Revenue Concentration Risk
            </Text>
            <Text className='text-xs'>
              Top {REVENUE_CONCENTRATION_TOP_N} products account for{' '}
              <span className='font-bold'>{topNCumulativePct.toFixed(0)}%</span> of total revenue
            </Text>
            <div className='space-y-0.5 mt-2'>
              {topNPareto.map((row, idx) => (
                <div key={idx} className='flex justify-between items-center text-xs'>
                  <Text className='truncate max-w-[200px]' title={row.productName || ''}>
                    {row.productName || `#${row.productId}`}
                  </Text>
                  <Text className='font-bold ml-2'>{formatCurrency(parseDecimal(row.revenue))}</Text>
                </div>
              ))}
            </div>
            <Text className='text-[10px] text-textInactiveColor mt-1'>
              Diversify bestsellers to reduce dependency on a narrow product mix.
            </Text>
          </div>
        )}

        {showAbandonment && (
          <div className='border border-warning/40 bg-warning/5 p-3'>
            <Text className='text-warning font-semibold text-xs mb-1'>
              Cart Abandonment Spike
            </Text>
            <Text className='text-xs'>
              Average abandonment rate is{' '}
              <span className='font-bold text-error'>{avgAbandonmentRate.toFixed(0)}%</span>
              {' '}across {formatNumber(abandonedCart.length)} period(s)
            </Text>
            <Text className='text-[10px] text-textInactiveColor mt-1'>
              Review checkout friction, shipping costs, and payment options.
            </Text>
          </div>
        )}

        {showPaymentFailures && (
          <div className='border border-error/40 bg-error/5 p-3'>
            <Text className='text-error font-semibold text-xs mb-1'>
              Payment Failures
            </Text>
            <Text className='text-xs mb-2'>
              <span className='font-bold'>{formatNumber(totalFailureCount)}</span> failed attempts
              {' '}totalling <span className='font-bold text-error'>{formatCurrency(totalFailedValue)}</span>
            </Text>
            {topFailureRows.length > 0 && (
              <div className='space-y-1'>
                {topFailureRows.map((row, idx) => (
                  <div key={idx} className='flex justify-between items-center text-xs'>
                    <div className='flex-1 min-w-0'>
                      <Text className='font-mono text-[10px] truncate max-w-[200px]'>
                        {row.errorCode}
                      </Text>
                      {row.paymentType && (
                        <Text className='text-[9px] text-textInactiveColor'>{row.paymentType}</Text>
                      )}
                    </div>
                    <div className='text-right ml-2'>
                      <Text className='font-bold text-error'>
                        {formatCurrency(row.totalFailedValue)}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Text className='text-[10px] text-textInactiveColor mt-1'>
              Check payment gateway status and retry mechanisms.
            </Text>
          </div>
        )}
      </div>

      <Text className='text-textInactiveColor text-[10px]'>
        Critical issues requiring immediate attention — detailed breakdown in Site Health tab
      </Text>
    </div>
  );
};
