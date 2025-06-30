import { common_ArchiveList } from 'api/proto-http/frontend';
import { useArchiveStore } from 'lib/stores/archive/store';
import { useEffect } from 'react';
import { ArchiveForm } from '../form/form';

interface Props {
  archiveData: common_ArchiveList | undefined;
  close: () => void;
}

export function ArchiveItem({ archiveData, close }: Props) {
  const { archiveItems, fetchArchiveItems, clearArchiveItems } = useArchiveStore();

  useEffect(() => {
    if (archiveData) {
      fetchArchiveItems(archiveData.id);
    }

    return () => {
      clearArchiveItems();
    };
  }, [archiveData]);

  function handleClose() {
    clearArchiveItems();
    close();
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

  if (!archiveData) return null;

  return (
    <ArchiveForm
      open={archiveData.id != null}
      onClose={() => handleClose()}
      initialValues={initialValues}
      archiveId={archiveData.id}
      existingMedia={existingMedia}
    />
  );
}
