import { Button } from '@mui/material';
import { MediaSelectorLayoutProps } from 'features/interfaces/mediaSelectorInterfaces';
import { FC, useState } from 'react';
import { MediaSelectorModal } from './mediaSelectorModal';

export const MediaSelectorLayout: FC<MediaSelectorLayoutProps> = ({
  label,
  allowMultiple,
  saveSelectedMedia,
}) => {
  const [mediaSelectorVisibility, setMediaSelectorVisibility] = useState(false);

  const handleMediaSelectorVisibility = () => {
    setMediaSelectorVisibility(!mediaSelectorVisibility);
  };
  return (
    <>
      <Button variant='contained' size='medium' onClick={handleMediaSelectorVisibility}>
        {label}
      </Button>
      <div>
        {mediaSelectorVisibility && (
          <MediaSelectorModal
            saveSelectedMedia={saveSelectedMedia}
            closeMediaSelector={handleMediaSelectorVisibility}
            allowMultiple={allowMultiple}
          />
        )}
      </div>
    </>
  );
};
