import ClearIcon from '@mui/icons-material/Clear';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, Button, Grid, IconButton, TextField, Typography } from '@mui/material';
import { addArchive } from 'api/archive';
import { common_ArchiveNew } from 'api/proto-http/admin';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { FC, useState } from 'react';
import styles from 'styles/archive.scss';
import { ArchiveModal } from '../archiveModal/archiveModal';
import { createArchives } from '../interfaces/interfaces';

export const CreateArchive: FC<createArchives> = ({ fetchArchive, showMessage }) => {
  const initialArchiveState: common_ArchiveNew = {
    archive: {
      heading: '',
      description: '',
    },
    items: [],
  };
  const [archive, setArchive] = useState<common_ArchiveNew>(initialArchiveState);
  const [title, setTitle] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [mediaItem, setMediaItem] = useState<string[]>([]);
  const [media, setMedia] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<number | undefined>();

  const toggleTextExpansion = (id: number | undefined) => {
    setExpandedItemId((prevId) => (prevId === id ? undefined : id));
  };

  const toggleModal = () => {
    if (isModalOpen) {
      setTitle('');
    }
    setIsModalOpen(!isModalOpen);
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
      setIsModalOpen(true);
    }
  };

  const isValidUrl = (url: string | undefined) => {
    if (!url) return;
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  };

  const addNewItem = () => {
    if (url && !isValidUrl(url)) {
      showMessage('INVALID URL', 'error');
      return;
    }
    if (mediaItem.includes(media)) {
      showMessage('THIS MEDIA HAS ALREADY BEEN ADDED', 'error');
      toggleModal();
      return;
    }

    const newItem = {
      media: media,
      url: url,
      title: title,
    };
    setArchive((prev) => ({
      ...prev,
      items: [...(prev.items || []), newItem],
    }));
    setMedia('');
    setTitle('');
    setUrl('');
    setMediaItem([...mediaItem, media]);
    toggleModal();
    showMessage('ITEM ADDED', 'success');
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

  const isDescriptionShort = (title: string | undefined) => {
    if (!title) return;
    const maxLineLength = 60;
    return title.length <= maxLineLength;
  };

  return (
    <Grid container spacing={2} marginTop={4} alignItems='center'>
      <Grid item xs={10}>
        <Grid container className={styles.scroll_container} wrap='nowrap'>
          <Grid item className={styles.media_item_add}>
            <MediaSelectorLayout
              label='create new item'
              allowMultiple={false}
              saveSelectedMedia={mediaPreview}
            />
          </Grid>
          {mediaItem.map((media, id) => (
            <Box width='396px'>
              <Grid item key={id} className={styles.media_item}>
                <img src={media} />
                <IconButton onClick={() => removeMediaItem(id)} className={styles.delete_item}>
                  <ClearIcon fontSize='small' />
                </IconButton>
              </Grid>
              <Box display='flex' alignItems='flex-start'>
                <Typography
                  variant='overline'
                  className={expandedItemId === id ? styles.description : styles.hidden_description}
                >
                  {archive.items?.[id].title}
                </Typography>

                {archive.items?.[id].title && !isDescriptionShort(archive.items?.[id].title) && (
                  <IconButton onClick={() => toggleTextExpansion(id)}>
                    {expandedItemId === id ? (
                      <ExpandLessIcon fontSize='small' />
                    ) : (
                      <ExpandMoreIcon fontSize='small' />
                    )}
                  </IconButton>
                )}
              </Box>
              {archive.items?.[id].url && isValidUrl(archive.items?.[id].url) && (
                <a href={archive.items?.[id].url}>go to link</a>
              )}
            </Box>
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
              required
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
          disabled={mediaItem.length === 0 || archive.archive?.heading?.trim() === ''}
        >
          submit
        </Button>
      </Grid>

      <ArchiveModal
        open={isModalOpen}
        close={toggleModal}
        media={media}
        title={title}
        setTitle={setTitle}
        url={url}
        setUrl={setUrl}
        addNewItem={addNewItem}
      />
    </Grid>
  );
};
