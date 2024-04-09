import { Box, Grid } from '@mui/material';
import { Layout } from 'components/login/layout';
import { ByUrl } from 'features/mediaSelector/byUrl';
import { DragDrop } from 'features/mediaSelector/dragDrop';
import { FilterMedias } from 'features/mediaSelector/filterMedias';
import { MediaList } from 'features/mediaSelector/listMedia';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useEffect } from 'react';
import styles from 'styles/media-selector.scss';

export const MediaManager: FC = () => {
  const {
    media,
    setMedia,
    fetchFiles,
    reload,
    url,
    setUrl,
    updateLink,
    sortedAndFilteredMedia,
    isLoading,
    filterByType,
    setFilterByType,
    sortByDate,
    setSortByDate,
  } = useMediaSelector();

  useEffect(() => {
    fetchFiles(50, 0);
  }, [fetchFiles]);

  return (
    <Layout>
      <Grid container spacing={2} marginTop={4} justifyContent='center'>
        <Grid item xs={9}>
          <Box component='div' className={styles.filter_upload_media_container}>
            <ByUrl url={url} setUrl={setUrl} updateContentLink={updateLink} isLoading={isLoading} />
            <DragDrop reload={reload} />
            <FilterMedias
              filterByType={filterByType}
              setFilterByType={setFilterByType}
              sortByDate={sortByDate}
              setSortByDate={setSortByDate}
            />
          </Box>
        </Grid>
        <Grid item xs={10}>
          <MediaList
            media={media}
            setMedia={setMedia}
            allowMultiple={false}
            selectedMedia={[]}
            select={() => {}}
            height='auto'
            sortedAndFilteredMedia={sortedAndFilteredMedia}
          />
        </Grid>
      </Grid>
    </Layout>
  );
};
