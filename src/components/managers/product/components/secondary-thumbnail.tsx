import { common_MediaFull, common_ProductFull } from 'api/proto-http/admin';
import { MediaPreviewWithSelector } from 'components/managers/hero/components/media-preview-with-selector';
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
  const mediaLink = thumbnail?.media?.thumbnail?.mediaUrl || productSecondaryThumbnail;

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
