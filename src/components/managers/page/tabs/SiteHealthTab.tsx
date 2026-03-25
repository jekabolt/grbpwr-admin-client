import type { GetMetricsResponse } from 'api/proto-http/admin';
import {
  BrowserBreakdownTable,
  ExceptionsTable,
  FormErrorsTable,
  NotFoundTable,
  PaymentFailuresTable,
  SessionDurationChart,
  WebVitalsCard,
} from '../components';

interface SiteHealthTabProps {
  metricsResponse: GetMetricsResponse;
}

export function SiteHealthTab({ metricsResponse }: SiteHealthTabProps) {
  return (
    <div className='space-y-6'>
      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Page performance</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <WebVitalsCard webVitals={metricsResponse.webVitals} />
        </div>
        <BrowserBreakdownTable browserBreakdown={metricsResponse.browserBreakdown} />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Technical issues</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <FormErrorsTable formErrors={metricsResponse.formErrors} />
          <ExceptionsTable exceptions={metricsResponse.exceptions} />
        </div>
        <div className='grid gap-6 md:grid-cols-2'>
          <NotFoundTable notFound={metricsResponse.notFound} />
          <PaymentFailuresTable paymentFailures={metricsResponse.paymentFailures} />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>UX engagement</h3>
        <SessionDurationChart sessionDuration={metricsResponse.sessionDuration} />
      </div>
    </div>
  );
}
