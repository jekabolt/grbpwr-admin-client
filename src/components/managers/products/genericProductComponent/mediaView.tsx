import ClearIcon from '@mui/icons-material/Clear';
import { Grid, IconButton, Typography } from '@mui/material';
import { common_MediaFull, common_ProductFull, common_ProductNew } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { isVideo } from 'features/utilitty/filterContentType';
import { useFormikContext } from 'formik';
import { FC, useEffect, useMemo, useState } from 'react';
import styles from 'styles/addProd.scss';

interface GenericMediaComponentProps {
  clearMediaPreview?: boolean;
  isEditMode?: boolean;
  isAddingProduct: boolean;
  product?: common_ProductFull;
}

export const MediaView: FC<GenericMediaComponentProps> = ({
  clearMediaPreview,
  isEditMode,
  isAddingProduct,
  product,
}) => {
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [mediaPreview, setMediaPreview] = useState<common_MediaFull[]>([]);
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();

  useEffect(() => {
    if (clearMediaPreview) {
      setImagePreviewUrl('');
      setMediaPreview([]);
    }
  }, [clearMediaPreview]);

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
          saveSelectedMedia={uploadThumbnailInProduct}
        />
        {!values.product?.thumbnailMediaId && (
          <Typography color='error' variant='overline'>
            THUMBNAIL MUST BE SELECTED
          </Typography>
        )}
      </Grid>
      <Grid item xs={12}>
        <Typography variant='h4' textTransform='uppercase'>
          Media
        </Typography>
        <Grid container alignItems='center' spacing={1}>
          {selectedMedia.map((media) => {
            const mediaUrl = media.media?.fullSize?.mediaUrl ?? '';
            return (
              <Grid item key={media.id} className={styles.media_item} xs={12} md={6}>
                {isVideo(mediaUrl) ? (
                  <video src={mediaUrl} controls className={styles.media}></video>
                ) : (
                  <img src={mediaUrl} alt='' className={styles.media} />
                )}
                {isEditMode && (
                  <IconButton
                    onClick={() => removeSelectedMedia(media.id as number)}
                    className={styles.delete_btn}
                  >
                    <ClearIcon />
                  </IconButton>
                )}
              </Grid>
            );
          })}
          {(isAddingProduct || isEditMode) && (
            <Grid item xs={12} md={6}>
              <div className={styles.select_media}>
                <MediaSelectorLayout
                  allowMultiple={true}
                  saveSelectedMedia={uploadMediasInProduct}
                  label='select media'
                />
              </div>
            </Grid>
          )}
        </Grid>
        {values.mediaIds && values.mediaIds.length < 1 && (
          <Typography color='error' variant='overline'>
            AT LEAST ONE MEDIA MUST BE ADDED TO THE PRODUCT
          </Typography>
        )}
      </Grid>
    </Grid>
  );
};
