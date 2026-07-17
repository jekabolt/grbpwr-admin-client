import { useArchiveDetails } from 'components/managers/archives/components/useArchiveQuery';
import { ROUTES } from 'constants/routes';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ArchiveForm } from './components';

export function Archive() {
  // Route-E: /timeline/{pretty}-{code}. The tail after the last '-' is the public code (or the
  // internal id for not-yet-migrated rows during the cutover — see useArchiveDetails).
  const { handle } = useParams<{ handle: string }>();
  const isEditMode = !!handle;
  const isAddingArchive = !handle;
  const tail = handle ? handle.split('-').pop() : undefined;
  const { data, isLoading, isError, refetch } = useArchiveDetails(tail);
  // Admin writes (UpdateArchive) still key on the internal numeric id. The storefront detail no longer
  // carries it, so we recover it from the URL tail: a numeric tail is a pre-migration internal id; a
  // non-numeric tail is the public code, for which the id-based write is unavailable (see remainder).
  const writeId = tail && /^\d+$/.test(tail) ? tail : undefined;

  if (isEditMode && isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='animate-pulse'>
          loading timeline entry…
        </Text>
      </div>
    );
  }

  if (isEditMode && (isError || !data)) {
    return (
      <div className='flex flex-col items-center gap-3 py-20'>
        <Text variant='error'>couldn&apos;t load this timeline entry.</Text>
        <Text variant='label' size='small'>
          it may have been removed, or the connection dropped.
        </Text>
        <div className='flex items-center gap-2'>
          <Button type='button' variant='secondary' size='lg' onClick={() => refetch()}>
            retry
          </Button>
          <Button asChild variant='main' size='lg'>
            <Link to={ROUTES.archives}>← timeline</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ArchiveForm
      isEditMode={isEditMode}
      isAddingArchive={isAddingArchive}
      id={writeId}
      archive={data}
    />
  );
}
