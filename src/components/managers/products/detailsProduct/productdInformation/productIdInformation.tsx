import { Grid } from '@mui/material';
import { FC } from 'react';
import { ProductIdProps } from '../utility/interfaces';
import { Product } from './product/product';

export const ProductIdInformation: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  return (
    <Grid container>
      <Grid item xs={12}>
        <Product product={product} id={id} fetchProduct={fetchProduct} />
      </Grid>
    </Grid>
  );
};
