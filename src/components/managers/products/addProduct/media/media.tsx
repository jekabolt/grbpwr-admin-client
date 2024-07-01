import ClearIcon from '@mui/icons-material/Clear';
import { Grid, IconButton, Typography } from '@mui/material';
import { common_MediaFull, common_ProductNew } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { isVideo } from 'features/utilitty/filterContentType';
import { useFormikContext } from 'formik';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/addProd.scss';

export const Media: FC<{ clearMediaPreview: boolean }> = ({ clearMediaPreview }) => {
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
    if (!newSelectedMedia.length) {
      return;
    }
    const thumbnail = newSelectedMedia[0];
    const thumbnailUrl = thumbnail.media?.fullSize?.mediaUrl ?? '';
    setImagePreviewUrl(thumbnailUrl);
    setFieldValue('product.thumbnail', thumbnailUrl);
  };
  const uploadMediasInProduct = (newSelectedMedia: common_MediaFull[]) => {
    if (newSelectedMedia.length === 0) {
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

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Typography variant='h4' textTransform='uppercase'>
          thumbnail
        </Typography>
        <SingleMediaViewAndSelect
          link={imagePreviewUrl}
          saveSelectedMedia={uploadThumbnailInProduct}
        />
        {!values.product?.thumbnail && (
          <Typography color='error' variant='overline'>
            THUMBNAIL MUST BE SELECTED
          </Typography>
        )}
      </Grid>
      <Grid item xs={12}>
        <Typography variant='h4' textTransform='uppercase'>
          media
        </Typography>
        {mediaPreview && (
          <Grid container alignItems='center' spacing={2}>
            {mediaPreview.map((media, id) => {
              const mediaUrl = media.media?.fullSize?.mediaUrl ?? '';
              return (
                <Grid item key={id} className={styles.media_item} xs={6} md={3}>
                  {isVideo(mediaUrl) ? (
                    <video src={mediaUrl} controls className={styles.media}></video>
                  ) : (
                    <img src={mediaUrl} alt='' className={styles.media} />
                  )}
                  <IconButton
                    onClick={() => removeSelectedMedia(media.id ?? 0)}
                    className={styles.delete_btn}
                  >
                    <ClearIcon />
                  </IconButton>
                </Grid>
              );
            })}
            <Grid item xs={6} md={3}>
              <div className={styles.select_media}>
                <MediaSelectorLayout
                  allowMultiple={true}
                  saveSelectedMedia={uploadMediasInProduct}
                  label='select media'
                />
              </div>
            </Grid>
          </Grid>
        )}
        {values.mediaIds && values.mediaIds.length < 1 && (
          <Typography color='error' variant='overline'>
            AT LEAST ONE MEDIA MUST BE ADDED TO THE PRODUCT
          </Typography>
        )}
      </Grid>
    </Grid>
  );
};
