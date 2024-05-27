import { Box, CircularProgress, Grid, TextField } from '@mui/material';
import { UploadMediaByUrlProps } from 'features/interfaces/mediaSelectorInterfaces';
import { FC } from 'react';

export const ByUrl: FC<UploadMediaByUrlProps> = ({ url, setUrl, isLoading }) => {
  return (
    <Grid container>
      <Grid item>
        <Box display='flex' gap='5px'>
          <TextField
            size='small'
            label='upload media by url'
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {isLoading && <CircularProgress />}
        </Box>
      </Grid>
    </Grid>
  );
};
