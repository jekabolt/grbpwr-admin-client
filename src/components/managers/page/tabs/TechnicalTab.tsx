import type { GetMetricsResponse } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import {
  BrowserBreakdownTable,
  ExceptionsTable,
  FormErrorsTable,
  NotFoundTable,
  PaymentFailuresTable,
  SessionDurationChart,
  UserJourneysTable,
  WebVitalsCard,
} from '../components';

interface TechnicalTabProps {
  metricsResponse: GetMetricsResponse;
}

export function TechnicalTab({ metricsResponse }: TechnicalTabProps) {
  return (
    <div className='space-y-6 opacity-90'>
      <Text className='text-textInactiveColor text-xs border-l-2 border-warning pl-3'>
        This tab is primarily for engineers and site reliability monitoring.
      </Text>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Core Web Vitals</h3>
        <WebVitalsCard webVitals={metricsResponse.webVitals} />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Technical Issues</h3>
        <Text className='text-xs text-textInactiveColor mb-3'>
          High-traffic 404s = broken links hurting SEO and user experience.
        </Text>
        <NotFoundTable notFound={metricsResponse.notFound} />
        <ExceptionsTable exceptions={metricsResponse.exceptions} />
        <FormErrorsTable formErrors={metricsResponse.formErrors} />
        <PaymentFailuresTable paymentFailures={metricsResponse.paymentFailures} />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>User Navigation</h3>
        <UserJourneysTable userJourneys={metricsResponse.userJourneys} />
        <SessionDurationChart sessionDuration={metricsResponse.sessionDuration} />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Browser & Device</h3>
        <BrowserBreakdownTable browserBreakdown={metricsResponse.browserBreakdown} />
      </div>
    </div>
  );
}
