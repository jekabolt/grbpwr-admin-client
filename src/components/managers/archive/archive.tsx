import { Alert, AppBar, Button, Grid, Snackbar, Toolbar } from '@mui/material';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import { CreateArchive } from './createArchive/createArchive';
import { fetchArchives } from './fetcharchive';
import { ListArchive } from './listArchive/listArchive';

export const Archive: FC = () => {
  const {
    archive,
    isLoading,
    hasMore,
    fetchArchive,
    showMessage,
    snackBarMessage,
    snackBarSeverity,
    isSnackBarOpen,
    setIsSnackBarOpen,
    deleteArchiveFromList,
    deleteItemFromArchive,
    setArchive,
    updateArchiveInformation,
  } = fetchArchives();
  const [isCreateArchiveModalOpen, setIsCreateArchiveModalOpen] = useState(false);

  const handleOpenCreateArchiveModal = () => setIsCreateArchiveModalOpen(true);
  const handleCloseCreateArchiveModal = () => setIsCreateArchiveModalOpen(false);

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
      <AppBar
        position='fixed'
        sx={{
          top: 'auto',
          bottom: 0,
          backgroundColor: 'transparent',
          boxShadow: 'none',
        }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant='contained' onClick={handleOpenCreateArchiveModal}>
            add
          </Button>
        </Toolbar>
      </AppBar>
      <Grid container spacing={2} justifyContent='center'>
        <Grid item xs={12}>
          <CreateArchive
            open={isCreateArchiveModalOpen}
            close={handleCloseCreateArchiveModal}
            fetchArchive={fetchArchive}
            showMessage={showMessage}
          />
        </Grid>
        <Grid item xs={12}>
          <ListArchive
            archive={archive}
            setArchive={setArchive}
            deleteArchiveFromList={deleteArchiveFromList}
            deleteItemFromArchive={deleteItemFromArchive}
            updateArchiveInformation={updateArchiveInformation}
            showMessage={showMessage}
          />
        </Grid>
        <Snackbar
          open={isSnackBarOpen}
          autoHideDuration={6000}
          onClose={() => setIsSnackBarOpen(!isSnackBarOpen)}
        >
          <Alert severity={snackBarSeverity}>{snackBarMessage.toUpperCase()}</Alert>
        </Snackbar>
      </Grid>
    </Layout>
  );
};
