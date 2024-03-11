import { getAllUploadedFiles } from 'api/admin';
import { addArchiveItem, deleteArchive, getArchive, updateArchive } from 'api/archive';
import {
  common_ArchiveFull,
  common_ArchiveInsert,
  common_ArchiveItemInsert,
  common_Media,
} from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import arrow from 'img/arrow-right.jpg';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/archiveList.scss';
import { ArchivePaged } from './archiveComponents/archivePaged';

export const GetArchive: FC = () => {
  const [archive, setArchive] = useState<common_ArchiveFull[] | undefined>([]);
  const [newItemsByArchiveId, setNewItemsByArchiveId] = useState<{
    [key: number]: common_ArchiveItemInsert;
  }>({});
  const [filesUrl, setFilesUrl] = useState<string[]>([]);
  const itemsPerPage = 1;
  const [currentPage, setCurrentPage] = useState(1);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const totalPages = Math.ceil((archive?.length ?? 0) / itemsPerPage);
  const [editingArchive, setEditingArchive] = useState<common_ArchiveInsert | null>(null);
  const [editItemId, setEditItemId] = useState<number | undefined>();

  const handleEditClick = (archive: common_ArchiveFull) => {
    setEditItemId(archive.archive?.id);
    setEditingArchive(archive.archive?.archiveInsert || null);
  };

  const handleEditingFieldChange = (field: 'heading' | 'description', value: string) => {
    setEditingArchive((currentEditingArchive) => {
      if (currentEditingArchive) {
        return { ...currentEditingArchive, [field]: value };
      }
      return null;
    });
  };

  const handleSaveClick = async () => {
    if (editingArchive && editItemId) {
      await updateArchive({
        id: editItemId,
        archive: editingArchive,
      });
      setEditItemId(undefined);
      setEditingArchive(null);
      fetchArchive();
    }
  };

  const nextPage = () => {
    setCurrentPage((currentPage) => Math.min(currentPage + 1, totalPages));
  };

  const prevPage = () => {
    setCurrentPage((currentPage) => Math.max(currentPage - 1, 1));
  };

  const fetchArchive = async () => {
    const response = await getArchive({
      limit: 5,
      offset: 0,
      orderFactor: 'ORDER_FACTOR_ASC',
    });
    setArchive(response.archives);
  };

  useEffect(() => {
    fetchArchive();
  }, [currentPage]);

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

  const handleNewItemFieldChange = (
    archiveId: number,
    field: 'title' | 'url' | 'media',
    value: string,
  ) => {
    setNewItemsByArchiveId((currentItems) => ({
      ...currentItems,
      [archiveId]: { ...currentItems[archiveId], [field]: value },
    }));
  };

  const submitNewItem = async (archiveId: number) => {
    const newItem = newItemsByArchiveId[archiveId];
    await addArchiveItem({
      archiveId: archiveId,
      items: [newItem],
    });
    fetchArchive();
  };

  const handleMediaSelection = (archiveId: number, mediaUrl: string) => {
    setNewItemsByArchiveId((currentItems) => ({
      ...currentItems,
      [archiveId]: { ...currentItems[archiveId], media: mediaUrl },
    }));
  };

  const removeArchive = async (id: number | undefined) => {
    const response = await deleteArchive({ id });
    fetchArchive();
  };

  return (
    <Layout>
      <div className={styles.archive_list_container}>
        <button type='button' onClick={prevPage} disabled={currentPage === 1}>
          <img src={arrow} style={{ rotate: '180deg' }} />
        </button>
        {archive?.slice(indexOfFirstItem, indexOfLastItem).map((archive, archiveIdx) => (
          <div key={archiveIdx} className={styles.archive_info}>
            <button
              type='button'
              onClick={() => removeArchive(archive.archive?.id)}
              className={styles.delete_archive}
            >
              X
            </button>
            {editItemId === archive.archive?.id ? (
              <>
                <input
                  type='text'
                  value={editingArchive?.heading || ''}
                  onChange={(e) => handleEditingFieldChange('heading', e.target.value)}
                />
                <ArchivePaged
                  filesUrl={filesUrl}
                  archive={archive}
                  newItemsByArchiveId={newItemsByArchiveId}
                  handleMediaSelection={handleMediaSelection}
                  handleNewItemFieldChange={handleNewItemFieldChange}
                  submitNewItem={submitNewItem}
                  fetchArchive={fetchArchive}
                />
                <input
                  type='text'
                  value={editingArchive?.description || ''}
                  onChange={(e) => handleEditingFieldChange('description', e.target.value)}
                />
                <button type='button' onClick={handleSaveClick}>
                  save
                </button>
              </>
            ) : (
              <>
                <h3>{archive.archive?.archiveInsert?.heading}</h3>
                <ArchivePaged
                  filesUrl={filesUrl}
                  archive={archive}
                  newItemsByArchiveId={newItemsByArchiveId}
                  handleMediaSelection={handleMediaSelection}
                  handleNewItemFieldChange={handleNewItemFieldChange}
                  submitNewItem={submitNewItem}
                  fetchArchive={fetchArchive}
                />
                <h3>{archive.archive?.archiveInsert?.description}</h3>
                <button
                  type='button'
                  onClick={() => handleEditClick(archive)}
                  className={styles.edit_archive}
                >
                  edit
                </button>
              </>
            )}
          </div>
        ))}
        <button type='button' onClick={nextPage} disabled={currentPage === totalPages}>
          <img src={arrow} />
        </button>
      </div>
    </Layout>
  );
};
