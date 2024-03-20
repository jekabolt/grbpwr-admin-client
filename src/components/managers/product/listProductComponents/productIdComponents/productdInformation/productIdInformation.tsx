import { Grid } from '@mui/material';
import { FC } from 'react';
import { ProductIdProps } from '../utility/interfaces';
import { Product } from './product/product';

export const ProductIdInformation: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  return (
    <Grid container style={{ border: '1px solid black' }}>
      <Grid item>
        <Product product={product} id={id} fetchProduct={fetchProduct} />
      </Grid>
    </Grid>
  );
};
