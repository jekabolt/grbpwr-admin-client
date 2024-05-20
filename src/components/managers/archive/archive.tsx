import { Alert, Divider, Grid, Snackbar } from '@mui/material';
import { Layout } from 'components/login/layout';
import { FC, useEffect } from 'react';
import { CreateArchive } from './createArchive/createArchive';
import { fetchArchives } from './fetcharchive';
import { ListArchive } from './listArchive/listArchive';

export const Archive: FC = () => {
  const {
    archive,
    isLoading,
    hasMore,
    fetchArchive,
    deleteArchiveFromList,
    deleteArchiveItem,
    addNewItemsToArchive,
    showMessage,
    snackBarMessage,
    snackBarSeverity,
    isSnackBarOpen,
    setIsSnackBarOpen,
    updateArchiveInformation,
  } = fetchArchives();

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY + 300 >= document.documentElement.offsetHeight &&
        !isLoading &&
        hasMore
      ) {
        fetchArchive(50, archive.length);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore, archive.length, fetchArchive]);

  useEffect(() => {
    fetchArchive(50, 0);
  }, [fetchArchive]);

  return (
    <Layout>
      <Grid container spacing={4} justifyContent='center'>
        <Grid item xs={10}>
          <CreateArchive fetchArchive={fetchArchive} showMessage={showMessage} />
        </Grid>
        <Grid item xs={10}>
          <Divider />
        </Grid>
        <Grid item xs={10}>
          <ListArchive
            archive={archive}
            deleteArchive={deleteArchiveFromList}
            deleteItem={deleteArchiveItem}
            newItemToArchive={addNewItemsToArchive}
            showMessage={showMessage}
            updateArchiveInformation={updateArchiveInformation}
          />
        </Grid>
        <Snackbar
          open={isSnackBarOpen}
          autoHideDuration={6000}
          onClose={() => setIsSnackBarOpen(!isSnackBarOpen)}
        >
          <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
        </Snackbar>
      </Grid>
    </Layout>
  );
};
