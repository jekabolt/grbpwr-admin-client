import { Cross1Icon } from '@radix-ui/react-icons';
import { common_MediaFull, common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { MediaViewInterface } from '../interface/interface';

export const MediaView: FC<MediaViewInterface> = ({
  clearMediaPreview,
  isEditMode,
  isAddingProduct,
  product,
}) => {
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [mediaPreview, setMediaPreview] = useState<common_MediaFull[]>([]);
  const { showMessage } = useSnackBarStore();
  const { values, setFieldValue, errors } = useFormikContext<common_ProductNew>();

  useEffect(() => {
    if (clearMediaPreview) {
      setImagePreviewUrl('');
      setMediaPreview([]);
      setFieldValue('mediaIds', []);
      setFieldValue('product.thumbnailMediaId', '');
    }
  }, [clearMediaPreview, setFieldValue]);

  const uploadThumbnailInProduct = (newSelectedMedia: common_MediaFull[]) => {
    if (!newSelectedMedia.length) return;
    const thumbnail = newSelectedMedia[0];
    setImagePreviewUrl(thumbnail.media?.fullSize?.mediaUrl ?? '');
    setFieldValue('product.thumbnailMediaId', thumbnail.id);
  };

  const uploadMediasInProduct = (newSelectedMedia: common_MediaFull[]) => {
    if (!newSelectedMedia.length) {
      showMessage('No selected media', 'error');
      return;
    }

    const uniqueMedia = newSelectedMedia.filter((m) => !values.mediaIds?.includes(m.id || 0));

    if (uniqueMedia.length === 0) {
      showMessage('media already in product', 'error');
      return;
    }

    setMediaPreview((prevPreview) => [...prevPreview, ...uniqueMedia]);

    const updatedMediaIds = [...(values.mediaIds || []), ...uniqueMedia.map((media) => media.id)];
    setFieldValue('mediaIds', updatedMediaIds);
  };

  const removeSelectedMedia = (mediaId: number) => {
    setMediaPreview((prevMedia) => prevMedia.filter((media) => media.id !== mediaId));
    const updatedMediaIds = values.mediaIds?.filter((id) => id !== mediaId);
    setFieldValue('mediaIds', updatedMediaIds);
  };

  const selectedMedia = useMemo(() => {
    const existingMedia =
      product?.media?.filter((media) => values.mediaIds?.includes(media.id as number)) || [];
    const newMedia = mediaPreview.filter(
      (media) => !existingMedia.some((existing) => existing.id === media.id),
    );
    return [...existingMedia, ...newMedia];
  }, [product, values.mediaIds, mediaPreview]);

  return (
    <div>
      <div className='flex flex-col gap-4'>
        {/* <SingleMediaViewAndSelect
          link={
            imagePreviewUrl ||
            product?.product?.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl
          }
          isEditMode={isEditMode}
          isAddingProduct={isAddingProduct}
          isDeleteAccepted={false}
          aspectRatio={['4:5']}
          hideVideos={true}
          saveSelectedMedia={uploadThumbnailInProduct}
        /> */}
        {!values.product?.thumbnailMediaId && <Text variant='error'>thumbnail is required</Text>}
        <div className='grid grid-cols-2 gap-2'>
          {selectedMedia.map((m) => (
            <div key={m.id} className='relative'>
              <Media
                type='image'
                src={m.media?.thumbnail?.mediaUrl || ''}
                alt={m.media?.blurhash || ''}
              />
              {(isEditMode || isAddingProduct) && (
                <div className='absolute top-0 right-0'>
                  <Button onClick={() => removeSelectedMedia(m.id || 0)}>
                    <Cross1Icon />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {/* {(isAddingProduct || isEditMode) && (
            <div className='w-full h-auto flex items-center justify-center border border-text'>
              <MediaSelectorLayout
                label='select media'
                aspectRatio={['4:5']}
                isDeleteAccepted={false}
                allowMultiple={true}
                saveSelectedMedia={uploadMediasInProduct}
                hideVideos={false}
              />
            </div>
          )} */}
        </div>
        {errors.mediaIds && <Text variant='error'>{errors.mediaIds}</Text>}
      </div>
    </div>
  );
};
