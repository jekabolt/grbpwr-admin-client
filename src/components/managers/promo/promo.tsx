import { Grid } from '@mui/material';
import { FC, useEffect } from 'react';
import { Layout } from 'ui/layout';
import { CreatePromo } from './createPromo';
import { ListPromo } from './listPromo';
import usePromo from './usePromo';

export const Promo: FC = () => {
  const { promos, fetchPromos, createNewPromo } = usePromo();

  useEffect(() => {
    fetchPromos(50, 0);
  }, [fetchPromos]);

  return (
    <Layout>
      <Grid container justifyContent='center' spacing={2}>
        <Grid item xs={12}>
          <CreatePromo createNewPromo={createNewPromo} />
        </Grid>
        <Grid item xs={12}>
          <ListPromo promos={promos} fetchPromos={fetchPromos} />
        </Grid>
      </Grid>
    </Layout>
  );
};
