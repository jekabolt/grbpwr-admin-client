import { ROUTES } from 'constants/routes';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ListArchive } from './components/archive-list';

export function Archives() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  return (
    <div>
      <Button
        size='lg'
        variant='main'
        onClick={openModal}
        asChild
        className='fixed bottom-4 right-4 lg:bottom-2 lg:right-2 z-30'
      >
        <Link to={ROUTES.addArchive}>create new</Link>
      </Button>
      <ListArchive />
      {/* <ArchiveForm open={isModalOpen} onClose={closeModal} /> */}
    </div>
  );
}
