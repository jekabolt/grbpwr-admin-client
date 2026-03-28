import type { AddToCartRateAnalysis, ProductTrendRow } from 'api/proto-http/admin';
import { FC } from 'react';
import { useLocation, Link } from 'react-router-dom';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface ProductActionItemsProps {
  productTrend: ProductTrendRow[] | undefined;
  addToCartRateAnalysis: AddToCartRateAnalysis | undefined;
}

function currentRevenue(p: ProductTrendRow): number {
  return parseDecimal(p.currentRevenue);
}

function previousRevenue(p: ProductTrendRow): number {
  return parseDecimal(p.previousRevenue);
}

export const ProductActionItems: FC<ProductActionItemsProps> = ({
  productTrend,
  addToCartRateAnalysis,
}) => {
  const { pathname } = useLocation();
  const atcMatrixHref = `${pathname}?tab=products-inventory#atc-matrix`;

  const declining = (productTrend || [])
    .filter((p) => (p.changePct || 0) < 0 && currentRevenue(p) > 0)
    .sort((a, b) => (a.changePct || 0) - (b.changePct || 0))
    .slice(0, 5);

  const noSales = (productTrend || [])
    .filter(
      (p) =>
        currentRevenue(p) <= 0 && (previousRevenue(p) > 0 || (p.previousUnits || 0) > 0),
    )
    .sort((a, b) => previousRevenue(b) - previousRevenue(a))
    .slice(0, 5);

  const avgViewCount = addToCartRateAnalysis?.avgViewCount ?? 0;
  const avgCartRatePct = (addToCartRateAnalysis?.avgCartRate ?? 0) * 100;

  const hiddenGems = (addToCartRateAnalysis?.products || [])
    .map((p) => {
      const viewCount = p.viewCount ?? 0;
      const cartRatePct = (p.cartRate ?? 0) * 100;
      const aboveAvgViews = viewCount >= avgViewCount;
      const aboveAvgRate = cartRatePct >= avgCartRatePct;
      const isHiddenGem = !aboveAvgViews && aboveAvgRate;
      return { ...p, viewCount, cartRatePct, isHiddenGem };
    })
    .filter((p) => p.isHiddenGem)
    .sort((a, b) => b.cartRatePct - a.cartRatePct)
    .slice(0, 5);

  const hasAnyActionItems = declining.length > 0 || noSales.length > 0 || hiddenGems.length > 0;

  if (!hasAnyActionItems) return null;

  return (
    <div className='space-y-4'>
      <Text variant='uppercase' className='font-bold text-sm'>
        Action Items
      </Text>
      <Text className='text-xs text-textInactiveColor leading-relaxed'>
        Products requiring decisions today — declining sales, no recent sales, or hidden opportunities
      </Text>

      <div className='grid gap-4 lg:grid-cols-3'>
        {declining.length > 0 && (
          <div className='border border-warning/40 bg-warning/5 p-4'>
            <Text className='font-semibold text-sm mb-3 uppercase'>Declining</Text>
            <div className='space-y-2'>
              {declining.map((row, idx) => {
                const changePct = row.changePct || 0;
                return (
                  <div key={idx} className='text-xs space-y-0.5'>
                    <ProductNameLink
                      productId={row.productId}
                      productName={row.productName}
                      maxWidth='180px'
                    />
                    <div className='flex justify-between'>
                      <Text className='text-textInactiveColor text-[10px]'>
                        {formatNumber(row.previousUnits || 0)} → {formatNumber(row.currentUnits || 0)} units
                      </Text>
                      <Text className='text-error font-bold text-[10px]'>
                        {changePct.toFixed(1)}%
                      </Text>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {noSales.length > 0 && (
          <div className='border border-error/40 bg-error/5 p-4'>
            <Text className='font-semibold text-sm mb-3 uppercase'>No Sales</Text>
            <div className='space-y-2'>
              {noSales.map((row, idx) => (
                <div key={idx} className='text-xs space-y-0.5'>
                  <ProductNameLink
                    productId={row.productId}
                    productName={row.productName}
                    maxWidth='180px'
                  />
                  <Text className='text-textInactiveColor text-[10px]'>
                    Prev: {formatCurrency(parseDecimal(row.previousRevenue))} ({formatNumber(row.previousUnits || 0)} units)
                  </Text>
                </div>
              ))}
            </div>
          </div>
        )}

        {hiddenGems.length > 0 && (
          <div className='border border-green-600/40 bg-green-600/5 p-4'>
            <Text className='font-semibold text-sm mb-3 uppercase text-green-700'>
              Hidden Gems
            </Text>
            <Text className='text-[10px] text-textInactiveColor mb-2'>
              High cart rate, low traffic —{' '}
              <Link to={atcMatrixHref} replace className='underline hover:text-textColor'>
                boost visibility
              </Link>
            </Text>
            <div className='space-y-2'>
              {hiddenGems.map((row, idx) => (
                <div key={idx} className='text-xs space-y-0.5'>
                  <ProductNameLink
                    productId={row.productId}
                    productName={row.productName}
                    maxWidth='180px'
                  />
                  <div className='flex justify-between'>
                    <Text className='text-textInactiveColor text-[10px]'>
                      {formatNumber(row.viewCount)} views
                    </Text>
                    <Text className='text-green-700 font-bold text-[10px]'>
                      {row.cartRatePct.toFixed(1)}% cart rate
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
