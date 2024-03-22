import { common_ProductNew } from 'api/proto-http/admin';
import { FC } from 'react';
import styles from 'styles/thumbnailSelector.scss';

interface SelectedIMagesProps {
  product: common_ProductNew;
}

export const SelectedThumbnailImage: FC<SelectedIMagesProps> = ({ product }) => {
  return (
    <div className={styles.added_img_wrapper}>
      <div className={styles.added_img_container}>
        {product.product?.thumbnail && (
          <img src={product.product.thumbnail} alt='thumb' className={styles.image} />
        )}
      </div>
    </div>
  );
};
