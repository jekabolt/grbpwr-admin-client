import { common_ArchiveList } from 'api/proto-http/frontend';
import { ArchiveForm } from '../form/form';
import { useArchiveDetails } from '../utility/useArchive';

interface Props {
  archiveData: common_ArchiveList | undefined;
  close: () => void;
}

export function ArchiveItem({ archiveData, close }: Props) {
  const {
    data: archiveItems,
    isLoading,
    error,
  } = useArchiveDetails(archiveData?.id, {
    heading: archiveData?.heading || 'string',
    tag: archiveData?.tag || 'string',
  });

  function handleClose() {
    close();
  }

  if (!archiveData) return null;

  if (isLoading) {
    return (
      <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
        <div className='bg-white p-8 rounded-lg'>
          <div>Loading archive details...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
        <div className='bg-white p-8 rounded-lg'>
          <div className='text-red-500 mb-4'>
            Error loading archive: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
          <button
            onClick={handleClose}
            className='px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600'
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const initialValues = {
    heading: archiveItems?.archiveList?.heading || '',
    description: archiveItems?.archiveList?.description || '',
    tag: archiveItems?.archiveList?.tag || '',
    mediaIds: archiveItems?.media?.map((m) => m.id).filter((id): id is number => id !== undefined),
    mainMediaId: archiveItems?.mainMedia?.id,
    thumbnailId: archiveItems?.mainMedia?.id,
  };

  const existingMedia = [
    ...(archiveItems?.media?.filter((m) => m && m.id) || []),
    ...(archiveItems?.mainMedia?.media?.fullSize?.mediaUrl ? [archiveItems.mainMedia] : []),
  ];

  return (
    <ArchiveForm
      open={archiveData.id != null}
      onClose={handleClose}
      initialValues={initialValues}
      archiveId={archiveData.id}
      existingMedia={existingMedia}
    />
  );
}
