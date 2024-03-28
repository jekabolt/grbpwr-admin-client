import { Grid } from '@mui/material';
import { useMatch } from '@tanstack/react-location';
import { getProductByID } from 'api/admin';
import { common_ProductFull } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import { MediaView } from './productMedia/mediaView';
import { ProductSizesAndMeasurements } from './productSizesAndMeasurements/productSizesAndMeasurements';
import { ProductIdInformation } from './productdInformation/productIdInformation';
import { ProductIdProps } from './utility/type';

export const Details: FC = () => {
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
          <ProductIdInformation product={product} id={id} fetchProduct={fetchProduct} />
        </Grid>
        <Grid item xs={11}>
          <ProductSizesAndMeasurements product={product} fetchProduct={fetchProduct} id={id} />
        </Grid>
      </Grid>
    </Layout>
  );
};
