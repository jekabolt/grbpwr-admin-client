import CloseIcon from '@mui/icons-material/Close';
import { Box, Button, Dialog, Grid, IconButton, TextField } from '@mui/material';
import { isValidURL } from 'features/utilitty/isValidUrl';
import { FC } from 'react';
import styles from 'styles/creatArchiveItemModal.scss';
import { ArchiveModalInterface } from '../interfaces/interfaces';

export const ArchiveModal: FC<ArchiveModalInterface> = ({
  id,
  open,
  media,
  title,
  url,
  close,
  setTitle,
  addNewItem,
  setUrl,
}) => {
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (value.length > 256) {
      value = value.substring(0, 256);
    }
    setTitle(value);
  };

  return (
    <Dialog open={open} onClose={close} fullWidth scroll='paper' maxWidth='lg'>
      <Box position='relative'>
        <Button
          variant='contained'
          onClick={() => addNewItem(id)}
          sx={{ position: 'absolute', left: 0 }}
        >
          add item
        </Button>
        <IconButton onClick={close} sx={{ position: 'absolute', right: 0 }}>
          <CloseIcon />
        </IconButton>
        <Grid container spacing={2} padding='2%'>
          <Grid item xs={12} className={styles.media_item_add}>
            {media ? <img src={media} /> : ''}
          </Grid>
          <Grid item xs={12} justifySelf='center'>
            <TextField
              value={url}
              error={!!url && !isValidURL(url)}
              helperText={url && !isValidURL(url) ? 'the entered url is invalid' : ''}
              onChange={(e) => setUrl(e.target.value)}
              label='url'
              fullWidth
              size='small'
              style={{ textTransform: 'uppercase' }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              value={title}
              onChange={handleDescriptionChange}
              label='description'
              variant='outlined'
              multiline
              fullWidth
              style={{ textTransform: 'uppercase' }}
            />
          </Grid>
        </Grid>
      </Box>
    </Dialog>
  );
};
