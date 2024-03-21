import { Grid } from '@mui/material';
import { DragDrop } from 'components/managers/product/componentsOfProduct/dragDrop';
import { MediaSelectorUploadMediaByUrByDragDropProps } from 'features/interfaces/mediaSelectorInterfaces';
import { FC } from 'react';
import { ByUrl } from './byUrl';

export const UploadMediaByUrlByDragDrop: FC<MediaSelectorUploadMediaByUrByDragDropProps> = ({
  reload,
  closeMediaSelector,
  url,
  setUrl,
  updateContentLink,
}) => {
  return (
    <Grid
      container
      direction='column'
      style={{ height: '100%' }}
      alignItems='center'
      justifyContent='center'
      spacing={4}
    >
      <Grid item xs={2}>
        <ByUrl
          closeMediaSelector={closeMediaSelector}
          url={url}
          setUrl={setUrl}
          updateContentLink={updateContentLink}
        />
      </Grid>
      <Grid item xs={2}>
        <DragDrop reloadFile={reload} />
      </Grid>
    </Grid>
  );
};
