import { Button, Grid } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import { FC } from 'react';
import { AllProducts } from './listProducts/allProducts';

export const Product: FC = () => {
  const navigate = useNavigate();

  const navigateAddProduct = () => {
    navigate({ to: ROUTES.addProduct });
  };

  return (
    <Layout>
      <Grid container spacing={2} marginTop={4} justifyContent='center'>
        <Grid item xs={6} sm={3} md={3}>
          <Button onClick={navigateAddProduct} size='large' variant='contained'>
            ADD PRODUCT
          </Button>
        </Grid>
        <Grid item xs={10}>
          <AllProducts />
        </Grid>
      </Grid>
    </Layout>
  );
};
