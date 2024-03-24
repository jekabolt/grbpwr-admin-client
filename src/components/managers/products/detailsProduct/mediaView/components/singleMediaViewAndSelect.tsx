import { fileExtensionToContentType } from 'components/managers/media/mediaManager';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { FC } from 'react';
import styles from 'styles/product-id-media.scss';
import { MediaViewComponentsProps } from '../../utility/interfaces';

export const SingleMediaViewAndSelect: FC<MediaViewComponentsProps> = ({
  link,
  saveSelectedMedia,
}) => {
  const isVideo = (mediaUrl: string | undefined) => {
    if (mediaUrl) {
      const extension = mediaUrl.split('.').pop()?.toLowerCase();

      if (extension) {
        const contentType = fileExtensionToContentType[extension];
        return contentType?.startsWith('video/');
      }
    }
    return false;
  };
  return (
    <>
      <div className={styles.thumbnail_container}>
        {isVideo(link) ? <video src={link} controls></video> : <img src={link} alt='thumbnail' />}
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
