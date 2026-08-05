import { ROUTES } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatSizeName } from '../product/utility/sizes';
import { formatDateShort } from '../orders-catalog/components/utility';
import { Button } from 'ui/components/button';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { useProductWaitlist } from './components/useWaitlist';

const PAGE_SIZE = 50;

// Standalone waitlist queue (back-in-stock "notify me" signups). Product name/thumbnail is not
// resolved here — there is no cheap batch lookup by id, and resolving it would cost one RPC per
// row — so the product column links straight to the product edit page instead.
export function Waitlist() {
  const { dictionary } = useDictionary();

  const [productFilter, setProductFilter] = useState('');
  const [debouncedProductId, setDebouncedProductId] = useState<number | undefined>(undefined);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const id = Number(productFilter);
      setDebouncedProductId(productFilter.trim() && Number.isFinite(id) && id > 0 ? id : undefined);
      setOffset(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [productFilter]);

  const { data, isLoading, isFetching } = useProductWaitlist(debouncedProductId, PAGE_SIZE, offset);
  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;
  const busy = isLoading || isFetching;

  const sizeName = (sizeId?: number) => {
    const raw = dictionary?.sizes?.find((s) => s.id === sizeId)?.name ?? String(sizeId ?? '');
    return formatSizeName(raw) || raw;
  };

  return (
    <SectionStack>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-baseline gap-2'>
          <Text variant='uppercase' size='large' component='h1' className='font-bold'>
            waitlist
          </Text>
          {total > 0 ? <Pill tone='mut'>{total.toLocaleString()} total</Pill> : null}
        </div>
      </div>

      <Toolbar>
        <Input
          name='productFilter'
          type='number'
          placeholder='filter by product id'
          value={productFilter}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProductFilter(e.target.value)}
          className='w-48'
        />
        <ToolbarSpacer />
      </Toolbar>

      <Section title='waitlist entries' question='— back-in-stock signups, newest first per page'>
        <DataTable>
          <thead>
            <tr>
              <th>
                <span className='block text-left'>date</span>
              </th>
              <th>
                <span className='block text-left'>product</span>
              </th>
              <th>
                <span className='block text-left'>size</span>
              </th>
              <th>
                <span className='block text-left'>email</span>
              </th>
              <th>
                <span className='block text-left'>name</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <Text variant='inactive' size='small'>
                    {busy ? 'loading…' : 'no waitlist entries'}
                  </Text>
                </td>
              </tr>
            ) : (
              entries.map((e) => {
                const name = [e.firstName, e.lastName].filter(Boolean).join(' ');
                return (
                  <tr key={e.id}>
                    <td className='whitespace-nowrap'>
                      <span className='block text-left'>{formatDateShort(e.createdAt)}</span>
                    </td>
                    <td className='whitespace-nowrap'>
                      <span className='block text-left'>
                        <Link
                          to={`${ROUTES.product}/${e.productId}`}
                          className='underline underline-offset-2 hover:opacity-70'
                        >
                          #{e.productId}
                        </Link>
                      </span>
                    </td>
                    <td className='whitespace-nowrap'>
                      <span className='block text-left'>{sizeName(e.sizeId)}</span>
                    </td>
                    <td className='whitespace-nowrap'>
                      <span className='block text-left'>{e.email || <EmptyCell />}</span>
                    </td>
                    <td className='whitespace-nowrap'>
                      <span className='block text-left'>{name || <EmptyCell />}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </DataTable>

        {total > 0 ? (
          <div className='flex items-center justify-between pt-2'>
            <Text variant='inactive' size='small'>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </Text>
            <div className='flex gap-2'>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={!hasPrev || busy}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                prev
              </Button>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={!hasNext || busy}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                next
              </Button>
            </div>
          </div>
        ) : null}
      </Section>
    </SectionStack>
  );
}
