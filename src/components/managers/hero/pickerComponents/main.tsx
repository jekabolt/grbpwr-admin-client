import arrow from 'img/arrow-right.png';
import React, { FC, useState } from 'react';
import styles from 'styles/hero.scss';

interface MainProps {
  handleMainByUrlOrFile: (value: string) => void;
  filesUrl: string[];
  handleMainExploreText: (e: React.ChangeEvent<HTMLInputElement>) => void;
  exploreText: string | undefined;
  handleMainExploreLink: (e: React.ChangeEvent<HTMLInputElement>) => void;
  exploreLink: string | undefined;
}

export const MainHero: FC<MainProps> = ({
  handleMainByUrlOrFile,
  filesUrl,
  exploreText,
  handleMainExploreText,
  handleMainExploreLink,
  exploreLink,
}) => {
  const [url, setUrl] = useState('');
  const [inputFieldVisibility, setInputFieldVisibility] = useState(false);
  const [mediaSelectorVisibility, setMediaSelectorVisibility] = useState(false);
  const [exploreVisibility, setExploreVisibility] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const itemsPerPage = 4;
  const [currentPage, setCurrentPage] = useState(1);
  const startId = (currentPage - 1) * itemsPerPage;
  const endId = startId + itemsPerPage;
  const totalItems = filesUrl.slice(startId, endId);

  const handleExploreVisibility = () => {
    setExploreVisibility(!exploreVisibility);
  };

  const handleInputFieldVisibility = () => {
    setInputFieldVisibility(!inputFieldVisibility);
  };

  const handleMediaSelectorVisibility = () => {
    setMediaSelectorVisibility(!mediaSelectorVisibility);
  };

  const nextPage = () => {
    setCurrentPage((prevPage) =>
      prevPage < Math.ceil(filesUrl.length / itemsPerPage) ? prevPage + 1 : prevPage,
    );
  };

  const prevPage = () => {
    setCurrentPage((prevPage) => (prevPage > 1 ? prevPage - 1 : prevPage));
  };

  const handleSelectImage = (image: string) => {
    if (image === selectedImage) {
      setSelectedImage(null);
      handleMainByUrlOrFile('');
    } else {
      setSelectedImage(image);
      handleMainByUrlOrFile(image);
    }
  };

  const handleMainByUrl = () => {
    handleMainByUrlOrFile(url);
    setUrl('');
  };
  return (
    <>
      <div className={styles.main_container}>
        <div className={styles.section_wrapper}>
          <h2 className={styles.section_title}>main</h2>
          <div className={styles.section}>
            <button type='button' onClick={handleInputFieldVisibility} className={styles.btn}>
              by url
            </button>
            {inputFieldVisibility && (
              <div>
                <input
                  type='text'
                  placeholder='by url'
                  name='contentLink'
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <button type='button' onClick={handleMainByUrl}>
                  ok
                </button>
              </div>
            )}
            <button type='button' onClick={handleMediaSelectorVisibility} className={styles.btn}>
              media selector
            </button>
            <button type='button' onClick={handleExploreVisibility} className={styles.btn}>
              explore
            </button>
            {exploreVisibility && (
              <div>
                <input
                  type='text'
                  name='exploreText'
                  value={exploreText}
                  onChange={handleMainExploreText}
                />
                <input
                  type='text'
                  name='exploreLink'
                  value={exploreLink}
                  onChange={handleMainExploreLink}
                />
              </div>
            )}
          </div>
        </div>
        <ul className={styles.files_list}>
          <div className={styles.arrow_wrapper}>
            <button type='button' onClick={prevPage} className={styles.arrow_btn}>
              <img src={arrow} alt='' style={{ rotate: '180deg' }} className={styles.arrow} />
            </button>
          </div>
          {totalItems.map((media, index) => (
            <li key={index}>
              <img
                src={media}
                alt=''
                className={media === selectedImage ? styles.transparent : ''}
              />
              <button type='button' onClick={() => handleSelectImage(media)}>
                ok
              </button>
            </li>
          ))}
          <div className={styles.arrow_wrapper}>
            <button type='button' onClick={nextPage} className={styles.arrow_btn}>
              <img src={arrow} alt='' className={styles.arrow} />
            </button>
          </div>
        </ul>
      </div>
    </>
  );
};
