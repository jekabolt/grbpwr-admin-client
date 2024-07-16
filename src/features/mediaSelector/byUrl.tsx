import { Box, CircularProgress, Grid, TextField, Theme, useMediaQuery } from '@mui/material';
import { UploadMediaByUrlProps } from 'features/interfaces/mediaSelectorInterfaces';
import { checkIsHttpHttpsMediaLink } from 'features/utilitty/checkIsHttpHttpsLink';
import { FC } from 'react';

export const ByUrl: FC<UploadMediaByUrlProps> = ({ url, setUrl, isLoading }) => {
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const isValidUrl = (urlString: string) => {
    try {
      new URL(urlString);
      return checkIsHttpHttpsMediaLink(urlString);
    } catch (e) {
      setUrl('');
      return false;
    }
  };
  return (
    <Grid container>
      <Grid item xs={12}>
        <Box display='flex' gap='5px'>
          <TextField
            size='small'
            label='upload media by url'
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={!isValidUrl(url) && url.length > 0}
            fullWidth={isMobile}
          />
          {isLoading && <CircularProgress />}
        </Box>
      </Grid>
    </Grid>
  );
};
