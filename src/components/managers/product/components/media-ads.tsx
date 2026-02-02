import { common_MediaFull, common_ProductFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { Control, useController } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { ProductFormData } from '../utility/schema';

type Props = {
  product?: common_ProductFull;
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
    <div className='grid  grid-cols-2 gap-2'>
      {mediaLinks?.map((m, id) => (
        <div key={m.id} className='relative w-full border border-text aspect-[4/5] overflow-hidden'>
          <Media
            type='image'
            src={m.media?.thumbnail?.mediaUrl || ''}
            alt={m.media?.blurhash || ''}
            fit='contain'
          />

          <Button
            type='button'
            onClick={() => deleteMediaAds(m.id || 0)}
            className={cn(
              'absolute top-0 right-0 flex items-center justify-center z-50 cursor-pointer',
              {
                hidden: !editMode,
              },
            )}
          >
            x
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
            aspectRatio={['4:5', 'Custom']}
            isDeleteAccepted={false}
            allowMultiple={true}
            saveSelectedMedia={handleMediaAds}
            showVideos={true}
          />
        </div>
      )}
    </div>
  );
}
