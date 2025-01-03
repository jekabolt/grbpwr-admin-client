import { Button, Grid2 as Grid } from '@mui/material';
import { addHero, getHero } from 'api/hero';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { common_HeroEntity } from 'api/proto-http/frontend';
import { Layout } from 'components/login/layout';
import { isValidUrlForHero } from 'features/utilitty/isValidUrl';
import { Field, FieldArray, Form, Formik } from 'formik';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useEffect, useRef, useState } from 'react';
import styles from 'styles/hero.scss';
import { isValidUrl } from '../archive/utility/isValidUrl';
import { Entities } from './entities/entities';
import { SelectHeroType } from './selectHeroType';
import { heroValidationSchema } from './utility/heroValidationShema';
import { mapHeroFunction } from './utility/mapHeroFunction';

export const Hero: FC = () => {
  const { showMessage, clearAll } = useSnackBarStore();
  const [hero, setHero] = useState<common_HeroFullInsert>(mapHeroFunction());
  const [entities, setEntities] = useState<common_HeroEntity[]>([]);
  const entityRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

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
      if (entity.single) {
        checkUrl(entity.single.exploreLink, 'Single Add');
      }
      if (entity.main) {
        checkUrl(entity.main.single?.exploreLink, 'Main Add');
      }
      if (entity.double) {
        checkUrl(entity.double.left?.exploreLink, 'Double Add Left');
        checkUrl(entity.double.right?.exploreLink, 'Double Add Right');
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

    clearAll();

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
      showMessage('hero saved successfully', 'success');
      fetchHero();
    } catch {
      showMessage('hero can not be saved', 'error');
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
    </Layout>
  );
};
