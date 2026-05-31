import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from 'constants/routes';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { MembersFilters, useMembers } from '../utils/hooks';
import { MembersFilter } from './components/members-filter';
import { MembersTable } from './components/members-table';

const PAGE_SIZE = 50;

export function Members() {
  const [filters, setFilters] = useState<MembersFilters>({});
  const [debouncedFilters, setDebouncedFilters] = useState<MembersFilters>({});
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
      setOffset(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [filters]);

  const { data, isLoading, isFetching } = useMembers(debouncedFilters, PAGE_SIZE, offset);
  const members = data?.members ?? [];
  const total = data?.total ?? 0;

  const handleFiltersChange = (partial: MembersFilters) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const handleReset = () => setFilters({});

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <div className='flex flex-col w-full gap-4 pb-16'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='large'>
          Members {total > 0 && `(${total})`}
        </Text>
        <div className='flex gap-2'>
          <Button variant='secondary' size='lg' asChild>
            <Link to={ROUTES.tierConfig}>tier config</Link>
          </Button>
          <Button variant='secondary' size='lg' asChild>
            <Link to={ROUTES.hacker}>hacker</Link>
          </Button>
          <Button variant='secondary' size='lg' asChild>
            <Link to={ROUTES.tierAudit}>audit</Link>
          </Button>
        </div>
      </div>

      <MembersFilter
        filters={filters}
        isLoading={isFetching}
        onFiltersChange={handleFiltersChange}
        onReset={handleReset}
      />

      <MembersTable members={members} isLoading={isLoading || isFetching} />

      {total > 0 && (
        <div className='flex items-center justify-between'>
          <Text variant='inactive'>
            {from}–{to} of {total}
          </Text>
          <div className='flex gap-2'>
            <Button
              variant='secondary'
              size='lg'
              disabled={!hasPrev || isFetching}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              Prev
            </Button>
            <Button
              variant='secondary'
              size='lg'
              disabled={!hasNext || isFetching}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
