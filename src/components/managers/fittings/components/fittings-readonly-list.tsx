import { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { Link, useNavigate } from 'react-router-dom';
import Text from 'ui/components/text';
import { useInfiniteFittings } from './useFittingQuery';
import { formatFittingDate, statusLabel, verdictLabel } from './utils';

type Props = {
  productId?: number;
  modelId?: number;
};

// Read-only fittings list, scoped by product or by model. Reused on the model
// edit page and on the product page.
export function FittingsReadonlyList({ productId, modelId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteFittings(
    { productId, modelId },
    20,
  );
  const { ref, inView } = useInView({ rootMargin: '200px' });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const fittings = data?.pages.flatMap((page) => page.fittings) ?? [];

  const showProduct = !productId;
  const showModel = !modelId;

  if (isLoading) {
    return (
      <Text variant='inactive' className='animate-pulse'>
        loading fittings…
      </Text>
    );
  }

  if (fittings.length === 0) {
    return (
      <Text variant='inactive' className='uppercase'>
        no fittings yet
      </Text>
    );
  }

  const headers = [
    'date',
    ...(showProduct ? ['product'] : []),
    ...(showModel ? ['model'] : []),
    'status',
    'verdict',
    'sizes',
    'photos',
    '',
  ];

  return (
    <div className='w-full'>
      {/* Desktop table */}
      <div className='hidden w-full overflow-x-auto lg:block'>
        <table className='w-full border-collapse border border-textColor'>
        <thead className='bg-textInactiveColor'>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className='border border-textColor px-2 py-1 text-left'>
                <Text variant='uppercase' size='small'>
                  {h}
                </Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fittings.map((fitting) => {
            const id = fitting.id ?? 0;
            const insert = fitting.fitting;
            return (
              <tr
                key={id}
                role='button'
                tabIndex={0}
                onClick={() => navigate(`/fittings/${id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/fittings/${id}`)}
                className='cursor-pointer border-b border-textColor transition-colors hover:bg-highlightColor/5'
              >
                <td className='border border-textColor px-2 py-1'>
                  <Text>{formatFittingDate(insert?.fittingDate)}</Text>
                </td>
                {showProduct && (
                  <td className='border border-textColor px-2 py-1'>
                    {insert?.productId ? (
                      <Link
                        to={`/products/${insert.productId}`}
                        onClick={(e) => e.stopPropagation()}
                        className='underline'
                      >
                        <Text>#{insert.productId}</Text>
                      </Link>
                    ) : (
                      <Text>—</Text>
                    )}
                  </td>
                )}
                {showModel && (
                  <td className='border border-textColor px-2 py-1'>
                    {insert?.modelId ? (
                      <Link
                        to={`/models/${insert.modelId}`}
                        onClick={(e) => e.stopPropagation()}
                        className='underline'
                      >
                        <Text>#{insert.modelId}</Text>
                      </Link>
                    ) : (
                      <Text>—</Text>
                    )}
                  </td>
                )}
                <td className='border border-textColor px-2 py-1'>
                  <Text>{statusLabel(insert?.status)}</Text>
                </td>
                <td className='border border-textColor px-2 py-1'>
                  <Text>{verdictLabel(insert?.verdict)}</Text>
                </td>
                <td className='border border-textColor px-2 py-1'>
                  <Text>{insert?.sizes?.length ?? 0}</Text>
                </td>
                <td className='border border-textColor px-2 py-1'>
                  <Text>{fitting.media?.length ?? 0}</Text>
                </td>
                <td className='border border-textColor px-2 py-1 text-right'>
                  <Text variant='underlined'>open</Text>
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className='flex flex-col gap-2 lg:hidden'>
        {fittings.map((fitting) => {
          const id = fitting.id ?? 0;
          const insert = fitting.fitting;
          return (
            <div
              key={id}
              role='button'
              tabIndex={0}
              onClick={() => navigate(`/fittings/${id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/fittings/${id}`)}
              className='flex cursor-pointer flex-col gap-0.5 border border-textColor p-3'
            >
              <Text>
                {formatFittingDate(insert?.fittingDate)}
                {showProduct && insert?.productId ? ` · product #${insert.productId}` : ''}
                {showModel && insert?.modelId ? ` · model #${insert.modelId}` : ''}
              </Text>
              <Text variant='inactive' size='small'>
                {statusLabel(insert?.status)} · {verdictLabel(insert?.verdict)} ·{' '}
                {insert?.sizes?.length ?? 0} size(s) · {fitting.media?.length ?? 0} photo(s)
              </Text>
            </div>
          );
        })}
      </div>

      {hasNextPage && (
        <div ref={ref} className='flex justify-center py-3'>
          {isFetchingNextPage && <Text variant='inactive'>loading more…</Text>}
        </div>
      )}
    </div>
  );
}
