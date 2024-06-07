import { Alert, Grid, Snackbar } from '@mui/material';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import { CreatePromo } from './createPromo';
import { ListPromo } from './listPromo';
import usePromo from './usePromo';

export const Promo: FC = () => {
  const { promos, fetchPromos } = usePromo();
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
  const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackBarMessage(message);
    setSnackBarSeverity(severity);
    setIsSnackBarOpen(true);
  };
  useEffect(() => {
    fetchPromos(50, 0);
  }, [fetchPromos]);

  return (
    <Layout>
      <Grid container justifyContent='center' spacing={2}>
        <Grid item xs={12}>
          <CreatePromo fetchPromos={fetchPromos} showMessage={showMessage} />
        </Grid>
        <Grid item xs={12} md={10}>
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
