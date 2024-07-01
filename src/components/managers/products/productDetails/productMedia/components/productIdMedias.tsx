import ClearIcon from '@mui/icons-material/Clear';
import { Grid, IconButton } from '@mui/material';
import { deleteMediaById } from 'api/updateProductsById';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC, useMemo } from 'react';
import styles from 'styles/product-id-media.scss';
import { MediaListProps } from '../../utility/interfaces';

export const ProductMedias: FC<MediaListProps> = ({ product, fetchProduct, saveSelectedMedia }) => {
  const handleDeleteMedia = async (id: number | undefined) => {
    if (!id) {
      alert('no id');
      return;
    }
    const response = await deleteMediaById({ productId: product?.product?.id, mediaId: id });
    if (response) {
      fetchProduct();
    }
  };

  const uniqueMedia = useMemo(() => {
    const uniqueUrls = new Set();
    return (
      product?.media?.filter((media) => {
        const fullSizeUrl = media.media?.fullSize?.mediaUrl;
        if (fullSizeUrl && !uniqueUrls.has(fullSizeUrl)) {
          uniqueUrls.add(fullSizeUrl);
          return true;
        }
        return false;
      }) || []
    );
  }, [product]);

  return (
    <Grid container spacing={1} className={styles.listed_media_container}>
      {uniqueMedia?.map((media) => (
        <Grid item xs={6} md={3} key={media.id} className={styles.listed_media_wrapper}>
          {isVideo(media.media?.thumbnail?.mediaUrl) ? (
            <video src={media.media?.thumbnail?.mediaUrl} controls className={styles.media}></video>
          ) : (
            <img src={media.media?.thumbnail?.mediaUrl} alt='media' className={styles.media} />
          )}
          <IconButton
            size='small'
            onClick={() => handleDeleteMedia(media.id)}
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
