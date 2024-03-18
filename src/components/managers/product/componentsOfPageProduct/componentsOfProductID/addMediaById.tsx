import { useNavigate } from '@tanstack/react-location';
import { addMediaByID, deleteFiles, getAllUploadedFiles } from 'api/admin';
import { common_Media } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import queryString from 'query-string';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/addMediaById.scss';

export const AddMediaByID: FC = () => {
  const navigate = useNavigate();
  const [imageUrl, setImageUrl] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string[]>([]);
  const [displayedImage, setDisplayedImage] = useState<string>('');
  const [thumbnailInput, setThumbnailInput] = useState(false);
  const [filesUrl, setFilesUrl] = useState<string[]>([]);
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  const [mediaNumber, setMediaNumber] = useState<number[]>([]);
  const queryParams = queryString.parse(window.location.search);
  const productId = queryParams.productId as string;

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
    const pattern = /https:\/\/files\.grbpwr\.com\/(.+?)(-og\.(jpg|mp4|webm))?$/;
    const match = input.match(pattern);
    if (!match) {
      return [];
    }
    const [, path, , extension] = match;
    const resultArray: string[] = [`${path}-og.${extension}`];

    if (extension === 'jpg') {
      resultArray.push(`${path}-compressed.jpg`);
    }
    return resultArray;
  }

  const handleDeleteFile = async (fileIndex: number) => {
    const fileToDelete = filesUrl[fileIndex];
    const objectKeys = generateStringArray(fileToDelete);

    if (objectKeys.length > 0) {
      await deleteFiles({ id: fileIndex });
      const updatedFiles = [...filesUrl];
      updatedFiles.splice(fileIndex, 1);
      setFilesUrl(updatedFiles);
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
      const response = await getAllUploadedFiles({
        limit: 5,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_ASC',
      });

      const filesArray = response.list || [];
      const urls = filesArray.map((file: common_Media) => file.media?.fullSize || '');

      setFilesUrl(urls);
    };

    fetchUploadedFiles();
  }, []);

  const handleThumbnail = () => {
    setThumbnailInput(!thumbnailInput);
  };

  const handleMediaManager = () => {
    navigate({ to: ROUTES.media });
  };

  const handleAddMedia = async () => {
    if (selectedImage.length === 0) {
      return;
    }

    for (const imageUrl of selectedImage) {
      const compressedUrl = imageUrl.replace(/-og\.jpg$/, '-compressed.jpg');
      const response = await addMediaByID({
        productId: Number(productId),
        fullSize: imageUrl,
        thumbnail: imageUrl,
        compressed: compressedUrl,
      });
    }
  };

  return (
    <div className={styles.thumbnail_wrapper}>
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
            <button type='button'>OK</button>
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
            <button className={styles.add_btn} type='button' onClick={handleAddMedia}>
              add new one
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
