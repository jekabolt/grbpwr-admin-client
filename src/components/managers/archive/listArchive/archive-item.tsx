import { common_ArchiveFull } from 'api/proto-http/frontend';
import { useArchiveStore } from 'lib/stores/store';
import { useEffect } from 'react';
import { ArchiveForm } from '../form/form';

interface Props {
  archiveData: common_ArchiveFull | undefined;
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
    heading: archiveItems?.heading || '',
    description: archiveItems?.description || '',
    tag: archiveItems?.tag || '',
    mediaIds: archiveItems?.media?.map((m) => m.id).filter((id): id is number => id !== undefined),
    videoId: archiveItems?.video?.id,
  };

  const existingMedia = [
    ...(archiveItems?.media || []),
    ...(archiveItems?.video ? [archiveItems.video] : []),
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
