import type { GetMetricsResponse } from 'api/proto-http/admin';
import { Link, useLocation } from 'react-router-dom';
import Text from 'ui/components/text';
import {
  DetailsExpansionTable,
  NotifyMeIntentTable,
  SizeGuideClicksTable,
  UserJourneysTable,
} from '../components';

interface BehaviourTabProps {
  metricsResponse: GetMetricsResponse;
}

export function BehaviourTab({ metricsResponse }: BehaviourTabProps) {
  const { pathname } = useLocation();
  const productsHref = `${pathname}?tab=products#product-engagement`;

  return (
    <div className='space-y-6'>
      <Text className='text-textInactiveColor text-xs'>
        Time on page, image zoom, and gallery swipes are under{' '}
        <Link to={productsHref} replace className='underline underline-offset-2 hover:text-textColor'>
          Products &amp; Inventory
        </Link>{' '}
        → Product engagement (same SKU context as sales metrics).
      </Text>
      <div className='space-y-6'>
        <UserJourneysTable userJourneys={metricsResponse.userJourneys} />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Size &amp; PDP detail use</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <SizeGuideClicksTable sizeGuideClicks={metricsResponse.sizeGuideClicks} />
          <DetailsExpansionTable detailsExpansion={metricsResponse.detailsExpansion} />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Restock demand</h3>
        <NotifyMeIntentTable notifyMeIntent={metricsResponse.notifyMeIntent} />
      </div>
    </div>
  );
}
