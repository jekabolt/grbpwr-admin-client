import { useNavigate } from '@tanstack/react-location';
import { getAllUploadedFiles } from 'api/admin';
import { addArchive } from 'api/archive';
import { AddArchiveRequest, common_Media } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/addNewArchive.scss';

export const Archive: FC = () => {
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newMediaByUrl, setNewMediaByUrl] = useState('');
  const [newMediaBySelector, setNewMediaBySelector] = useState('');
  const [filesUrl, setFilesUrl] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const [item, setItem] = useState<{ title: string; media: string; url: string }[]>([]);
  const [urlVisibility, setUrlVisibility] = useState(false);
  const [mediaVisibility, setMediaVisibility] = useState(false);
  const navigate = useNavigate();

  const handleUrlVisibility = () => {
    setUrlVisibility(!urlVisibility);
  };

  const handleMediaVisibility = () => {
    setMediaVisibility(!mediaVisibility);
  };

  const createArchive = async () => {
    const newArchive: AddArchiveRequest = {
      archiveNew: {
        archive: {
          heading: newTitle,
          description: newDescription,
        },
        items: item,
      },
    };
    await addArchive(newArchive);
    setItem([]);
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

  const handleSelectedMedia = (media: string) => {
    setNewMediaBySelector(media);
  };

  const addNewItem = () => {
    setItem([
      ...item,
      { title: itemTitle, media: newMediaBySelector || newMediaByUrl, url: newUrl },
    ]);
    setItemTitle('');
    setNewMediaBySelector('');
    setNewMediaByUrl('');
    setNewUrl('');
  };

  const navigateGetArchive = () => {
    navigate({ to: ROUTES.getArchive, replace: true });
  };

  return (
    <Layout>
      <form className={styles.archive_form}>
        <input
          type='text'
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder='heading'
        />
        <input
          type='text'
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder='description'
        />
        <div>
          <button type='button' onClick={handleUrlVisibility} className={styles.button}>
            by url
          </button>
          {urlVisibility && (
            <input
              type='text'
              value={newMediaByUrl}
              onChange={(e) => setNewMediaByUrl(e.target.value)}
            />
          )}
          <button type='button' onClick={handleMediaVisibility} className={styles.button}>
            media selector
          </button>
          {mediaVisibility && (
            <ul>
              {filesUrl.map((media, id) => (
                <li key={id}>
                  <img src={media} alt='' style={{ width: '100px', height: '100px' }} />
                  <button type='button' onClick={() => handleSelectedMedia(media)}>
                    ok
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            type='text'
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder='url'
          />
          <input
            type='text'
            value={itemTitle}
            onChange={(e) => setItemTitle(e.target.value)}
            placeholder='title'
          />
          <button type='button' onClick={addNewItem} className={styles.submit}>
            submit
          </button>
        </div>
        <button type='button' onClick={createArchive} className={styles.btn}>
          add archive
        </button>
        <button type='button' onClick={navigateGetArchive} className={styles.btn}>
          get archive
        </button>
      </form>
    </Layout>
  );
};
