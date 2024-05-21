import ClearIcon from '@mui/icons-material/Clear';
import { Grid, IconButton, Typography } from '@mui/material';
import { common_MediaFull, common_ProductNew } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { isVideo } from 'features/utilitty/filterContentType';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
import styles from 'styles/addProd.scss';

export const Media: FC = () => {
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [mediaPreview, setMediaPreview] = useState<common_MediaFull[]>([]);
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();

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
    <Grid container display='grid' spacing={2}>
      <Grid item xs={11}>
        <Typography variant='h4' textTransform='uppercase'>
          thumbnail
        </Typography>
        <SingleMediaViewAndSelect
          link={imagePreviewUrl}
          saveSelectedMedia={uploadThumbnailInProduct}
        />
      </Grid>
      <Grid item xs={11}>
        <Typography variant='h4' textTransform='uppercase'>
          product medias
        </Typography>
        {mediaPreview && (
          <Grid container className={styles.media_list} gap={2}>
            {mediaPreview.map((media, id) => {
              const mediaUrl = media.media?.fullSize?.mediaUrl ?? '';
              return (
                <Grid item key={id} className={styles.media_item} xs={12} sm={6} md={4} lg={3}>
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
            <Grid item xs={12} sm={6} md={4} lg={3} className={styles.media_item}>
              <MediaSelectorLayout
                allowMultiple={true}
                saveSelectedMedia={uploadMediasInProduct}
                label='select media'
              />
            </Grid>
          </Grid>
        )}
      </Grid>
    </Grid>
  );
};
