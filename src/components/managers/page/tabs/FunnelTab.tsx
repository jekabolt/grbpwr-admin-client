import type { GetMetricsResponse } from 'api/proto-http/admin';
import {
  AbandonedCartCard,
  AddToCartRateMatrixChart,
  AddToCartRateTable,
  AddToCartRateTrendChart,
  CheckoutTimingsCard,
  DeviceFunnelChart,
  FunnelChart,
  HeroFunnelChart,
  PaymentRecoveryCard,
} from '../components';

interface FunnelTabProps {
  metricsResponse: GetMetricsResponse;
}

export function FunnelTab({ metricsResponse }: FunnelTabProps) {
  const hasAddToCartRateAnalysis =
    (metricsResponse.addToCartRateAnalysis?.products?.length ?? 0) > 0 ||
    (metricsResponse.addToCartRateAnalysis?.globalTrend?.length ?? 0) > 0;

  return (
    <div className='space-y-6'>
      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Conversion funnel</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <FunnelChart funnel={metricsResponse.funnel} />
          <div className='space-y-4'>
            <AbandonedCartCard abandonedCart={metricsResponse.abandonedCart} />
            <CheckoutTimingsCard checkoutTimings={metricsResponse.checkoutTimings} />
          </div>
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Hero funnel & recovery</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <HeroFunnelChart heroFunnel={metricsResponse.heroFunnel} />
          <PaymentRecoveryCard paymentRecovery={metricsResponse.paymentRecovery} />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Device funnel</h3>
        <DeviceFunnelChart deviceFunnel={metricsResponse.deviceFunnel} />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Add to cart rate</h3>
        {hasAddToCartRateAnalysis ? (
          <>
            <AddToCartRateMatrixChart addToCartRateAnalysis={metricsResponse.addToCartRateAnalysis} />
            <AddToCartRateTrendChart addToCartRateAnalysis={metricsResponse.addToCartRateAnalysis} />
          </>
        ) : (
          <AddToCartRateTable addToCartRate={metricsResponse.addToCartRate} />
        )}
      </div>
    </div>
  );
}
