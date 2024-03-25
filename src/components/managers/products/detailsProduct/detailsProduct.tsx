import { Grid } from '@mui/material';
import { useMatch } from '@tanstack/react-location';
import { getProductByID } from 'api/admin';
import { common_ProductFull } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import { MediaView } from './mediaView/mediaView';
import { ProductIdInformation } from './productdInformation/productIdInformation';
import { SizesAndMeasurements } from './sizes&measurements/sizesAndMeasurements';
import { ProductIdProps } from './utility/type';

export const DetailsProduct: FC = () => {
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
      <h2>product id = {id}</h2>
      <Grid container spacing={1} justifyContent='center' style={{ width: '90%', margin: '30px' }}>
        <Grid item xs={4}>
          <MediaView product={product} id={id} fetchProduct={fetchProduct} />
        </Grid>
        <Grid item xs={6}>
          <ProductIdInformation product={product} id={id} fetchProduct={fetchProduct} />
        </Grid>
        <Grid item xs={12}>
          <SizesAndMeasurements product={product} fetchProduct={fetchProduct} id={id} />
        </Grid>
      </Grid>
    </Layout>
  );
};
