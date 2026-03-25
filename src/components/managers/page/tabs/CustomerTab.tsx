import type { GetMetricsResponse } from 'api/proto-http/admin';
import {
  CategoryLoyaltyTable,
  CohortRetentionTable,
  CrossSellTable,
  EntryProductsTable,
  NewsletterCard,
  OrderSequenceChart,
  SpendingCurveChart,
  TimeSeriesChart,
} from '../components';

interface CustomerTabProps {
  metricsResponse: GetMetricsResponse;
}

export function CustomerTab({ metricsResponse }: CustomerTabProps) {
  const metrics = metricsResponse.business;

  return (
    <div className='space-y-6'>
      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Cohort retention</h3>
        <CohortRetentionTable cohortRetention={metricsResponse.cohortRetention} />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Order sequence & spending curve</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <OrderSequenceChart orderSequence={metricsResponse.orderSequence} />
          <SpendingCurveChart spendingCurve={metricsResponse.spendingCurve} />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Customer trends</h3>
        <div className='grid gap-4 md:grid-cols-2'>
          <TimeSeriesChart
            title='Subscribers by day'
            data={metrics?.subscribersByDay}
            compareData={metrics?.subscribersByDayCompare}
            valueFormat='number'
          />
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

      <CrossSellTable metrics={metrics} />
      <NewsletterCard newsletter={metricsResponse.newsletter} />

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Acquisition & loyalty</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <EntryProductsTable entryProducts={metricsResponse.entryProducts} />
          <CategoryLoyaltyTable categoryLoyalty={metricsResponse.categoryLoyalty} />
        </div>
      </div>
    </div>
  );
}
