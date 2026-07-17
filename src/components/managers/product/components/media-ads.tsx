import { common_MediaFull, common_ColorwayFull } from 'api/proto-http/admin';
import { MediaGallerySelector } from 'components/managers/media/components/media-gallery-selector';
import { useEffect, useState } from 'react';
import { Control, useController } from 'react-hook-form';
import { ProductFormData } from '../utility/schema';

type Props = {
  product?: common_ColorwayFull;
  control: Control<ProductFormData>;
  clearKey?: number;
  editMode?: boolean;
};

export function MediaAds({ product, control, clearKey, editMode }: Props) {
  const { field } = useController({
    name: 'mediaIds',
    control,
  });
  const [mediaAds, setMediaAds] = useState<common_MediaFull[]>([]);
  const productMedia = product?.media || [];

  const mediaById = new Map<number, common_MediaFull>(
    [...productMedia, ...mediaAds]
      .filter((m): m is common_MediaFull & { id: number } => m.id != null)
      .map((m) => [m.id, m]),
  );
  const mediaLinks = (field.value ?? [])
    .map((id) => mediaById.get(id))
    .filter((m): m is common_MediaFull => m != null);

  useEffect(() => {
    if (!product && typeof clearKey === 'number') {
      setMediaAds([]);
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
    setMediaAds((prevMediaAds) => [...prevMediaAds, ...uniqueMediaAds]);
    const selectedMediaAds = [...(field.value || []), ...uniqueMediaAds.map((media) => media.id)];
    field.onChange(selectedMediaAds);
  }

  function deleteMediaAds(mediaId: number) {
    setMediaAds((prevMediaAds) => prevMediaAds.filter((media) => media.id !== mediaId));
    const updatedMediaIds = field.value?.filter((id) => id !== mediaId);
    field.onChange(updatedMediaIds);
  }
  return (
    <MediaGallerySelector
      media={mediaLinks}
      editMode={editMode}
      aspectRatio={['4:5', 'Custom']}
      frameAspect='4/5'
      purpose='additional photo'
      ratioCaption='any ratio'
      fit='contain'
      onSelect={handleMediaAds}
      onDelete={deleteMediaAds}
    />
  );
}
