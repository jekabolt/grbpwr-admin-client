import { common_ArchiveFull, common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { Control, useController, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
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
      <div className='grid grid-cols-2 gap-2'>
        {mediaLinks?.map((m, id) => (
          <div
            key={m.id}
            className='relative w-full border border-text aspect-[4/5] overflow-hidden'
          >
            <Media
              type='image'
              src={m.media?.thumbnail?.mediaUrl || ''}
              alt={m.media?.blurhash || ''}
              fit='cover'
            />

            <Button
              type='button'
              onClick={() => deleteMediaAds(m.id || 0)}
              className={cn(
                'absolute top-0 right-0 flex items-center justify-center z-50 cursor-pointer text-bgColor mix-blend-exclusion',
                {
                  hidden: !editMode,
                },
              )}
            >
              [x]
            </Button>
            <Text size='small' className='absolute bottom-0 left-0 mix-blend-difference text-white'>
              {id + 1}
            </Text>
          </div>
        ))}
        {editMode && (
          <div className='relative w-full aspect-[4/5] flex items-center justify-center border border-text'>
            <MediaSelector
              label='select media'
              aspectRatio={['3:4']}
              isDeleteAccepted={false}
              allowMultiple={true}
              saveSelectedMedia={handleMediaAds}
              showVideos={true}
            />
          </div>
        )}
      </div>
      {mediaError && <Text className='text-red-500'>{mediaError}</Text>}
    </div>
  );
}
