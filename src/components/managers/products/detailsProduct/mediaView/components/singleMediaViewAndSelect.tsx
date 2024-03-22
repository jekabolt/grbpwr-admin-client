import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { FC } from 'react';
import styles from 'styles/product-id-media.scss';
import { MediaViewComponentsProps } from '../../utility/interfaces';

export const SingleMediaViewAndSelect: FC<MediaViewComponentsProps> = ({
  link,
  saveSelectedMedia,
}) => {
  return (
    <>
      <div className={styles.thumbnail_container}>
        <img src={link} alt='thumbnail' />
        <div className={styles.media_selector}>
          <MediaSelectorLayout
            label='edit'
            saveSelectedMedia={saveSelectedMedia}
            allowMultiple={false}
          />
        </div>
      </div>
    </>
  );
};
