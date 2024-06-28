import { Grid } from '@mui/material';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC } from 'react';
import styles from 'styles/product-id-media.scss';
import { MediaViewComponentsProps } from '../managers/products/productDetails/utility/interfaces';

export const SingleMediaViewAndSelect: FC<MediaViewComponentsProps> = ({
  link,
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
            saveSelectedMedia={saveSelectedMedia}
            allowMultiple={false}
          />
        </Grid>
      </Grid>
    </Grid>
  );
};
