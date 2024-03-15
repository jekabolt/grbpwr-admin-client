import { Grid } from '@mui/material';
import { FC } from 'react';
import styles from 'styles/product-id-media.scss';
import { ThumbnailProps } from '../../../interfaces-type/thumbnailInterface';
import { UploadMediaThumbnail } from './upload-thumbnail-byUrl';

export const MediaSelector: FC<ThumbnailProps> = ({ setProduct, product, id }) => {
  return (
    <div className={styles.product_id_media_selector_overlay}>
      <Grid container className={styles.product_id_media_selector_container}>
        <Grid item xs={6}>
          <UploadMediaThumbnail id={id} product={product} setProduct={setProduct} />
        </Grid>
        <Grid item xs={6}></Grid>
      </Grid>
    </div>
  );
};
