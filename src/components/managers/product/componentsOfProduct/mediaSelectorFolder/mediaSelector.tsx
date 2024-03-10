import { common_ProductNew } from 'api/proto-http/admin';
import React, { FC, useEffect, useState } from 'react';
import styles from 'styles/mediaSelector.scss';
import { MediaPicker } from './mediaPicker';
import { SelectedImages } from './selectedImages';

interface MediaSelectorProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
}

export const MediaSelector: FC<MediaSelectorProps> = ({ product, setProduct }) => {
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  const [showAddedImages, setShowAddedImages] = useState(false);

  const handleAddClick = () => {
    setShowAddedImages(true);
    setShowMediaSelector(false);
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

  const handleCloseMediaSelector = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setShowMediaSelector(false);
    }
  };

  const handleViewAll = () => {
    setShowMediaSelector(!showMediaSelector);
  };

  const closeMediaPicker = () => {
    setShowMediaSelector(!showMediaSelector);
  };

  return (
    <div className={styles.media_selector_container}>
      <div className={styles.media_selector_wrapper}>
        <label htmlFor='thhumbnail' className={styles.media_selector_title}>
          Media
        </label>
        <div className={styles.media_selector_show_media_picker_btn_wrapper}>
          <button
            className={styles.media_selector_show_media_picker_btn}
            type='button'
            onClick={handleViewAll}
          >
            Media Selector
          </button>
        </div>
        {showMediaSelector && (
          <MediaPicker
            handleCloseMediaSelector={handleCloseMediaSelector}
            closeMediaPicker={closeMediaPicker}
            setProduct={setProduct}
            product={product}
            handleAddClick={handleAddClick}
          />
        )}
      </div>
      {showAddedImages && product.media && product.media.length > 0 && (
        <SelectedImages product={product} setProduct={setProduct} />
      )}
    </div>
  );
};
