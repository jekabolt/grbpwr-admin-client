import React, { FC, useState, useEffect } from 'react';
import styles from 'styles/mediaSelector.scss';
import { common_ProductNew, common_Media } from 'api/proto-http/admin';
import { MediaPicker } from './mediaPicker';
import { SelectedImages } from './selectedImages';

interface MediaSelectorProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
  handleInputChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
}

export const MediaSelector: FC<MediaSelectorProps> = ({
  product,
  setProduct,
  handleInputChange,
}) => {
  const [filesUrl, setFilesUrl] = useState<common_Media[]>([]);
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
            filesUrl={filesUrl}
            setFilesUrl={setFilesUrl}
            handleCloseMediaSelector={handleCloseMediaSelector}
            closeMediaPicker={closeMediaPicker}
            setProduct={setProduct}
            product={product}
            handleAddClick={handleAddClick}
            handleInputChange={handleInputChange}
          />
        )}
      </div>
      {showAddedImages && product.media && product.media.length > 0 && (
        <SelectedImages product={product} setProduct={setProduct} />
      )}
    </div>
  );
};
