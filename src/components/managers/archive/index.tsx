import { useArchiveDetails } from 'components/managers/archives/components/useArchiveQuery';
import { useParams } from 'react-router-dom';
import { ArchiveForm } from './components';

export function Archive() {
  const { heading, tag, id } = useParams<{ heading: string; tag: string; id: string }>();
  const isEditMode = !!id && !!heading && !!tag;
  const isAddingArchive = !id;
  const numId = id ? parseInt(id, 10) : undefined;
  const { data, isLoading } = useArchiveDetails(numId, { heading, tag });

  if (isEditMode && (isLoading || !data)) {
    return <div>Loading...</div>;
  }

  return (
    <ArchiveForm isEditMode={isEditMode} isAddingArchive={isAddingArchive} id={id} archive={data} />
  );
}
