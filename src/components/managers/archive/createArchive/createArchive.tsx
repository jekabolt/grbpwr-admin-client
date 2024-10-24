import ClearIcon from '@mui/icons-material/Clear';
import { Button, Grid, IconButton, TextField, Typography } from '@mui/material';
import { addArchive } from 'api/archive';
import {
  common_ArchiveItemInsert,
  common_ArchiveNew,
  common_MediaFull,
  common_MediaItem,
} from 'api/proto-http/admin';
import { CopyToClipboard } from 'components/common/copyToClipboard';
import { TruncateText } from 'components/common/truncateText';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { FC, useState } from 'react';
import styles from 'styles/archive.scss';
import { ArchiveModal } from '../archiveModal/archiveModal';
import { createArchives } from '../interfaces/interfaces';
import { isValidUrl } from '../utility/isValidUrl';

export const CreateArchive: FC<createArchives> = ({ fetchArchive, showMessage }) => {
  const initialArchiveState: common_ArchiveNew = {
    archive: {
      heading: '',
      text: '',
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
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);

  const toggleModal = (index: number | null = null) => {
    if (isModalOpen) {
      setTitle('');
      setUrl('');
      setMedia(undefined);
      setSelectedItemIndex(null);
    } else if (index !== null) {
      const item = archive.itemsInsert?.[index];
      const media = mediaItem[index];
      setTitle(item?.name || '');
      setUrl(item?.url || '');
      setMedia(media?.media?.fullSize?.mediaUrl);
      setSelectedItemIndex(index);
    }
    setIsModalOpen(!isModalOpen);
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
      showMessage('invalid url', 'error');
      return;
    }

    const newItem: common_ArchiveItemInsert = {
      mediaId: mediaId,
      url: url,
      name: title,
    };

    if (selectedItemIndex !== null) {
      const updatedItems = [...(archive.itemsInsert || [])];
      updatedItems[selectedItemIndex] = newItem;
      setArchive((prev) => ({
        ...prev,
        itemsInsert: updatedItems,
      }));

      const newMediaItem: common_MediaItem = {
        fullSize: { mediaUrl: media, width: undefined, height: undefined },
        thumbnail: undefined,
        compressed: undefined,
        blurhash: undefined,
      };
      const newMediaFull = {
        media: newMediaItem,
      } as common_MediaFull;

      const updatedMediaItems = [...mediaItem];
      updatedMediaItems[selectedItemIndex] = newMediaFull;

      setMediaItem(updatedMediaItems);
    } else {
      setArchive((prev) => ({
        ...prev,
        itemsInsert: [...(prev.itemsInsert ?? []), newItem],
      }));

      if (media) {
        const newMediaItem: common_MediaItem = {
          fullSize: { mediaUrl: media, width: undefined, height: undefined },
          thumbnail: undefined,
          compressed: undefined,
          blurhash: undefined,
        };

        const newMediaFull = {
          media: newMediaItem,
        } as common_MediaFull;

        setMediaItem((prevMediaItems) => [...prevMediaItems, newMediaFull]);
      }
    }

    setMedia(undefined);
    setTitle('');
    setUrl('');
    toggleModal();
    showMessage('item added', 'success');
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
          text: name === 'description' ? value : prevArchive.archive?.text || '',
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

  const createArchive = async () => {
    try {
      if (mediaItem.length > 0) {
        await addArchive({ archiveNew: archive });
        setArchive(initialArchiveState);
        fetchArchive(50, 0);
        setMediaItem([]);
        showMessage('archive created', 'success');
      } else {
        showMessage('add item to the archive', 'error');
      }
    } catch (error) {
      showMessage('archive cannot be created ', 'error');
    }
  };

  return (
    <Grid container spacing={2} marginTop={4} alignItems='center'>
      <Grid item xs={12}>
        <Typography variant='h5' textTransform='uppercase'>
          create new archive
        </Typography>
        <Grid container className={styles.scroll_container} wrap='nowrap'>
          <Grid item xs={12} md={3} className={styles.media_item_add}>
            <MediaSelectorLayout
              label='add media'
              allowMultiple={false}
              saveSelectedMedia={mediaPreview}
              aspectRatio={['1:1', '3:4', '4:3']}
              hideVideos={true}
              isDeleteAccepted={false}
            />
          </Grid>
          {mediaItem.map((media, id) => (
            <Grid item key={id} xs={12} md={3}>
              <Grid container>
                <Grid item xs={12} className={styles.media_item}>
                  <img
                    src={media.media?.fullSize?.mediaUrl}
                    alt=''
                    onClick={() => toggleModal(id)}
                  />
                  <IconButton onClick={() => removeMediaItem(id)} className={styles.delete_item}>
                    <ClearIcon fontSize='small' />
                  </IconButton>
                </Grid>
                <Grid item xs={12}>
                  <TruncateText text={archive.itemsInsert?.[id].name} length={60} />
                  {archive.itemsInsert?.[id]?.url && isValidUrl(archive.itemsInsert[id].url) && (
                    <CopyToClipboard
                      text={archive.itemsInsert[id].url || ''}
                      displayText={`${archive.itemsInsert[id].url?.slice(0, 5)}...${archive.itemsInsert[id].url?.slice(-7)}`}
                    />
                  )}
                </Grid>
              </Grid>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              type='text'
              name='heading'
              fullWidth
              value={archive.archive?.heading}
              onChange={handleTextFieldChange}
              label='TITLE'
              InputLabelProps={{ shrink: true, style: { textTransform: 'uppercase' } }}
              size='small'
              required
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              type='text'
              name='description'
              value={archive.archive?.text}
              onChange={handleTextFieldChange}
              label='DESCRIPTION'
              InputLabelProps={{ shrink: true, style: { textTransform: 'uppercase' } }}
              inputProps={{ maxLength: 255 }}
              size='small'
              fullWidth
              multiline
            />
          </Grid>
        </Grid>
      </Grid>

      <Grid item xs={12}>
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
        isEditMode={selectedItemIndex !== null}
        media={media?.toString() || ''}
        title={title}
        url={url}
        close={toggleModal}
        setTitle={setTitle}
        setUrl={setUrl}
        addNewItem={addNewItem}
      />
    </Grid>
  );
};
