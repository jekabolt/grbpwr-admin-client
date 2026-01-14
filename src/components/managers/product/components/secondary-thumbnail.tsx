import { common_MediaFull, common_ProductFull } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/managers/media/media-selector/components/singleMediaViewAndSelect';
import { useState } from 'react';
import { Control, useController } from 'react-hook-form';
import { ProductFormData } from '../utility/schema';

type Props = {
  product?: common_ProductFull;
  control: Control<ProductFormData>;
};

export function SecondaryThumbnail({ product, control }: Props) {
  const { field } = useController({
    name: 'product.secondaryThumbnailMediaId',
    control,
  });
  const [thumbnail, setThumbnail] = useState<common_MediaFull | undefined>();
  const productSecondaryThumbnail =
    product?.product?.productDisplay?.secondaryThumbnail?.media?.thumbnail?.mediaUrl;
  const mediaLink = product ? productSecondaryThumbnail : thumbnail?.media?.thumbnail?.mediaUrl;

  function handleThumbnail(thumbnail: common_MediaFull[]) {
    if (!thumbnail.length) {
      setThumbnail(undefined);
      field.onChange(0);
      return;
    }
    setThumbnail(thumbnail[0]);
    field.onChange(thumbnail[0]?.id ?? 0);
  }

  return (
    <div className='space-y-2'>
      <label className='text-sm font-medium'>Secondary Thumbnail (Optional)</label>
      <div className='border border-text'>
        <SingleMediaViewAndSelect
          link={mediaLink}
          hideVideos
          aspectRatio={['4:5']}
          saveSelectedMedia={handleThumbnail}
        />
      </div>
    </div>
  );
}
