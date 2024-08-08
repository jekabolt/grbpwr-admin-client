import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Button,
  Dialog,
  Grid,
  IconButton,
  TextField,
  Theme,
  useMediaQuery,
} from '@mui/material';
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
  isEditMode,
  close,
  setTitle,
  addNewItem,
  setUrl,
}) => {
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (value.length > 256) {
      value = value.substring(0, 256);
    }
    setTitle(value);
  };

  return (
    <Dialog open={open} onClose={close} fullWidth scroll='paper' maxWidth='sm'>
      <Box position='relative'>
        <IconButton onClick={close} sx={{ position: 'absolute', right: 0 }}>
          <CloseIcon />
        </IconButton>
        <Grid container spacing={2} justifyContent='center' padding='2%'>
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
          <Grid
            item
            xs={12}
            style={{ display: 'flex', justifyContent: isMobile ? 'center' : 'flex-end' }}
          >
            <Button variant='contained' onClick={() => addNewItem(id)}>
              {isEditMode ? 'save' : 'add item'}
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Dialog>
  );
};
