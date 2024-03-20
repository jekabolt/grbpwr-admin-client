import { Button, Grid, TextField } from '@mui/material';
import { UploadMediaByUrlProps } from 'features/interfaces/mediaSelectorInterfaces';
import { FC } from 'react';

export const ByUrl: FC<UploadMediaByUrlProps> = ({
  url,
  setUrl,
  updateMediaByUrl,
  closeMediaSelector,
}) => {
  const addAndClose = () => {
    updateMediaByUrl();
    closeMediaSelector();
  };
  return (
    <Grid container spacing={2}>
      <Grid item>
        <TextField
          size='small'
          label='upload new'
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </Grid>
      <Grid item>
        <Button
          variant='contained'
          size='medium'
          sx={{ backgroundColor: 'black' }}
          onClick={addAndClose}
        >
          upload
        </Button>
      </Grid>
    </Grid>
  );
};
