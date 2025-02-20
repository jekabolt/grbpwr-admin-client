import { Button, Grid2 as Grid } from '@mui/material';
import { Layout } from 'components/common/layout';
import { ROUTES } from 'constants/routes';
import { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { AllProducts } from './listProducts/allProducts';

export const Product: FC = () => {
  const navigate = useNavigate();

  const navigateAddProduct = () => {
    navigate(ROUTES.addProduct);
  };

  return (
    <Layout>
      <Grid container spacing={2}>
        <Grid position='fixed' right={10} bottom={10}>
          <Button onClick={navigateAddProduct} sx={{ backgroundColor: '#000', color: '#fff' }}>
            add
          </Button>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <AllProducts />
        </Grid>
      </Grid>
    </Layout>
  );
};
