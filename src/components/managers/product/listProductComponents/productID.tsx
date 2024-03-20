import { Grid } from '@mui/material';
import { useMatch } from '@tanstack/react-location';
import { getProductByID } from 'api/admin';
import { common_ProductFull } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import { MediaView } from './productIdComponents/mediaView/mediaView';
import { ProductIdInformation } from './productIdComponents/productdInformation/productIdInformation';
import { productIdInformation } from './productIdComponents/productdInformation/utility/productObject';
import { ProductIdProps } from './productIdComponents/utility/type';

export const ProductID: FC = () => {
  const [prod, setProd] = useState<common_ProductFull | undefined>();
  const [prodcutDetails, setProductDetails] = useState({ ...productIdInformation });
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
    setProd(response.product);
  };

  return (
    <Layout>
      <h2>product id = {id}</h2>
      <Grid container spacing={4} style={{ width: '90%', margin: '30px' }}>
        <Grid item xs={5}>
          <MediaView product={prod} setProduct={setProd} id={id} fetchProduct={fetchProduct} />
        </Grid>
        <Grid item xs={7}>
          <ProductIdInformation
            product={prod}
            setProduct={setProd}
            id={id}
            fetchProduct={fetchProduct}
          />
        </Grid>
      </Grid>
    </Layout>
  );
};
