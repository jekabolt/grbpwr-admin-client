import { Grid } from '@mui/material';
import { useMatch } from '@tanstack/react-location';
import { getProductByID } from 'api/admin';
import { common_ProductFull } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import { ProductIDProps } from './product-id-components/interfaces-type/type';
import { MediaWrapper } from './product-id-components/product-id-media/mediaWrapper';

export const ProductID: FC = () => {
  const [product, setProduct] = useState<common_ProductFull | undefined>();
  const {
    params: { id: id },
  } = useMatch<ProductIDProps>();

  useEffect(() => {
    const fetchProduct = async () => {
      const response = await getProductByID({
        id: Number(id),
      });
      setProduct(response.product);
    };
    fetchProduct();
  }, [id]);

  return (
    <Layout>
      <h2>product id = {id}</h2>
      <Grid container spacing={4} style={{ width: '90%', margin: '30px' }}>
        <Grid item xs={5}>
          <MediaWrapper product={product} setProduct={setProduct} id={id} />
        </Grid>
        <Grid item xs={7}>
          <h2 style={{ border: '1px solid black' }}>name</h2>
        </Grid>
      </Grid>
    </Layout>
  );
};
