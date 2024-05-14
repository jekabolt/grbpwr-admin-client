import ClearIcon from '@mui/icons-material/Clear';
import { Button, Grid, IconButton, TextField, Typography } from '@mui/material';
import {
  common_ArchiveFull,
  common_ArchiveInsert,
  common_ArchiveItemInsert,
} from 'api/proto-http/admin';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import React, { FC, useEffect, useState } from 'react';
import styles from 'styles/archiveList.scss';

type UpdateArchivePayload = Partial<common_ArchiveInsert>;
type ArchivePayloads = {
  [key: number]: UpdateArchivePayload;
};

interface Archive {
  archive: common_ArchiveFull[];
  deleteArchive: (id: number | undefined) => void;
  deleteItem: (id: number | undefined) => void;
  newItemToArchive: (id: number | undefined, newItem: common_ArchiveItemInsert[]) => void;
  showMessage: (message: string, severity: 'success' | 'error') => void;
  updateArchiveInformation: (
    id: number | undefined,
    heading: string | undefined,
    description: string | undefined,
  ) => void;
}

export const ListArchive: FC<Archive> = ({
  archive,
  deleteArchive,
  deleteItem,
  newItemToArchive,
  updateArchiveInformation,
}) => {
  const [archivePayloads, setArchivePayloads] = useState<ArchivePayloads>({});
  const [media, setMedia] = useState('');
  const [title, setTitle] = useState('');
  const [isEdit, setIsEdit] = useState(false);
  const [selectedArchiveId, setSelectedArchiveId] = useState<number | undefined>();

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

  const editModeToggler = () => {
    setIsEdit(!isEdit);
  };

  const updateAndDisableEditMode = (id: number | undefined) => {
    if (id === undefined) return;
    if (isEdit) {
      const payload = archivePayloads[id];
      if (payload) {
        updateArchiveInformation(id, payload.heading, payload.description);
      }
    }
    editModeToggler();
  };

  const createMediaPreviewHandler = (archiveId: number | undefined) => {
    return (newSelectedMedia: string[]) => {
      if (newSelectedMedia.length > 0) {
        setMedia(newSelectedMedia[0]);
        setSelectedArchiveId(archiveId);
      }
    };
  };

  const handleSubmitNewItem = (id: number | undefined) => {
    if (!id) return;

    const newItem: common_ArchiveItemInsert = {
      media: media,
      title: title,
      url: media,
    };
    newItemToArchive(id, [newItem]);
    setMedia('');
    setTitle('');
  };
  return (
    <Grid container spacing={2} marginLeft={10}>
      {archive.map(
        (a) =>
          a.archive?.id && (
            <React.Fragment key={`archive-${a.archive.id}`}>
              <Grid item xs={10}>
                <Grid container className={styles.items_container} wrap='nowrap'>
                  {isEdit && (
                    <Grid item className={styles.add_preview_new_item}>
                      {media && selectedArchiveId === a.archive.id ? (
                        <>
                          <img src={media} />
                          <TextField
                            name='title'
                            value={title}
                            onChange={(e: any) => setTitle(e.target.value)}
                            className={styles.description}
                            label='DESCRIPTION'
                            variant='standard'
                            multiline
                          />
                          <Button
                            size='small'
                            className={styles.add_item}
                            onClick={() => handleSubmitNewItem(a.archive?.id)}
                          >
                            add
                          </Button>
                          <IconButton size='small' className={styles.exit_edit_mode}>
                            <ClearIcon fontSize='medium' />
                          </IconButton>
                        </>
                      ) : (
                        <MediaSelectorLayout
                          label='add media'
                          allowMultiple={false}
                          saveSelectedMedia={createMediaPreviewHandler(a.archive.id)}
                        />
                      )}
                    </Grid>
                  )}
                  {a.items?.map((item) => (
                    <Grid item key={`item-${item.archiveId}`} className={styles.item}>
                      <img src={item.archiveItemInsert?.media} alt='' />
                      <Typography noWrap={false} variant='overline' className={styles.description}>
                        {item.archiveItemInsert?.title}
                      </Typography>
                      <IconButton
                        onClick={() => deleteItem(item.id)}
                        className={styles.delete_item}
                      >
                        <ClearIcon />
                      </IconButton>
                    </Grid>
                  ))}
                </Grid>
              </Grid>
              <Grid item xs={12}>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      name='heading'
                      value={
                        archivePayloads[a.archive?.id]?.heading ??
                        a.archive.archiveInsert?.heading ??
                        ''
                      }
                      inputProps={{ readOnly: !isEdit }}
                      onChange={(e) => updateArchivePayload(a.archive?.id, e)}
                    />
                  </Grid>
                  <Grid item xs={7}>
                    <TextField
                      name='description'
                      value={
                        archivePayloads[a.archive?.id]?.description ??
                        a.archive.archiveInsert?.description ??
                        ''
                      }
                      fullWidth
                      multiline
                      inputProps={{ readOnly: !isEdit }}
                      onChange={(e) => updateArchivePayload(a.archive?.id, e)}
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <Button onClick={() => updateAndDisableEditMode(a.archive?.id)}>
                      {isEdit ? 'update' : 'edit'}
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
