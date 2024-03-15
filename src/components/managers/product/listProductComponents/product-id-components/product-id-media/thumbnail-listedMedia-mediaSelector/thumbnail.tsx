import { Button } from '@mui/material';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/product-id-media.scss';
import { ThumbnailProps } from '../../interfaces-type/thumbnailInterface';
import { MediaSelector } from './mediaSelector';

export const Thumbnail: FC<ThumbnailProps> = ({ product, setProduct, id }) => {
  const [showMediaSelector, setShowMediaSelector] = useState(false);

  const handleOpenMediaSelector = () => {
    setShowMediaSelector(!showMediaSelector);
  };

  useEffect(() => {
    if (showMediaSelector) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showMediaSelector]);

  return (
    <>
      <div className={styles.thumbnail_wrapper}>
        <img
          src={product?.product?.productInsert?.thumbnail}
          alt='thumbnail'
          className={styles.thumbnail}
        />
        <Button variant='contained' onClick={handleOpenMediaSelector} className={styles.thumb_btn}>
          edit
        </Button>
      </div>
      <div>
        {showMediaSelector && <MediaSelector product={product} setProduct={setProduct} id={id} />}
      </div>
    </>
  );
};
