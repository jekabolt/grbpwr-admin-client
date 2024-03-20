import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { FC } from 'react';
import styles from 'styles/product-id-media.scss';
import { MediaViewComponentsProps } from '../../utility/interfaces';

export const Thumbnail: FC<MediaViewComponentsProps> = ({
  product,
  url,
  setUrl,
  updateMediaByUrl,
  handleSelectedMedia,
  select,
  selectedMedia,
}) => {
  return (
    <>
      <div className={styles.thumbnail_container}>
        <img src={product?.product?.productInsert?.thumbnail} alt='thumbnail' />
        <div className={styles.media_selector}>
          <MediaSelectorLayout
            label='edit'
            url={url}
            setUrl={setUrl}
            updateMediaByUrl={updateMediaByUrl}
            handleSelectedMedia={handleSelectedMedia}
            allowMultiple={false}
            select={select}
            selectedMedia={selectedMedia}
          />
        </div>
      </div>
    </>
  );
};
