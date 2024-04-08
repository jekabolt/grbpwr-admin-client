import { Box, Button, Grid, TextField } from '@mui/material';
import { UploadMediaByUrlProps } from 'features/interfaces/mediaSelectorInterfaces';
import { FC } from 'react';

export const ByUrl: FC<UploadMediaByUrlProps> = ({ url, setUrl, updateContentLink }) => {
  return (
    <Grid container>
      <Grid item>
        <Box display='flex' gap='5px'>
          <TextField
            size='small'
            label='upload new'
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button variant='contained' size='small' onClick={updateContentLink}>
            upload
          </Button>
        </Box>
      </Grid>
    </Grid>
  );
};
