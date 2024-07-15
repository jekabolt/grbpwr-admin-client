import { Grid } from '@mui/material';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC } from 'react';
import styles from 'styles/product-id-media.scss';
import { SingleMediaView } from '../managers/products/productDetails/utility/interfaces';

export const SingleMediaViewAndSelect: FC<SingleMediaView> = ({
  link,
  isEditMode,
  saveSelectedMedia,
}) => {
  return (
    <Grid container>
      <Grid item xs={12} className={styles.thumbnail_container}>
        {link ? (
          isVideo(link) ? (
            <video src={link} controls></video>
          ) : (
            <img src={link} alt='thumbnail' />
          )
        ) : (
          ''
        )}
        <Grid item className={link ? styles.media_selector : styles.empty_media_selector}>
          <MediaSelectorLayout
            label={link ? 'edit' : 'select media'}
            isEditMode={isEditMode}
            allowMultiple={false}
            saveSelectedMedia={saveSelectedMedia}
          />
        </Grid>
      </Grid>
    </Grid>
  );
};
