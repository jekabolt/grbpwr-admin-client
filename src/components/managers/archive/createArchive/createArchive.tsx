import ClearIcon from '@mui/icons-material/Clear';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, Button, Grid, IconButton, TextField, Typography } from '@mui/material';
import { addArchive } from 'api/archive';
import {
  common_ArchiveItemInsert,
  common_ArchiveNew,
  common_MediaFull,
  common_MediaItem,
} from 'api/proto-http/admin';
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
    itemsInsert: [],
  };
  const [archive, setArchive] = useState<common_ArchiveNew>(initialArchiveState);
  const [title, setTitle] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [mediaItem, setMediaItem] = useState<common_MediaFull[]>([]);
  const [media, setMedia] = useState<string | undefined>('');
  const [mediaId, setMediaId] = useState<number | undefined>();
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

  const isValidUrl = (url: string | undefined) => {
    if (!url) return;
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  };

  const mediaPreview = (newSelectedMedia: common_MediaFull[]) => {
    if (newSelectedMedia.length === 0) return;
    const selectedMedia = newSelectedMedia[0];
    setMediaId(selectedMedia.id);
    const previewMediaUrl = selectedMedia.media?.thumbnail?.mediaUrl;
    setMedia(previewMediaUrl);
    setIsModalOpen(true);
  };

  const addNewItem = () => {
    if (url && !isValidUrl(url)) {
      showMessage('INVALID URL', 'error');
      return;
    }
    const newItem: common_ArchiveItemInsert = {
      mediaId: mediaId,
      url: url,
      title: title,
    };

    setArchive((prev) => ({
      ...prev,
      itemsInsert: [...(prev.itemsInsert ?? []), newItem], // Use ?? to handle undefined safely
    }));
    if (media) {
      const newMediaItem: common_MediaItem = {
        fullSize: { mediaUrl: media, width: undefined, height: undefined },
        thumbnail: undefined,
        compressed: undefined,
      };

      const newMediaFull: common_MediaFull = {
        id: undefined, // Or some logic to generate/set ID
        createdAt: undefined, // Or set the current timestamp or undefined
        media: newMediaItem,
      };

      setMediaItem((prevMediaItems) => [...prevMediaItems, newMediaFull]);
    }

    setMedia(undefined); // Reset media to undefined as it's type is string | undefined
    setTitle('');
    setUrl('');
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
        itemsInsert: prevArchive.itemsInsert,
      };
    });
  };

  const removeMediaItem = (index: number) => {
    const updatedMediaItems = [...mediaItem];
    updatedMediaItems.splice(index, 1);

    setMediaItem(updatedMediaItems);

    setArchive((prevArchive) => ({
      ...prevArchive,
      itemsInsert: prevArchive.itemsInsert?.filter((_, i) => i !== index),
    }));
  };

  const isDescriptionShort = (title: string | undefined) => {
    if (!title) return;
    const maxLineLength = 60;
    return title.length <= maxLineLength;
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

  return (
    <Grid container spacing={2} marginTop={4} alignItems='center'>
      <Grid item xs={10}>
        <Grid container className={styles.scroll_container} wrap='nowrap'>
          <p>create new archive</p>
          <Grid item className={styles.media_item_add}>
            <MediaSelectorLayout
              label='add media'
              allowMultiple={false}
              saveSelectedMedia={mediaPreview}
            />
          </Grid>
          {mediaItem.map((media, id) => (
            <Box width='396px' key={id}>
              <Grid item className={styles.media_item}>
                <img src={media.media?.fullSize?.mediaUrl} alt={`Media item ${id}`} />
                <IconButton onClick={() => removeMediaItem(id)} className={styles.delete_item}>
                  <ClearIcon fontSize='small' />
                </IconButton>
              </Grid>
              <Box display='flex' alignItems='flex-start'>
                <Typography
                  variant='overline'
                  className={expandedItemId === id ? styles.description : styles.hidden_description}
                >
                  {archive.itemsInsert?.[id]?.title ?? 'No title'} {/* Safe access */}
                </Typography>

                {archive.itemsInsert?.[id]?.title &&
                  !isDescriptionShort(archive.itemsInsert[id].title) && (
                    <IconButton onClick={() => toggleTextExpansion(id)}>
                      {expandedItemId === id ? (
                        <ExpandLessIcon fontSize='small' />
                      ) : (
                        <ExpandMoreIcon fontSize='small' />
                      )}
                    </IconButton>
                  )}
              </Box>
              {archive.itemsInsert?.[id]?.url && isValidUrl(archive.itemsInsert[id].url) && (
                <a href={archive.itemsInsert[id].url} target='_blank' rel='noopener noreferrer'>
                  go to link
                </a>
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
              //TODO: try to upercase via scss
              label='TITLE'
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
        media={media?.toString() || ''}
        title={title}
        setTitle={setTitle}
        url={url}
        setUrl={setUrl}
        addNewItem={addNewItem}
      />
    </Grid>
  );
};
