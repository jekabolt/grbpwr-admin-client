import { Grid } from '@mui/material';
import { Layout } from 'components/login/layout';
import { MediaSelector } from 'features/mediaSelector/mediaSelector';
import { FC } from 'react';

export const MediaManager: FC = () => {
  return (
    <Layout>
      <Grid container justifyContent='center'>
        <Grid item xs={12}>
          <MediaSelector
            select={() => {}}
            selectedMedia={[]}
            allowMultiple={false}
            enableModal={true}
          />
        </Grid>
      </Grid>
    </Layout>
  );
};
