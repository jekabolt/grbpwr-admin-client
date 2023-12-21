import React, { FC, useState, useEffect } from 'react';
import styles from 'styles/thumbnail.scss';
import { deleteFiles, getAllUploadedFiles } from 'api/admin';
import { common_ProductNew, common_ProductMediaInsert, common_Media } from 'api/proto-http/admin';
import { useNavigate } from '@tanstack/react-location';
import { ROUTES } from 'constants/routes';

interface ThumbnailProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
}

export const Thumbnail: FC<ThumbnailProps> = ({ product, setProduct }) => {
  const navigate = useNavigate();
  // const [product, setProduct] = useState<common_ProductNew>({ ...initialProductState, media: [] }); // to correct
  const [imageUrl, setImageUrl] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string[]>([]);
  const [displayedImage, setDisplayedImage] = useState<string>('');
  const [thumbnailInput, setThumbnailInput] = useState(false);
  const [filesUrl, setFilesUrl] = useState<string[]>([]);
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  const [mediaNumber, setMediaNumber] = useState<number[]>([]);
  const [imagesAdded, setImagesAdded] = useState(false);

  const select = (imageUrl: string | number) => {
    if (typeof imageUrl === 'string') {
      if (selectedImage.includes(imageUrl)) {
        setSelectedImage((prevSelectedImage) =>
          prevSelectedImage.filter((image) => image !== imageUrl),
        );
      } else {
        setSelectedImage([...selectedImage, imageUrl]);
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

  function generateStringArray(input: string): string[] {
    // Define a regular expression pattern to match the relevant part of the URL
    const pattern = /https:\/\/files\.grbpwr\.com\/(.+?)(-og\.(jpg|mp4|webm))?$/;

    // Use the regular expression to extract the matched parts of the URL
    const match = input.match(pattern);

    if (!match) {
      // Return an empty array if the input doesn't match the expected pattern
      return [];
    }

    const [, path, , extension] = match; // Note the additional comma to skip the second capturing group
    const resultArray: string[] = [`${path}-og.${extension}`];

    if (extension === 'jpg') {
      // If the extension is 'jpg', add the '-compressed.jpg' version to the array
      resultArray.push(`${path}-compressed.jpg`);
    }
    console.log(resultArray);
    return resultArray;
  }

  const handleDeleteFile = async (fileIndex: number) => {
    try {
      const fileToDelete = filesUrl[fileIndex]; // Assuming filesUrl is an array of file URLs
      const objectKeys = generateStringArray(fileToDelete);

      if (objectKeys.length > 0) {
        await deleteFiles({ id: fileIndex });
        const updatedFiles = [...filesUrl];
        updatedFiles.splice(fileIndex, 1);
        setFilesUrl(updatedFiles);
      } else {
        console.error('Invalid file URL:', fileToDelete);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  const filterUploadedFiles = (files: string[]) => {
    return files.filter((file) => /\.(jpg|jpeg|png)$/i.test(file));
  };

  const handleViewAll = () => {
    setShowMediaSelector(!showMediaSelector);
  };

  useEffect(() => {
    const fetchUploadedFiles = async () => {
      try {
        const response = await getAllUploadedFiles({
          limit: 5,
          offset: 0,
          orderFactor: 'ORDER_FACTOR_ASC',
        });

        const filesArray = response.list || [];
        const urls = filesArray.map((file: common_Media) => file.media?.fullSize || '');

        setFilesUrl(urls);
      } catch (error) {
        console.error('Error fetching uploaded files:', error);
      }
    };

    fetchUploadedFiles();
  }, []);

  const handleThumbnail = () => {
    setThumbnailInput(!thumbnailInput);
  };

  const handleMediaManager = () => {
    navigate({ to: ROUTES.media, replace: true });
  };

  const handleImage = () => {
    if (selectedImage.length > 0) {
      const updatedMedia: common_ProductMediaInsert[] = [...(product.media || [])];

      selectedImage.forEach((imageUrl) => {
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
      setShowMediaSelector(false);
      setImagesAdded(true);
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
      setImagesAdded(true);
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

  return (
    <div className={styles.thumbnail_wrapper}>
      <label
        htmlFor='thhumbnail'
        className={`${styles.thumbnail_title} ${showMediaSelector ? styles.left : ''}`}
      >
        Media
      </label>
      <div className={`${styles.thumbnail_container} ${showMediaSelector ? styles.left : ''}`}>
        <button
          className={`${styles.thumbnail_btn} ${thumbnailInput ? styles.by_url_left : ''}`}
          type='button'
          onClick={handleThumbnail}
        >
          By Url
        </button>
        {thumbnailInput && (
          <div className={styles.by_url_container}>
            <input
              className={styles.by_url_input}
              type='text'
              name='media'
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <button type='button' onClick={handleImage}>
              OK
            </button>
          </div>
        )}
        <button className={styles.thumbnail_btn} type='button' onClick={handleViewAll}>
          Media Selector
        </button>
        <button className={styles.thumbnail_btn} onClick={handleMediaManager}>
          Upload New
        </button>
      </div>
      {showMediaSelector && (
        <div className={styles.thumbnail_uploaded_media_wrapper}>
          <ul className={styles.thhumbnail_uploaded_media_container}>
            {filterUploadedFiles(filesUrl).map((url, index) => (
              <li key={index}>
                <button
                  className={styles.delete_img}
                  type='button'
                  onClick={() => handleDeleteFile(index)}
                >
                  X
                </button>
                <input
                  type='checkbox'
                  checked={selectedImage.includes(url)}
                  onChange={() => select(url)}
                  id={`${index}`}
                  style={{ display: 'none' }}
                />
                <label htmlFor={`${index}`}>
                  {selectedImage.includes(url) ? (
                    <span className={styles.media_number}>{selectedImage.indexOf(url) + 1}</span>
                  ) : null}
                  <img key={index} src={url} alt={url} className={styles.uploaded_img} />
                </label>
              </li>
            ))}
          </ul>
          <div className={styles.media_selector_add}>
            <button className={styles.add_btn} type='button' onClick={handleImage}>
              add
            </button>
          </div>
        </div>
      )}
      {showMediaSelector ? null : (
        <div className={styles.added}>
          {imagesAdded && product.media && product.media.length > 0 && (
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
                    <img src={media.fullSize} alt={`Media ${index}`} className={styles.imgs} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
