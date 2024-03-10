import { common_ProductNew } from 'api/proto-http/admin';
import styles from 'styles/mediaSelector.scss';
import React, { FC } from 'react';

interface SelectedIMagesProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
}

export const SelectedImages: FC<SelectedIMagesProps> = ({ product, setProduct }) => {
  const handleDeleteMedia = (index: number) => {
    if (product.media) {
      const updatedMedia = [...product.media];

      updatedMedia.splice(index, 1);

      setProduct((prevProduct: common_ProductNew) => ({
        ...prevProduct,
        media: updatedMedia,
      }));
    }
  };
  return (
    <div className={styles.added_img_wrapper}>
      <ul className={styles.added_img_container}>
        {product?.media?.map((media, index) => (
          <li className={styles.added_img} key={index}>
            <button
              type='button'
              className={styles.delete_img}
              onClick={() => handleDeleteMedia(index)}
            >
              X
            </button>
            <img src={media.fullSize} alt={`Media ${index}`} className={styles.image} />
          </li>
        ))}
      </ul>
    </div>
  );
};
