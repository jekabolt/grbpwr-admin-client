import { Grid } from '@mui/material';
import { DragDrop } from 'components/managers/product/componentsOfProduct/dragDrop';
import { MediaSelectorUploadMediaByUrByDragDropProps } from 'features/interfaces/mediaSelectorInterfaces';
import { FC } from 'react';
import { ByUrl } from './byUrl';

export const UploadMediaByUrlByDragDrop: FC<MediaSelectorUploadMediaByUrByDragDropProps> = ({
  url,
  setUrl,
  updateMediaByUrl,
  reload,
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
        <ByUrl url={url} setUrl={setUrl} updateMediaByUrl={updateMediaByUrl} />
      </Grid>
      <Grid item xs={2}>
        <DragDrop reloadFile={reload} />
      </Grid>
    </Grid>
  );
};
