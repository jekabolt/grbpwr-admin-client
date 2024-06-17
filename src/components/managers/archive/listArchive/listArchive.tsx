import DeleteIcon from '@mui/icons-material/Delete';
import { Box, Button, Divider, Grid, TextField } from '@mui/material';
import { common_MediaFull } from 'api/proto-http/admin';
import { common_ArchiveFull, common_ArchiveItemFull } from 'api/proto-http/frontend';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/archiveList.scss';
import { ArchiveModal } from '../archiveModal/archiveModal';
import { listArchive } from '../interfaces/interfaces';
import { convertArchiveFullToNew } from '../utility/convertArchiveFromFullToNew';
import { ArchiveTable } from './archiveTable';

export const ListArchive: FC<listArchive> = ({
  archive,
  setArchive,
  deleteArchiveFromList,
  updateArchiveInformation,
  showMessage,
  fetchArchive,
}) => {
  const [media, setMedia] = useState<string>('');
  const [heading, setHeading] = useState<{ [key: number]: string }>({});
  const [description, setDescription] = useState<{ [key: number]: string }>({});
  const [mediaId, setMediaId] = useState<number>();
  const [title, setTitle] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [selectedArchiveId, setSelectedArchiveId] = useState<number | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, seIsEditMode] = useState<{ [key: number]: boolean }>({});

  useEffect(() => {
    archive.forEach((archiveEntry) => {
      if (archiveEntry.items) {
        archiveEntry.items = archiveEntry.items.map((item) => ({
          ...item,
          media: item.archiveItem?.media?.media?.thumbnail?.mediaUrl,
          title: item.archiveItem?.title,
          url: item.archiveItem?.url,
        }));
      }
    });
  }, [archive]);

  const deleteItemFromArchive = (archiveId: number | undefined, itemId: number | undefined) => {
    setArchive((prevArchive) =>
      prevArchive.map((archiveEntry) => {
        if (archiveEntry.archive?.id === archiveId) {
          const updatedItems = archiveEntry.items?.filter((item) => item.id !== itemId) || [];
          const updatedArchiveEntry = { ...archiveEntry, items: updatedItems };
          updateArchiveInformation(archiveId, convertArchiveFullToNew(updatedArchiveEntry));
          return updatedArchiveEntry;
        }
        return archiveEntry;
      }),
    );
  };

  const toggleModal = () => {
    setIsModalOpen(!isModalOpen);
    setTitle('');
    setUrl('');
  };

  const mediaPreview =
    (archiveId: number | undefined) => (newSelectedMedia: common_MediaFull[]) => {
      if (newSelectedMedia.length > 0) {
        const media = newSelectedMedia[0];
        setMedia(media.media?.fullSize?.mediaUrl ?? '');
        setMediaId(media.id);
        setSelectedArchiveId(archiveId);
        setIsModalOpen(true);
      }
    };

  const handleSaveNewOrderOfRows = (
    updatedItems: common_ArchiveItemFull[],
    archiveId: number | undefined,
  ) => {
    setArchive((prevArchive) =>
      prevArchive.map((archiveEntry) => {
        if (archiveEntry.archive?.id === archiveId) {
          const originalOrder = archiveEntry.items?.map((item) => item.id).join(',');
          const newOrder = updatedItems.map((item) => item.id).join(',');
          if (originalOrder !== newOrder) {
            showMessage('ITEMS ORDER CHANGED', 'success');
          }
          const updatedArchiveEntry = { ...archiveEntry, items: updatedItems };
          updateArchiveInformation(archiveId, convertArchiveFullToNew(updatedArchiveEntry));
          return updatedArchiveEntry;
        }
        return archiveEntry;
      }),
    );
  };

  const addNewItemToArchive = (archiveId: number | undefined) => {
    setArchive((prevArchive) =>
      prevArchive.map((archiveEntry) => {
        if (archiveEntry.archive?.id === archiveId) {
          const mediaExists = archiveEntry.items?.some(
            (item) => item.archiveItem?.media?.id === mediaId,
          );
          if (mediaExists) {
            showMessage('THIS MEDIA IS ALREADY ADDED TO THE ARCHIVE', 'error');
            return archiveEntry;
          }

          const newItem = {
            id: undefined,
            archiveId,
            archiveItem: {
              media: {
                id: mediaId,
                media: {
                  fullSize: { mediaUrl: media, width: undefined, height: undefined },
                  thumbnail: { mediaUrl: media, width: undefined, height: undefined },
                  compressed: { mediaUrl: media, width: undefined, height: undefined },
                },
                createdAt: undefined,
              },
              url,
              title,
            },
          };
          const updatedItems = [...(archiveEntry.items || []), newItem];
          showMessage('ITEM ADDED TO THE ARCHIVE SUCCESSFULLY', 'success');

          const updatedArchiveEntry = { ...archiveEntry, items: updatedItems };
          updateArchiveInformation(archiveId, convertArchiveFullToNew(updatedArchiveEntry));
          return updatedArchiveEntry;
        }
        return archiveEntry;
      }),
    );
    toggleModal();
    setMedia('');
    setTitle('');
    setUrl('');
    setMediaId(undefined);
  };

  const handleUpdateArchive = (archiveId: number | undefined) => {
    if (!archiveId) return;

    setArchive((prevArchive) =>
      prevArchive.map((archiveEntry) => {
        if (archiveEntry.archive?.id === archiveId) {
          const updatedArchive = {
            ...archiveEntry,
            archive: {
              ...archiveEntry.archive,
              archiveBody: {
                heading: heading[archiveId] ?? archiveEntry.archive?.archiveBody?.heading ?? '',
                description:
                  description[archiveId] ?? archiveEntry.archive?.archiveBody?.description ?? '',
              },
            },
          } as common_ArchiveFull;
          updateArchiveInformation(archiveId, convertArchiveFullToNew(updatedArchive));
          showMessage('ARCHIVE UPDATED', 'success');
          return updatedArchive;
        }
        return archiveEntry;
      }),
    );
  };

  const toggleEditMode = (archiveId: number | undefined) => {
    if (archiveId) {
      if (isEditMode[archiveId]) {
        handleUpdateArchive(archiveId);
      }
      seIsEditMode((prevEditMode) => ({
        ...prevEditMode,
        [archiveId]: !prevEditMode[archiveId],
      }));
    }
  };

  return (
    <Grid container spacing={2}>
      {archive.map((archiveEntry) => (
        <Grid item xs={12} key={archiveEntry.archive?.id}>
          <Grid
            container
            alignItems='center'
            justifyContent='space-between'
            spacing={2}
            marginBottom={2}
          >
            <Grid item>
              <Box display='flex' gap='20px'>
                <TextField
                  label='title'
                  style={{ textTransform: 'uppercase' }}
                  InputLabelProps={{ shrink: true }}
                  required
                  name='heading'
                  value={
                    heading[archiveEntry.archive?.id as number] ??
                    archiveEntry.archive?.archiveBody?.heading ??
                    ''
                  }
                  onChange={(e) =>
                    setHeading({
                      ...heading,
                      [archiveEntry.archive?.id as number]: e.target.value,
                    })
                  }
                  inputProps={{ readOnly: !isEditMode[archiveEntry.archive?.id ?? 0] }}
                  size='small'
                />

                <Button
                  variant='contained'
                  size='medium'
                  onClick={() => toggleEditMode(archiveEntry.archive?.id)}
                >
                  {isEditMode[archiveEntry.archive?.id ?? 0] ? 'update' : 'edit'}
                </Button>
              </Box>
            </Grid>
            <Grid item>
              <Button onClick={() => deleteArchiveFromList(archiveEntry.archive?.id)}>
                <DeleteIcon color='error' fontSize='medium' />
              </Button>
            </Grid>
          </Grid>

          <Grid item xs={12}>
            {isEditMode[archiveEntry.archive?.id ?? 0] ? (
              <ArchiveTable
                data={archiveEntry.items || []}
                deleteItemFromArchive={deleteItemFromArchive}
                handleSaveNewOrderOfRows={handleSaveNewOrderOfRows}
              />
            ) : (
              <Grid container gap={4}>
                {archiveEntry.items?.slice(0, 4).map((item, index) => (
                  <Grid item key={index} className={styles.item} xs={2}>
                    <img src={item.archiveItem?.media?.media?.thumbnail?.mediaUrl} />
                  </Grid>
                ))}
              </Grid>
            )}
          </Grid>
          <Grid container spacing={2} justifyContent='space-between' marginTop={1}>
            <Grid item xs={8}>
              <TextField
                label='description'
                style={{ textTransform: 'uppercase' }}
                InputLabelProps={{ shrink: true }}
                value={
                  description[archiveEntry.archive?.id as number] ??
                  archiveEntry.archive?.archiveBody?.description ??
                  ''
                }
                onChange={(e) =>
                  setDescription({
                    ...description,
                    [archiveEntry.archive?.id as number]: e.target.value,
                  })
                }
                inputProps={{ readOnly: !isEditMode[archiveEntry.archive?.id ?? 0] }}
                size='small'
                fullWidth
              />
            </Grid>
            <Grid item>
              {isEditMode[archiveEntry.archive?.id ?? 0] ? (
                <MediaSelectorLayout
                  label='add new item'
                  allowMultiple={false}
                  saveSelectedMedia={mediaPreview(archiveEntry.archive?.id)}
                />
              ) : (
                ''
              )}
            </Grid>
          </Grid>
          <Grid item xs={12} margin='2% 0  2% 0'>
            <Divider />
          </Grid>
        </Grid>
      ))}
      <ArchiveModal
        title={title}
        setTitle={setTitle}
        id={selectedArchiveId}
        addNewItem={addNewItemToArchive}
        url={url}
        setUrl={setUrl}
        media={media}
        open={isModalOpen}
        close={toggleModal}
      />
    </Grid>
  );
};
