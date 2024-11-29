import DeleteIcon from '@mui/icons-material/Delete';
import { Box, Button, Grid, TextField, Typography } from '@mui/material';
import { common_MediaFull } from 'api/proto-http/admin';
import { common_ArchiveFull, common_ArchiveItemFull } from 'api/proto-http/frontend';
import { CopyToClipboard } from 'components/common/copyToClipboard';
import { MediaSelectorLayout } from 'components/common/mediaSelector/layout';
import { TruncateText } from 'components/common/truncateText';
import { isValidURL } from 'features/utilitty/isValidUrl';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/archiveList.scss';
import { ArchiveModal } from '../archiveModal/archiveModal';
import { ListArchiveInterface } from '../interfaces/interfaces';
import { ArchiveTable } from './archiveTable';

export const ListArchive: FC<ListArchiveInterface> = ({
  archive,
  setArchive,
  deleteArchiveFromList,
  deleteItemFromArchive,
  updateArchiveInformation,
  showMessage,
}) => {
  const [media, setMedia] = useState('');
  const [mediaId, setMediaId] = useState<number>();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [selectedArchiveId, setSelectedArchiveId] = useState<number>();
  const [selectedItemId, setSelectedItemId] = useState<number | undefined>(undefined);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState<{ [key: number]: boolean }>({});
  const [heading, setHeading] = useState<{ [key: number]: string }>({});
  const [description, setDescription] = useState<{ [key: number]: string }>({});
  const toggleModal = () => setIsModalOpen(!isModalOpen);

  const resetState = () => {
    toggleModal();
    setMedia('');
    setTitle('');
    setUrl('');
    setSelectedItemId(undefined);
  };

  const handleRowClick = (item: common_ArchiveItemFull, archiveId?: number) => {
    setMedia(item.archiveItem?.media?.media?.thumbnail?.mediaUrl ?? '');
    setTitle(item.archiveItem?.name || '');
    setUrl(item.archiveItem?.url || '');
    setSelectedArchiveId(archiveId);
    setSelectedItemId(item.id);
    setIsModalOpen(true);
  };

  useEffect(() => {
    archive.forEach((entry) => {
      entry.items = entry.items?.map((item) => ({
        ...item,
        media: item.archiveItem?.media?.media?.thumbnail?.mediaUrl,
        title: item.archiveItem?.name,
        url: item.archiveItem?.url,
      }));
    });
  }, [archive]);

  const handleSaveOrder = (updatedItems: common_ArchiveItemFull[], archiveId?: number) => {
    setArchive((prev) =>
      prev.map((entry) => {
        if (entry.archive?.id === archiveId) {
          const updated = { ...entry, items: updatedItems };
          updateArchiveInformation(archiveId, updated);
          showMessage('items order changed', 'success');
          return updated;
        }
        return entry;
      }),
    );
  };

  const handleMediaPreview = (archiveId?: number) => (media: common_MediaFull[]) => {
    if (media.length) {
      const selected = media[0];
      setMedia(selected.media?.fullSize?.mediaUrl ?? '');
      setMediaId(selected.id);
      setSelectedArchiveId(archiveId);
      setIsModalOpen(true);
    }
  };

  const addNewItemToArchive = (archiveId?: number) => {
    if (url && !isValidURL(url)) {
      showMessage('url is not valid', 'error');
      return;
    }
    setArchive((prev) =>
      prev.map((entry) => {
        if (entry.archive?.id === archiveId) {
          if (entry.items?.some((item) => item.archiveItem?.media?.id === mediaId)) {
            return showMessage('this media is already added', 'error'), entry;
          }
          const tempId = Date.now();
          const newItem = {
            id: tempId,
            archiveId,
            archiveItem: {
              media: { id: mediaId, media: { thumbnail: { mediaUrl: media } } },
              url,
              name: title,
            },
          } as common_ArchiveItemFull;
          const updatedItems = [...(entry.items || []), newItem];
          const updated = { ...entry, items: updatedItems };
          updateArchiveInformation(archiveId, updated);
          showMessage('item added successfully', 'success');
          return updated;
        }
        return entry;
      }),
    );
    resetState();
  };

  const handleUpdateItemInArchive = (archiveId?: number) => {
    if (!archiveId || selectedItemId === undefined) {
      return;
    }
    if (url && !isValidURL(url)) {
      showMessage('url is not valid', 'error');
      return;
    }
    setArchive((prev) =>
      prev.map((entry) => {
        if (entry.archive?.id === archiveId) {
          const updatedItems = entry.items?.map((item) => {
            if (item.id === selectedItemId) {
              const updatedItem: common_ArchiveItemFull = {
                ...item,
                archiveItem: {
                  ...item.archiveItem,
                  media: {
                    id: mediaId || item.archiveItem?.media?.id,
                    media: {
                      ...item.archiveItem?.media?.media,
                      thumbnail: {
                        ...item.archiveItem?.media?.media?.thumbnail,
                        mediaUrl: media || item.archiveItem?.media?.media?.thumbnail?.mediaUrl,
                      },
                    },
                  } as common_MediaFull,
                  url: url,
                  name: title,
                },
              };

              return updatedItem;
            }
            return item;
          });

          const updated = { ...entry, items: updatedItems as common_ArchiveItemFull[] };
          updateArchiveInformation(archiveId, updated);
          showMessage('item updated successfully', 'success');
          return updated;
        }
        return entry;
      }),
    );
    resetState();
  };

  const handleUpdateArchive = (archiveId?: number) => {
    if (!archiveId) return;
    setArchive((prev) =>
      prev.map((entry) => {
        if (entry.archive?.id === archiveId) {
          const updated = {
            ...entry,
            archive: {
              ...entry.archive,
              archiveBody: {
                heading: heading[archiveId] ?? entry.archive?.archiveBody?.heading ?? '',
                text: description[archiveId] ?? entry.archive?.archiveBody?.text ?? '',
              },
            },
          } as common_ArchiveFull;
          updateArchiveInformation(archiveId, updated);
          showMessage('new archive data saved', 'success');
          return updated;
        }
        return entry;
      }),
    );
  };

  const toggleEditMode = (archiveId?: number) => {
    if (archiveId === undefined) return;
    const currentHeading =
      heading[archiveId] ??
      archive.find((entry) => entry.archive?.id === archiveId)?.archive?.archiveBody?.heading ??
      '';
    if (isEditMode[archiveId] && !currentHeading.trim()) {
      showMessage('archive title cannot be empty', 'error');
      return;
    }
    if (isEditMode[archiveId]) {
      handleUpdateArchive(archiveId);
    }
    setIsEditMode((prev) => ({ ...prev, [archiveId]: !prev[archiveId] }));
  };

  return (
    <Grid container spacing={3}>
      {archive.map((entry, id) => (
        <Grid item xs={12} key={entry.archive?.id}>
          <Grid
            container
            justifyContent='space-between'
            spacing={2}
            borderBottom='5px solid #000'
            padding={2}
            sx={{ backgroundColor: id % 2 == 0 ? '#f5f5f5' : 'transparent' }}
          >
            <Grid item xs={12} display='flex' justifyContent='flex-end'>
              <Typography variant='h6' textTransform='uppercase'>
                total number of items: {entry.items?.length}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant='h6' textTransform='uppercase'>
                archive &#8470; {archive.length - id}
              </Typography>
            </Grid>
            <Grid item>
              <Box display='flex' gap='20px'>
                <TextField
                  label='title'
                  InputLabelProps={{ shrink: true }}
                  required={isEditMode[entry.archive?.id ?? 0]}
                  value={
                    heading[entry.archive?.id ?? 0] ?? entry.archive?.archiveBody?.heading ?? ''
                  }
                  onChange={(e) =>
                    setHeading({ ...heading, [entry.archive?.id ?? 0]: e.target.value })
                  }
                  inputProps={{ readOnly: !isEditMode[entry.archive?.id ?? 0] }}
                  size='small'
                />
                <Button
                  variant='contained'
                  size='medium'
                  onClick={() => toggleEditMode(entry.archive?.id)}
                >
                  {isEditMode[entry.archive?.id ?? 0] ? 'save' : 'edit'}
                </Button>
              </Box>
            </Grid>
            <Grid item>
              <Button onClick={() => deleteArchiveFromList(entry.archive?.id)}>
                <DeleteIcon color='error' fontSize='medium' />
              </Button>
            </Grid>

            <Grid item xs={12}>
              {isEditMode[entry.archive?.id ?? 0] ? (
                <ArchiveTable
                  data={entry.items || []}
                  deleteItemFromArchive={deleteItemFromArchive}
                  handleSaveNewOrderOfRows={handleSaveOrder}
                  onRowClick={(item) => handleRowClick(item, entry.archive?.id)}
                />
              ) : (
                <Grid container spacing={2}>
                  {entry.items?.slice(-4).map((item, index) => (
                    <Grid item xs={6} md={3} key={index}>
                      <Grid item xs={12} className={styles.item}>
                        <img src={item.archiveItem?.media?.media?.thumbnail?.mediaUrl} />
                      </Grid>
                      <Grid item xs={12}>
                        <TruncateText text={item.archiveItem?.name} length={60} />
                        {item.archiveItem?.url && (
                          <CopyToClipboard
                            text={item.archiveItem?.url}
                            displayText={`${item.archiveItem?.url.slice(0, 5)}...${item.archiveItem?.url.slice(-7)}`}
                          />
                        )}
                      </Grid>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Grid>

            <Grid item xs={12}>
              <Grid container spacing={2}>
                <Grid item xs={8} sm={10}>
                  <TextField
                    label='description'
                    InputLabelProps={{ shrink: true }}
                    value={
                      description[entry.archive?.id ?? 0] ?? entry.archive?.archiveBody?.text ?? ''
                    }
                    onChange={(e) =>
                      setDescription({ ...description, [entry.archive?.id ?? 0]: e.target.value })
                    }
                    inputProps={{ readOnly: !isEditMode[entry.archive?.id ?? 0], maxLength: 255 }}
                    size='small'
                    fullWidth
                    multiline
                  />
                </Grid>
                {isEditMode[entry.archive?.id ?? 0] && (
                  <Grid item xs={4} sm={2}>
                    <MediaSelectorLayout
                      label='add new item'
                      allowMultiple={false}
                      saveSelectedMedia={handleMediaPreview(entry.archive?.id)}
                      aspectRatio={['1:1', '3:4', '4:3']}
                      hideVideos={true}
                      isDeleteAccepted={false}
                    />
                  </Grid>
                )}
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      ))}
      <ArchiveModal
        id={selectedArchiveId}
        title={title}
        url={url}
        media={media}
        open={isModalOpen}
        setTitle={setTitle}
        addNewItem={selectedItemId ? handleUpdateItemInArchive : addNewItemToArchive}
        setUrl={setUrl}
        close={toggleModal}
        isEditMode={selectedItemId !== null}
      />
    </Grid>
  );
};
