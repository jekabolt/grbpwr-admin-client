import AddIcon from '@mui/icons-material/Add';
import { Grid, IconButton, Theme, useMediaQuery } from '@mui/material';
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
      <Grid container spacing={2} justifyContent='center'>
        <Grid item position='fixed' right={2} bottom={2}>
          <IconButton
            onClick={navigateAddProduct}
            sx={{ borderRadius: '100%', backgroundColor: '#000', color: '#fff' }}
          >
            <AddIcon />
          </IconButton>
        </Grid>
        <Grid item xs={12}>
          <AllProducts />
        </Grid>
      </Grid>
    </Layout>
  );
};
