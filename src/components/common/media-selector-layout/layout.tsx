import { Button, Grid2 as Grid } from '@mui/material';
import { FC, useState } from 'react';
import { MediaSelectorLayoutProps } from '../interfaces/mediaSelectorInterfaces';
import { MediaSelectorModal } from './media-selector-components/mediaSelectorModal';

export const MediaSelectorLayout: FC<MediaSelectorLayoutProps> = ({
  label,
  allowMultiple,
  aspectRatio,
  hideVideos,
  isDeleteAccepted,
  saveSelectedMedia,
}) => {
  const [mediaSelectorVisibility, setMediaSelectorVisibility] = useState(false);

  const handleMediaSelectorVisibility = () => {
    setMediaSelectorVisibility(!mediaSelectorVisibility);
  };
  return (
    <Grid container justifyContent='center'>
      <Grid>
        <Button variant='contained' size='medium' onClick={handleMediaSelectorVisibility}>
          {label}
        </Button>
      </Grid>
      <Grid>
        {mediaSelectorVisibility && (
          <MediaSelectorModal
            aspectRatio={aspectRatio}
            hideVideos={hideVideos}
            allowMultiple={allowMultiple}
            isDeleteAccepted={isDeleteAccepted}
            saveSelectedMedia={saveSelectedMedia}
            closeMediaSelector={handleMediaSelectorVisibility}
          />
        )}
      </Grid>
    </Grid>
  );
};
