import React, { FC, useState, useEffect } from 'react';
import styles from 'styles/thumbnail.scss';
import { deleteFiles, getAllUploadedFiles } from 'api/admin';
import { common_ProductNew, common_ProductMediaInsert, common_Media } from 'api/proto-http/admin';
import { DragDrop } from './dragDrop';

interface ThumbnailProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
}

export const Thumbnail: FC<ThumbnailProps> = ({ product, setProduct }) => {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string[]>([]);
  const [displayedImage, setDisplayedImage] = useState<string>('');
  const [filesUrl, setFilesUrl] = useState<common_Media[]>([]);
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  const [mediaNumber, setMediaNumber] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showAddedImages, setShowAddedImages] = useState(false);

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

  const handleDeleteFile = async (id: number | undefined) => {
    try {
      const response = await deleteFiles({ id });
      console.log(response);
      setFilesUrl((currentFiles) => currentFiles?.filter((file) => file.id !== id));
    } catch (error) {
      console.error(error);
    }
  };

  const handleViewAll = () => {
    setShowMediaSelector(!showMediaSelector);
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

  const fetchUploadedFiles = async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    const limit = 1;
    try {
      const response = await getAllUploadedFiles({
        limit: limit,
        offset: offset,
        orderFactor: 'ORDER_FACTOR_ASC',
      });
      const url = response.list || [];
      setFilesUrl((prevUrls) => [...prevUrls, ...url]);
      setOffset((prevOffset) => prevOffset + url.length);
      setHasMore(url.length === limit);
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
        limit: 1,
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

  const handleImage = () => {
    if (selectedImage && selectedImage.length > 0) {
      const updatedMedia: common_ProductMediaInsert[] = [...(product.media || [])];

      selectedImage?.forEach((imageUrl) => {
        const compressedUrl = imageUrl.replace(/-og\.jpg$/, '-compressed.jpg');

        updatedMedia.push({
          fullSize: imageUrl,
          thumbnail: imageUrl,
          compressed: compressedUrl,
        });
      });

      setProduct((prevProduct: common_ProductNew) => ({
        ...prevProduct,
        media: updatedMedia,
      }));

      setSelectedImage([]);
    } else if (imageUrl.trim() !== '') {
      setDisplayedImage(imageUrl);
      const compressedUrl = imageUrl.replace(/-og\.jpg$/, '-compressed.jpg');

      setProduct((prevProduct: common_ProductNew) => {
        const updatedMedia: common_ProductMediaInsert[] = [...(prevProduct.media || [])];

        updatedMedia.push({
          fullSize: imageUrl,
          thumbnail: imageUrl,
          compressed: compressedUrl,
        });

        return {
          ...prevProduct,
          media: updatedMedia,
        };
      });

      setImageUrl('');
    }
  };

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

  const handleCloseMediaSelector = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setShowMediaSelector(false);
    }
  };

  return (
    <div
      className={`${styles.thumbnail_wrapper} ${showMediaSelector ? styles.disabled_overlay : ''}`}
    >
      <label htmlFor='thhumbnail' className={styles.thumbnail_title}>
        Media
      </label>
      <div className={styles.thumbnail_container}>
        <button className={styles.thumbnail_btn} type='button' onClick={handleViewAll}>
          Media Selector
        </button>
      </div>
      {showMediaSelector && (
        <div className={styles.overlay} onClick={handleCloseMediaSelector}>
          <div
            className={`${styles.thumbnail_uploaded_media_wrapper} ${styles.thumbnail_active_wrapper}`}
          >
            {showAddedImages && product.media && product.media.length > 0 ? (
              <div className={styles.added_img_wrapper}>
                <ul className={styles.added_img_container}>
                  {product.media.map((media, index) => (
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
            ) : (
              <div className={styles.media_selector_by_url_upload_new_container}>
                <div className={styles.media_selector_by_url_upload_new}>
                  <div className={styles.media_selector_by_url}>
                    <h3>By Url</h3>
                    <div className={styles.by_url_container}>
                      <input
                        type='text'
                        name='media'
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        className={styles.by_url_input}
                      />
                      <button type='button' onClick={handleImage} className={styles.by_url_btn}>
                        OK
                      </button>
                    </div>
                  </div>
                  <div className={styles.media_selector_upload_new}>
                    <DragDrop />
                  </div>
                  <div className={styles.show_img_btn_container}>
                    <button
                      type='button'
                      className={styles.show_img_btn}
                      onClick={() => setShowAddedImages(!showAddedImages)}
                    >
                      Show Added Images
                    </button>
                  </div>
                </div>
                <div className={styles.media_selector_container}>
                  <button type='button' onClick={reloadFiles} className={styles.media_selector_btn}>
                    reload
                  </button>
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
