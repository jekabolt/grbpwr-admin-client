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
    const response = await deleteMediaById({ productMediaId: id });
    if (response) {
      fetchProduct();
    }
  };

  const uniqueMedia = useMemo(() => {
    const uniqueUrls = new Set();
    return (
      product?.media?.filter((media) => {
        const fullSizeUrl = media.productMediaInsert?.fullSize;
        if (fullSizeUrl && !uniqueUrls.has(fullSizeUrl)) {
          uniqueUrls.add(fullSizeUrl);
          return true;
        }
        return false;
      }) || []
    );
  }, [product]);

  return (
    <Grid container gap={2} className={styles.listed_media_container}>
      {uniqueMedia?.map((media) => (
        <Grid
          item
          xs={12}
          sm={6}
          md={4}
          lg={3}
          key={media.id}
          className={styles.listed_media_wrapper}
        >
          {isVideo(media.productMediaInsert?.thumbnail) ? (
            <video
              src={media.productMediaInsert?.thumbnail}
              controls
              className={styles.media}
            ></video>
          ) : (
            <img src={media.productMediaInsert?.thumbnail} alt='media' className={styles.media} />
          )}
          <IconButton
            aria-label='delete'
            size='small'
            onClick={() => handleDeleteMedia(media.id)}
            className={styles.media_btn}
          >
            <ClearIcon />
          </IconButton>
        </Grid>
      ))}
      <Grid item xs={12} sm={6} md={4} lg={3} className={styles.listed_media_wrapper}>
        <MediaSelectorLayout
          label='select media'
          allowMultiple={true}
          saveSelectedMedia={saveSelectedMedia}
        />
      </Grid>
    </Grid>
  );
};
