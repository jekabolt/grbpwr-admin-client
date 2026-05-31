import { common_ArchiveFull, common_MediaFull } from 'api/proto-http/admin';
import { MediaGallerySelector } from 'components/managers/media/components/media-gallery-selector';
import { useEffect, useState } from 'react';
import { Control, useController, useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import { CheckoutData } from './schema';

export function ArchiveMedia({
  archive,
  control,
  clearKey,
  editMode,
}: {
  archive?: common_ArchiveFull;
  control: Control<CheckoutData>;
  clearKey?: number;
  editMode?: boolean;
}) {
  const {
    formState: { errors },
  } = useFormContext<CheckoutData>();

  const { field } = useController({
    name: 'mediaIds',
    control,
  });
  const [media, setMedia] = useState<common_MediaFull[]>([]);
  const archiveMedia = archive?.media || [];

  const mediaById = new Map<number, common_MediaFull>(
    [...archiveMedia, ...media]
      .filter((m): m is common_MediaFull & { id: number } => m.id != null)
      .map((m) => [m.id, m]),
  );
  const mediaLinks = (field.value ?? [])
    .map((id) => mediaById.get(id))
    .filter((m): m is common_MediaFull => m != null);

  useEffect(() => {
    if (!archive && typeof clearKey === 'number') {
      setMedia([]);
      field.onChange([]);
    }
  }, [clearKey]);

  function handleMediaAds(mediaAds: common_MediaFull[]) {
    if (!mediaAds.length) return;
    const uniqueMediaAds = mediaAds.filter((m) => !field.value?.includes(m.id || 0));
    if (!uniqueMediaAds.length) {
      alert('media ads already in product');
      return;
    }
    setMedia((prevMediaAds) => [...prevMediaAds, ...uniqueMediaAds]);
    const selectedMediaAds = [...(field.value || []), ...uniqueMediaAds.map((media) => media.id)];
    field.onChange(selectedMediaAds);
  }

  function deleteMediaAds(mediaId: number) {
    setMedia((prevMedia) => prevMedia.filter((media) => media.id !== mediaId));
    const updatedMediaIds = field.value?.filter((id) => id !== mediaId);
    field.onChange(updatedMediaIds);
  }

  const mediaError = (errors.mediaIds as { message?: string } | undefined)?.message;

  return (
    <div className='space-y-1'>
      <MediaGallerySelector
        media={mediaLinks}
        editMode={editMode}
        aspectRatio={['3:4']}
        frameAspect='3/4'
        purpose='gallery media'
        ratioCaption='3:4'
        fit='cover'
        firstIsThumbnail
        onSelect={handleMediaAds}
        onDelete={deleteMediaAds}
      />
      {mediaError && <Text variant='error'>{mediaError}</Text>}
    </div>
  );
}
