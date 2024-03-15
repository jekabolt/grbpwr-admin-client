import { Button, Grid, IconButton } from '@mui/material';
import { deleteMediaById } from 'api/byID';
import { common_ProductFull } from 'api/proto-http/admin';
import { FC, useState } from 'react';
import styles from 'styles/product-id-media.scss';
import { ThumbnailProps } from '../../interfaces-type/thumbnailInterface';
import { MediaPicker } from './components/media-picker';

export const ListedMedia: FC<ThumbnailProps> = ({ product, setProduct, id }) => {
  const [mediaPicker, setMediaPicker] = useState(false);

  const handleMediaPickerVisibility = () => {
    setMediaPicker(!mediaPicker);
  };

  const handleDeleteMedia = async (id: number | undefined) => {
    if (!setProduct) return;
    await deleteMediaById({ productMediaId: id });
    const updatedMedia = product?.media?.filter((media) => media.id !== id);
    if (product) {
      const updatedProduct = {
        ...product,
        media: updatedMedia,
      } as common_ProductFull;
      setProduct(updatedProduct);
    }
  };

  return (
    <Grid container gap={4} className={styles.listed_media_container}>
      {product?.media?.map((media) => (
        <Grid item xs={5} key={media.id} className={styles.listed_media_wrapper}>
          <img src={media.productMediaInsert?.fullSize} alt='media' className={styles.media} />
          <IconButton
            aria-label='delete'
            size='small'
            onClick={() => handleDeleteMedia(media.id)}
            className={styles.media_btn}
          >
            x
          </IconButton>
        </Grid>
      ))}
      <Button variant='contained' size='medium' onClick={handleMediaPickerVisibility}>
        upload new
      </Button>
      {mediaPicker && <MediaPicker id={id} />}
    </Grid>
  );
};
