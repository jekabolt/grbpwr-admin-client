import { Button, Grid } from '@mui/material';
import { MediaSelectorLayoutProps } from 'features/interfaces/mediaSelectorInterfaces';
import { FC, useState } from 'react';
import { MediaSelectorModal } from './mediaSelectorModal';

export const MediaSelectorLayout: FC<MediaSelectorLayoutProps> = ({
  label,
  allowMultiple,
  aspectRatio,
  hideVideos,
  saveSelectedMedia,
}) => {
  const [mediaSelectorVisibility, setMediaSelectorVisibility] = useState(false);

  const handleMediaSelectorVisibility = () => {
    setMediaSelectorVisibility(!mediaSelectorVisibility);
  };
  return (
    <Grid container justifyContent='center'>
      <Grid item>
        <Button variant='contained' size='medium' onClick={handleMediaSelectorVisibility}>
          {label}
        </Button>
      </Grid>
      <Grid item>
        {mediaSelectorVisibility && (
          <MediaSelectorModal
            aspectRatio={aspectRatio}
            hideVideos={hideVideos}
            allowMultiple={allowMultiple}
            saveSelectedMedia={saveSelectedMedia}
            closeMediaSelector={handleMediaSelectorVisibility}
          />
        )}
      </Grid>
    </Grid>
  );
};
