import { common_PromoCode } from 'api/proto-http/admin';
import { FC } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { PromoTable } from './components/promo-table';
import { useInfinitePromo } from './components/usePromoQuery';

export const Promo: FC = () => {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfinitePromo();
  const promos = data?.pages.flatMap((page) => page.promoCodes as common_PromoCode[]) || [];

  return (
    <div className='flex flex-col gap-10'>
      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading promo codes…
          </Text>
        </div>
      ) : (
        <>
          <PromoTable promos={promos} />
          {/* H3: fetchNextPage/hasNextPage were previously destructured but never
              used — any store with more than one page of promo codes silently
              could only see (and manage) the first page. */}
          {hasNextPage && (
            <div className='flex justify-center py-2'>
              <Button
                type='button'
                size='lg'
                variant='simple'
                className='uppercase'
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'loading…' : 'load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
