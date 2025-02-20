import { Button, Grid } from '@mui/material';
import { ROUTES } from 'constants/routes';
import { FC } from 'react';
import { useNavigate } from 'react-router-dom';

export const SideBarItems: FC = () => {
  const navigate = useNavigate();

  const navigateMediaManager = () => {
    navigate(ROUTES.media);
  };

  const navigateProductManager = () => {
    navigate(ROUTES.product);
  };

  const navigateHero = () => {
    navigate(ROUTES.hero);
  };

  const navigatePromo = () => {
    navigate(ROUTES.promo);
  };

  const navigateArchive = () => {
    navigate(ROUTES.archive);
  };

  const navigateSettings = () => {
    navigate(ROUTES.settings);
  };

  const navigateOrders = () => {
    navigate(ROUTES.orders);
  };

  return (
    <div>
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
  );
};
