import ClearIcon from '@mui/icons-material/Clear';
import { Grid, IconButton } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { isVideo } from 'features/utilitty/filterContentType';
import { useFormikContext } from 'formik';
import { FC, useMemo } from 'react';
import styles from 'styles/product-id-media.scss';
import { MediaListProps } from '../../utility/interfaces';

export const ProductMedias: FC<MediaListProps> = ({
  product,
  mediaPreview,
  deleteMediaFromProduct,
  saveSelectedMedia,
}) => {
  const { values } = useFormikContext<common_ProductNew>();

  const selectedMedia = useMemo(() => {
    const existingMedia =
      product?.media?.filter((media) => values.mediaIds?.includes(media.id as number)) || [];
    const newMedia = mediaPreview.filter(
      (media) => !existingMedia.some((existing) => existing.id === media.id),
    );
    return [...existingMedia, ...newMedia];
  }, [product, values.mediaIds, mediaPreview]);

  return (
    <Grid container spacing={1} className={styles.listed_media_container}>
      {selectedMedia.map((media) => (
        <Grid item xs={6} md={3} key={media.id} className={styles.listed_media_wrapper}>
          {isVideo(media.media?.thumbnail?.mediaUrl) ? (
            <video src={media.media?.thumbnail?.mediaUrl} controls className={styles.media}></video>
          ) : (
            <img src={media.media?.thumbnail?.mediaUrl} alt='media' className={styles.media} />
          )}
          <IconButton
            size='small'
            onClick={() => deleteMediaFromProduct(media.id)}
            className={styles.media_btn}
          >
            <ClearIcon />
          </IconButton>
        </Grid>
      ))}
      <Grid item xs={6} md={3}>
        <div className={styles.select_media_wrapper}>
          <MediaSelectorLayout
            label='select media'
            allowMultiple={true}
            saveSelectedMedia={saveSelectedMedia}
          />
        </div>
      </Grid>
    </Grid>
  );
};
