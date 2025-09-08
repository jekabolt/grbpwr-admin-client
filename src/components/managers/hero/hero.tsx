// import { useHeroStore } from 'lib/stores/hero/store';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useRef } from 'react';
import { Layout } from 'ui/layout';
// import styles from 'styles/hero.scss';
// import { Entities } from './entities/entities';

export const Hero: FC = () => {
  const { showMessage, clearAll } = useSnackBarStore();
  // const { hero, fetchHero, saveHero } = useHeroStore();
  const entityRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // useEffect(() => {
  //   fetchHero();
  // }, []);

  // const handleSaveHero = async (values: common_HeroFullInsert) => {
  //   const { invalidUrls, nonAllowedDomainUrls } = validateExploreLinks(values);
  //   clearAll();

  //   invalidUrls.forEach((message) => {
  //     showMessage(message, 'error');
  //   });

  //   nonAllowedDomainUrls.forEach((message) => {
  //     showMessage(message, 'error');
  //   });

  //   if (invalidUrls.length > 0) {
  //     return;
  //   }

  //   const { success } = await saveHero(values);
  //   if (success) {
  //     showMessage('hero saved successfully', 'success');
  //   } else {
  //     showMessage('hero can not be saved', 'error');
  //   }
  // };

  return (
    <Layout>
      hero
      {/* <Formik
        initialValues={mapHeroFunction(hero)}
        validationSchema={heroValidationSchema}
        enableReinitialize
        onSubmit={handleSaveHero}
      >
        {({ handleSubmit }) => (
          <Form onSubmit={handleSubmit}>
            <FieldArray
              name='entities'
              render={(arrayHelpers) => (
                <Grid
                  container
                  spacing={2}
                  // className={styles.entities_container}
                >
                  <Grid size={{ xs: 12, md: 7 }}>
                    <Field component={NavbarHero} />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    {/* <Field
                      component={Entities}
                      entityRefs={entityRefs}
                      arrayHelpers={arrayHelpers}
                    /> */}
      {/* </Grid>
                  <Grid size={{ xs: 12 }}>
                    <Field
                      component={SelectHeroType}
                      arrayHelpers={arrayHelpers}
                      entityRefs={entityRefs}
                    />
                  </Grid>
                </Grid>
              )}
            /> */}
      {/* // <Grid container>
            //   <Button
            //     type='submit'
            //     variant='contained'
            //     color='primary'
            //     sx={{ position: 'fixed', bottom: '20px', right: '20px' }}
            //   >
            //     Save
            //   </Button>
            // </Grid> */}
      {/* </Form>
        )}
      </Formik> */}
    </Layout>
  );
};
