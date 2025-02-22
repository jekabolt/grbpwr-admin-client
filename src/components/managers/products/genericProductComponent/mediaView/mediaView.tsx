import ClearIcon from '@mui/icons-material/Clear';
import { Grid, IconButton, Typography } from '@mui/material';
import { common_MediaFull, common_ProductNew } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/managers/media/media-selector/components/singleMediaViewAndSelect';
import { MediaSelectorLayout } from 'components/managers/media/media-selector/layout';
import { ErrorMessage, useFormikContext } from 'formik';
import { isVideo } from 'lib/features/filterContentType';
import { FC, useEffect, useMemo, useState } from 'react';
// import styles from 'styles/addProduct.scss';
import Media from 'components/ui/components/media';
import { MediaViewInterface } from '../interface/interface';

export const MediaView: FC<MediaViewInterface> = ({
  clearMediaPreview,
  isEditMode,
  isAddingProduct,
  product,
  isCopyMode,
}) => {
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [mediaPreview, setMediaPreview] = useState<common_MediaFull[]>([]);
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
      alert('No selected media');
      return;
    }

    setMediaPreview((prevPreview) => [...prevPreview, ...newSelectedMedia]);

    const updatedMediaIds = [
      ...(values.mediaIds || []),
      ...newSelectedMedia.map((media) => media.id),
    ];
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
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Typography variant='h4' textTransform='uppercase'>
          Thumbnail
        </Typography>
        <SingleMediaViewAndSelect
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
        />
        {!values.product?.thumbnailMediaId && (
          <Typography color='error' textTransform='uppercase' variant='overline'>
            <ErrorMessage name='product.thumbnailMediaId' />
          </Typography>
        )}
      </Grid>
      <Grid item xs={12}>
        <Typography variant='h4' textTransform='uppercase'>
          Media
        </Typography>
        <Grid container alignItems='center' spacing={2}>
          {selectedMedia.map((media) => {
            const mediaUrl = media.media?.fullSize?.mediaUrl ?? '';
            return (
              <Grid
                item
                key={media.id}
                // className={styles.media_item}
                xs={12}
                md={6}
              >
                <Media
                  alt={mediaUrl}
                  type={isVideo(mediaUrl) ? 'video' : 'image'}
                  src={mediaUrl}
                  controls={isVideo(mediaUrl)}
                />

                <IconButton
                  onClick={() => removeSelectedMedia(media.id as number)}
                  // className={styles.delete_btn}
                >
                  <ClearIcon />
                </IconButton>
              </Grid>
            );
          })}
          {(isAddingProduct || isEditMode) && (
            <Grid item xs={12} md={6}>
              <div
              // className={styles.select_media}
              >
                <MediaSelectorLayout
                  label='select media'
                  aspectRatio={['4:5']}
                  isDeleteAccepted={false}
                  allowMultiple={true}
                  saveSelectedMedia={uploadMediasInProduct}
                />
              </div>
            </Grid>
          )}
        </Grid>
        {errors.mediaIds && (
          <Typography color='error' textTransform='uppercase' variant='overline'>
            {errors.mediaIds}
          </Typography>
        )}
      </Grid>
    </Grid>
  );
};
