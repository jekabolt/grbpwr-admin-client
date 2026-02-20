import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import { downloadCsv, stockChangesToCsv } from './stock-csv';
import { StockHistoryFilters, type StockHistorySizeOption } from './stock-history-filters';
import {
  defaultStockHistoryFilters,
  stockHistoryFilterSchema,
  type StockHistoryFilterSchema,
} from './stock-history-schema';
import { StockModal } from './stock-modal';
import { StockTable } from './stock-table';
import { StockTrendChart } from './stock-trend-chart';
import { type StockChangeHistoryFilters, useStockChangeHistory } from './useStockChangeHistory';

interface Props {
  productId?: number;
  sizes?: StockHistorySizeOption[];
}

function formValuesToFilters(values: StockHistoryFilterSchema): StockChangeHistoryFilters {
  return {
    dateFrom: values.dateFrom || undefined,
    dateTo: values.dateTo || undefined,
    limit: Number(values.limit) || 30,
    source: values.source,
    orderFactor: values.orderFactor,
    sizeId: values.sizeId === '__all__' ? undefined : Number(values.sizeId),
  };
}

export function StockHistory({ productId, sizes = [] }: Props) {
  const form = useForm<StockHistoryFilterSchema>({
    resolver: zodResolver(stockHistoryFilterSchema) as Resolver<StockHistoryFilterSchema>,
    defaultValues: defaultStockHistoryFilters,
  });

  const watched = form.watch();
  const filters = useMemo(() => formValuesToFilters(watched), [watched]);

  const sizeItems = useMemo(
    () => [
      { value: '__all__', label: 'All sizes' },
      ...sizes
        .filter((s) => s.id != null)
        .map((s) => ({ value: String(s.id), label: s.name ?? String(s.id) })),
    ],
    [sizes],
  );

  const {
    changes = [],
    isPending,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useStockChangeHistory(productId, filters, { enabled: true });

  const handleExportCsv = () => {
    const csv = stockChangesToCsv(changes, sizes);
    const filename = `stock-history${productId != null ? `-${productId}` : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(csv, filename);
  };

  const sizeLabel = useMemo(() => {
    const id = watched.sizeId;
    if (id === '__all__' || !id) return 'All sizes';
    return sizeItems.find((s) => s.value === id)?.label ?? id;
  }, [watched.sizeId, sizeItems]);

  return (
    <StockModal>
      <Form {...form}>
        <div className='flex min-h-0 flex-1 flex-col gap-4 lg:flex-row'>
          <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:min-w-0'>
            <StockHistoryFilters sizes={sizes} />
            <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
              <div className='mb-2 flex shrink-0 items-center justify-between gap-2'>
                <Text variant='uppercase' className='text-textInactiveColor'>
                  {isPending
                    ? 'Loading…'
                    : `${changes.length} row${changes.length === 1 ? '' : 's'}`}
                </Text>
              </div>
              <StockTable changes={changes} isLoading={isPending} sizes={sizes} />
              {hasNextPage && (
                <div className='mt-2 flex justify-center'>
                  <Button
                    type='button'
                    variant='main'
                    size='lg'
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    <Text variant='uppercase'>{isFetchingNextPage ? 'Loading…' : 'Load more'}</Text>
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className='shrink-0 lg:w-[380px]'>
            <StockTrendChart
              changes={changes}
              productId={productId}
              sizeLabel={sizeLabel}
              onDownloadCsv={handleExportCsv}
              isLoading={isPending}
            />
          </div>
        </div>
      </Form>
    </StockModal>
  );
}
