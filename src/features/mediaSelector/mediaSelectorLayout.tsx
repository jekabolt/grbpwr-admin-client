import { Button } from '@mui/material';
import { MediaSelectorLayoutProps } from 'features/interfaces/mediaSelectorInterfaces';
import { FC, useState } from 'react';
import { MediaSelector } from './mediaSelector';

export const MediaSelectorLayout: FC<MediaSelectorLayoutProps> = ({
  label,
  url,
  setUrl,
  updateMediaByUrl,
  handleSelectedMedia,
  allowMultiple,
  select,
  selectedMedia,
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
            closeMediaSelector={handleMediaSelectorVisibility}
            url={url}
            setUrl={setUrl}
            updateMediaByUrl={updateMediaByUrl}
            handleSelectedMedia={handleSelectedMedia}
            allowMultiple={allowMultiple}
            select={select}
            selectedMedia={selectedMedia}
          />
        )}
      </div>
    </>
  );
};
