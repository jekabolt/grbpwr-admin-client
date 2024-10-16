import { Grid } from '@mui/material';
import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC } from 'react';
import styles from 'styles/product-id-media.scss';

interface SingleMediaView {
  link: string | undefined;
  isEditMode?: boolean;
  isAddingProduct?: boolean;
  aspectRatio?: string[];
  hideVideos?: boolean;
  saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
}

export const SingleMediaViewAndSelect: FC<SingleMediaView> = ({
  link,
  isEditMode,
  isAddingProduct,
  aspectRatio,
  hideVideos,
  saveSelectedMedia,
}) => {
  return (
    <Grid container>
      <Grid item xs={12} className={styles.thumbnail_container}>
        {link &&
          (isVideo(link) ? (
            <video src={link} controls></video>
          ) : (
            <img src={link} alt='thumbnail' />
          ))}
        {(isEditMode === undefined || isEditMode || isAddingProduct) && (
          <Grid item className={link ? styles.media_selector : styles.empty_media_selector}>
            <MediaSelectorLayout
              label={link ? 'edit' : 'select media'}
              isEditMode={isEditMode}
              allowMultiple={false}
              aspectRatio={aspectRatio}
              hideVideos={hideVideos}
              saveSelectedMedia={saveSelectedMedia}
            />
          </Grid>
        )}
      </Grid>
    </Grid>
  );
};
