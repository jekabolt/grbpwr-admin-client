import { useState } from 'react';
import { Button } from 'ui/components/button';
import { Layout } from 'ui/layout';
import { ArchiveForm } from './form/form';
import { ListArchive } from './listArchive/list-archive';

export function Archive() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  return (
    <Layout>
      <Button
        size='lg'
        onClick={openModal}
        className='fixed bottom-4 right-4 lg:bottom-2 lg:right-2 z-30'
      >
        create new
      </Button>

      <ListArchive />

      <ArchiveForm open={isModalOpen} onClose={closeModal} />
    </Layout>
  );
}
