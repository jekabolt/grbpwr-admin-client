import { Button, Grid } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { Layout } from 'components/common/layout';
import { ROUTES } from 'constants/routes';
import { FC } from 'react';

export const Main: FC = () => {
  const navigate = useNavigate();

  const navigateMediaManager = () => {
    navigate({ to: ROUTES.media });
  };

  const navigateProductManager = () => {
    navigate({ to: ROUTES.product });
  };

  const navigateHero = () => {
    navigate({ to: ROUTES.hero });
  };

  const navigatePromo = () => {
    navigate({ to: ROUTES.promo });
  };

  const navigateArchive = () => {
    navigate({ to: ROUTES.archive });
  };

  const navigateSettings = () => {
    navigate({ to: ROUTES.settings });
  };

  const navigateOrders = () => {
    navigate({ to: ROUTES.orders });
  };

  return (
    <Layout>
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}
      >
        <Grid container spacing={2} direction='column' justifyContent='center' alignItems='center'>
          <Grid item>
            <Button variant='contained' onClick={navigateMediaManager} sx={{ width: 120 }}>
              MEDIA
            </Button>
          </Grid>

          <Grid item>
            <Button variant='contained' onClick={navigateProductManager} sx={{ width: 120 }}>
              PRODUCTS
            </Button>
          </Grid>

          <Grid item>
            <Button variant='contained' onClick={navigateOrders} sx={{ width: 120 }}>
              ORDERS
            </Button>
          </Grid>

          <Grid item>
            <Button variant='contained' onClick={navigateHero} sx={{ width: 120 }}>
              HERO
            </Button>
          </Grid>

          <Grid item>
            <Button variant='contained' onClick={navigatePromo} sx={{ width: 120 }}>
              PROMO
            </Button>
          </Grid>
          <Grid item>
            <Button variant='contained' onClick={navigateArchive} sx={{ width: 120 }}>
              ARCHIVE
            </Button>
          </Grid>

          <Grid item>
            <Button variant='contained' onClick={navigateSettings} sx={{ width: 120 }}>
              SETTINGS
            </Button>
          </Grid>
        </Grid>
      </div>
    </Layout>
  );
};
