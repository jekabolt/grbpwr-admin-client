import { FC } from 'react';
import styles from 'styles/mediaSelector.scss';
import { ThumbnailProps } from '../../../interfaces-type/thumbnailInterface';

export const MediaPicker: FC<ThumbnailProps> = ({ mediaFile, isLoading }) => {
  return (
    <div className={styles.media_picker_img_wrapper}>
      <ul className={styles.media_selector_img_container}>
        {mediaFile?.map((media) => (
          <li
            key={`${media.id}-${media.media?.fullSize}`}
            className={styles.media_selector_img_wrapper}
          >
            <img
              key={media.id}
              src={media.media?.fullSize}
              alt='video'
              className={styles.media_selector_img}
            />
          </li>
        ))}
      </ul>
      {isLoading && <div></div>}
    </div>
  );
};
