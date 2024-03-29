import { Grid } from '@mui/material';
import { useMatch } from '@tanstack/react-location';
import { getProductByID } from 'api/admin';
import { common_ProductFull } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import { MediaView } from './productMedia/mediaView';
import { ProductSizesAndMeasurements } from './productSizesAndMeasurements/productSizesAndMeasurements';

import { MakeGenerics } from '@tanstack/react-location';
import { BasicProductIformation } from './basicProductInormation/basicProductInformation';
import { ProductTags } from './productTags/productTags';

export type ProductIdProps = MakeGenerics<{
  Params: {
    id: string;
  };
}>;

export const ProductDetails: FC = () => {
  const [product, setProduct] = useState<common_ProductFull | undefined>();
  const {
    params: { id: id },
  } = useMatch<ProductIdProps>();

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const fetchProduct = async () => {
    const response = await getProductByID({
      id: Number(id),
    });
    setProduct(response.product);
  };

  return (
    <Layout>
      <Grid
        container
        spacing={2}
        alignItems='flex-start'
        justifyContent='center'
        style={{ width: '90%', margin: '3%' }}
      >
        <Grid item xs={5}>
          <MediaView product={product} id={id} fetchProduct={fetchProduct} />
        </Grid>
        <Grid item xs={6}>
          <Grid container spacing={2}>
            <Grid item xs={10}>
              <BasicProductIformation product={product} id={id} fetchProduct={fetchProduct} />
            </Grid>
            <Grid item xs={10}>
              <ProductTags product={product} id={id} fetchProduct={fetchProduct} />
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={11}>
          <ProductSizesAndMeasurements product={product} fetchProduct={fetchProduct} id={id} />
        </Grid>
      </Grid>
    </Layout>
  );
};
