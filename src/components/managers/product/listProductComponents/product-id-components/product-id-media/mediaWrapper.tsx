import { FC } from 'react';
import styles from 'styles/product-id-media.scss';
import { ThumbnailProps } from '../interfaces/thumbnailInterface';
import { ListedMedia } from './thumbnail-listedMedia-mediaSelector/listedMedia';
import { Thumbnail } from './thumbnail-listedMedia-mediaSelector/thumbnail';

export const MediaWrapper: FC<ThumbnailProps> = ({ product, setProduct }) => {
  return (
    <div className={styles.product_id_media_information}>
      <Thumbnail product={product} setProduct={setProduct} />
      <ListedMedia product={product} setProduct={setProduct} />
    </div>
  );
};
