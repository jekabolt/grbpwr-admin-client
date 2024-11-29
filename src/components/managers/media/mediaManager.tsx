import { Grid } from '@mui/material';
import { MediaSelector } from 'components/common/mediaSelector/layout/mediaSelector';
import { Layout } from 'components/login/layout';
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
