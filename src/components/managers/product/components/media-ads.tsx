import { Cross1Icon } from '@radix-ui/react-icons';
import { common_MediaFull, common_ProductFull } from 'api/proto-http/admin';
import { MediaSelectorLayout } from 'components/managers/media/media-selector/layout';
import { useEffect, useState } from 'react';
import { Control, useController } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { ProductFormData } from '../utility/schema';

type Props = {
  product?: common_ProductFull;
  control: Control<ProductFormData>;
  clearKey?: number;
};

export function MediaAds({ product, control, clearKey }: Props) {
  const { field } = useController({
    name: 'mediaIds',
    control,
  });
  const [mediaAds, setMediaAds] = useState<common_MediaFull[]>([]);
  const productMedia = product?.media;
  const mediaLinks = product?.media ? productMedia : mediaAds;

  // Clear local state and form field when clearKey changes (for newly added product)
  useEffect(() => {
    if (!product && typeof clearKey === 'number') {
      setMediaAds([]);
      field.onChange([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className='grid grid-cols-2 gap-2'>
      {mediaLinks?.map((m) => (
        <div key={m.id} className='relative'>
          <Media
            type='image'
            src={m.media?.thumbnail?.mediaUrl || ''}
            alt={m.media?.blurhash || ''}
          />

          <div className='absolute top-0 right-0'>
            <Button onClick={() => deleteMediaAds(m.id || 0)}>
              <Cross1Icon />
            </Button>
          </div>
        </div>
      ))}
      <div className='w-full h-auto flex items-center justify-center border border-text'>
        <MediaSelectorLayout
          label='select media'
          aspectRatio={['4:5']}
          isDeleteAccepted={false}
          allowMultiple={true}
          saveSelectedMedia={handleMediaAds}
          hideVideos={false}
        />
      </div>
    </div>
  );
}
