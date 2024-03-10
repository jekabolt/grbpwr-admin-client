import arrow from 'img/arrow-right.png';
import { FC, useState } from 'react';
import styles from 'styles/hero.scss';

interface AdsProps {
  filesUrl: string[];
  selectedImage: string[];
  newAdUrl: string;
  setNewAdUrl: (url: string) => void;
  newExploreText: string;
  setNewExploreText: (text: string) => void;
  handleAddByUrl: () => void;
  select: (url: string) => void;
  exploreTextMap: Record<string, string>;
  exploreLinkMap: Record<string, string>;
  handleExploreTextChange: (url: string, value: string) => void;
  handleExploreLinkChange: (url: string, value: string) => void;
  handleAddToAds: () => void;
}

// Should I leave the media selector or not?
// may be useCallback or useMemo
export const Ads: FC<AdsProps> = ({
  filesUrl,
  selectedImage,
  newAdUrl,
  setNewAdUrl,
  handleAddByUrl,
  select,
  exploreTextMap,
  handleExploreTextChange,
  handleAddToAds,
  newExploreText,
  setNewExploreText,
  exploreLinkMap,
  handleExploreLinkChange,
}) => {
  const [thumbnailInput, setThumbnailInput] = useState(false);
  const [showMediaSelector, setShowMediaSelector] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;
  const startId = (currentPage - 1) * itemsPerPage;
  const endId = startId + itemsPerPage;
  const files = filesUrl.slice(startId, endId);

  const handleThumbnail = () => {
    setThumbnailInput(!thumbnailInput);
  };

  const handleViewAll = () => {
    setShowMediaSelector(!showMediaSelector);
  };

  const nextPage = () => {
    setCurrentPage((prevPage) =>
      prevPage < Math.ceil(filesUrl.length / itemsPerPage) ? prevPage + 1 : prevPage,
    );
  };

  const prevPage = () => {
    setCurrentPage((prevPage) => (prevPage > 1 ? prevPage - 1 : prevPage));
  };

  return (
    <div className={styles.ads_container}>
      <div className={styles.section_wrapper}>
        <h2 className={styles.section_title}>ads</h2>
        <div className={styles.section}>
          <button type='button' onClick={handleThumbnail} className={styles.btn}>
            by url
          </button>
          {thumbnailInput && (
            <div>
              <input
                type='text'
                name='contentLink'
                placeholder='by url'
                value={newAdUrl}
                onChange={(e) => setNewAdUrl(e.target.value)}
              />
              <input
                type='text'
                name='exploreText'
                placeholder='explore text'
                value={newExploreText}
                onChange={(e) => setNewExploreText(e.target.value)}
              />
              <button type='button' onClick={handleAddByUrl}>
                Add by URL
              </button>
            </div>
          )}
          <button type='button' onClick={handleViewAll} className={styles.btn}>
            Media Selector
          </button>

          <button type='button' className={styles.btn}>
            upload new
          </button>
        </div>
      </div>
      <ul className={styles.files_list}>
        <div className={styles.arrow_wrapper}>
          <button type='button' onClick={prevPage} className={styles.arrow_btn}>
            <img src={arrow} alt='' style={{ rotate: '180deg' }} className={styles.arrow} />
          </button>
        </div>
        {files.map((url) => (
          <li key={url}>
            <input
              type='checkbox'
              checked={selectedImage.includes(url)}
              onChange={() => select(url)}
              id={`${url}`}
              style={{ display: 'none' }}
            />
            <label htmlFor={`${url}`}>
              {selectedImage.includes(url) ? <span>{selectedImage.indexOf(url) + 1}</span> : null}
              <img key={url} src={url} alt={url} />
              {selectedImage.includes(url) && (
                <div className={styles.input_container}>
                  <input
                    type='text'
                    placeholder='explore text'
                    value={exploreTextMap[url] || ''}
                    onChange={(e) => handleExploreTextChange(url, e.target.value)}
                  />
                  <input
                    type='text'
                    placeholder='explore link'
                    value={exploreLinkMap[url] || ''}
                    onChange={(e) => handleExploreLinkChange(url, e.target.value)}
                  />
                </div>
              )}
            </label>
          </li>
        ))}
        <div className={styles.arrow_wrapper}>
          <button type='button' onClick={nextPage} className={styles.arrow_btn}>
            <img src={arrow} alt='' className={styles.arrow} />
          </button>
        </div>
        <div className={styles.add}>
          <button type='button' onClick={handleAddToAds}>
            add
          </button>
        </div>
      </ul>
    </div>
  );
};
