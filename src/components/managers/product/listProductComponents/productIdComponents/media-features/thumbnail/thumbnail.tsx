import { Button } from '@mui/material';
import { FC, useState } from 'react';
import styles from 'styles/product-id-media.scss';
import { ProductIdMediaProps } from '../../utility/interfaces';
import { ThumbnailSelector } from './thumbnail-features/thumbnailSelector';

export const Thumbnail: FC<ProductIdMediaProps> = ({
  product,
  setProduct,
  id,
  reload,
  media,
  setMedia,
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
            product={product}
            id={id}
            setProduct={setProduct}
            reload={reload}
            media={media}
            setMedia={setMedia}
            closeThumbnailPicker={handleThumbPickerVisibility}
          />
        )}
      </div>
    </>
  );
};
