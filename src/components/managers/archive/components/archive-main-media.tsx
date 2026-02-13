import { common_ArchiveFull, common_MediaFull } from 'api/proto-http/admin';
import { MediaPreviewWithSelector } from 'components/managers/media/components/media-preview-with-selector';
import { useEffect, useState } from 'react';
import { Control, useController, useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import type { CheckoutData } from './schema';

function getMediaUrl(media: common_MediaFull | undefined): string | undefined {
  return media?.media?.thumbnail?.mediaUrl || media?.media?.fullSize?.mediaUrl;
}

type Props = {
  archive?: common_ArchiveFull;
  control: Control<CheckoutData>;
  editMode?: boolean;
};

export function ArchiveMainMedia({ archive, control, editMode }: Props) {
  const {
    formState: { errors },
  } = useFormContext<CheckoutData>();

  const { field } = useController({
    name: 'mainMediaId',
    control,
  });

  const [mainMedia, setMainMedia] = useState<common_MediaFull | undefined>();

  const archiveMainMedia = archive?.mainMedia;
  const archiveMainMediaId = archiveMainMedia?.id;

  useEffect(() => {
    if (
      field.value !== 0 &&
      field.value === archiveMainMediaId &&
      archiveMainMedia &&
      mainMedia?.id !== archiveMainMediaId
    ) {
      setMainMedia(archiveMainMedia);
    }
  }, [field.value, archiveMainMedia, archiveMainMediaId, mainMedia?.id]);

  const mediaLink = field.value === 0 ? undefined : getMediaUrl(mainMedia ?? archiveMainMedia);

  const mainMediaError = (errors.mainMediaId as { message?: string } | undefined)?.message;

  function handleThumbnail(media: common_MediaFull[]) {
    if (!media.length) {
      setMainMedia(undefined);
      field.onChange(0);
      return;
    }

    const next = media[0];
    setMainMedia(next);
    field.onChange(next?.id ?? 0);
  }

  function handleDelete() {
    setMainMedia(undefined);
    field.onChange(0);
  }

  return (
    <div className='space-y-1'>
      <MediaPreviewWithSelector
        mediaUrl={mediaLink}
        aspectRatio={['16:9', '2:1']}
        allowMultiple={false}
        showVideos={true}
        alt='Thumbnail preview'
        editMode={editMode}
        showSelectorWhenEmpty={editMode || !!mediaLink}
        onSaveMedia={handleThumbnail}
        onClear={handleDelete}
      />
      {mainMediaError && <Text className='text-red-500'>{mainMediaError}</Text>}
    </div>
  );
}
