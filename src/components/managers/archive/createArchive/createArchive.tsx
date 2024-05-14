import ClearIcon from '@mui/icons-material/Clear';
import { Alert, Button, Grid, IconButton, Snackbar, TextField, Typography } from '@mui/material';
import { addArchive } from 'api/archive';
import { common_ArchiveNew } from 'api/proto-http/admin';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { FC, useState } from 'react';
import styles from 'styles/archive.scss';

interface Archives {
  fetchArchive: (limit: number, offset: number) => void;
}

export const CreateArchive: FC<Archives> = ({ fetchArchive }) => {
  const initialArchiveState: common_ArchiveNew = {
    archive: {
      heading: '',
      description: '',
    },
    items: [],
  };
  const [archive, setArchive] = useState<common_ArchiveNew>(initialArchiveState);
  const [title, setTitle] = useState<string>('');
  const [mediaItem, setMediaItem] = useState<string[]>([]);
  const [media, setMedia] = useState<string>('');
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
  const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackBarMessage(message);
    setSnackBarSeverity(severity);
    setIsSnackBarOpen(!isSnackBarOpen);
  };

  const createArchive = async () => {
    try {
      if (mediaItem.length > 0) {
        await addArchive({ archiveNew: archive });
        setArchive(initialArchiveState);
        fetchArchive(50, 0);
        setMediaItem([]);
        showMessage('ARCHIVE CREATED', 'success');
      } else {
        showMessage('ADD ITEM TO THE ARCHIVE', 'error');
      }
    } catch (error) {
      showMessage('ARCHIVE COULD NOT BE CREATED ', 'success');
    }
  };

  const mediaPreview = (newSelectedMedia: string[]) => {
    if (newSelectedMedia.length === 0) {
      return;
    }

    if (newSelectedMedia.length > 0) {
      setMedia(newSelectedMedia[0]);
    }
  };

  const addNewItem = () => {
    if (mediaItem.includes(media)) {
      showMessage('THIS MEDIA HAS ALREADY BEEN ADDED', 'error');
      return;
    }
    const newItem = {
      media: media,
      url: '',
      title: title,
    };
    setArchive((prev) => ({
      ...prev,
      items: [...(prev.items || []), newItem],
    }));
    setMedia('');
    setTitle('');
    setMediaItem([...mediaItem, media]);
    showMessage('ITEM ADDED', 'success');
  };

  const exitEditMode = () => {
    setMedia('');
  };

  const handleTextFieldChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setArchive((prevArchive: common_ArchiveNew): common_ArchiveNew => {
      return {
        ...prevArchive,
        archive: {
          ...prevArchive.archive,
          [name]: value,
          heading: name === 'heading' ? value : prevArchive.archive?.heading || '',
          description: name === 'description' ? value : prevArchive.archive?.description || '',
        },
        items: prevArchive.items,
      };
    });
  };

  const removeMediaItem = (index: number) => {
    const updatedMediaItems = [...mediaItem];
    updatedMediaItems.splice(index, 1);

    setMediaItem(updatedMediaItems);

    setArchive((prevArchive) => ({
      ...prevArchive,
      items: prevArchive.items?.filter((_, i) => i !== index),
    }));
  };

  return (
    <Grid container spacing={2} marginLeft={10} marginTop={4} alignItems='center'>
      <Grid item xs={10}>
        <Grid container className={styles.scroll_container} wrap='nowrap'>
          <Grid item className={styles.media_item_add}>
            {media ? (
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
                <Button size='small' className={styles.add_item} onClick={() => addNewItem()}>
                  add
                </Button>
                <IconButton
                  size='small'
                  className={styles.exit_edit_mode}
                  onClick={() => exitEditMode()}
                >
                  <ClearIcon fontSize='medium' />
                </IconButton>
              </>
            ) : (
              <MediaSelectorLayout
                label='add media'
                allowMultiple={false}
                saveSelectedMedia={mediaPreview}
              />
            )}
          </Grid>
          {mediaItem.map((media, id) => (
            <Grid item key={id} className={styles.media_item}>
              <img src={media} />
              <Typography noWrap={false} variant='overline' className={styles.description}>
                {archive.items?.[id].title}
              </Typography>
              <IconButton onClick={() => removeMediaItem(id)} className={styles.delete_item}>
                <ClearIcon fontSize='small' />
              </IconButton>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              type='text'
              name='heading'
              value={archive.archive?.heading}
              onChange={handleTextFieldChange}
              label='HEADING'
              InputLabelProps={{ shrink: true }}
              size='small'
            />
          </Grid>
          <Grid item xs={4}>
            <TextField
              type='text'
              name='description'
              value={archive.archive?.description}
              onChange={handleTextFieldChange}
              label='DESCRIPTION'
              InputLabelProps={{ shrink: true }}
              size='small'
              fullWidth
              multiline
            />
          </Grid>
        </Grid>
      </Grid>
      <Grid item xs={3}>
        <Button
          onClick={() => createArchive()}
          variant='contained'
          disabled={mediaItem.length === 0 ? true : false}
        >
          submit
        </Button>
      </Grid>
      <Snackbar
        open={isSnackBarOpen}
        autoHideDuration={6000}
        onClose={() => setIsSnackBarOpen(!isSnackBarOpen)}
      >
        <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
      </Snackbar>
    </Grid>
  );
};
