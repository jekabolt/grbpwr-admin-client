import { useInfiniteFittings } from 'components/managers/fittings/components/useFittingQuery';
import { formatFittingDate } from 'components/managers/fittings/components/utils';
import { Link } from 'react-router-dom';
import { Button, Text } from 'ui';

const ROW = 'flex h-8.25 items-center justify-between gap-3 border-b border-ink px-2';

/**
 * The model's fittings as rows of the fill system: 33px, ink rule, the fitting left in ink, its
 * date right in `placeholder` grey; a row is the link to the fitting. Same data as
 * `FittingsReadonlyList` (which other screens keep as it is).
 */
export function ModelFittingRows({ modelId }: { modelId: number }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteFittings(
    { modelId },
    20,
  );
  const fittings = data?.pages.flatMap((page) => page.fittings ?? []) ?? [];

  if (isLoading) {
    return (
      <div className={ROW}>
        <Text className='animate-pulse text-placeholder'>loading…</Text>
      </div>
    );
  }

  if (fittings.length === 0) {
    return (
      <div className={ROW}>
        <Text className='text-placeholder'>No fittings</Text>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      {fittings.map((fitting) => {
        const id = fitting.id ?? 0;
        const productId = fitting.fitting?.productId;
        return (
          <Link
            key={id}
            to={`/fittings/${id}`}
            className={`${ROW} text-textBaseSize text-ink hover:border-highlightColor focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink`}
          >
            <span className='min-w-0 truncate'>
              Fitting #{id}
              {productId ? ` · product #${productId}` : ''}
            </span>
            <span className='shrink-0 text-placeholder tabular-nums'>
              {formatFittingDate(fitting.fitting?.fittingDate)}
            </span>
          </Link>
        );
      })}
      {hasNextPage && (
        <Button
          type='button'
          variant='default'
          className='h-8.25 w-full cursor-pointer text-placeholder hover:text-ink'
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          more
        </Button>
      )}
    </div>
  );
}
