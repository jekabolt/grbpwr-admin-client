import { common_MediaFull, common_ProductFull } from 'api/proto-http/admin';
import { MediaPreviewWithSelector } from 'components/managers/hero/components/media-preview-with-selector';
import { useState } from 'react';
import { Control, useController } from 'react-hook-form';
import { ProductFormData } from '../utility/schema';

type Props = {
  product?: common_ProductFull;
  control: Control<ProductFormData>;
};

export function Thumbnail({ product, control }: Props) {
  const { field } = useController({
    name: 'product.thumbnailMediaId',
    control,
  });
  const [thumbnail, setThumbnail] = useState<common_MediaFull | undefined>();
  const productThumbnail = product?.product?.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl;
  const mediaLink = thumbnail?.media?.thumbnail?.mediaUrl || productThumbnail;

  function handleThumbnail(thumbnail: common_MediaFull[]) {
    if (!thumbnail.length) return;
    setThumbnail(thumbnail[0]);
    field.onChange(thumbnail[0]?.id ?? 0);
  }

  return (
    <div className='space-y-2'>
      <label className='text-sm font-medium'>Primary Thumbnail</label>
      <MediaPreviewWithSelector
        mediaUrl={mediaLink}
        aspectRatio={['4:5']}
        allowMultiple={false}
        showVideos={false}
        alt='Thumbnail preview'
        onSaveMedia={handleThumbnail}
      />
    </div>
  );
}
