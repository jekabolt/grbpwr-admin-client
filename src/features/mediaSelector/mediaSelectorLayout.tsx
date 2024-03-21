import { Button } from '@mui/material';
import { MediaSelectorLayoutProps } from 'features/interfaces/mediaSelectorInterfaces';
import { FC, useState } from 'react';
import { MediaSelector } from './mediaSelector';

export const MediaSelectorLayout: FC<MediaSelectorLayoutProps> = ({
  label,
  handleSelectedMedia,
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
          <MediaSelector
            saveSelectedMedia={saveSelectedMedia}
            closeMediaSelector={handleMediaSelectorVisibility}
            handleSelectedMedia={handleSelectedMedia}
            allowMultiple={allowMultiple}
          />
        )}
      </div>
    </>
  );
};
