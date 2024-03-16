import { Grid, IconButton } from '@mui/material';
import { FC } from 'react';
import styles from 'styles/product-id-media.scss';
import { ProductIdMediaProps } from '../../utility/interfaces';

export const MediaList: FC<ProductIdMediaProps> = ({ product }) => {
  function handleDeleteMedia(id: number | undefined) {
    throw new Error('Function not implemented.');
  }

  return (
    <Grid container gap={5} className={styles.listed_media_container}>
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
    </Grid>
  );
};
