import { common_ProductFull } from 'api/proto-http/admin';
import { FC } from 'react';
import styles from 'styles/productID.scss';
import { AddMediaByID } from './addMediaById';

interface ProductMedia {
  product: common_ProductFull | undefined;
  showAddMedia: boolean;
  toggleAddMedia: () => void;
}

export const ProductMediaContainer: FC<ProductMedia> = ({
  product,
  showAddMedia,
  toggleAddMedia,
}) => {
  return (
    <div className={styles.img_grid}>
      <div className={styles.main_img_container}>
        <img
          src={product?.product?.productInsert?.thumbnail}
          alt='thumbnail'
          className={styles.main_img}
        />
        <button onClick={toggleAddMedia}>add</button>
        {showAddMedia && (
          <div className={styles.add_media}>
            <AddMediaByID />
          </div>
        )}
      </div>
      <ul className={styles.product_by_id_media_list}>
        {product?.media?.map((media, index) => (
          <li key={index}>
            <p>{index + 1}</p>
            <img src={media.productMediaInsert?.compressed} alt='' />
          </li>
        ))}
      </ul>
    </div>
  );
};
