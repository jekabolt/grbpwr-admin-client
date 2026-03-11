import { common_PromoCode } from 'api/proto-http/admin';
import { FC } from 'react';
import { PromoTable } from './components/promo-table';
import { useInfinitePromo } from './components/usePromoQuery';

export const Promo: FC = () => {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfinitePromo();
  const promos = data?.pages.flatMap((page) => page.promoCodes as common_PromoCode[]) || [];

  return (
    <div className='flex flex-col gap-10'>
      <PromoTable promos={promos} />
    </div>
  );
};
