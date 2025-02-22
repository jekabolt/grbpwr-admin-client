import { AppBar, Button, Toolbar } from '@mui/material';

import { Layout } from 'components/ui/layout';
import { useState } from 'react';
import { ArchiveForm } from './form/form';
import { ListArchive } from './listArchive/list-archive';

export function Archive() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

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
          <Button variant='contained' onClick={openModal}>
            new
          </Button>
        </Toolbar>
      </AppBar>
      <ListArchive />
      <ArchiveForm open={isModalOpen} onClose={closeModal} />
    </Layout>
  );
}
