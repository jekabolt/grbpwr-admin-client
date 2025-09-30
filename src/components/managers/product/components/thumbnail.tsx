import { common_MediaFull, common_ProductFull } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/managers/media/media-selector/components/singleMediaViewAndSelect';
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
  const mediaLink = product ? productThumbnail : thumbnail?.media?.thumbnail?.mediaUrl;

  function handleThumbnail(thumbnail: common_MediaFull[]) {
    if (!thumbnail.length) return;
    setThumbnail(thumbnail[0]);
    field.onChange(thumbnail[0]?.id ?? 0);
  }

  return (
    <SingleMediaViewAndSelect
      link={mediaLink}
      hideVideos
      aspectRatio={['4:5']}
      saveSelectedMedia={handleThumbnail}
    />
  );
}
