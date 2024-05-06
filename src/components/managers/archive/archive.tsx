import { Grid } from '@mui/material';
import { Layout } from 'components/login/layout';
import { FC } from 'react';
import { CreateArchive } from './createArchive/createArchive';

export const Archive: FC = () => {
  return (
    <Layout>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <CreateArchive />
        </Grid>
      </Grid>
    </Layout>
  );
};
