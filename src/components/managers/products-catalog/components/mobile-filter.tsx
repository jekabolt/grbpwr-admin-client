import * as DialogPrimitives from '@radix-ui/react-dialog';

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useDictionary } from 'lib/providers/dictionary-provider';
import useFilter from 'lib/useFilter';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

import Color from './color';
import FilterOptionButtons from './filter-buttons';
import FromTo from './from-to';
import Gender from './gender';
import PreorderSaleHidden from './preorder-sale-hidden';
import ShowLatestLimit from './show-latest-limit';
import { Sizes } from './sizes';
import Sort from './sort-order';
import { useFilterSelection } from './useFilterSelection';
import { useRouteParams } from './useRouteParams';

function Collection() {
  const { selectedValues, handleToggle } = useFilterSelection({
    filterKey: 'collection',
    multiSelect: true,
  });
  const { dictionary } = useDictionary();
  const collections = dictionary?.collections || [];

  if (collections.length === 0) return null;

  return (
    <FilterOptionButtons
      selectedValues={selectedValues}
      handleFilterChange={handleToggle}
      values={collections}
      title='collection'
      showSeparated={false}
    />
  );
}

export function MobileFilter() {
  const [open, setOpen] = useState(false);
  const { gender } = useRouteParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const { defaultValue: sizeValue } = useFilter('size');
  const { defaultValue: sortValue } = useFilter('sort');
  const { defaultValue: orderValue } = useFilter('order');
  const { defaultValue: saleValue } = useFilter('sale');
  const { defaultValue: collectionValue } = useFilter('collection');

  const hasActiveFilters =
    !!sizeValue || !!sortValue || !!orderValue || !!saleValue || !!collectionValue;

  const handleClearAll = () => {
    setSearchParams(new URLSearchParams());
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitives.Trigger asChild>
        <Button className='uppercase'>filter +</Button>
      </DialogPrimitives.Trigger>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-20 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-50 border border-textInactiveColor bg-bgColor p-2.5 text-textColor lg:hidden'>
          <DialogPrimitives.Title className='sr-only'>mobile menu</DialogPrimitives.Title>
          <div className='flex h-full flex-col justify-between'>
            <DialogPrimitives.Close asChild>
              <div className='flex items-center justify-between'>
                <Text variant='uppercase'>filter</Text>
                <Button>[x]</Button>
              </div>
            </DialogPrimitives.Close>
            <div className='h-full space-y-10 overflow-y-scroll pt-10'>
              <div className='space-y-6'>
                <Text variant='uppercase'>sort by</Text>
                <Sort />
              </div>
              <PreorderSaleHidden />
              <ShowLatestLimit />
              <Gender />
              <Color />
              <FromTo />
              <Collection />
              <Sizes gender={gender} />
            </div>
            <div className='flex items-center justify-end gap-2 bg-bgColor'>
              <Button
                className='w-1/2 uppercase'
                size='lg'
                variant='simpleReverseWithBorder'
                onClick={handleClearAll}
                disabled={!hasActiveFilters}
              >
                clear all
              </Button>
              <DialogPrimitives.Close asChild>
                <Button className='w-1/2 uppercase' size='lg' variant='main'>
                  show
                </Button>
              </DialogPrimitives.Close>
            </div>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
