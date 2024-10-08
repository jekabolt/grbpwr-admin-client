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
      <Grid container spacing={2} justifyContent='center'>
        <Grid item position='fixed' right={10} bottom={10}>
          <Button onClick={navigateAddProduct} sx={{ backgroundColor: '#000', color: '#fff' }}>
            add
          </Button>
        </Grid>
        <Grid item xs={12}>
          <AllProducts />
        </Grid>
      </Grid>
    </Layout>
  );
};
