import { Alert, Button, Grid, Snackbar } from '@mui/material';
import { addHero, getHero } from 'api/hero';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { common_HeroEntity } from 'api/proto-http/frontend';
import { Layout } from 'components/login/layout';
import { Field, FieldArray, Form, Formik } from 'formik';
import { FC, useEffect, useRef, useState } from 'react';
import styles from 'styles/hero.scss';
import { Entities } from './entities/entities';
import { SelectHeroType } from './selectHeroType';
import { heroValidationSchema } from './utility/heroValidationShema';
import { mapHeroFunction } from './utility/mapHeroFunction';

export const Hero: FC = () => {
  const [hero, setHero] = useState<common_HeroFullInsert>(mapHeroFunction());
  const [entities, setEntities] = useState<common_HeroEntity[]>([]);
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
  const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');
  const entityRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackBarMessage(message);
    setSnackBarSeverity(severity);
    setIsSnackBarOpen(true);
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

  const saveHero = async (values: common_HeroFullInsert) => {
    try {
      await addHero({ hero: values });
      showMessage('HERO SAVED SUCCESSFULLY', 'success');
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
                  <Field
                    component={Entities}
                    entities={entities}
                    entityRefs={entityRefs}
                    arrayHelpers={arrayHelpers}
                  />
                  <Grid item xs={12} md={10}>
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
      <Snackbar
        open={isSnackBarOpen}
        autoHideDuration={3000}
        onClose={() => setIsSnackBarOpen(false)}
      >
        <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
      </Snackbar>
    </Layout>
  );
};
