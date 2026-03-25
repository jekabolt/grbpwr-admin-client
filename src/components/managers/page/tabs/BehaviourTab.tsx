import type { GetMetricsResponse } from 'api/proto-http/admin';
import {
  DetailsExpansionTable,
  ImageSwipesTable,
  NotifyMeIntentTable,
  ProductZoomTable,
  SizeGuideClicksTable,
  TimeOnPageTable,
  UserJourneysTable,
} from '../components';

interface BehaviourTabProps {
  metricsResponse: GetMetricsResponse;
}

export function BehaviourTab({ metricsResponse }: BehaviourTabProps) {
  return (
    <div className='space-y-6'>
      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>User journeys</h3>
        <UserJourneysTable userJourneys={metricsResponse.userJourneys} />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Page engagement</h3>
        <TimeOnPageTable timeOnPage={metricsResponse.timeOnPage} />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Product interactions</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <ProductZoomTable productZoom={metricsResponse.productZoom} />
          <ImageSwipesTable imageSwipes={metricsResponse.imageSwipes} />
        </div>
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
