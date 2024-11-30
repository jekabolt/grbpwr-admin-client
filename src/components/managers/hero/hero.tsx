import { Alert, Button, Grid2 as Grid, Snackbar } from '@mui/material';
import { addHero, getHero } from 'api/hero';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { common_HeroEntity } from 'api/proto-http/frontend';
import { Layout } from 'components/login/layout';
import { isValidUrlForHero } from 'features/utilitty/isValidUrl';
import { Field, FieldArray, Form, Formik } from 'formik';
import { FC, useEffect, useRef, useState } from 'react';
import styles from 'styles/hero.scss';
import { isValidUrl } from '../archive/utility/isValidUrl';
import { Entities } from './entities/entities';
import { SelectHeroType } from './selectHeroType';
import { heroValidationSchema } from './utility/heroValidationShema';
import { mapHeroFunction } from './utility/mapHeroFunction';

export const Hero: FC = () => {
  const [hero, setHero] = useState<common_HeroFullInsert>(mapHeroFunction());
  const [entities, setEntities] = useState<common_HeroEntity[]>([]);
  const [alerts, setAlerts] = useState<
    Array<{
      message: string;
      severity: 'success' | 'error';
      id: number;
    }>
  >([]);
  const entityRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  const showMessage = (message: string, severity: 'success' | 'error') => {
    const newAlert = {
      message,
      severity,
      id: Date.now(),
    };
    setAlerts((prev) => [...prev, newAlert]);
  };

  const handleCloseAlert = (id: number) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  };

  const fetchHero = async () => {
    const response = await getHero({});
    if (!response) return;

    const heroEntities = response.hero?.entities || [];

    setEntities(heroEntities);
    setHero(mapHeroFunction(response.hero));
  };

  useEffect(() => {
    fetchHero();
  }, []);

  const validateExploreLinks = (values: common_HeroFullInsert) => {
    const invalidUrls: string[] = [];
    const nonAllowedDomainUrls: string[] = [];

    values.entities?.forEach((entity) => {
      const checkUrl = (url: string | undefined, type: string) => {
        if (!url) return;

        if (!isValidUrl(url)) {
          invalidUrls.push(`${type} URL is not valid`);
        } else if (!isValidUrlForHero(url)) {
          nonAllowedDomainUrls.push(`${type} URL is not from allowed domain`);
        }
      };
      if (entity.singleAdd) {
        checkUrl(entity.singleAdd.exploreLink, 'Single Add');
      }
      if (entity.mainAdd?.singleAdd) {
        checkUrl(entity.mainAdd.singleAdd.exploreLink, 'Main Add');
      }
      if (entity.doubleAdd) {
        checkUrl(entity.doubleAdd.left?.exploreLink, 'Double Add Left');
        checkUrl(entity.doubleAdd.right?.exploreLink, 'Double Add Right');
      }
      if (entity.featuredProducts) {
        checkUrl(entity.featuredProducts.exploreLink, 'Featured Products');
      }
      if (entity.featuredProductsTag) {
        checkUrl(entity.featuredProductsTag.exploreLink, 'Featured Products Tag');
      }
    });

    return { invalidUrls, nonAllowedDomainUrls };
  };

  const saveHero = async (values: common_HeroFullInsert) => {
    const { invalidUrls, nonAllowedDomainUrls } = validateExploreLinks(values);

    setAlerts([]);

    invalidUrls.forEach((message) => {
      showMessage(message, 'error');
    });

    nonAllowedDomainUrls.forEach((message) => {
      showMessage(message, 'error');
    });

    if (invalidUrls.length > 0) {
      return;
    }

    try {
      await addHero({ hero: values });
      showMessage('HERO SAVED SUCCESSFULLY', 'success');
      fetchHero();
    } catch {
      showMessage("HERO CAN'T BE SAVED", 'error');
    }
  };

  return (
    <Layout>
      <Formik
        initialValues={hero}
        validationSchema={heroValidationSchema}
        enableReinitialize
        onSubmit={saveHero}
      >
        {({ handleSubmit }) => (
          <Form onSubmit={handleSubmit}>
            <FieldArray
              name='entities'
              render={(arrayHelpers) => (
                <Grid container spacing={2} className={styles.entities_container}>
                  <Grid size={{ xs: 12 }}>
                    <Field
                      component={Entities}
                      entities={entities}
                      entityRefs={entityRefs}
                      arrayHelpers={arrayHelpers}
                      showMessage={showMessage}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <Field
                      component={SelectHeroType}
                      arrayHelpers={arrayHelpers}
                      entityRefs={entityRefs}
                    />
                  </Grid>
                </Grid>
              )}
            />

            <Grid container>
              <Button
                type='submit'
                variant='contained'
                color='primary'
                sx={{ position: 'fixed', bottom: '20px', right: '20px' }}
              >
                Save
              </Button>
            </Grid>
          </Form>
        )}
      </Formik>
      {alerts.map((alert, index) => (
        <Snackbar
          key={alert.id}
          open={true}
          autoHideDuration={6000}
          onClose={() => handleCloseAlert(alert.id)}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          style={{
            bottom: `${index * 60 + 20}px`,
          }}
        >
          <Alert severity={alert.severity} onClose={() => handleCloseAlert(alert.id)}>
            {alert.message.toUpperCase()}
          </Alert>
        </Snackbar>
      ))}
    </Layout>
  );
};
