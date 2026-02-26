import { common_ArchiveFull, common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Control, useController, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import type { CheckoutData } from './schema';

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
    name: 'mainMediaIds',
    control,
  });

  const [media, setMedia] = useState<common_MediaFull[]>([]);
  const archiveMainMedia = archive?.mainMedia ?? [];

  const mediaById = new Map<number, common_MediaFull>(
    [...archiveMainMedia, ...media]
      .filter((m): m is common_MediaFull & { id: number } => m.id != null)
      .map((m) => [m.id, m]),
  );
  const mediaLinks = (field.value ?? [])
    .map((id) => mediaById.get(id))
    .filter((m): m is common_MediaFull => m != null);

  function handleMediaAdd(selected: common_MediaFull[]) {
    if (!selected.length) return;
    const unique = selected.filter((m) => !(field.value ?? []).includes(m.id ?? 0));
    if (!unique.length) return;
    setMedia((prev) => [...prev, ...unique]);
    field.onChange([...(field.value ?? []), ...unique.map((m) => m.id!).filter(Boolean)]);
  }

  function deleteMedia(mediaId: number) {
    setMedia((prev) => prev.filter((m) => m.id !== mediaId));
    field.onChange((field.value ?? []).filter((id) => id !== mediaId));
  }

  const mainMediaError = (errors.mainMediaIds as { message?: string } | undefined)?.message;

  return (
    <div className='space-y-1'>
      <div className='grid grid-cols-2 gap-2'>
        {mediaLinks.map((m, idx) => (
          <div
            key={m.id}
            className={cn(
              'relative w-full border border-text overflow-hidden',
              isVideo(m.media?.fullSize?.mediaUrl) ? 'aspect-video' : 'aspect-[2/1]',
            )}
          >
            <Media
              type={isVideo(m.media?.fullSize?.mediaUrl) ? 'video' : 'image'}
              src={m.media?.thumbnail?.mediaUrl || m.media?.fullSize?.mediaUrl || ''}
              alt={m.media?.blurhash || ''}
              fit='cover'
            />
            <Button
              type='button'
              onClick={() => deleteMedia(m.id!)}
              className={cn(
                'absolute top-0 right-0 flex items-center justify-center z-50 cursor-pointer text-bgColor mix-blend-exclusion',
                { hidden: !editMode },
              )}
            >
              [x]
            </Button>
            <Text size='small' className='absolute bottom-0 left-0 mix-blend-difference text-white'>
              {idx + 1}
            </Text>
          </div>
        ))}
        {editMode && (
          <div className='relative w-full aspect-[2/1] flex items-center justify-center border border-text'>
            <MediaSelector
              label='select main media'
              aspectRatio={['16:9', '2:1']}
              isDeleteAccepted={false}
              allowMultiple={true}
              saveSelectedMedia={handleMediaAdd}
              showVideos={true}
            />
          </div>
        )}
      </div>
      {mainMediaError && <Text className='text-red-500'>{mainMediaError}</Text>}
    </div>
  );
}
