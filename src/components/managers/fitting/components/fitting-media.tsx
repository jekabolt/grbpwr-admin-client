import { common_Fitting, common_MediaFull } from 'api/proto-http/admin';
import { MediaGallerySelector } from 'components/managers/media/components/media-gallery-selector';
import { useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { FittingFormData } from './schema';

export function FittingMedia({ fitting }: { fitting?: common_Fitting }) {
  const { control } = useFormContext<FittingFormData>();
  const { field } = useController({ control, name: 'mediaIds' });
  const [media, setMedia] = useState<common_MediaFull[]>([]);

  const fittingMedia = fitting?.media || [];
  const mediaById = new Map<number, common_MediaFull>(
    [...fittingMedia, ...media]
      .filter((m): m is common_MediaFull & { id: number } => m.id != null)
      .map((m) => [m.id, m]),
  );
  const mediaLinks = (field.value ?? [])
    .map((id) => mediaById.get(id))
    .filter((m): m is common_MediaFull => m != null);

  function handleAdd(picked: common_MediaFull[]) {
    if (!picked.length) return;
    const unique = picked.filter((m) => !(field.value ?? []).includes(m.id || 0));
    if (!unique.length) return;
    setMedia((prev) => [...prev, ...unique]);
    const ids = unique.map((m) => m.id).filter((id): id is number => id != null);
    field.onChange([...(field.value ?? []), ...ids]);
  }

  function handleDelete(id: number) {
    setMedia((prev) => prev.filter((m) => m.id !== id));
    field.onChange((field.value ?? []).filter((v) => v !== id));
  }

  return (
    <MediaGallerySelector
      media={mediaLinks}
      editMode
      aspectRatio={['3:4']}
      frameAspect='3/4'
      purpose='fitting photos'
      ratioCaption='any ratio'
      fit='cover'
      onSelect={handleAdd}
      onDelete={handleDelete}
    />
  );
}
