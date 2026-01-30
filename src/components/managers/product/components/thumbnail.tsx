import { common_MediaFull, common_ProductFull } from 'api/proto-http/admin';
import { MediaPreviewWithSelector } from 'components/managers/media/components/media-preview-with-selector';
import { useEffect, useState } from 'react';
import { Control, useController } from 'react-hook-form';
import Text from 'ui/components/text';
import { ProductFormData } from '../utility/schema';

function getMediaUrl(media: common_MediaFull | undefined): string | undefined {
  return media?.media?.thumbnail?.mediaUrl || media?.media?.fullSize?.mediaUrl;
}

const CONFIG = {
  primary: {
    fieldName: 'product.thumbnailMediaId' as const,
    productPath: 'thumbnail' as const,
    label: 'Primary Thumbnail',
    clearOnEmpty: false,
    sequence: 1,
  },
  secondary: {
    fieldName: 'product.secondaryThumbnailMediaId' as const,
    productPath: 'secondaryThumbnail' as const,
    label: 'Secondary Thumbnail (Optional)',
    clearOnEmpty: true,
    sequence: 2,
  },
} as const;

type Props = {
  product?: common_ProductFull;
  control: Control<ProductFormData>;
  variant?: keyof typeof CONFIG;
  editMode?: boolean;
};

export function Thumbnail({ product, control, variant = 'primary', editMode }: Props) {
  const config = CONFIG[variant];
  const { field } = useController({
    name: config.fieldName,
    control,
  });
  const [thumbnail, setThumbnail] = useState<common_MediaFull | undefined>();
  const productDisplayMedia = product?.product?.productDisplay?.[config.productPath];
  const productMediaId = productDisplayMedia?.id;

  useEffect(() => {
    if (
      field.value !== 0 &&
      field.value === productMediaId &&
      productDisplayMedia &&
      thumbnail?.id !== productMediaId
    ) {
      setThumbnail(productDisplayMedia);
    }
  }, [field.value, productMediaId, productDisplayMedia, thumbnail?.id]);

  const mediaLink = field.value === 0 ? undefined : getMediaUrl(thumbnail);

  function handleThumbnail(media: common_MediaFull[]) {
    if (!media.length) {
      if (config.clearOnEmpty) {
        setThumbnail(undefined);
        field.onChange(0);
      }
      return;
    }
    setThumbnail(media[0]);
    field.onChange(media[0]?.id ?? 0);
  }

  function handleDelete() {
    setThumbnail(undefined);
    field.onChange(0);
  }

  if (variant === 'secondary' && !editMode && !mediaLink) {
    return null;
  }

  return (
    <div className='space-y-2 flex-1 min-w-0'>
      <MediaPreviewWithSelector
        mediaUrl={mediaLink}
        aspectRatio={['4:5']}
        allowMultiple={false}
        showVideos={false}
        alt='Thumbnail preview'
        sequence={config.sequence}
        editMode={editMode}
        showSelectorWhenEmpty={editMode || !!mediaLink}
        onSaveMedia={handleThumbnail}
        onClear={handleDelete}
      />
      <Text size='small' className='leading-none whitespace-nowrap'>
        {config.label}
      </Text>
    </div>
  );
}
