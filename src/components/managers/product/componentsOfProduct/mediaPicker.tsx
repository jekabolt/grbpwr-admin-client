import React, { FC, useEffect, useState } from 'react';
import styles from 'styles/mediaSelector.scss';
import { DragDrop } from './dragDrop';
import { deleteFiles, getAllUploadedFiles } from 'api/admin';
import { common_Media, common_ProductMediaInsert, common_ProductNew } from 'api/proto-http/admin';
import { InputField } from './inputFields';

interface MediaSelectorProps {
  product: common_ProductNew;
  filesUrl: common_Media[] | undefined;
  setFilesUrl: React.Dispatch<React.SetStateAction<common_Media[]>>;
  handleCloseMediaSelector: (e: React.MouseEvent<HTMLDivElement>) => void;
  closeMediaPicker: () => void;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
  handleAddClick: () => void;
  handleInputChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
}

export const MediaPicker: FC<MediaSelectorProps> = ({
  filesUrl,
  setFilesUrl,
  handleCloseMediaSelector,
  closeMediaPicker,
  setProduct,
  handleAddClick,
  product,
  handleInputChange,
}) => {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string[]>([]);
  const [mediaNumber, setMediaNumber] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const select = (imageUrl: string | number | undefined) => {
    if (typeof imageUrl === 'string') {
      if (selectedImage?.includes(imageUrl)) {
        setSelectedImage((prevSelectedImage) =>
          prevSelectedImage?.filter((image) => image !== imageUrl),
        );
      } else {
        setSelectedImage([...(selectedImage || []), imageUrl]);
      }
    } else if (typeof imageUrl === 'number') {
      if (mediaNumber.includes(imageUrl)) {
        setMediaNumber((prevMediaNumber) =>
          prevMediaNumber.filter((imageIndex) => imageIndex !== imageUrl),
        );
      } else {
        setMediaNumber([...mediaNumber, imageUrl]);
      }
    }
  };

  const normalizeUrl = (url: string) => {
    // Normalize the URL by removing trailing slashes and converting to lowercase
    return url.trim().replace(/\/+$/, '').toLowerCase();
  };

  const handleImage = () => {
    let updatedMedia: common_ProductMediaInsert[] = [];

    if (selectedImage && selectedImage.length > 0) {
      // Filter selected images to remove duplicates
      const uniqueSelectedImages = selectedImage.filter(
        (imageUrl, index) => selectedImage.indexOf(imageUrl) === index,
      );

      updatedMedia = uniqueSelectedImages.map((imageUrl) => ({
        fullSize: imageUrl,
        thumbnail: imageUrl,
        compressed: imageUrl.replace(/-og\.jpg$/, '-compressed.jpg'),
      }));
      setSelectedImage([]);
    } else if (imageUrl.trim() !== '') {
      const isUnique =
        !product.media || !product.media.some((media) => media.fullSize === imageUrl);

      if (isUnique) {
        updatedMedia.push({
          fullSize: imageUrl,
          thumbnail: imageUrl,
          compressed: imageUrl.replace(/-og\.jpg$/, '-compressed.jpg'),
        });
        setImageUrl('');
      } else {
        alert('This media already exists in the product.');
        setImageUrl('');
        return;
      }
    }
    setProduct((prevProduct: common_ProductNew) => ({
      ...prevProduct,
      media: [...(prevProduct.media || []), ...updatedMedia],
    }));
    handleAddClick();
  };

  const handleDeleteFile = async (id: number | undefined) => {
    try {
      const response = await deleteFiles({ id });
      console.log(response);
      setFilesUrl((currentFiles) => currentFiles?.filter((file) => file.id !== id));
    } catch (error) {
      console.error(error);
    }
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

  const fetchUploadedFiles = async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    const limit = 10;
    try {
      const response = await getAllUploadedFiles({
        limit: limit,
        offset: offset,
        orderFactor: 'ORDER_FACTOR_ASC',
      });
      const newFiles = response.list || [];
      const uniqueNewFiles = newFiles.filter(
        (file) => !filesUrl?.some((existingFile) => existingFile.id === file.id),
      );
      setFilesUrl((prevUrls) => [...prevUrls, ...uniqueNewFiles]);
      setOffset((prevOffset) => prevOffset + uniqueNewFiles.length);
      setHasMore(uniqueNewFiles.length === limit);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const reloadFiles = async () => {
    setIsLoading(true);
    setOffset(0);
    setHasMore(true);
    try {
      const response = await getAllUploadedFiles({
        limit: 10,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_ASC',
      });
      const newFiles = response.list || [];
      setFilesUrl(newFiles);
      setOffset(newFiles.length);
      setHasMore(newFiles.length > 0);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
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
          <InputField
            label='THUMBNAIL'
            value={product.product?.thumbnail}
            name='thumbnail'
            onChange={handleInputChange}
          />
        </div>
        <div className={styles.media_picker_img_wrapper}>
          <ul className={styles.media_selector_img_container}>
            {filesUrl?.map((media) => (
              <li key={media.id} className={styles.media_selector_img_wrapper}>
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
                    <span className={styles.media_selector_img_number}>
                      {selectedImage.indexOf(media.media?.fullSize ?? '') + 1}
                    </span>
                  ) : null}
                  <img
                    key={media.id}
                    src={media.media?.fullSize}
                    alt='video'
                    className={styles.media_selector_img}
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
