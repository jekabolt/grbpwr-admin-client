import { FC } from 'react';
import styles from 'styles/product-id-media.scss';
import { ThumbnailProps } from '../../interfaces/thumbnailInterface';

export const Thumbnail: FC<ThumbnailProps> = ({ product, setProduct }) => {
  return (
    <div className={styles.product_id_thumbnail_wrapper}>
      <img
        src={product?.product?.productInsert?.thumbnail}
        alt='thumbnail'
        className={styles.product_id_thumbnail}
      />
    </div>
  );
};
