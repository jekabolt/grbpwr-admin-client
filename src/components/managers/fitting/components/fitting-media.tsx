import { common_MediaFull } from 'api/proto-http/admin';
import { MediaGallerySelector } from 'components/managers/media/components/media-gallery-selector';
import { useController, useFormContext } from 'react-hook-form';
import { FittingFormData } from './schema';

// The resolved-media map (saved fitting.media + freshly-picked) is owned by the
// parent FittingForm and shared with the callouts editor, so a just-picked photo
// can be annotated without a save/reload.
export function FittingMedia({
  mediaById,
  onPicked,
}: {
  mediaById: Map<number, common_MediaFull>;
  onPicked: (items: common_MediaFull[]) => void;
}) {
  const { control } = useFormContext<FittingFormData>();
  const { field } = useController({ control, name: 'mediaIds' });

  const mediaLinks = (field.value ?? [])
    .map((id) => mediaById.get(id))
    .filter((m): m is common_MediaFull => m != null);

  function handleAdd(picked: common_MediaFull[]) {
    if (!picked.length) return;
    const unique = picked.filter((m) => !(field.value ?? []).includes(m.id || 0));
    if (!unique.length) return;
    onPicked(unique);
    const ids = unique.map((m) => m.id).filter((id): id is number => id != null);
    field.onChange([...(field.value ?? []), ...ids]);
  }

  function handleDelete(id: number) {
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
