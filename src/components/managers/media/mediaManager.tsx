import { Grid } from '@mui/material';
import { Layout } from 'components/login/layout';
import { MediaList } from 'features/mediaSelector/listMedia';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useEffect } from 'react';

export const MediaManager: FC = () => {
  const { media, setMedia, fetchFiles, reload, url, setUrl, updateLink } = useMediaSelector();

  useEffect(() => {
    fetchFiles(50, 0);
  }, [fetchFiles]);

  return (
    <Layout>
      <Grid container justifyContent='center'>
        <Grid item xs={10}>
          <MediaList
            media={media}
            setMedia={setMedia}
            allowMultiple={false}
            selectedMedia={[]}
            select={() => {}}
            height='auto'
            reload={reload}
            url={url}
            setUrl={setUrl}
            updateContentLink={updateLink}
          />
        </Grid>
      </Grid>
    </Layout>
  );
};
