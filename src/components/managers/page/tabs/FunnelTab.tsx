import type { GetMetricsResponse } from 'api/proto-http/admin';
import { Link, useLocation } from 'react-router-dom';
import {
  AbandonedCartCard,
  AddToCartRateMatrixChart,
  AddToCartRateTable,
  AddToCartRateTrendChart,
  CheckoutTimingsCard,
  ConversionHealthSnapshot,
  DeviceFunnelChart,
  FunnelChart,
  HeroFunnelChart,
  PaymentRecoveryCard,
  ReturnByProductChart,
} from '../components';
import Text from 'ui/components/text';

interface FunnelTabProps {
  metricsResponse: GetMetricsResponse;
  compareEnabled?: boolean;
}

export function FunnelTab({ metricsResponse, compareEnabled = false }: FunnelTabProps) {
  const { pathname } = useLocation();
  const atcMatrixHref = `${pathname}?tab=products#atc-matrix`;

  const hasAddToCartRateAnalysis =
    (metricsResponse.addToCartRateAnalysis?.products?.length ?? 0) > 0 ||
    (metricsResponse.addToCartRateAnalysis?.globalTrend?.length ?? 0) > 0;

  return (
    <div className='space-y-6'>
      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Conversion funnel</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <FunnelChart funnel={metricsResponse.funnel} compareEnabled={compareEnabled} />
          <div className='space-y-4'>
            <CheckoutTimingsCard checkoutTimings={metricsResponse.checkoutTimings} />
          </div>
        </div>
        <ConversionHealthSnapshot
          webVitals={metricsResponse.webVitals}
          notFound={metricsResponse.notFound}
          exceptions={metricsResponse.exceptions}
        />
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Abandonment &amp; returns</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <AbandonedCartCard abandonedCart={metricsResponse.abandonedCart} />
          <ReturnByProductChart returnByProduct={metricsResponse.returnByProduct} />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Homepage banner funnel & recovery</h3>
        <div className='grid gap-6 md:grid-cols-2'>
          <HeroFunnelChart heroFunnel={metricsResponse.heroFunnel} compareEnabled={compareEnabled} />
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
        <Text className='text-textInactiveColor text-xs leading-relaxed'>
          For the full add-to-cart chart on the Products tab:{' '}
          <Link to={atcMatrixHref} replace className='underline underline-offset-2 hover:text-textColor'>
            Open Products — add-to-cart performance
          </Link>
          .
        </Text>
      </div>
    </div>
  );
}
