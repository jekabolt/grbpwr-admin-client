import { AppBar, Button, Grid, Toolbar } from '@mui/material';
import { Layout } from 'components/login/layout';
import { FC, useState } from 'react';
import { CreateArchive } from './createArchive/createArchive';
// import { fetchArchives } from './fetcharchive';
// import { ListArchive } from './listArchive/listArchive';

export const Archive: FC = () => {
  const [isCreateArchiveModalOpen, setIsCreateArchiveModalOpen] = useState(false);

  const handleOpenCreateArchiveModal = () => setIsCreateArchiveModalOpen(true);
  const handleCloseCreateArchiveModal = () => setIsCreateArchiveModalOpen(false);

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
          <CreateArchive />
        </Grid>
        {/* <Grid item xs={12}>
          <ListArchive
            archive={archive}
            setArchive={setArchive}
            deleteArchiveFromList={deleteArchiveFromList}
            deleteItemFromArchive={deleteItemFromArchive}
            updateArchiveInformation={updateArchiveInformation}
          />
        </Grid> */}
      </Grid>
    </Layout>
  );
};
