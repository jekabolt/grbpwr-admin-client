import { Grid } from '@mui/material';
import { DragDrop } from 'components/managers/product/componentsOfProduct/dragDrop';
import { FC } from 'react';
import styles from 'styles/product-id-media.scss';
import { ThumbnailProps } from '../../../interfaces-type/thumbnailInterface';
import { UploadThumbnail } from './uploadThumbnail';

export const UploadMediaThumbnail: FC<ThumbnailProps> = ({
  reloadFile,
  id,
  product,
  setProduct,
}) => {
  return (
    <Grid
      container
      direction='column'
      justifyContent='center'
      alignItems='center'
      className={styles.product_id_upload_by_url}
    >
      <Grid item xs={3}>
        <UploadThumbnail product={product} setProduct={setProduct} id={id} />
      </Grid>
      <Grid item xs={3}>
        <DragDrop reloadFile={reloadFile} />
      </Grid>
    </Grid>
  );
};
