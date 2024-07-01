import { Alert, Grid, Snackbar, Theme, useMediaQuery } from '@mui/material';
import { Layout } from 'components/login/layout';
import { FC, useEffect } from 'react';
import { CreatePromo } from './createPromo';
import { ListPromo } from './listPromo';
import usePromo from './usePromo';

export const Promo: FC = () => {
  const {
    promos,
    snackBarMessage,
    snackBarSeverity,
    isSnackBarOpen,
    fetchPromos,
    createNewPromo,
    setIsSnackBarOpen,
    showMessage,
  } = usePromo();

  useEffect(() => {
    fetchPromos(50, 0);
  }, [fetchPromos]);

  return (
    <Layout>
      <Grid container justifyContent='center' spacing={2}>
        <Grid item xs={12}>
          <CreatePromo createNewPromo={createNewPromo} showMessage={showMessage} />
        </Grid>
        <Grid item xs={12}>
          <ListPromo promos={promos} fetchPromos={fetchPromos} showMessage={showMessage} />
        </Grid>
      </Grid>
      <Snackbar
        open={isSnackBarOpen}
        autoHideDuration={6000}
        onClose={() => setIsSnackBarOpen(!isSnackBarOpen)}
      >
        <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
      </Snackbar>
    </Layout>
  );
};
