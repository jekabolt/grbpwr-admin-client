import { Grid } from '@mui/material';
import { DragDrop } from 'components/managers/product/componentsOfProduct/dragDrop';
import { FC } from 'react';
import { MediaPickerByUrlProps } from '../../../../utility/interfaces';
import { ByUrl } from './byUrl';

export const UploadThumbnailByUrl: FC<MediaPickerByUrlProps> = ({
  reload,
  url,
  setUrl,
  updateNewMediaByUrl,
}) => {
  return (
    <Grid
      container
      direction='column'
      style={{ height: '100%' }}
      alignItems='center'
      justifyContent='center'
    >
      <Grid item xs={2}>
        <ByUrl url={url} setUrl={setUrl} updateNewMediaByUrl={updateNewMediaByUrl} />
      </Grid>
      <Grid item xs={2}>
        <DragDrop reloadFile={reload} />
      </Grid>
    </Grid>
  );
};
