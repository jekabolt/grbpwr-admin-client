import { Grid } from '@mui/material';
import { DragDrop } from 'components/managers/product/componentsOfProduct/dragDrop';
import { FC } from 'react';
import { ProductIdMediaProps } from '../../../../utility/interfaces';
import { ByUrl } from './byUrl';

export const UploadThumbnailByUrl: FC<ProductIdMediaProps> = ({
  product,
  setProduct,
  id,
  reload,
}) => {
  return (
    <Grid
      container
      direction='column'
      style={{ height: '100%' }}
      alignItems='center'
      justifyContent='center'
    >
      <Grid item xs={2}>
        <ByUrl product={product} id={id} setProduct={setProduct} />
      </Grid>
      <Grid item xs={2}>
        <DragDrop reloadFile={reload} />
      </Grid>
    </Grid>
  );
};
