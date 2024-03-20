import { Button, Grid } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import { FC } from 'react';
import styles from 'styles/main.scss';

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
      <div className={styles.main}>
        <Grid container direction='column' spacing={2}>
          <Grid item>
            <Button variant='contained' onClick={navigateMediaManager} className={styles.btn}>
              MEDIA
            </Button>
          </Grid>
          <Grid item>
            <Button variant='contained' onClick={navigateProductManager} className={styles.btn}>
              PRODUCTS
            </Button>
          </Grid>
          <Grid item>
            <Button variant='contained' onClick={navigateOrders} className={styles.btn}>
              ORDERS
            </Button>
          </Grid>
          <Grid item>
            <Button variant='contained' onClick={navigateHero} className={styles.btn}>
              HERO
            </Button>
          </Grid>
          <Grid item>
            <Button variant='contained' onClick={navigatePromo} className={styles.btn}>
              PROMO
            </Button>
          </Grid>
          <Grid item>
            <Button variant='contained' onClick={navigateArchive} className={styles.btn}>
              ARCHIVE
            </Button>
          </Grid>
          <Grid item>
            <Button variant='contained' onClick={navigateSettings} className={styles.btn}>
              SETTINGS
            </Button>
          </Grid>
        </Grid>
      </div>
    </Layout>
  );
};
