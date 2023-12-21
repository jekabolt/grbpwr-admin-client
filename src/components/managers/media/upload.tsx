import React, { FC, useEffect, useState, useRef } from 'react';
import { getAllUploadedFiles, deleteFiles } from 'api/admin';
import { common_Media } from 'api/proto-http/admin';
import { Layout } from 'components/layout/layout';
import styles from 'styles/upload.scss';

interface UploadedFile {
  id: number;
  url: string | undefined;
  lastModified: string | undefined;
}

function copyToClipboard(text: string | undefined) {
  const textArea = document.createElement('textarea');
  textArea.value = text || '';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
}

export const UploadPage: FC = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[] | undefined>([]);
  const [order, setOrder] = useState<'plus' | 'minus'>('plus');
  const [filter, setFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const isFetchingData = useRef(false);
  const filesOnPage = 10;

  const handlePictures = () => {
    setFilter('PICTURES');
  };

  const handleVideo = () => {
    setFilter('VIDEO');
  };

  // DATE
  function formatDate(dateString: string | number | Date | undefined) {
    if (!dateString) {
      return '';
    }

    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', options as Intl.DateTimeFormatOptions);
  }

  const sortByDate = () => {
    const sortedFiles = [...uploadedFiles!];
    sortedFiles.sort((a, b) => {
      const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
      const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;

      if (order === 'plus') {
        return dateA - dateB;
      } else {
        return dateB - dateA;
      }
    });
    setUploadedFiles(sortedFiles);
  };

  const dateSorter = () => {
    setOrder(order === 'plus' ? 'minus' : 'plus');
    sortByDate(); // Sort when the order changes
  };

  function generateStringArray(input: string | undefined): string[] {
    const pattern = /https:\/\/files\.grbpwr\.com\/(.+?)(-og\.(jpg|mp4|webm))?$/;

    const match = input?.match(pattern);

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await getAllUploadedFiles({
          limit: 20,
          offset: 0,
          orderFactor: undefined,
        });

        const files: common_Media[] = response.list || [];

        const mapedFiles: UploadedFile[] = files.map((media, index) => ({
          id: index + 1,
          url: media.media?.fullSize,
          lastModified: media.createdAt,
        }));

        setUploadedFiles(mapedFiles);
      } catch (error) {
        console.error('Error fetching uploaded files:', error);
      } finally {
        isFetchingData.current = false;
      }
    };

    fetchData();
  }, [currentPage]);

  const handleDelete = async (fileId: number | undefined) => {
    try {
      await deleteFiles({ id: fileId });
      // Remove the deleted file from the state
      setUploadedFiles((prevFiles) => prevFiles?.filter((file) => file.id !== fileId));
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  return (
    <Layout>
      <h1 className={styles.media_name}>MEDIA MANAGER</h1>
      <div className={styles.files_container}>
        <div className={styles.sorter_container}>
          <p className={styles.sort_btn_title}>SORT</p>
          <button onClick={dateSorter} className={styles.sort_btn}>
            DATE {order === 'plus' ? '+' : '-'}
          </button>
          <button onClick={handlePictures} className={styles.sort_btn}>
            PICTURES
          </button>
          <button onClick={handleVideo} className={styles.sort_btn}>
            VIDEOS
          </button>
        </div>
        <ul className={styles.uploaded_files}>
          {uploadedFiles
            ?.slice((currentPage - 1) * filesOnPage, currentPage * filesOnPage)
            .filter((file) => {
              if (filter === 'PICTURES') {
                return (
                  file.url?.toLowerCase().endsWith('.jpg') ||
                  file.url?.toLowerCase().endsWith('.jpeg') ||
                  file.url?.toLowerCase().endsWith('.png')
                );
              } else if (filter === 'VIDEO') {
                return (
                  file.url?.toLowerCase().endsWith('.mp4') ||
                  file.url?.toLowerCase().endsWith('.webm')
                );
              } else {
                return true;
              }
            })
            .map((file, index) => (
              <li key={index} className={styles.uploaded_file}>
                <button className={styles.delete_btn} onClick={() => handleDelete(file.id)}>
                  X
                </button>
                <div className={styles.date}>{formatDate(file.lastModified)}</div>
                <div className={styles.url_container}>
                  <div className={styles.urlText}>{file.url}</div>
                  <button onClick={() => copyToClipboard(file.url)} className={styles.copy_btn}>
                    Copy Link
                  </button>
                </div>
                {file.url?.toLowerCase().endsWith('.jpg') ||
                file.url?.toLowerCase().endsWith('.jpeg') ||
                file.url?.toLowerCase().endsWith('.png') ? (
                  <a href={file.url} target='_blank' rel='noopener noreferrer'>
                    <img
                      src={file.url}
                      alt={file.url?.replace('-og.jpg', '-compressed.jpg')}
                      title={`${file.lastModified}`}
                      className={`${styles.uploaded_img}`}
                    />
                  </a>
                ) : file.url?.toLowerCase().endsWith('.mp4') ||
                  file.url?.toLowerCase().endsWith('.webm') ? (
                  <a href={file.url} target='_blank' rel='noopener noreferrer'>
                    <video className={styles.video}>
                      <source src={file.url} type='video/mp4' />
                    </video>
                  </a>
                ) : (
                  <a href={file.url} target='_blank' rel='noopener noreferrer'>
                    {file.lastModified}
                  </a>
                )}
              </li>
            ))}
        </ul>
      </div>
    </Layout>
  );
};
