import type { GetMetricsResponse } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import {
  CategoryLoyaltyTable,
  CohortRetentionTable,
  CrossSellTable,
  CustomerSegmentsTable,
  EntryProductsTable,
  KpiCards,
  OrderSequenceChart,
  RFMAnalysisTable,
  SpendingCurveChart,
  TimeSeriesChart,
} from '../components';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface AudienceTabProps {
  metricsResponse: GetMetricsResponse;
  compareEnabled: boolean;
}

export function AudienceTab({ metricsResponse, compareEnabled }: AudienceTabProps) {
  const metrics = metricsResponse.business;

  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <h3 className='text-sm font-bold uppercase'>Email Performance</h3>
        <Text className='text-xs text-textInactiveColor leading-relaxed'>
          Email delivery, open rates, and click-through performance from your marketing campaigns
        </Text>
        <KpiCards
          metrics={metrics}
          compareEnabled={compareEnabled}
          visibleGroupIds={['email']}
        />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>New vs returning customers</h3>
        <div className='grid gap-4 md:grid-cols-2'>
          <TimeSeriesChart
            title='New customers by day'
            data={metrics?.newCustomersByDay}
            compareData={metrics?.newCustomersByDayCompare}
            valueFormat='number'
          />
          <TimeSeriesChart
            title='Returning customers by day'
            data={metrics?.returningCustomersByDay}
            compareData={metrics?.returningCustomersByDayCompare}
            valueFormat='number'
          />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold leading-snug'>
          Do customers come back? (Month 1–6)
        </h3>
        <Text className='text-xs text-textInactiveColor leading-relaxed mb-3 max-w-2xl'>
          This shows how many customers from each cohort month placed another order in following months.
          All zeros in recent columns means those customers haven't had time yet — this fills in as months pass.
        </Text>
        <CohortRetentionTable cohortRetention={metricsResponse.cohortRetention} />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Do customers spend more over time?</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <OrderSequenceChart orderSequence={metricsResponse.orderSequence} />
          <SpendingCurveChart spendingCurve={metricsResponse.spendingCurve} />
        </div>
      </div>

      <CrossSellTable metrics={metrics} />

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Acquisition & loyalty</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <EntryProductsTable entryProducts={metricsResponse.entryProducts} />
          <CategoryLoyaltyTable categoryLoyalty={metricsResponse.categoryLoyalty} />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Customer Lifetime Value</h3>
        <div className='border border-textInactiveColor p-4'>
          {(() => {
            const clvDistribution = metrics?.clvDistribution;
            if (!clvDistribution) return null;

            const sampleSize = clvDistribution.sampleSize ?? 0;
            const showWarning = sampleSize < 5;
            const hideStats = sampleSize < 3;

            if (hideStats) {
              return (
                <div className='flex flex-col gap-2'>
                  <Text className='text-warning text-sm'>
                    Insufficient data for distribution analysis (n={sampleSize})
                  </Text>
                  <Text className='text-textInactiveColor text-xs'>
                    At least 3 samples required for meaningful statistics
                  </Text>
                </div>
              );
            }

            return (
              <>
                {showWarning && (
                  <div className='mb-3 p-2 border border-warning bg-warning/10'>
                    <Text className='text-warning text-xs'>
                      Insufficient data for distribution analysis (n={sampleSize})
                    </Text>
                  </div>
                )}
                <div className='grid grid-cols-3 gap-4'>
                  <div>
                    <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                      Average
                    </Text>
                    <Text className='font-bold'>
                      {formatCurrency(parseDecimal(clvDistribution.mean))}
                    </Text>
                  </div>
                  <div>
                    <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                      Median
                    </Text>
                    <Text className='font-bold'>
                      {formatCurrency(parseDecimal(clvDistribution.median))}
                    </Text>
                  </div>
                  <div>
                    <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                      90th percentile
                    </Text>
                    <Text className='font-bold'>
                      {formatCurrency(parseDecimal(clvDistribution.p90))}
                    </Text>
                  </div>
                </div>
                <div className='mt-3 pt-3 border-t border-textInactiveColor'>
                  <Text className='text-textInactiveColor text-[10px]'>
                    Sample size: {formatNumber(sampleSize)}
                  </Text>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Customer trends</h3>
        <div className='max-w-xl'>
          <TimeSeriesChart
            title='Email opt-ins by day'
            data={metrics?.subscribersByDay}
            compareData={metrics?.subscribersByDayCompare}
            valueFormat='number'
          />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Customer Segments</h3>
        <Text className='text-xs text-textInactiveColor leading-relaxed'>
          Customers grouped by purchasing behaviour — segment labels reflect order frequency and spend level
        </Text>
        <CustomerSegmentsTable customerSegments={metricsResponse.customerSegments} />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>RFM Analysis</h3>
        <Text className='text-xs text-textInactiveColor leading-relaxed'>
          Recency-Frequency-Monetary scoring identifies your most valuable customers and those at risk of churning
        </Text>
        <RFMAnalysisTable rfmAnalysis={metricsResponse.rfmAnalysis} />
      </div>
    </div>
  );
}
