import { deleteItemFromArchive } from 'api/archive';
import { common_ArchiveFull, common_ArchiveItemInsert } from 'api/proto-http/admin';
import { FC, useState } from 'react';
import styles from 'styles/archiveList.scss';

interface ArchiveList {
  archive: common_ArchiveFull;
  newItemsByArchiveId: { [key: number]: common_ArchiveItemInsert };
  handleNewItemFieldChange: (
    archiveId: number,
    field: 'title' | 'url' | 'media',
    value: string,
  ) => void;
  handleMediaSelection: (archiveId: number, mediaUrl: string) => void;
  submitNewItem: (archiveId: number) => void;
  filesUrl: string[];
  fetchArchive: () => void;
}

export const ArchivePaged: FC<ArchiveList> = ({
  archive,
  newItemsByArchiveId,
  handleNewItemFieldChange,
  handleMediaSelection,
  submitNewItem,
  filesUrl,
  fetchArchive,
}) => {
  const [urlVisibility, setUrlVisibility] = useState(false);
  const [mediaVisibility, setMediaVisibility] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = archive.items?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((archive.items?.length ?? 0) / itemsPerPage);

  const nextPage = () => {
    setCurrentPage((currentPage) => Math.min(currentPage + 1, totalPages));
  };

  const prevPage = () => {
    setCurrentPage((currentPage) => Math.max(currentPage - 1, 1));
  };

  const handleUrlVisibility = () => {
    setUrlVisibility(!urlVisibility);
  };

  const handleMediaVisibility = () => {
    setMediaVisibility(!mediaVisibility);
  };

  const deleteItem = async (id: number | undefined) => {
    try {
      const response = await deleteItemFromArchive({ itemId: id });
      console.log('iteme deleted: ', response);
      fetchArchive();
    } catch (error) {
      console.error(error);
    }
  };
  return (
    <div className={styles.list_archive}>
      <ul>
        {currentItems?.map((item, index) => {
          const itemNumber = index + 1 + (currentPage - 1) * itemsPerPage;
          return (
            <>
              <li key={index} className={styles.item}>
                <p className={styles.id}>{itemNumber}</p>
                <button type='button' onClick={() => deleteItem(item.id)}>
                  x
                </button>
                <img src={item.archiveItemInsert?.media} alt='media' />
                <div>
                  <p>{item.archiveItemInsert?.title}</p>
                  <p>{item.archiveItemInsert?.url}</p>
                </div>
              </li>
            </>
          );
        })}

        {currentPage === totalPages && (
          <li className={styles.new_item}>
            <input
              type='text'
              placeholder='Title'
              value={newItemsByArchiveId[archive.archive?.id ?? 0]?.title || ''}
              onChange={(e) =>
                handleNewItemFieldChange(archive.archive?.id ?? 0, 'title', e.target.value)
              }
            />
            <input
              type='text'
              placeholder='Item URL'
              value={newItemsByArchiveId[archive.archive?.id ?? 0]?.url || ''}
              onChange={(e) =>
                handleNewItemFieldChange(archive.archive?.id ?? 0, 'url', e.target.value)
              }
            />
            <div>
              <button type='button' onClick={handleUrlVisibility}>
                by url
              </button>
              {urlVisibility && (
                <input
                  type='text'
                  placeholder='Media URL'
                  value={newItemsByArchiveId[archive.archive?.id ?? 0]?.media || ''}
                  onChange={(e) =>
                    handleNewItemFieldChange(archive.archive?.id ?? 0, 'media', e.target.value)
                  }
                />
              )}
              <button type='button' onClick={handleMediaVisibility}>
                media selector
              </button>
            </div>
            <button
              onClick={() => submitNewItem(archive.archive?.id ?? 0)}
              className={styles.button}
            >
              submit
            </button>
          </li>
        )}

        {mediaVisibility && (
          <ul>
            {filesUrl.map((media, id) => (
              <li key={id} style={{ display: 'inline-block', margin: '5px' }}>
                <img src={media} alt='' style={{ width: '100px', height: '100px' }} />
                <button
                  type='button'
                  onClick={() => handleMediaSelection(archive.archive?.id ?? 0, media)}
                >
                  ok
                </button>
              </li>
            ))}
          </ul>
        )}
      </ul>
      {archive.items && archive.items.length > 0 && (
        <div>
          <button onClick={prevPage} disabled={currentPage === 1}>
            Previous
          </button>
          <button onClick={nextPage} disabled={currentPage === totalPages}>
            Next
          </button>
        </div>
      )}
    </div>
  );
};
