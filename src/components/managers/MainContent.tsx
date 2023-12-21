import { FC } from 'react';
import { useNavigate } from '@tanstack/react-location';
import { ROUTES } from 'constants/routes';
import { Layout } from 'components/layout/layout';
import styles from 'styles/main.scss';

export const Main: FC = () => {
  const navigate = useNavigate();

  const navigateMediaManager = () => {
    navigate({ to: ROUTES.media, replace: true });
  };

  const navigateProductManager = () => {
    navigate({ to: ROUTES.product, replace: true });
  };

  return (
    <Layout>
      <div className={styles.main}>
        <button onClick={navigateMediaManager} className={styles.btn}>
          MEDIA
        </button>
        <button onClick={navigateProductManager} className={styles.btn}>
          PRODUCTS
        </button>
        <button className={styles.btn}>ORDERS</button>
        <button className={styles.btn}>HERO</button>
        <button className={styles.btn}>ARCHIVE</button>
        <button className={styles.btn}>ART</button>
      </div>
    </Layout>
  );
};
