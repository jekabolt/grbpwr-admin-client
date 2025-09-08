import { common_ArchiveList } from 'api/proto-http/frontend';
import { ArchiveForm } from '../form/form';
import { useArchiveDetails } from '../utility/useArchive';

interface Props {
  archiveData: common_ArchiveList | undefined;
  close: () => void;
}

export function ArchiveItem({ archiveData, close }: Props) {
  const { data: archiveItems } = useArchiveDetails(archiveData?.id, {
    heading: archiveData?.translations?.[0]?.heading || 'string',
    tag: archiveData?.tag || 'string',
  });

  function handleClose() {
    close();
  }

  if (!archiveData) return null;

  const initialValues = {
    translations: archiveItems?.archiveList?.translations || [],
    heading: archiveItems?.archiveList?.translations?.[0]?.heading || '',
    description: archiveItems?.archiveList?.translations?.[0]?.description || '',
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
