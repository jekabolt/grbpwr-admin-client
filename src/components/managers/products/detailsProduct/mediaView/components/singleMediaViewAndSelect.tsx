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
        {link ? <img src={link} alt='thumbnail' /> : <h1>No image selected</h1>}
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
