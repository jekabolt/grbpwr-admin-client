import { Button, Grid, TextField } from '@mui/material';
import { UploadMediaByUrlProps } from 'features/interfaces/mediaSelectorInterfaces';
import { FC } from 'react';

export const ByUrl: FC<UploadMediaByUrlProps> = ({ url, setUrl, updateContentLink }) => {
  const addAndClose = () => {
    updateContentLink();
  };
  return (
    <Grid container spacing={2}>
      <Grid item xs={6}>
        <TextField
          size='small'
          label='upload new'
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </Grid>
      <Grid item xs={6}>
        <Button variant='contained' size='medium' onClick={addAndClose}>
          upload
        </Button>
      </Grid>
    </Grid>
  );
};
