import { Button, Grid, TextField } from '@mui/material';
import { FC } from 'react';
import { MediaPickerByUrlProps } from '../../../../utility/interfaces';

export const ByUrl: FC<MediaPickerByUrlProps> = ({ url, setUrl, updateNewMediaByUrl }) => {
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
          onClick={updateNewMediaByUrl}
        >
          upload
        </Button>
      </Grid>
    </Grid>
  );
};
