import ClearIcon from '@mui/icons-material/Clear';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, Button, Grid, IconButton, TextField, Typography } from '@mui/material';
import {
  common_ArchiveInsert,
  common_ArchiveItemInsert,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import React, { FC, useEffect, useState } from 'react';
import styles from 'styles/archiveList.scss';
import { ArchiveModal } from '../archiveModal/archiveModal';
import { listArchive } from '../interfaces/interfaces';

type UpdateArchivePayload = Partial<common_ArchiveInsert>;
type ArchivePayloads = {
  [key: number]: UpdateArchivePayload;
};
type EditModes = {
  [key: number]: boolean;
};

export const ListArchive: FC<listArchive> = ({
  archive,
  deleteArchive,
  deleteItem,
  newItemToArchive,
  updateArchiveInformation,
  showMessage,
}) => {
  const [archivePayloads, setArchivePayloads] = useState<ArchivePayloads>({});
  const [media, setMedia] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [isEdit, setIsEdit] = useState<EditModes>({});
  const [selectedArchiveId, setSelectedArchiveId] = useState<number | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<number | undefined>();

  const toggleTextExpansion = (id: number | undefined) => {
    setExpandedItemId((prevId) => (prevId === id ? undefined : id));
  };

  const isDescriptionShort = (title: string | undefined) => {
    if (!title) return;
    const maxLineLength = 60;
    return title.length <= maxLineLength;
  };

  const toggleModal = () => {
    setIsModalOpen(!isModalOpen);
  };

  useEffect(() => {
    const initialPayloads: ArchivePayloads = {};
    archive.forEach((a) => {
      if (a.archive?.id) {
        initialPayloads[a.archive.id] = {
          heading: a.archive.archiveInsert?.heading || '',
          description: a.archive.archiveInsert?.description || '',
        };
      }
    });
    setArchivePayloads(initialPayloads);
  }, [archive]);

  const updateArchivePayload = (
    id: number | undefined,
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (id === undefined) return;

    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    const name = target.name;
    const value = target.value;

    setArchivePayloads((prev) => {
      let updatedPayload: UpdateArchivePayload = { ...prev[id] };

      updatedPayload = {
        ...updatedPayload,
        [id]: {
          ...prev[id],
          [name]: value,
        },
      };
      return updatedPayload;
    });
  };

  const editModeToggler = (id: number | undefined) => {
    if (id === undefined) return;

    setIsEdit((prevIsEdit) => {
      const newEditStates: EditModes = {};
      Object.keys(prevIsEdit).forEach((key) => {
        newEditStates[Number(key)] = false;
      });
      newEditStates[id] = !prevIsEdit[id];
      return newEditStates;
    });

    setSelectedArchiveId(id);
  };

  const updateAndDisableEditMode = (id: number | undefined) => {
    if (id === undefined) return;
    if (isEdit[id]) {
      const payload = archivePayloads[id];
      if (payload) {
        updateArchiveInformation(id, payload.heading, payload.description);
      }
    }
    editModeToggler(id);
  };

  const createMediaPreviewHandler = (archiveId: number | undefined) => {
    return (newSelectedMedia: common_MediaFull[]) => {
      if (newSelectedMedia.length > 0) {
        setMedia(newSelectedMedia[0].media?.thumbnail?.mediaUrl ?? '');
        setSelectedArchiveId(archiveId);
        setIsModalOpen(true);
      }
    };
  };
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleSubmitNewItem = (id: number | undefined) => {
    if (!id) return;

    if (url && !isValidUrl(url)) {
      showMessage('INVALID URL ', 'error');
      setUrl('');
      return;
    }

    const newItem: common_ArchiveItemInsert = {
      media: media,
      title: title,
      url: url,
    };
    newItemToArchive(id, [newItem]);
    toggleModal();
    setMedia('');
    setTitle('');
    setUrl('');
  };

  return (
    <Grid container spacing={2}>
      {archive.map(
        (a) =>
          a.archive?.id && (
            <React.Fragment key={`archive-${a.archive.id}`}>
              <Grid item xs={10}>
                <Grid container className={styles.items_container} wrap='nowrap'>
                  {isEdit[a.archive.id] && (
                    <>
                      <Grid item className={styles.add_preview_new_item}>
                        {selectedArchiveId === a.archive.id && (
                          <MediaSelectorLayout
                            label='add media'
                            allowMultiple={false}
                            saveSelectedMedia={createMediaPreviewHandler(a.archive.id)}
                          />
                        )}
                      </Grid>
                      <ArchiveModal
                        title={title}
                        setTitle={setTitle}
                        id={selectedArchiveId}
                        addNewItem={handleSubmitNewItem}
                        url={url}
                        setUrl={setUrl}
                        media={media}
                        open={isModalOpen}
                        close={toggleModal}
                      />
                    </>
                  )}
                  {a.items?.map((item) => (
                    <Box>
                      <Grid item key={`item-${item.archiveId}`} className={styles.item}>
                        <img src={item.archiveItemInsert?.media} alt='' />
                        <IconButton
                          onClick={() => deleteItem(item.id)}
                          className={styles.delete_item}
                        >
                          <ClearIcon />
                        </IconButton>
                      </Grid>
                      <Box width='396px' display='flex' alignItems='flex-start'>
                        <Typography
                          noWrap={false}
                          variant='overline'
                          className={
                            expandedItemId === item.id
                              ? styles.description
                              : styles.hidden_description
                          }
                        >
                          {item.archiveItemInsert?.title}
                        </Typography>
                        {item.archiveItemInsert?.title &&
                          !isDescriptionShort(item.archiveItemInsert.title) && (
                            <IconButton onClick={() => toggleTextExpansion(item.id)}>
                              {expandedItemId === item.id ? (
                                <ExpandLessIcon fontSize='small' />
                              ) : (
                                <ExpandMoreIcon fontSize='small' />
                              )}
                            </IconButton>
                          )}
                      </Box>
                      {item.archiveItemInsert?.url && isValidUrl(item.archiveItemInsert.url) && (
                        <a href={item.archiveItemInsert.url}>go to link</a>
                      )}
                    </Box>
                  ))}
                </Grid>
              </Grid>
              <Grid item xs={12} style={{ marginBottom: '2%' }}>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      label='HEADING'
                      name='heading'
                      value={
                        archivePayloads[a.archive?.id]?.heading ??
                        a.archive.archiveInsert?.heading ??
                        ''
                      }
                      inputProps={{ readOnly: !isEdit[a.archive.id] }}
                      onChange={(e) => updateArchivePayload(a.archive?.id, e)}
                      size='small'
                      required
                    />
                  </Grid>
                  <Grid item xs={7}>
                    <TextField
                      label='DESCRIPTION'
                      name='description'
                      value={
                        archivePayloads[a.archive?.id]?.description ??
                        a.archive.archiveInsert?.description ??
                        ''
                      }
                      fullWidth
                      multiline
                      inputProps={{ readOnly: !isEdit[a.archive.id] }}
                      onChange={(e) => updateArchivePayload(a.archive?.id, e)}
                      size='small'
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <Button
                      disabled={archivePayloads[a.archive?.id]?.heading?.trim() === ''}
                      onClick={() => updateAndDisableEditMode(a.archive?.id)}
                    >
                      {isEdit[a.archive.id] ? 'update' : 'edit'}
                    </Button>
                    <Button color='error' onClick={() => deleteArchive(a.archive?.id)}>
                      delete archive
                    </Button>
                  </Grid>
                </Grid>
              </Grid>
            </React.Fragment>
          ),
      )}
    </Grid>
  );
};
