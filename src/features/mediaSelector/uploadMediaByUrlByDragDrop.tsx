import { Grid } from '@mui/material';
import { MediaSelectorUploadMediaByUrByDragDropProps } from 'features/interfaces/mediaSelectorInterfaces';
import { DragDrop } from 'features/mediaSelector/dragDrop';
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
    <Grid container style={{ marginTop: '5%' }}>
      <Grid item xs={5}>
        <ByUrl
          closeMediaSelector={closeMediaSelector}
          url={url}
          setUrl={setUrl}
          updateContentLink={updateContentLink}
        />
      </Grid>
      <Grid item xs={7}>
        <DragDrop reloadFile={reload} />
      </Grid>
    </Grid>
  );
};
