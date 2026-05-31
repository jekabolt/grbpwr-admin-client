import { common_ArchiveFull, common_MediaFull } from 'api/proto-http/admin';
import { MediaGallerySelector } from 'components/managers/media/components/media-gallery-selector';
import { useState } from 'react';
import { Control, useController, useFormContext } from 'react-hook-form';
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
      <MediaGallerySelector
        media={mediaLinks}
        editMode={editMode}
        aspectRatio={['16:9', '2:1']}
        frameAspect='2/1'
        purpose='main media'
        ratioCaption='16:9 / 2:1'
        fit='cover'
        onSelect={handleMediaAdd}
        onDelete={deleteMedia}
      />
      {mainMediaError && <Text variant='error'>{mainMediaError}</Text>}
    </div>
  );
}
