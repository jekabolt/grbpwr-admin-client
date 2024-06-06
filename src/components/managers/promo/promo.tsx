import { Grid } from '@mui/material';
import { Layout } from 'components/login/layout';
import { FC, useEffect } from 'react';
import { CreatePromo } from './createPromo';
import { ListPromo } from './listPromo';
import usePromo from './usePromo';

export const Promo: FC = () => {
  const { promos, fetchPromos } = usePromo();
  useEffect(() => {
    fetchPromos(50, 0);
  }, [fetchPromos]);
  return (
    <Layout>
      <Grid container justifyContent='center' spacing={2}>
        <Grid item xs={12}>
          <CreatePromo fetchPromos={fetchPromos} />
        </Grid>
        <Grid item>
          <ListPromo promos={promos} />
        </Grid>
      </Grid>
    </Layout>
  );
};
