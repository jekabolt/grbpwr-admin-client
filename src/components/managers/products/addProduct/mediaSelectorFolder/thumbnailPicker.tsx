import { deleteFiles, getAllUploadedFiles } from 'api/admin';
import { common_Media, common_ProductNew } from 'api/proto-http/admin';
import React, { FC, useEffect, useState } from 'react';
import styles from 'styles/thumbnailSelector.scss';
import { DragDrop } from '../../../../../features/mediaSelector/dragDrop';

interface ThumbnailPickerProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
  closeMediaPicker: () => void;
  handleAddClick: () => void;
  handleCloseMediaSelector: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const ThumbnailPicker: FC<ThumbnailPickerProps> = ({
  product,
  setProduct,
  closeMediaPicker,
  handleAddClick,
  handleCloseMediaSelector,
}) => {
  const [filesUrl, setFilesUrl] = useState<common_Media[]>([]);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const select = (imageUrl: string | null) => {
    setSelectedImage((prevSelectedImage) => (prevSelectedImage === imageUrl ? null : imageUrl));
  };

  const handleImage = () => {
    if (!product.product) {
      return;
    }

    if (imageUrl && imageUrl.trim() !== '') {
      setSelectedImage(imageUrl.trim());
    }

    if (!selectedImage) {
      return;
    }

    const updatedProduct: common_ProductNew = { ...product };

    if (updatedProduct.product) {
      updatedProduct.product.thumbnail = selectedImage;
    }
    setProduct(updatedProduct);
    handleAddClick();
  };

  const handleDeleteFile = async (id: number | undefined) => {
    await deleteFiles({ id });
    setFilesUrl((currentFiles) => currentFiles?.filter((file) => file.id !== id));
  };

  useEffect(() => {
    fetchUploadedFiles();
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY + 300 >= document.documentElement.offsetHeight &&
        !isLoading &&
        hasMore
      ) {
        fetchUploadedFiles();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore]);

  const reloadFiles = async () => {
    setIsLoading(true);
    setOffset(0);
    setHasMore(true);
    const response = await getAllUploadedFiles({
      limit: 10,
      offset: 0,
      orderFactor: 'ORDER_FACTOR_ASC',
    });
    const newFiles = response.list || [];
    setFilesUrl(newFiles);
    setOffset(newFiles.length);
    setHasMore(newFiles.length > 0);
    setIsLoading(false);
  };

  const fetchUploadedFiles = async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    const limit = 5;
    const response = await getAllUploadedFiles({
      limit: limit,
      offset: offset,
      orderFactor: 'ORDER_FACTOR_ASC',
    });
    const newFiles = response.list || [];
    const uniqueNewFiles = newFiles.filter((newFile) =>
      filesUrl?.every((existingFile) => existingFile.media?.fullSize !== newFile.media?.fullSize),
    );
    setFilesUrl((prevFiles) => [...prevFiles, ...uniqueNewFiles]);
    setOffset((prevOffset) => prevOffset + uniqueNewFiles.length);
    setHasMore(uniqueNewFiles.length === limit);
    setIsLoading(false);
  };

  return (
    <div className={styles.media_picker_overlay} onClick={handleCloseMediaSelector}>
      <div className={`${styles.media_picker_upload} ${styles.media_picker_active}`}>
        <div className={styles.media_picker_by_url_upload_new_container}>
          <div className={styles.media_picker_by_url}>
            <h3>By Url</h3>
            <div className={styles.media_picker_by_url_container}>
              <input
                type='text'
                name='media'
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className={styles.media_picker_by_url_input}
              />
              <button
                type='button'
                onClick={handleImage}
                className={styles.media_picker_by_url_btn}
              >
                OK
              </button>
            </div>
          </div>
          <div className={styles.media_picker_upload_new}>
            <DragDrop reloadFile={reloadFiles} />
          </div>
        </div>
        <div className={styles.media_picker_img_wrapper}>
          <ul className={styles.media_selector_img_container}>
            {filesUrl?.map((media) => (
              <li
                key={`${media.id}-${media.media?.fullSize}`}
                className={styles.media_selector_img_wrapper}
              >
                <button
                  className={styles.media_selector_delete_img}
                  type='button'
                  onClick={() => handleDeleteFile(media.id)}
                >
                  X
                </button>
                <input
                  type='checkbox'
                  checked={selectedImage?.includes(media.media?.fullSize ?? '')}
                  onChange={() => select(media.media?.fullSize ?? '')}
                  id={`${media.id}`}
                  style={{ display: 'none' }}
                />
                <label htmlFor={`${media.id}`}>
                  {selectedImage?.includes(media.media?.fullSize ?? '') ? (
                    <span className={styles.media_selector_img_number}>selected</span>
                  ) : null}
                  <img
                    key={media.id}
                    src={media.media?.fullSize}
                    alt='video'
                    className={`${styles.media_selector_img} ${
                      selectedImage?.includes(media.media?.fullSize ?? '')
                        ? styles.selected_media
                        : ''
                    }`}
                  />
                </label>
              </li>
            ))}
          </ul>
          {isLoading && <div></div>}
          <button className={styles.media_selector_btn} type='button' onClick={handleImage}>
            add
          </button>
        </div>
        <button type='button' onClick={closeMediaPicker} className={styles.media_picker_close_btn}>
          x
        </button>
      </div>
    </div>
  );
};
