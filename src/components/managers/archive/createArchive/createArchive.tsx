import AddIcon from '@mui/icons-material/Add';
import { Grid, IconButton, TextField } from '@mui/material';
import { addArchive } from 'api/archive';
import { common_ArchiveNew } from 'api/proto-http/admin';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { FC, useState } from 'react';
import styles from 'styles/archive.scss';

export const CreateArchive: FC = () => {
  const [archive, setArchive] = useState<common_ArchiveNew>({
    archive: {
      heading: '',
      description: '',
    },
    items: [],
  });
  const [mediaItem, setMediaItem] = useState<string[]>([]);

  const createArchive = async () => {
    try {
      await addArchive({ archiveNew: archive });
    } catch (error) {
      alert(error);
    }
  };

  const addNewMediaItem = (newSelectedMedia: string[]) => {
    if (newSelectedMedia.length === 0) {
      return;
    }

    const newItems = newSelectedMedia.map((media) => ({
      media: media,
      url: '',
      title: '',
    }));

    setMediaItem((prevMedia) => [...prevMedia, ...newSelectedMedia]);

    setArchive((prevArchive) => ({
      ...prevArchive,
      items: [...(prevArchive.items || []), ...newItems],
    }));
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

  const getMediaItemStyle = () => {
    const styles = [{ width: '396px', height: '243px' }];
    const randomIndex = Math.floor(Math.random() * styles.length);
    return styles[randomIndex];
  };

  return (
    <Grid container spacing={2} marginTop={3} alignItems='center'>
      <Grid item xs={10}>
        <div style={{ width: '1100px', marginBottom: '3%' }}>
          <Grid
            container
            sx={{
              width: '100%',
              display: 'flex',
              overflowX: 'scroll',
              flexWrap: 'nowrap',
              gap: '10px',
            }}
          >
            {mediaItem.map((media, id) => (
              <Grid item key={id} className={styles.media_item}>
                <img src={media} />
              </Grid>
            ))}
            <Grid item className={styles.media_item}>
              <MediaSelectorLayout
                label='add media'
                allowMultiple={false}
                saveSelectedMedia={addNewMediaItem}
              />
            </Grid>
          </Grid>
        </div>
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
          <Grid item xs={12}>
            <TextField
              type='text'
              name='description'
              value={archive.archive?.description}
              onChange={handleTextFieldChange}
              label='DESCRIPTION'
              InputLabelProps={{ shrink: true }}
              size='small'
            />
          </Grid>
        </Grid>
      </Grid>
      <Grid item xs={2}>
        <IconButton
          onClick={createArchive}
          style={{ alignSelf: 'center', justifySelf: 'flex-end' }}
        >
          <AddIcon fontSize='large' />
        </IconButton>
      </Grid>
    </Grid>
  );
};

{
}
