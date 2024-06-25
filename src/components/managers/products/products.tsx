import { Button, Grid, Theme, useMediaQuery } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import { FC } from 'react';
import { AllProducts } from './listProducts/allProducts';

export const Product: FC = () => {
  const navigate = useNavigate();
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));

  const navigateAddProduct = () => {
    navigate({ to: ROUTES.addProduct });
  };

  return (
    <Layout>
      <Grid container spacing={2} justifyContent='center' padding={isMobile ? '10%' : '3%'}>
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
