import { Grid } from '@mui/material';
import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC } from 'react';
import { MediaSelectorLayout } from '../layout';

interface SingleMediaView {
  link: string | undefined;
  isEditMode?: boolean;
  isAddingProduct?: boolean;
  aspectRatio?: string[];
  hideVideos?: boolean;
  isDeleteAccepted?: boolean;
  saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
}

export const SingleMediaViewAndSelect: FC<SingleMediaView> = ({
  link,
  isEditMode,
  isAddingProduct,
  aspectRatio,
  hideVideos,
  isDeleteAccepted,
  saveSelectedMedia,
}) => {
  return (
    <Grid container>
      <Grid item xs={12}>
        {link &&
          (isVideo(link) ? (
            <video src={link} controls></video>
          ) : (
            <img src={link} alt='thumbnail' />
          ))}
        {(isEditMode === undefined || isEditMode || isAddingProduct) && (
          <Grid item>
            <MediaSelectorLayout
              label={link ? 'edit' : 'select media'}
              allowMultiple={false}
              aspectRatio={aspectRatio}
              hideVideos={hideVideos}
              isDeleteAccepted={isDeleteAccepted}
              saveSelectedMedia={saveSelectedMedia}
            />
          </Grid>
        )}
      </Grid>
    </Grid>
  );
};

// className={styles.thumbnail_container}

// className={link ? styles.media_selector : styles.empty_media_selector}
