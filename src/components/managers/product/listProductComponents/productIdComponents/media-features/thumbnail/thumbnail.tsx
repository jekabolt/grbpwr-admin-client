import { Button } from '@mui/material';
import { FC, useState } from 'react';
import styles from 'styles/product-id-media.scss';
import { MediaComponentProps } from '../../utility/interfaces';
import { ThumbnailSelector } from './thumbnail-features/thumbnailSelector';

export const Thumbnail: FC<MediaComponentProps> = ({
  product,
  reload,
  media,
  setMedia,
  select,
  handleImage,
  selectedThumbnail,
  url,
  setUrl,
  updateNewMediaByUrl,
}) => {
  const [thumbPicker, setThumbPicker] = useState(false);

  const handleThumbPickerVisibility = () => {
    setThumbPicker(!thumbPicker);
  };

  return (
    <>
      <div className={styles.thumbnail_container}>
        <img src={product?.product?.productInsert?.thumbnail} alt='thumbnail' />
        <Button
          variant='contained'
          size='medium'
          onClick={handleThumbPickerVisibility}
          className={styles.thumb_edit_btn}
        >
          edit
        </Button>
      </div>
      <div>
        {thumbPicker && (
          <ThumbnailSelector
            reload={reload}
            media={media}
            setMedia={setMedia}
            closeThumbnailPicker={handleThumbPickerVisibility}
            select={select}
            handleImage={handleImage}
            selectedThumbnail={selectedThumbnail}
            url={url}
            setUrl={setUrl}
            updateNewMediaByUrl={updateNewMediaByUrl}
          />
        )}
      </div>
    </>
  );
};
