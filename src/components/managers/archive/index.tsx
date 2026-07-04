import { useArchiveDetails } from 'components/managers/archives/components/useArchiveQuery';
import { ROUTES } from 'constants/routes';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ArchiveForm } from './components';

export function Archive() {
  const { heading, tag, id } = useParams<{ heading: string; tag: string; id: string }>();
  const isEditMode = !!id && !!heading && !!tag;
  const isAddingArchive = !id;
  const numId = id ? parseInt(id, 10) : undefined;
  const { data, isLoading, isError, refetch } = useArchiveDetails(numId, { heading, tag });

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
    <ArchiveForm isEditMode={isEditMode} isAddingArchive={isAddingArchive} id={id} archive={data} />
  );
}
